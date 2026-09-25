"use client";

import Image from "next/image";
import type { WebsiteConfig } from "@/types/website";

type TemplateImage = {
  id: string;
  kind: string;
  url: string;
  alt: string;
  position: number;
};

type Props = {
  config: WebsiteConfig;
  images: TemplateImage[];
  clinic: {
    name: string;
    doctor_name: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
  };
  services: Array<{
    id: string;
    name: string;
    description: string | null;
    duration_minutes: number;
    price: number;
    status: string;
  }>;
  availabilityRules: Array<{
    day_of_week: number;
    start_time: string;
    end_time: string;
    enabled: boolean;
  }>;
  widgetSlug: string;
};

export function TemplateMinimal({
  config,
  images,
  clinic,
  services,
  availabilityRules,
  widgetSlug,
}: Props) {
  const { content, theme } = config;
  const heroImage = images.find((img) => img.kind === "hero");
  const doctorImage = images.find((img) => img.kind === "doctor");
  const galleryImages = images.filter((img) => img.kind === "gallery");
  const sortedSections = [...content.sections]
    .filter((s) => s.visible)
    .sort((a, b) => a.order - b.order);

  // Primary CTA opens the floating AI widget when it is embedded on the page;
  // falls back to navigating to the standalone chat page.
  const widgetApi = () =>
    (window as { MedBookWidget?: { open?: () => void } }).MedBookWidget;

  const handlePrimaryCta = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (content.hero.ctaUrl) return;
    if (widgetApi()?.open) {
      e.preventDefault();
      widgetApi()!.open!();
    }
  };

  const handleContactCta = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (widgetApi()?.open) {
      e.preventDefault();
      widgetApi()!.open!();
    }
  };

  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: theme.fontFamily }}>
      {sortedSections.map((section) => {
        switch (section.id) {
          case "hero":
            return (
              <section key="hero" className="mx-auto max-w-3xl px-6 pt-24 pb-16">
                {heroImage && (
                  <div className="relative mb-8 aspect-video overflow-hidden rounded-lg">
                    <Image
                      src={heroImage.url}
                      alt={heroImage.alt}
                      fill
                      priority
                      sizes="(min-width: 768px) 768px, 100vw"
                      className="object-cover"
                    />
                  </div>
                )}
                <h1 className="text-3xl font-light tracking-tight text-slate-900 sm:text-4xl">
                  {content.hero.headline || clinic.name}
                </h1>
                {content.hero.description && (
                  <p className="mt-4 text-lg text-slate-500">
                    {content.hero.description}
                  </p>
                )}
                {(content.hero.ctaText || (content.hero.ctaSecondaryLabel && clinic.phone)) && (
                  <div className="mt-8 flex flex-wrap items-center gap-6">
                    {content.hero.ctaText && (
                      <a
                        href={content.hero.ctaUrl || `/widget/${widgetSlug}`}
                        onClick={handlePrimaryCta}
                        className="border-b-2 pb-0.5 text-sm font-medium transition"
                        style={{ color: theme.primaryColor, borderColor: theme.primaryColor }}
                      >
                        {content.hero.ctaText}
                      </a>
                    )}
                    {content.hero.ctaSecondaryLabel && clinic.phone && (
                      <a
                        href={`tel:${clinic.phone}`}
                        className="text-sm font-medium text-slate-500 transition hover:text-slate-800"
                      >
                        {content.hero.ctaSecondaryLabel}
                      </a>
                    )}
                  </div>
                )}
              </section>
            );

          case "about":
            return (
              <section key="about" className="mx-auto max-w-3xl px-6 py-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  About
                </h2>
                <div className={`mt-4 gap-8 ${doctorImage ? "flex flex-col sm:flex-row" : ""}`}>
                  {doctorImage && (
                    <div className="relative h-56 w-full flex-shrink-0 overflow-hidden rounded sm:w-44">
                      <Image
                        src={doctorImage.url}
                        alt={doctorImage.alt || "Doctor portrait"}
                        fill
                        sizes="176px"
                        className="object-cover"
                      />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    {content.about.bio && (
                      <p className="whitespace-pre-line text-slate-600 leading-relaxed">
                        {content.about.bio}
                      </p>
                    )}
                    {(content.about.certifications?.length ?? 0) > 0 && (
                      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
                        {content.about.certifications!.map((cert) => (
                          <li key={cert} className="text-xs text-slate-500">
                            {cert}
                          </li>
                        ))}
                      </ul>
                    )}
                    {content.about.credentials && (
                      <p className="mt-4 text-sm text-slate-500">{content.about.credentials}</p>
                    )}
                  </div>
                </div>
              </section>
            );

          case "services":
            return (
              <section key="services" className="mx-auto max-w-3xl px-6 py-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  Services
                </h2>
                <div className="mt-6 space-y-4">
                  {services
                    .filter((s) => s.status === "active")
                    .map((service) => (
                      <div key={service.id} className="flex items-baseline justify-between">
                        <div>
                          <span className="font-medium text-slate-800">{service.name}</span>
                          {service.description && (
                            <span className="ml-2 text-sm text-slate-400">
                              — {service.description}
                            </span>
                          )}
                        </div>
                        <div className="ml-4 flex shrink-0 gap-4 text-sm text-slate-500">
                          <span>{service.duration_minutes}m</span>
                          <span style={{ color: theme.primaryColor }}>${service.price.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </section>
            );

          case "gallery":
            return galleryImages.length > 0 ? (
              <section key="gallery" className="mx-auto max-w-3xl px-6 py-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  Gallery
                </h2>
                <div className="mt-6 grid grid-cols-3 gap-2">
                  {galleryImages.map((img) => (
                    <div
                      key={img.id}
                      className="relative aspect-square overflow-hidden rounded"
                    >
                      <Image
                        src={img.url}
                        alt={img.alt}
                        fill
                        sizes="(min-width: 768px) 256px, 33vw"
                        className="object-cover"
                      />
                    </div>
                  ))}
                </div>
              </section>
            ) : null;

          case "contact":
            return (
              <section key="contact" className="mx-auto max-w-3xl px-6 py-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  Contact
                </h2>
                <div className="mt-6 flex flex-wrap gap-x-12 gap-y-4 text-sm text-slate-600">
                  {content.contact.showPhone && clinic.phone && (
                    <div>
                      <p className="text-xs text-slate-400">Phone</p>
                      <p className="mt-0.5">{clinic.phone}</p>
                    </div>
                  )}
                  {content.contact.showEmail && clinic.email && (
                    <div>
                      <p className="text-xs text-slate-400">Email</p>
                      <p className="mt-0.5">{clinic.email}</p>
                    </div>
                  )}
                  {content.contact.showAddress && clinic.address && (
                    <div>
                      <p className="text-xs text-slate-400">Address</p>
                      <p className="mt-0.5">{clinic.address}</p>
                    </div>
                  )}
                </div>
                {content.contact.showHours && (
                  <div className="mt-6">
                    <p className="text-xs text-slate-400">Hours</p>
                    <div className="mt-2 grid grid-cols-2 gap-x-8 gap-y-1 text-sm text-slate-600 sm:grid-cols-4">
                      {availabilityRules.map((rule) => (
                        <div key={rule.day_of_week} className="flex justify-between">
                          <span>{dayLabels[rule.day_of_week]}</span>
                          <span className="text-slate-400">
                            {rule.enabled
                              ? `${rule.start_time.slice(0, 5)}-${rule.end_time.slice(0, 5)}`
                              : "-"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {content.contact.mapEmbedUrl?.startsWith("https://") && (
                  <div className="mt-6 overflow-hidden rounded border border-slate-200">
                    <iframe
                      src={content.contact.mapEmbedUrl}
                      title={`${clinic.name} location map`}
                      width="100%"
                      height="280"
                      style={{ border: 0 }}
                      loading="lazy"
                      allowFullScreen
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  </div>
                )}
                {content.contact.bookingCtaText && (
                  <a
                    href={`/widget/${widgetSlug}`}
                    onClick={handleContactCta}
                    className="mt-8 inline-block border-b-2 pb-0.5 text-sm font-medium transition"
                    style={{ color: theme.primaryColor, borderColor: theme.primaryColor }}
                  >
                    {content.contact.bookingCtaText}
                  </a>
                )}
              </section>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}
