/**
 * Client-side appointment export helpers: CSV and a dependency-free minimal
 * XLSX writer. The workbook is built as a stored (uncompressed) ZIP containing
 * the OOXML parts with inline strings — no external spreadsheet library needed.
 */
import { formatClinicLocalSlot } from "@/lib/time";
import type { AppointmentRow } from "@/lib/visits-queries";

export type ExportFormat = "csv" | "xlsx";

/** A row-shaped subset of an appointment sufficient for the export sheet. */
export type AppointmentExportRow = Pick<
  AppointmentRow,
  | "patientName"
  | "patientPhone"
  | "doctorName"
  | "serviceName"
  | "start_time"
  | "end_time"
  | "status"
  | "visit"
>;

export type ExportCell = string | number | null;

const EXPORT_HEADERS = [
  "Patient",
  "Phone",
  "Doctor",
  "Service",
  "Date & Slot",
  "Status",
  "Token",
];

/** Build the flat 2D sheet (header + rows) used by both CSV and XLSX. */
export function buildAppointmentSheet(
  rows: AppointmentExportRow[],
  timezone: string,
): ExportCell[][] {
  return [
    EXPORT_HEADERS,
    ...rows.map((r) => [
      r.patientName,
      r.patientPhone ?? "",
      r.doctorName ?? "—",
      r.serviceName,
      formatClinicLocalSlot(r.start_time, r.end_time, timezone),
      r.status,
      r.visit?.token_number ?? "",
    ]),
  ];
}

function toCsvRow(cells: ExportCell[]): string {
  return cells
    .map((cell) => {
      const s = cell === null ? "" : String(cell);
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    })
    .join(",");
}

/** Serialise a sheet to a CSV string. */
export function sheetToCsv(sheet: ExportCell[][]): string {
  return sheet.map(toCsvRow).join("\n");
}

/** Trigger a browser download of a CSV file. */
export function downloadCsvFile(sheet: ExportCell[][], filename: string) {
  const blob = new Blob([sheetToCsv(sheet)], {
    type: "text/csv;charset=utf-8;",
  });
  saveBlob(blob, filename);
}

/* ── minimal .xlsx writer (stored ZIP + OOXML inline strings) ───────── */

const encoder = new TextEncoder();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function concatBytes(chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function colName(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function sheetXml(sheet: ExportCell[][]): string {
  const rows = sheet
    .map((cells, r) => {
      const rowCells = cells
        .map((cell, ci) => {
          const ref = colName(ci) + (r + 1);
          if (cell === null || cell === "") return `<c r="${ref}"/>`;
          if (typeof cell === "number" && Number.isFinite(cell)) {
            return `<c r="${ref}" t="n"><v>${cell}</v></c>`;
          }
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(cell))}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${rowCells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
}

/** Build the workbook ZIP bytes for a sheet. */
export function buildXlsxBlob(sheet: ExportCell[][]): Blob {
  const files: Record<string, string> = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Appointments" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
    "xl/worksheets/sheet1.xml": sheetXml(sheet),
  };

  const entries = Object.entries(files).map(([name, content]) => {
    const data = encoder.encode(content);
    return { name, data, crc: crc32(data) };
  });

  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);

    // Local file header
    const lh = new Uint8Array(30);
    const lhv = new DataView(lh.buffer);
    lhv.setUint32(0, 0x04034b50, true);
    lhv.setUint16(4, 20, true);
    lhv.setUint16(6, 0x0800, true);
    lhv.setUint16(8, 0, true);
    lhv.setUint16(10, 0, true);
    lhv.setUint16(12, 0x21, true);
    lhv.setUint32(14, entry.crc, true);
    lhv.setUint32(18, entry.data.length, true);
    lhv.setUint32(22, entry.data.length, true);
    lhv.setUint16(26, nameBytes.length, true);
    lhv.setUint16(28, 0, true);
    parts.push(lh, nameBytes, entry.data);

    // Central directory entry
    const ch = new Uint8Array(46);
    const chv = new DataView(ch.buffer);
    chv.setUint32(0, 0x02014b50, true);
    chv.setUint16(4, 20, true);
    chv.setUint16(6, 20, true);
    chv.setUint16(8, 0x0800, true);
    chv.setUint16(10, 0, true);
    chv.setUint16(12, 0, true);
    chv.setUint16(14, 0x21, true);
    chv.setUint32(16, entry.crc, true);
    chv.setUint32(20, entry.data.length, true);
    chv.setUint32(24, entry.data.length, true);
    chv.setUint16(28, nameBytes.length, true);
    chv.setUint16(30, 0, true);
    chv.setUint16(32, 0, true);
    chv.setUint16(34, 0, true);
    chv.setUint16(36, 0, true);
    chv.setUint32(38, 0, true);
    chv.setUint32(42, offset, true);
    central.push(ch, nameBytes);

    offset += 30 + nameBytes.length + entry.data.length;
  }

  const centralBytes = concatBytes(central);
  const eocd = new Uint8Array(22);
  const eocdv = new DataView(eocd.buffer);
  eocdv.setUint32(0, 0x06054b50, true);
  eocdv.setUint16(4, 0, true);
  eocdv.setUint16(6, 0, true);
  eocdv.setUint16(8, entries.length, true);
  eocdv.setUint16(10, entries.length, true);
  eocdv.setUint32(12, centralBytes.length, true);
  eocdv.setUint32(16, offset, true);
  eocdv.setUint16(20, 0, true);

  const bytes = concatBytes([...parts, centralBytes, eocd]);
  return new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Trigger a browser download of an XLSX workbook. */
export function downloadXlsxFile(sheet: ExportCell[][], filename: string) {
  saveBlob(buildXlsxBlob(sheet), filename);
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}