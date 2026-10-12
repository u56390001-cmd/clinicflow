"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Stethoscope, ChevronDown, Users } from "lucide-react";
import { resolveDoctorWorkspace } from "@/lib/specialty-workspaces";

export type ClinicDoctorOption = {
  id: string;
  name: string;
  specialty: string | null;
};

export function PatientDoctorSelector({
  doctors,
  selectedDoctorId,
}: {
  doctors: ClinicDoctorOption[];
  selectedDoctorId?: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentDocId = searchParams.get("doc") ?? selectedDoctorId ?? "";

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    if (e.target.value) {
      params.set("doc", e.target.value);
    } else {
      params.delete("doc");
    }
    // Reset page to 1 when changing doctor filter
    params.delete("page");
    router.push(`?${params.toString()}`);
  }

  if (doctors.length === 0) return null;

  const currentDoctor = doctors.find((d) => d.id === currentDocId);
  const workspaceKind = currentDoctor
    ? resolveDoctorWorkspace(currentDoctor.specialty)
    : "all";

  return (
    <div className="mt-2.5 flex flex-col gap-1.5 rounded-[8px] border border-text-muted/20 bg-app/50 p-2">
      <div className="flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1.5 font-medium text-text-secondary">
          {currentDoctor ? (
            <Stethoscope className="size-3.5 text-primary shrink-0" aria-hidden="true" />
          ) : (
            <Users className="size-3.5 text-text-muted shrink-0" aria-hidden="true" />
          )}
          {currentDoctor ? "Doctor Workspace" : "Patient Filter"}
        </span>
        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary capitalize">
          {currentDoctor ? workspaceKind : "All Clinic"}
        </span>
      </div>
      <div className="relative flex items-center">
        <select
          value={currentDocId}
          onChange={handleChange}
          aria-label="Filter patients by doctor"
          className="w-full h-8 appearance-none rounded-[6px] border border-text-muted/25 bg-surface py-0 pl-2.5 pr-7 text-[12px] font-medium text-text-primary shadow-xs transition-colors hover:border-primary/40 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
        >
          <option value="">All Doctors (All Patients)</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} {d.specialty ? `— ${d.specialty}` : ""}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2 size-3.5 text-text-muted"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
