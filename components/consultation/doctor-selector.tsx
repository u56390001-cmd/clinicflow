"use client";

/**
 * TEMPORARY WORKAROUND — Doctor Selector
 *
 * This component allows an admin to manually pick which doctor's queue to view
 * when no doctor is linked to the logged-in user (user_id = null on doctors table).
 *
 * TODO: Remove this component once doctor role-based login is implemented.
 * When a doctor logs in with their own account and their user_id is set in the
 * doctors table, findDoctorForUser() will return the correct doctor automatically
 * and this selector becomes unnecessary.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { Stethoscope, ChevronDown } from "lucide-react";

type DoctorOption = {
  id: string;
  name: string;
  specialty: string | null;
};

export function DoctorSelector({ doctors }: { doctors: DoctorOption[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentDocId = searchParams.get("doc") ?? "";

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    if (e.target.value) {
      params.set("doc", e.target.value);
    } else {
      params.delete("doc");
    }
    // Remove active visit param when switching doctor
    params.delete("visit");
    router.push(`?${params.toString()}`);
  }

  if (doctors.length === 0) return null;

  const selected = doctors.find((d) => d.id === currentDocId);

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex items-center">
        <Stethoscope
          className="pointer-events-none absolute left-3 h-4 w-4 text-primary"
          aria-hidden="true"
        />
        <select
          value={currentDocId}
          onChange={handleChange}
          className="h-9 appearance-none rounded-control border border-text-muted/30 bg-surface py-0 pl-9 pr-8 text-sm font-medium text-text-primary shadow-card transition-colors hover:border-primary/40 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
          aria-label="Select doctor"
        >
          <option value="">All Doctors</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
              {d.specialty ? ` · ${d.specialty}` : ""}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-text-muted"
          aria-hidden="true"
        />
      </div>
      {selected && (
        <span className="text-xs text-text-secondary">
          Showing {selected.name}&apos;s queue
        </span>
      )}
    </div>
  );
}
