/**
 * Parsing the medicine catalogue file behind "Import Excel/CSV".
 *
 * Why CSV and not .xlsx
 * The repo has a dependency-free XLSX *writer* (`lib/export.ts`) but no reader,
 * and adding a parser library for a screen that imports a handful of drug names
 * is a poor trade. So the import accepts `.csv` (and `.tsv`, which is what Excel
 * writes when the delimiter is a tab) and tells the user plainly that an `.xlsx`
 * has to be saved as CSV first. It also offers the template download below, so
 * the column names never have to be guessed.
 *
 * The parser is deliberately forgiving about column NAMES and strict about
 * values. A clinic's existing spreadsheet will say `Drug`, `Medicine Name`,
 * `Brand` or `Product` for the same column, and `Strength`, `Dose` or `Potency`
 * for another; rejecting a file over that would make the button useless. What it
 * will not do is silently invent a row: a row with no name is reported as
 * skipped with its line number, so the person importing can see what was lost.
 *
 * There is no clinical validation here. Deciding whether a dose is appropriate is
 * a prescriber's job; this only moves text they already wrote.
 */

import {
  MEDICINE_CATEGORY_MAX,
  MEDICINE_NAME_MAX,
  MEDICINE_STRENGTH_MAX,
} from "@/lib/validation/schemas";

/** A row that survived parsing and is ready for validation before insert. */
export type ParsedMedicineRow = {
  name: string;
  strength: string;
  category: string;
  isActive: boolean;
  /** 1-based line in the source file, for the skip report. */
  line: number;
};

export type ParsedMedicineFile = {
  rows: ParsedMedicineRow[];
  /** Human-readable reasons, one per rejected line. */
  skipped: { line: number; reason: string }[];
  /** True when no usable header row was found. */
  noHeader: boolean;
};

/**
 * Header aliases, in the priority order a column is matched. Keys are compared
 * after stripping everything that is not a letter or digit, so `Medicine Name`,
 * `medicine_name` and `MEDICINENAME` all reduce to `medicinename`.
 */
const NAME_HEADERS = [
  "name",
  "medicinename",
  "drug",
  "drugname",
  "brand",
  "product",
];
const STRENGTH_HEADERS = [
  "strength",
  "dosage",
  "dose",
  "potency",
  "dosestrength",
  "mg",
];
const CATEGORY_HEADERS = [
  "category",
  "form",
  "type",
  "dosageform",
  "categoryname",
];
const ACTIVE_HEADERS = ["active", "status", "isactive", "enabled"];

/** Drop a UTF-8 BOM, which Excel prepends and which would break the first header. */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Normalise a header cell for alias comparison. */
function normaliseHeader(cell: string): string {
  return cell.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Pick the delimiter by counting candidates on the first non-empty line.
 *
 * Tabs are checked first because a CSV exported with a tab delimiter also
 * contains no commas, while a semicolon-delimited European export contains none
 * either — so "no comma present" would otherwise be read as a single column.
 */
function detectDelimiter(sample: string): string {
  const line = sample.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  const counts: [string, number][] = [
    [",", (line.match(/,/g) ?? []).length],
    ["\t", (line.match(/\t/g) ?? []).length],
    [";", (line.match(/;/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

/**
 * Split CSV text into rows of cells, honouring quoted fields.
 *
 * Written as an explicit state machine rather than a regex: a quoted field may
 * contain the delimiter, a newline (Excel does this for wrapped cells) and a
 * doubled quote as an escape. A regex that handles the first two and not the
 * third corrupts rows silently, which is worse than an error message.
 */
function splitRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        // A doubled quote inside a quoted field is one literal quote; a single
        // quote followed by anything else closes the field.
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      // Swallow the \n of a \r\n pair so CRLF files do not yield blank rows.
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else {
      cell += char;
    }
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

/** Find which column index matches any alias in `aliases`, or -1. */
function columnIndex(headers: string[], aliases: string[]): number {
  return headers.findIndex((header) =>
    aliases.includes(normaliseHeader(header)),
  );
}

/** Read the active flag from a cell, defaulting to active when absent or unclear. */
function parseActiveFlag(cell: string | undefined): boolean {
  if (cell === undefined) return true;
  const value = cell.trim().toLowerCase();
  if (value === "") return true;
  if (
    [
      "no",
      "n",
      "false",
      "0",
      "inactive",
      "disabled",
      "off",
      "archived",
    ].includes(value)
  ) {
    return false;
  }
  return true;
}

/**
 * Parse the uploaded file.
 *
 * `maxRows` is enforced here rather than in the action so a 200k-line
 * spreadsheet fails fast with a clear message instead of generating an
 * unbounded insert statement.
 */
export function parseMedicinesCsv(
  text: string,
  maxRows = 2000,
): ParsedMedicineFile {
  const cleaned = stripBom(text);
  const rows = splitRows(cleaned, detectDelimiter(cleaned));

  const nonEmpty = rows.filter((row) => row.some((cell) => cell.trim() !== ""));
  if (nonEmpty.length === 0) {
    return { rows: [], skipped: [], noHeader: true };
  }

  const headerRow = nonEmpty[0].map((cell) => cell.trim());
  const nameIndex = columnIndex(headerRow, NAME_HEADERS);
  const strengthIndex = columnIndex(headerRow, STRENGTH_HEADERS);
  const categoryIndex = columnIndex(headerRow, CATEGORY_HEADERS);
  const activeIndex = columnIndex(headerRow, ACTIVE_HEADERS);

  // No recognisable name column means this is not a catalogue file. Reported
  // rather than guessed at, because guessing which column is the drug name is
  // how you end up importing a spreadsheet of patient names as medicines.
  if (nameIndex === -1) {
    return { rows: [], skipped: [], noHeader: true };
  }

  const parsed: ParsedMedicineRow[] = [];
  const skipped: { line: number; reason: string }[] = [];

  nonEmpty.slice(1).forEach((cells, index) => {
    const line = index + 2; // 1-based, and the header occupied line 1.

    if (parsed.length >= maxRows) {
      skipped.push({
        line,
        reason: `Beyond the ${maxRows}-row import limit.`,
      });
      return;
    }

    const name = (cells[nameIndex] ?? "").trim();
    if (name === "") {
      skipped.push({ line, reason: "No medicine name in this row." });
      return;
    }
    if (name.length > MEDICINE_NAME_MAX) {
      skipped.push({
        line,
        reason: `Name longer than ${MEDICINE_NAME_MAX} characters.`,
      });
      return;
    }

    const strength = (cells[strengthIndex] ?? "").trim();
    const category = (cells[categoryIndex] ?? "").trim();

    parsed.push({
      name,
      strength: strength.slice(0, MEDICINE_STRENGTH_MAX),
      category: category.slice(0, MEDICINE_CATEGORY_MAX),
      isActive: parseActiveFlag(cells[activeIndex]),
      line,
    });
  });

  return { rows: parsed, skipped, noHeader: false };
}

/** Maximum rows a single import may insert, enforced in `parseMedicinesCsv`. */
export const MEDICINE_IMPORT_MAX_ROWS = 2000;

/** Header row of the downloadable template — the canonical column names. */
export const MEDICINE_IMPORT_TEMPLATE_HEADER = "Name,Strength,Category,Active";

/**
 * The template itself: a header plus one worked example.
 *
 * The example row is deliberately a real, ordinary drug rather than a
 * placeholder, so the format is obvious without inventing a fake patient or a
 * fake clinic.
 */
export const MEDICINE_IMPORT_TEMPLATE_ROWS = [
  MEDICINE_IMPORT_TEMPLATE_HEADER,
  "Paracetamol,500mg,Tablet,Yes",
  "Amoxicillin,500mg,Capsule,Yes",
  "Cetirizine,,Tablet,No",
];

/**
 * Trigger a browser download of the template, via the same Blob approach
 * `lib/export.ts` uses.
 */
export function downloadMedicineImportTemplate() {
  const blob = new Blob([MEDICINE_IMPORT_TEMPLATE_ROWS.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "medbook-medicines-template.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
