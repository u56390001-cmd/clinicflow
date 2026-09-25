import { redirect } from "next/navigation";

import { patientDirectoryHref } from "@/lib/patient-directory";

/**
 * Legacy deep link. The patient record is now the detail pane of the
 * `/app/patients` workspace, selected with `?id=`, so there is one profile
 * implementation instead of two. Existing links and bookmarks land in the right
 * place — `?id=` accepts a UUID as well as a UHID.
 */
export default async function PatientProfileRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(patientDirectoryHref({ selectedId: id }));
}
