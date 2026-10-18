"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MapPin, Plus, Ruler, Save } from "lucide-react";

import { ConfirmDeleteButton } from "@/components/patients/record/workspaces/confirm-delete";
import {
  ChipPicker,
  NoteStatus,
  type NoteState,
} from "@/components/patients/record/workspaces/specialty-form";
import { RecordSection } from "@/components/patients/record/record-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteDermLesionAction,
  saveDermLesionAction,
  saveDermScoresAction,
} from "@/lib/actions/specialty-workspaces";
import { cn } from "@/lib/utils";
import type { DermLesion, DermSeverityScore } from "@/types/database";

/* ------------------------------------------------------------------------- */
/* Controlled vocabularies — quick chips, but never a hard limit: the lesion  */
/* observations field keeps free text available.                              */
/* ------------------------------------------------------------------------- */

const LESION_MORPHOLOGY = [
  "Macule",
  "Papule",
  "Pustule",
  "Plaque",
  "Nodule",
  "Vesicle",
  "Wheal",
  "Scale",
  "Crust",
  "Ulcer",
  "Scar",
] as const;
const LESION_COLORS = [
  "Erythematous",
  "Hyperpigmented",
  "Hypopigmented",
  "Violaceous",
  "Brown",
  "Skin-coloured",
] as const;
const LESION_TEXTURE = [
  "Smooth",
  "Scaly",
  "Rough",
  "Indurated",
  "Lichenified",
] as const;
const SIZE_UNITS = ["mm", "cm"] as const;

/** Named anchor points on the body-map silhouette (viewBox 0 0 200 400). */
type Anchor = { name: string; x: number; y: number };
const FRONT_ANCHORS: Anchor[] = [
  { name: "Scalp", x: 100, y: 20 },
  { name: "Face", x: 100, y: 45 },
  { name: "Neck", x: 100, y: 70 },
  { name: "Chest", x: 100, y: 110 },
  { name: "Abdomen", x: 100, y: 160 },
  { name: "Left upper arm", x: 46, y: 110 },
  { name: "Right upper arm", x: 154, y: 110 },
  { name: "Left forearm", x: 40, y: 175 },
  { name: "Right forearm", x: 160, y: 175 },
  { name: "Left hand", x: 46, y: 216 },
  { name: "Right hand", x: 154, y: 216 },
  { name: "Groin", x: 100, y: 205 },
  { name: "Left thigh", x: 84, y: 265 },
  { name: "Right thigh", x: 116, y: 265 },
  { name: "Left lower leg", x: 84, y: 340 },
  { name: "Right lower leg", x: 116, y: 340 },
  { name: "Left foot", x: 84, y: 378 },
  { name: "Right foot", x: 116, y: 378 },
];
const BACK_ANCHORS: Anchor[] = [
  { name: "Scalp", x: 100, y: 20 },
  { name: "Nape of neck", x: 100, y: 70 },
  { name: "Upper back", x: 100, y: 110 },
  { name: "Lower back", x: 100, y: 165 },
  { name: "Left upper arm", x: 46, y: 110 },
  { name: "Right upper arm", x: 154, y: 110 },
  { name: "Left forearm", x: 40, y: 175 },
  { name: "Right forearm", x: 160, y: 175 },
  { name: "Left hand", x: 46, y: 216 },
  { name: "Right hand", x: 154, y: 216 },
  { name: "Buttock", x: 100, y: 210 },
  { name: "Left thigh", x: 84, y: 265 },
  { name: "Right thigh", x: 116, y: 265 },
  { name: "Left lower leg", x: 84, y: 340 },
  { name: "Right lower leg", x: 116, y: 340 },
  { name: "Left foot", x: 84, y: 378 },
  { name: "Right foot", x: 116, y: 378 },
];

function nearestAnchor(anchors: Anchor[], x: number, y: number): Anchor {
  return anchors.reduce((best, anchor) => {
    const d = (anchor.x - x) ** 2 + (anchor.y - y) ** 2;
    const b = (best.x - x) ** 2 + (best.y - y) ** 2;
    return d < b ? anchor : best;
  });
}

/* ------------------------------------------------------------------------- */
/* Body map + lesion editor                                                  */
/* ------------------------------------------------------------------------- */

export function DermBodyMap({
  patientId,
  examId,
  lesions,
  canManage,
  visitId,
}: {
  patientId: string;
  examId: string | null;
  lesions: DermLesion[];
  canManage: boolean;
  /** Active visit/encounter stamp for new pins — migration 0104. */
  visitId?: string | null;
}) {
  const router = useRouter();
  const [view, setView] = useState<"front" | "back">("front");
  const [selectedId, setSelectedId] = useState<string | null>(
    lesions[0]?.id ?? null,
  );
  const [adding, setAdding] = useState(false);

  const visible = lesions.filter((lesion) => lesion.body_view === view);
  const selected = lesions.find((lesion) => lesion.id === selectedId) ?? null;

  async function addPin(anchor: Anchor, x: number, y: number) {
    if (!canManage || adding) return;
    setAdding(true);
    const result = await saveDermLesionAction(
      patientId,
      {
        exam_id: examId ?? "",
        body_region: anchor.name,
        body_view: view,
        body_x: Number((x / 200).toFixed(4)),
        body_y: Number((y / 400).toFixed(4)),
      },
      visitId,
    );
    setAdding(false);
    if (result.ok) {
      setSelectedId(result.data);
      toast.success(`Pin added — ${anchor.name}`);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  function handleMapClick(event: React.MouseEvent<SVGSVGElement>) {
    if (!canManage) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 200;
    const y = ((event.clientY - rect.top) / rect.height) * 400;
    const anchor = nearestAnchor(
      view === "front" ? FRONT_ANCHORS : BACK_ANCHORS,
      x,
      y,
    );
    void addPin(anchor, x, y);
  }

  async function removePin(id: string) {
    const result = await deleteDermLesionAction(id);
    if (result.ok) {
      if (selectedId === id) setSelectedId(null);
      toast.success("Lesion pin removed");
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <div className="lg:col-span-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="inline-flex rounded-control border border-hairline p-0.5">
            {(["front", "back"] as const).map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => setView(side)}
                className={cn(
                  "rounded-[6px] px-3 py-1 text-[12px] font-semibold capitalize transition-colors",
                  view === side
                    ? "bg-primary text-white"
                    : "text-text-secondary hover:text-text-primary",
                )}
              >
                {side}
              </button>
            ))}
          </div>
          {canManage && (
            <span className="text-ink-faint flex items-center gap-1 text-[11px]">
              <Plus aria-hidden="true" className="size-3" />
              Click the body to drop a pin
            </span>
          )}
        </div>

        <svg
          viewBox="0 0 200 400"
          onClick={handleMapClick}
          className={cn(
            "mx-auto h-[400px] w-auto",
            canManage ? "cursor-crosshair" : "cursor-default",
          )}
          role="img"
          aria-label={`${view} body map`}
        >
          <g
            fill="var(--color-primary)"
            className="opacity-[0.08]"
            aria-hidden="true"
          >
            <circle cx="100" cy="40" r="26" />
            <rect x="92" y="62" width="16" height="16" rx="6" />
            <rect x="64" y="74" width="72" height="150" rx="26" />
            <rect x="40" y="80" width="20" height="130" rx="10" />
            <rect x="140" y="80" width="20" height="130" rx="10" />
            <circle cx="46" cy="216" r="12" />
            <circle cx="154" cy="216" r="12" />
            <rect x="76" y="220" width="22" height="150" rx="11" />
            <rect x="102" y="220" width="22" height="150" rx="11" />
            <ellipse cx="84" cy="378" rx="15" ry="9" />
            <ellipse cx="116" cy="378" rx="15" ry="9" />
          </g>

          {visible.map((lesion) => {
            if (lesion.body_x === null || lesion.body_y === null) return null;
            const active = lesion.id === selectedId;
            return (
              <g
                key={lesion.id}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedId(lesion.id);
                }}
                className="cursor-pointer"
              >
                <circle
                  cx={lesion.body_x * 200}
                  cy={lesion.body_y * 400}
                  r={active ? 12 : 10}
                  fill="var(--color-primary)"
                  stroke="white"
                  strokeWidth={active ? 2.5 : 1.5}
                />
                <text
                  x={lesion.body_x * 200}
                  y={lesion.body_y * 400 + 3.5}
                  textAnchor="middle"
                  className="fill-white text-[10px] font-bold"
                >
                  {lesion.pin_number}
                </text>
              </g>
            );
          })}
        </svg>

        {lesions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {lesions.map((lesion) => (
              <button
                key={lesion.id}
                type="button"
                onClick={() => {
                  setView(lesion.body_view);
                  setSelectedId(lesion.id);
                }}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  lesion.id === selectedId
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-hairline text-text-secondary hover:border-primary/50",
                )}
              >
                <span className="grid size-4 place-items-center rounded-full bg-primary text-[9px] font-bold text-white">
                  {lesion.pin_number}
                </span>
                {lesion.body_region}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="lg:col-span-2">
        {selected ? (
          <LesionEditor
            key={selected.id}
            patientId={patientId}
            lesion={selected}
            canManage={canManage}
            onDelete={removePin}
            onSaved={() => router.refresh()}
          />
        ) : (
          <div className="flex h-full min-h-40 flex-col items-center justify-center rounded-card border border-dashed border-hairline p-4 text-center">
            <MapPin aria-hidden="true" className="text-ink-faint size-5" />
            <p className="mt-2 text-[12px] text-text-secondary">
              No pin selected
            </p>
            <p className="text-ink-faint mt-0.5 text-[11px]">
              Click the body map to add a lesion pin.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

type LesionPatch = Pick<
  DermLesion,
  | "body_region"
  | "laterality"
  | "morphology"
  | "color"
  | "texture"
  | "size_value"
  | "size_unit"
  | "observations"
>;

function LesionEditor({
  patientId,
  lesion,
  canManage,
  onDelete,
  onSaved,
}: {
  patientId: string;
  lesion: DermLesion;
  canManage: boolean;
  onDelete: (id: string) => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<NoteState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [patch, setPatch] = useState<LesionPatch>({
    body_region: lesion.body_region,
    laterality: lesion.laterality,
    morphology: lesion.morphology,
    color: lesion.color,
    texture: lesion.texture,
    size_value: lesion.size_value,
    size_unit: lesion.size_unit ?? "mm",
    observations: lesion.observations,
  });

  function save(next: LesionPatch) {
    if (!canManage) return;
    setStatus("saving");
    setMessage(null);
    void saveDermLesionAction(patientId, {
      id: lesion.id,
      exam_id: lesion.exam_id ?? "",
      body_region: next.body_region,
      body_view: lesion.body_view,
      body_x: lesion.body_x,
      body_y: lesion.body_y,
      laterality: next.laterality ?? "",
      morphology: next.morphology,
      color: next.color,
      texture: next.texture,
      size_value: next.size_value,
      size_unit: next.size_unit,
      observations: next.observations ?? "",
    }).then((result) => {
      if (result.ok) {
        setStatus("saved");
        onSaved();
      } else {
        setStatus("error");
        setMessage(result.message);
      }
    });
  }

  function update(next: Partial<LesionPatch>) {
    const merged = { ...patch, ...next };
    setPatch(merged);
    return merged;
  }

  return (
    <RecordSection
      title={`Pin #${lesion.pin_number} — ${patch.body_region}`}
      meta={<NoteStatus state={status} message={message} />}
    >
      <div className="space-y-3">
        <ChipPicker
          label="Morphology"
          options={LESION_MORPHOLOGY}
          value={patch.morphology}
          onChange={(next) => save(update({ morphology: next }))}
        />
        <ChipPicker
          label="Colour"
          options={LESION_COLORS}
          value={patch.color}
          onChange={(next) => save(update({ color: next }))}
        />
        <ChipPicker
          label="Surface / texture"
          options={LESION_TEXTURE}
          value={patch.texture}
          onChange={(next) => save(update({ texture: next }))}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="lesion-size"
              className="text-ink mb-1.5 block text-[12.5px] font-bold"
            >
              Size
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="lesion-size"
                type="number"
                min={0}
                step="0.1"
                value={patch.size_value ?? ""}
                onChange={(event) =>
                  setPatch((current) => ({
                    ...current,
                    size_value:
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                  }))
                }
                onBlur={() => save(patch)}
                className="w-24"
              />
              <NativeSelect
                aria-label="Size unit"
                value={patch.size_unit ?? "mm"}
                onChange={(event) =>
                  save(update({ size_unit: event.target.value }))
                }
                className="w-20"
              >
                {SIZE_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </NativeSelect>
              <Ruler aria-hidden="true" className="text-ink-faint size-4" />
            </div>
          </div>
          <div>
            <label
              htmlFor="lesion-laterality"
              className="text-ink mb-1.5 block text-[12.5px] font-bold"
            >
              Laterality
            </label>
            <NativeSelect
              id="lesion-laterality"
              value={patch.laterality ?? ""}
              onChange={(event) =>
                save(
                  update({
                    laterality: event.target.value as DermLesion["laterality"],
                  }),
                )
              }
            >
              <option value="">Not specified</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
              <option value="bilateral">Bilateral</option>
              <option value="central">Central</option>
            </NativeSelect>
          </div>
        </div>

        <div>
          <label
            htmlFor="lesion-notes"
            className="text-ink mb-1.5 block text-[12.5px] font-bold"
          >
            Observations
          </label>
          <Textarea
            id="lesion-notes"
            rows={3}
            value={patch.observations ?? ""}
            onChange={(event) =>
              setPatch((current) => ({
                ...current,
                observations: event.target.value,
              }))
            }
            onBlur={(event) =>
              save(update({ observations: event.currentTarget.value }))
            }
            placeholder="Border, dermoscopy pattern, tenderness, custom terms…"
          />
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-hairline pt-3">
          <span className="text-ink-faint flex items-center gap-1 text-[11px]">
            <MapPin aria-hidden="true" className="size-3" />
            {lesion.body_view === "front" ? "Front" : "Back"} view
          </span>
          {canManage && (
            <ConfirmDeleteButton
              ariaLabel="Delete lesion pin"
              title="Delete this lesion pin?"
              description="Removes the pin and its observations from this record."
              onConfirm={() => onDelete(lesion.id)}
            />
          )}
        </div>
      </div>
    </RecordSection>
  );
}

/* ------------------------------------------------------------------------- */
/* Validated severity scoring (GAGS / PASI / ABCDE)                          */
/* ------------------------------------------------------------------------- */

const GAGS_SITES = [
  { key: "forehead", label: "Forehead", weight: 2 },
  { key: "right_cheek", label: "Right cheek", weight: 2 },
  { key: "left_cheek", label: "Left cheek", weight: 2 },
  { key: "nose", label: "Nose", weight: 1 },
  { key: "chin", label: "Chin", weight: 1 },
  { key: "chest_back", label: "Chest & upper back", weight: 3 },
] as const;
const GAGS_LESION_SCORES = [
  "0 — none",
  "1 — comedones",
  "2 — papules",
  "3 — pustules",
  "4 — nodules",
] as const;

const PASI_AREAS = [
  { key: "head", label: "Head & neck", weight: 0.1 },
  { key: "upper", label: "Upper limbs", weight: 0.2 },
  { key: "trunk", label: "Trunk", weight: 0.3 },
  { key: "lower", label: "Lower limbs", weight: 0.4 },
] as const;
const PASI_AREA_OPTIONS = [
  "0%",
  "1-9%",
  "10-29%",
  "30-49%",
  "50-69%",
  "70-89%",
  "90-100%",
] as const;
const PASI_SEVERITY = [
  "none",
  "slight",
  "moderate",
  "marked",
  "very marked",
] as const;

const ABCDE_ITEMS = [
  { key: "asymmetry", label: "Asymmetry" },
  { key: "border", label: "Irregular border" },
  { key: "colour", label: "Colour variation" },
  { key: "diameter", label: "Diameter > 6 mm" },
  { key: "evolution", label: "Evolution / change" },
] as const;

function gagsBand(total: number): string {
  if (total === 0) return "Clear";
  if (total <= 18) return "Mild";
  if (total <= 30) return "Moderate";
  if (total <= 38) return "Severe";
  return "Very severe";
}

function pasiBand(total: number): string {
  if (total === 0) return "Clear";
  if (total < 5) return "Mild";
  if (total < 10) return "Moderate";
  if (total < 15) return "Severe";
  return "Very severe";
}

export function DermScoringTools({
  patientId,
  examId,
  scores,
  canManage,
  visitId,
}: {
  patientId: string;
  examId: string | null;
  scores: DermSeverityScore[];
  canManage: boolean;
  /** Active visit/encounter stamp when this save creates the exam — 0104. */
  visitId?: string | null;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<DermSeverityScore["kind"]>("GAGS");
  const [gags, setGags] = useState<Record<string, number>>({});
  const [pasi, setPasi] = useState<Record<string, number>>({});
  const [abcde, setAbcde] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const gagsTotal = GAGS_SITES.reduce(
    (sum, site) => sum + site.weight * (gags[site.key] ?? 0),
    0,
  );
  const pasiTotal = PASI_AREAS.reduce((sum, area) => {
    const a = pasi[`${area.key}_area`] ?? 0;
    const sev =
      (pasi[`${area.key}_e`] ?? 0) +
      (pasi[`${area.key}_i`] ?? 0) +
      (pasi[`${area.key}_d`] ?? 0);
    return sum + area.weight * a * sev;
  }, 0);
  const abcdeTotal = ABCDE_ITEMS.filter((item) => abcde[item.key]).length;

  const total =
    kind === "GAGS" ? gagsTotal : kind === "PASI" ? pasiTotal : abcdeTotal;
  const band =
    kind === "GAGS"
      ? gagsBand(gagsTotal)
      : kind === "PASI"
        ? pasiBand(pasiTotal)
        : abcdeTotal === 0
          ? "No features documented"
          : `${abcdeTotal} of 5 features present`;

  const inputs: Record<string, number | string | boolean> =
    kind === "GAGS"
      ? { ...gags }
      : kind === "PASI"
        ? { ...pasi }
        : { ...abcde };

  async function saveScore() {
    if (!canManage || saving) return;
    setSaving(true);
    const score: DermSeverityScore = {
      kind,
      total,
      band,
      inputs,
      recordedAt: new Date().toISOString(),
    };
    const result = await saveDermScoresAction(
      patientId,
      {
        id: examId ?? "",
        severity_scores: [...scores, score],
      },
      visitId,
    );
    setSaving(false);
    if (result.ok) {
      toast.success(`${kind} score saved to the encounter`);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-control border border-hairline p-0.5">
        {(["GAGS", "PASI", "ABCDE"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setKind(option)}
            className={cn(
              "rounded-[6px] px-3 py-1 text-[12px] font-semibold transition-colors",
              kind === option
                ? "bg-primary text-white"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            {option}
          </button>
        ))}
      </div>

      {kind === "GAGS" && (
        <div className="space-y-2">
          {GAGS_SITES.map((site) => (
            <div key={site.key} className="flex items-center gap-2">
              <span className="w-28 shrink-0 text-[12px] text-text-secondary">
                {site.label}
                <span className="text-ink-faint"> ×{site.weight}</span>
              </span>
              <NativeSelect
                aria-label={`${site.label} lesion score`}
                value={gags[site.key] ?? 0}
                onChange={(event) =>
                  setGags((current) => ({
                    ...current,
                    [site.key]: Number(event.target.value),
                  }))
                }
              >
                {GAGS_LESION_SCORES.map((label, index) => (
                  <option key={label} value={index}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ))}
        </div>
      )}

      {kind === "PASI" && (
        <div className="space-y-3">
          {PASI_AREAS.map((area) => (
            <div key={area.key} className="space-y-1.5">
              <p className="text-[12px] font-semibold text-text-secondary">
                {area.label}
              </p>
              <NativeSelect
                aria-label={`${area.label} area involved`}
                value={pasi[`${area.key}_area`] ?? 0}
                onChange={(event) =>
                  setPasi((current) => ({
                    ...current,
                    [`${area.key}_area`]: Number(event.target.value),
                  }))
                }
              >
                {PASI_AREA_OPTIONS.map((label, index) => (
                  <option key={label} value={index}>
                    Area: {label}
                  </option>
                ))}
              </NativeSelect>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    ["e", "Erythema"],
                    ["i", "Induration"],
                    ["d", "Desquamation"],
                  ] as const
                ).map(([key, label]) => (
                  <NativeSelect
                    key={key}
                    aria-label={`${area.label} ${label}`}
                    value={pasi[`${area.key}_${key}`] ?? 0}
                    onChange={(event) =>
                      setPasi((current) => ({
                        ...current,
                        [`${area.key}_${key}`]: Number(event.target.value),
                      }))
                    }
                  >
                    {PASI_SEVERITY.map((option, index) => (
                      <option key={option} value={index}>
                        {label}: {option}
                      </option>
                    ))}
                  </NativeSelect>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {kind === "ABCDE" && (
        <div className="space-y-2">
          {ABCDE_ITEMS.map((item) => (
            <label
              key={item.key}
              className="text-ink flex items-center gap-2 text-[12.5px] font-medium"
            >
              <input
                type="checkbox"
                checked={abcde[item.key] ?? false}
                onChange={(event) =>
                  setAbcde((current) => ({
                    ...current,
                    [item.key]: event.target.checked,
                  }))
                }
                disabled={!canManage}
                className="size-4 accent-[var(--color-primary)]"
              />
              {item.label}
            </label>
          ))}
        </div>
      )}

      <div className="rounded-card border border-hairline bg-app/60 p-3">
        <p className="text-ink-faint text-[11px] uppercase tracking-wide">
          {kind} total
        </p>
        <p className="text-2xl font-bold text-text-primary">{total}</p>
        <p className="text-[12px] text-text-secondary">{band}</p>
        <p className="text-ink-faint mt-1 text-[10.5px]">
          A score is not a diagnosis — document the clinical impression above.
        </p>
      </div>

      {canManage && (
        <Button
          type="button"
          size="sm"
          onClick={saveScore}
          disabled={saving || (kind !== "ABCDE" && total === 0)}
          className="w-full gap-1.5"
        >
          <Save aria-hidden="true" className="size-3.5" />
          {saving ? "Saving…" : "Save score to encounter"}
        </Button>
      )}

      {scores.length > 0 && (
        <div className="space-y-1.5 border-t border-hairline pt-3">
          <p className="text-ink-faint text-[11px] font-bold uppercase tracking-wide">
            Saved scores
          </p>
          {[...scores].reverse().map((score, index) => (
            <div
              key={`${score.recordedAt}-${index}`}
              className="flex items-center justify-between text-[12px]"
            >
              <span className="text-text-secondary">
                {score.kind}
                {score.band ? ` — ${score.band}` : ""}
              </span>
              <span className="font-semibold text-text-primary">
                {score.total}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
