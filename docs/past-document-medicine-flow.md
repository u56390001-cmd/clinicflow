# Old Patient + Past Documents: What Shows Where

Investigated 2026-10-01. Nothing changed yet — findings only.

## Short answer

Three **separate** data sources. Your observation was correct, nothing is broken:

| Where | Comes from | Edit Profile medicines? |
|---|---|---|
| AI Summary card | `patients.ai_summary` (cached text, written by document OCR only) | **No** |
| Ambient Copilot | `patient.known_allergies` + `patient.current_medications` | **Yes** (as AI prompt context) |
| Prescription treatment sidebar | `patient_medications WHERE source = 'ai_ocr'` | **No** |
| Overview tab | merges profile + prescribed + OCR meds (`source: 'registration'`) | **Yes** |

So: history + AI summary repeating is correct (cached from the earlier scan).
Edit Profile medicines not showing in the Rx sidebar is also correct — that rail is OCR-only.

## Real bug found (your upload error)

`lib/actions/ocr-actions.ts:287`

```ts
if (!extracted.success || extracted.data.items.length === 0) {
  await cleanup();              // deletes the uploaded scan
  return { ok: false, message: "We couldn't find any past illnesses..." };
}
```

The OCR model **does** return `medications` (schema: `ocrExtractedDocSchema.medications`),
but they are saved at line 373 — **after** this guard.

Result: a document that is only a prescription/treatment (medicines, no past illness or surgery)
→ `items` is empty → error shown → scan deleted → **extracted medicines thrown away**.

That is exactly the "treatment tha document me, phir bhi error" case.

## Recommended fix

Change the guard to fail only when *nothing* was extracted:

```ts
const { items, medications, allergies, known_cases } = extracted.data;
if (!extracted.success || (items.length + medications.length + allergies.length + known_cases.length) === 0) {
```

Also needs: the history insert at line 320 must not fail/require rows when `items` is empty
(skip it), and the success message should report what was actually found.

## Open question for you

Should profile (Edit Profile) medicines appear in the prescription sidebar too?
Currently Overview tab shows them, Rx sidebar does not. Pick one behaviour — my
recommendation: **no**, keep the Rx rail OCR-only so "scanned medicines" means what it says,
and let Overview carry registration data.

## Files

- `lib/actions/ocr-actions.ts` — the guard + pipeline
- `lib/validation/ocr-intake-schema.ts` — schema (has `medications`)
- `components/patients/record/prescriptions-tab.tsx:201` — OCR-only filter
- `components/patients/record/overview-tab.tsx:143` — profile meds merged
- `components/patients/record/prescription-workspace.tsx:1386` — copilot profile