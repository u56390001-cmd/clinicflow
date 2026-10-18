"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  ClipboardList,
  FileText,
  Image as ImageIcon,
  ShieldAlert,
  Stethoscope,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { TelehealthPatientContext } from "./telehealth-context";

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-text-muted">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * The clinical context column of the telehealth workspace. It renders the facts
 * the record already read — identity, live-visit state, allergies, recent
 * clinical facts, documents, derm photo tags — plus labelled shortcuts back
 * into the record's tabs. No data is fetched here and nothing is invented: an
 * empty list simply does not render.
 */
export function TelehealthContextPanel({
  context,
  className,
}: {
  context: TelehealthPatientContext | null;
  className?: string;
}) {
  if (!context) {
    return (
      <div
        className={cn(
          "flex h-full items-center justify-center bg-surface px-4 text-center text-[12.5px] text-text-secondary",
          className,
        )}
      >
        No clinical context is available for this patient.
      </div>
    );
  }

  const ageGender = [
    context.age !== null ? `${context.age} yrs` : null,
    context.gender ?? null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-surface", className)}>
      <div className="shrink-0 space-y-2 border-b-[0.5px] border-hairline px-4 py-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="text-ink min-w-0 truncate text-[15px] font-bold">
            {context.name}
          </h2>
          {context.patientCode && (
            <span className="inline-flex shrink-0 items-center rounded-control border-[0.5px] border-hairline bg-app px-1.5 py-[2px] font-mono text-[10.5px] font-semibold tracking-tight text-text-secondary">
              {context.patientCode}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-text-secondary">
          {ageGender && <span>{ageGender}</span>}
          {context.phone && <span className="font-mono">{context.phone}</span>}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {context.visitLabel ? (
            <span className="inline-flex h-6 items-center gap-1.5 rounded-pill border-[0.5px] border-primary/30 bg-primary/10 px-2.5 text-[11.5px] font-semibold text-primary">
              {context.visitLabel}
            </span>
          ) : (
            <span className="inline-flex h-6 items-center gap-1.5 rounded-pill border-[0.5px] border-status-warning/30 bg-status-warning/10 px-2.5 text-[11.5px] font-semibold text-status-warning">
              No visit started
            </span>
          )}
        </div>

        {context.allergies && (
          <div className="flex items-start gap-1.5 rounded-control border-[0.5px] border-status-destructive/40 bg-status-destructive/10 px-2.5 py-2">
            <ShieldAlert
              aria-hidden="true"
              className="mt-[1px] size-3.5 shrink-0 text-status-destructive"
            />
            <p className="text-[11.5px] font-semibold leading-relaxed text-status-destructive">
              {context.allergies}
            </p>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {context.clinical.length > 0 && (
          <Section
            title="Clinical"
            icon={
              <Stethoscope aria-hidden="true" className="size-3.5 shrink-0" />
            }
          >
            <dl className="space-y-1.5">
              {context.clinical.map((item, index) => (
                <div
                  key={`${item.label}-${index}`}
                  className="rounded-control border-[0.5px] border-hairline bg-app px-2.5 py-1.5"
                >
                  <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-text-muted">
                    {item.label}
                  </dt>
                  <dd className="text-ink text-[12.5px] leading-snug">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          </Section>
        )}

        {context.photos.length > 0 && (
          <Section
            title="Derm photo tags"
            icon={
              <ImageIcon aria-hidden="true" className="size-3.5 shrink-0" />
            }
          >
            <ul className="space-y-1">
              {context.photos.map((photo) => (
                <li
                  key={photo.id}
                  className="flex items-baseline justify-between gap-2 rounded-control border-[0.5px] border-hairline bg-app px-2.5 py-1.5"
                >
                  <span className="text-ink min-w-0 truncate text-[12px] font-semibold">
                    {photo.label}
                  </span>
                  <span className="shrink-0 text-[10.5px] text-text-muted">
                    {photo.meta}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {context.documents.length > 0 && (
          <Section
            title="Documents"
            icon={<FileText aria-hidden="true" className="size-3.5 shrink-0" />}
          >
            <ul className="space-y-1">
              {context.documents.map((document) => (
                <li
                  key={document.id}
                  className="flex items-baseline justify-between gap-2 rounded-control border-[0.5px] border-hairline bg-app px-2.5 py-1.5"
                >
                  <span className="text-ink min-w-0 truncate text-[12px] font-semibold">
                    {document.name}
                  </span>
                  <span className="shrink-0 text-[10.5px] text-text-muted">
                    {document.meta}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {context.clinical.length === 0 &&
          context.documents.length === 0 &&
          context.photos.length === 0 && (
            <p className="text-[12px] leading-relaxed text-text-secondary">
              Nothing recorded yet on this patient. Use the shortcuts below to
              open the examination, photos or prescription tabs.
            </p>
          )}
      </div>

      {context.shortcuts.length > 0 && (
        <div className="shrink-0 border-t-[0.5px] border-hairline px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
          <h3 className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">
            <ClipboardList aria-hidden="true" className="size-3.5 shrink-0" />
            Open in record
          </h3>
          <div className="grid grid-cols-2 gap-1.5">
            {context.shortcuts.map((shortcut) => (
              <Link
                key={shortcut.href}
                href={shortcut.href}
                scroll={false}
                className={cn(
                  "inline-flex h-8 items-center justify-center truncate rounded-control px-2.5 text-[12px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                  shortcut.primary
                    ? "border-[1.5px] border-primary bg-surface text-primary hover:bg-primary/5"
                    : "hover:bg-surface-muted border-[0.5px] border-hairline bg-app text-text-secondary hover:text-text-primary",
                )}
              >
                {shortcut.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
