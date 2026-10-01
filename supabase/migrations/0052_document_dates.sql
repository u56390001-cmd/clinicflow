-- Migration: document dates on everything a scan produces.
--
-- A prescription written in March 2018 tells the doctor something quite
-- different from one written last month, and the same is true of the history,
-- medication and allergy rows extracted from it. `uploaded_at` only records
-- when the file reached the system, so the date printed ON the document is kept
-- separately on every row it produced:
--
--   * medical_history.report_date    — date of the scan the entry came from
--   * patient_medications.report_date — ditto (0050)
--   * patient_alerts.report_date      — ditto (0051)
--   * patient_documents.document_date — the document's own date (0029 table)
--
-- Deliberately distinct from medical_history.date, which is when the CONDITION
-- started; a chronic condition from a 2018 report keeps its own onset date and
-- still reports when that report was written.
--
-- Every statement is ADD COLUMN IF NOT EXISTS so this file is re-runnable and
-- safe whether or not 0050/0051 have been applied yet.

ALTER TABLE medical_history
  ADD COLUMN IF NOT EXISTS report_date DATE;

ALTER TABLE patient_medications
  ADD COLUMN IF NOT EXISTS report_date DATE;

ALTER TABLE patient_alerts
  ADD COLUMN IF NOT EXISTS report_date DATE;

ALTER TABLE patient_documents
  ADD COLUMN IF NOT EXISTS document_date DATE;

-- Pending OCR rows are filtered by status and read newest-first; the document
-- date is only ever rendered alongside those rows, so it does not need its own
-- index (existing idx_*_patient indexes already cover the read path).