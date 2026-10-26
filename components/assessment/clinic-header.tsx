"use client";

import { clinicLogoPublicUrl } from "@/lib/clinic-logo-url";

/**
 * White-labelled identity block for the patient-facing link forms. Every
 * element comes from the clinic that minted the share link — name, logo,
 * phone, address — so the page reads as *the clinic's* portal. No platform
 * branding is ever rendered around it.
 */
export function ClinicHeader({
  clinicName,
  phone,
  address,
  logoPath,
}: {
  clinicName: string;
  phone?: string | null;
  address?: string | null;
  logoPath?: string | null;
}) {
  const logoUrl = clinicLogoPublicUrl(logoPath ?? null);
  const contact = [phone?.trim() || null, address?.trim() || null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="text-center">
      {logoUrl && (
        <img
          src={logoUrl}
          alt={`${clinicName} logo`}
          className="mx-auto mb-3 h-16 w-16 rounded-panel border border-hairline bg-white object-contain p-1.5"
        />
      )}
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
        {clinicName}
      </p>
      <p className="mt-1 text-lg font-extrabold text-text-primary">
        Official Clinical Assessment Portal
      </p>
      {contact && (
        <p className="mt-1 text-[11.5px] leading-relaxed text-text-secondary">{contact}</p>
      )}
    </div>
  );
}
