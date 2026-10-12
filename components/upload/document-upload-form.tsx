"use client";

import { useRef, useState } from "react";
import { Check, FileText, UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { submitDocumentUploadLinkAction } from "@/lib/actions/patient-links";

/**
 * The patient-facing document upload. Files go to the same private
 * `patient-documents` bucket the clinic uses; the link stays valid until it
 * expires so a patient can upload several reports in one sitting.
 */
export function DocumentUploadForm({
  token,
  preview,
}: {
  token: string;
  preview: { patientFirstName: string; clinicName: string };
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (working) return;
    setWorking(true);
    setError(null);
    setFileName(file.name);

    const form = new FormData();
    form.set("token", token);
    form.set("file", file);

    const res = await submitDocumentUploadLinkAction(null, form);
    setWorking(false);
    setFileName(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setUploaded((prev) => [...prev, res.data.fileName]);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
        {preview.clinicName}
      </p>
      <h1 className="mt-1 text-2xl font-extrabold text-text-primary">
        Upload documents
      </h1>
      <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
        Send any prior reports, prescriptions or assessment documents to{" "}
        {preview.clinicName}. They are stored privately and shared only with your
        clinician.
      </p>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
        >
          {error}
        </p>
      )}

      <div className="mt-5 rounded-panel border border-dashed border-hairline bg-surface px-6 py-10 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10">
          {working ? (
            <Spinner />
          ) : (
            <UploadCloud aria-hidden="true" className="size-7 text-primary" />
          )}
        </div>
        <p className="mt-3 text-sm font-semibold text-text-primary">
          {working ? `Uploading ${fileName}…` : "Choose a file to upload"}
        </p>
        <p className="mt-1 text-[11px] text-text-muted">
          PDF, PNG, JPEG or WebP · up to 10 MB per file
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <Button
          type="button"
          variant="secondary"
          className="mt-4"
          disabled={working}
          onClick={() => inputRef.current?.click()}
        >
          {working ? "Uploading…" : "Select file"}
        </Button>
      </div>

      {uploaded.length > 0 && (
        <div className="mt-5 rounded-panel border border-hairline bg-white p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
            Uploaded
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {uploaded.map((name, index) => (
              <li key={`${name}-${index}`} className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-md bg-emerald-100">
                  <Check aria-hidden="true" className="size-4 text-emerald-600" />
                </span>
                <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] font-medium text-text-primary">
                  <FileText aria-hidden="true" className="size-3.5 shrink-0 text-text-muted" />
                  <span className="truncate">{name}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-text-muted">
            You can upload another file, or close this page.
          </p>
        </div>
      )}
    </div>
  );
}
