/**
 * Serializable patient context handed to the telehealth workspace.
 *
 * It is built by the patient record, which already holds the clinical read
 * (`patient` + `record` + `documents`), so the call workspace never issues its
 * own record queries. Everything here is a plain value: the launcher is a
 * Client Component and the context crosses the server → client boundary.
 */
export type TelehealthContextItem = {
  label: string;
  value: string;
};

export type TelehealthDocumentItem = {
  id: string;
  name: string;
  /** e.g. "image/jpeg · 17 Oct 2026". */
  meta: string;
};

export type TelehealthPhotoItem = {
  id: string;
  label: string;
  /** e.g. "baseline · 17 Oct 2026". */
  meta: string;
};

export type TelehealthShortcut = {
  label: string;
  href: string;
  /** The workspace's own writing surface (Rx / session note). */
  primary?: boolean;
};

export type TelehealthPatientContext = {
  name: string;
  patientCode: string | null;
  age: number | null;
  gender: string | null;
  phone: string | null;
  /** Recorded allergies, one free-text string. */
  allergies: string | null;
  /** "In consultation · token 12" when a visit is live, else null. */
  visitLabel: string | null;
  /** Diagnoses, current medicines, recent procedures — newest first. */
  clinical: TelehealthContextItem[];
  documents: TelehealthDocumentItem[];
  /** Dermatology photo tags only. */
  photos: TelehealthPhotoItem[];
  shortcuts: TelehealthShortcut[];
  /** Dermatology workspaces can tag a captured frame onto the photo record. */
  dermPhotoTagging: boolean;
};
