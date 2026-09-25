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

export function TemplateClassic({
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

  const dayLabels = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: theme.fontFamily }}>
      {sortedSections.map((section) => {
        switch (section.id) {
          case "hero":
            return (
              <section key="hero" className="relative border-b-4" style={{ borderColor: theme.primaryColor }}>
                {heroImage && (
                  <div className="relative h-[50vh] overflow-hidden">
                    <Image
                      src={heroImage.url}
                      alt={heroImage.alt}
                      fill
                      priority
                      sizes="100vw"
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                  </div>
                )}
                <div
                  className={`mx-auto max-w-5xl px-6 py-16 ${heroImage ? "relative -mt-24 z-10 text-white" : ""}`}
                >
                  <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                    {content.hero.headline || clinic.name}
                  </h1>
                  {content.hero.description && (
                    <p className="mt-4 max-w-2xl text-lg opacity-90">
                      {content.hero.description}
                    </p>
                  )}
                  {(content.hero.ctaText || (content.hero.ctaSecondaryLabel && clinic.phone)) && (
                    <div className={`mt-8 flex flex-wrap items-center gap-3 ${heroImage ? "justify-start" : ""}`}>
                      {content.hero.ctaText && (
                        <a
                          href={content.hero.ctaUrl || `/widget/${widgetSlug}`}
                          onClick={handlePrimaryCta}
                          className="inline-block rounded px-8 py-3 text-sm font-semibold text-white transition"
                          style={{ backgroundColor: theme.primaryColor }}
                        >
                          {content.hero.ctaText}
                        </a>
                      )}
                      {content.hero.ctaSecondaryLabel && clinic.phone && (
                        <a
                          href={`tel:${clinic.phone}`}
                          className="inline-block rounded border-2 px-8 py-[10px] text-sm font-semibold transition hover:opacity-80"
                          style={{ borderColor: heroImage ? "#ffffff" : theme.primaryColor, color: heroImage ? "#ffffff" : theme.primaryColor }}
                        >
                          {content.hero.ctaSecondaryLabel}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </section>
            );

          case "about":
            return (
              <section key="about" className="mx-auto max-w-5xl px-6 py-16">
                <div className="border-b-2 pb-2" style={{ borderColor: theme.primaryColor }}>
                  <h2 className="text-2xl font-bold uppercase tracking-wider" style={{ color: theme.primaryColor }}>
                    About {clinic.doctor_name ? `Dr. ${clinic.doctor_name}` : ""}
                  </h2>
                </div>
                <div className={`mt-6 gap-10 ${doctorImage ? "flex flex-col sm:flex-row" : ""}`}>
                  {doctorImage && (
                    <div className="relative h-72 w-full flex-shrink-0 overflow-hidden border-2 sm:w-64" style={{ borderColor: `${theme.primaryColor}40` }}>
                      <Image
                        src={doctorImage.url}
                        alt={doctorImage.alt || "Doctor portrait"}
                        fill
                        sizes="256px"
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
                      <ul className="mt-4 flex flex-wrap gap-2">
                        {content.about.certifications!.map((cert) => (
                          <li
                            key={cert}
                            className="px-3 py-1 text-xs font-semibold uppercase tracking-wide"
                            style={{
                              border: `1px solid ${theme.primaryColor}55`,
                              color: theme.primaryColor,
                            }}
                          >
                            {cert}
                          </li>
                        ))}
                      </ul>
                    )}
                    {content.about.credentials && (
                      <div className="mt-6 border-l-4 pl-6" style={{ borderColor: theme.primaryColor }}>
                        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                          Credentials
                        </h3>
                        <p className="mt-2 whitespace-pre-line text-slate-700">
                          {content.about.credentials}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            );

          case "services":
            return (
              <section key="services" className="mx-auto max-w-5xl px-6 py-16">
                <div className="border-b-2 pb-2" style={{ borderColor: theme.primaryColor }}>
                  <h2 className="text-2xl font-bold uppercase tracking-wider" style={{ color: theme.primaryColor }}>
                    Our Services
                  </h2>
                </div>
                <div className="mt-8 divide-y" style={{ borderColor: `${theme.primaryColor}30` }}>
                  {services
                    .filter((s) => s.status === "active")
                    .map((service) => (
                      <div key={service.id} className="flex items-center justify-between py-4">
                        <div>
                          <h3 className="font-semibold text-slate-800">{service.name}</h3>
                          {service.description && (
                            <p className="mt-1 text-sm text-slate-500">{service.description}</p>
                          )}
                        </div>
                        <div className="text-right text-sm text-slate-600">
                          <p>{service.duration_minutes} min</p>
                          <p className="font-medium" style={{ color: theme.primaryColor }}>
                            ${service.price.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              </section>
            );

          case "gallery":
            return galleryImages.length > 0 ? (
              <section key="gallery" className="mx-auto max-w-5xl px-6 py-16">
                <div className="border-b-2 pb-2" style={{ borderColor: theme.primaryColor }}>
                  <h2 className="text-2xl font-bold uppercase tracking-wider" style={{ color: theme.primaryColor }}>
                    Gallery
                  </h2>
                </div>
                <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
                  {galleryImages.map((img) => (
                    <div
                      key={img.id}
                      className="relative aspect-square overflow-hidden border"
                      style={{ borderColor: `${theme.primaryColor}20` }}
                    >
                      <Image
                        src={img.url}
                        alt={img.alt}
                        fill
                        sizes="(min-width: 768px) 25vw, 50vw"
                        className="object-cover"
                      />
                    </div>
                  ))}
                </div>
              </section>
            ) : null;

          case "contact":
            return (
              <section key="contact" className="border-t-4 bg-slate-50" style={{ borderColor: theme.primaryColor }}>
                <div className="mx-auto max-w-5xl px-6 py-16">
                  <h2 className="text-2xl font-bold uppercase tracking-wider" style={{ color: theme.primaryColor }}>
                    Contact
                  </h2>
                  <div className="mt-8 grid gap-8 sm:grid-cols-3">
                    <div className="space-y-4">
                      {content.contact.showPhone && clinic.phone && (
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Phone</p>
                          <p className="mt-1 font-medium text-slate-800">{clinic.phone}</p>
                        </div>
                      )}
                      {content.contact.showEmail && clinic.email && (
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Email</p>
                          <p className="mt-1 font-medium text-slate-800">{clinic.email}</p>
                        </div>
                      )}
                      {content.contact.showAddress && clinic.address && (
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Address</p>
                          <p className="mt-1 font-medium text-slate-800">{clinic.address}</p>
                        </div>
                      )}
                    </div>
                    {content.contact.showHours && (
                      <div className="sm:col-span-2">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Opening Hours</p>
                        <div className="mt-3 space-y-1">
                          {availabilityRules.map((rule) => (
                            <div key={rule.day_of_week} className="flex justify-between text-sm">
                              <span className="font-medium text-slate-700">{dayLabels[rule.day_of_week]}</span>
                              <span className="text-slate-500">
                                {rule.enabled
                                  ? `${rule.start_time.slice(0, 5)} - ${rule.end_time.slice(0, 5)}`
                                  : "Closed"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {content.contact.mapEmbedUrl?.startsWith("https://") && (
                    <div className="mt-8 overflow-hidden border" style={{ borderColor: `${theme.primaryColor}30` }}>
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
                      className="mt-8 inline-block rounded px-8 py-3 text-sm font-semibold text-white transition"
                      style={{ backgroundColor: theme.primaryColor }}
                    >
                      {content.contact.bookingCtaText}
                    </a>
                  )}
                </div>
              </section>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}
