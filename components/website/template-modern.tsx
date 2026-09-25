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

export function TemplateModern({
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

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: theme.fontFamily }}>
      {sortedSections.map((section) => {
        switch (section.id) {
          case "hero":
            return (
              <section
                key="hero"
                className="relative flex min-h-[60vh] items-center justify-center overflow-hidden"
                style={{ backgroundColor: theme.primaryColor }}
              >
                {heroImage && (
                  <Image
                    src={heroImage.url}
                    alt={heroImage.alt}
                    fill
                    priority
                    sizes="100vw"
                    className="object-cover opacity-40"
                  />
                )}
                <div className="relative z-10 mx-auto max-w-4xl px-6 py-24 text-center text-white">
                  {content.hero.headline && (
                    <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                      {content.hero.headline}
                    </h1>
                  )}
                  {content.hero.description && (
                    <p className="mx-auto mt-6 max-w-2xl text-lg opacity-90">
                      {content.hero.description}
                    </p>
                  )}
                  {(content.hero.ctaText || (content.hero.ctaSecondaryLabel && clinic.phone)) && (
                    <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                      {content.hero.ctaText && (
                        <a
                          href={content.hero.ctaUrl || `/widget/${widgetSlug}`}
                          onClick={handlePrimaryCta}
                          className="rounded-full bg-white px-8 py-3 text-sm font-semibold transition hover:bg-slate-100"
                          style={{ color: theme.primaryColor }}
                        >
                          {content.hero.ctaText}
                        </a>
                      )}
                      {content.hero.ctaSecondaryLabel && clinic.phone && (
                        <a
                          href={`tel:${clinic.phone}`}
                          className="rounded-full border border-white/60 px-8 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
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
              <section key="about" className="mx-auto max-w-4xl px-6 py-20">
                <h2
                  className="text-3xl font-bold"
                  style={{ color: theme.primaryColor }}
                >
                  About
                </h2>
                <div
                  className={`mt-6 gap-8 ${doctorImage ? "flex flex-col sm:flex-row" : ""}`}
                >
                  {doctorImage && (
                    <div className="relative h-64 w-full flex-shrink-0 overflow-hidden rounded-lg sm:w-56">
                      <Image
                        src={doctorImage.url}
                        alt={doctorImage.alt || "Doctor portrait"}
                        fill
                        sizes="224px"
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
                            className="rounded-full px-3 py-1 text-xs font-medium"
                            style={{
                              borderColor: `${theme.primaryColor}55`,
                              color: theme.primaryColor,
                              backgroundColor: `${theme.primaryColor}14`,
                              border: `1px solid ${theme.primaryColor}55`,
                            }}
                          >
                            {cert}
                          </li>
                        ))}
                      </ul>
                    )}
                    {content.about.credentials && (
                      <div className="mt-6 rounded-lg bg-slate-50 p-6">
                        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
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
              <section key="services" className="bg-slate-50 px-6 py-20">
                <div className="mx-auto max-w-4xl">
                  <h2
                    className="text-3xl font-bold"
                    style={{ color: theme.primaryColor }}
                  >
                    Services
                  </h2>
                  <div className="mt-8 grid gap-4 sm:grid-cols-2">
                    {services
                      .filter((s) => s.status === "active")
                      .map((service) => (
                        <div
                          key={service.id}
                          className="rounded-lg border bg-white p-5 shadow-sm"
                        >
                          <h3 className="font-semibold text-slate-800">
                            {service.name}
                          </h3>
                          {service.description && (
                            <p className="mt-1 text-sm text-slate-500">
                              {service.description}
                            </p>
                          )}
                          <div className="mt-3 flex items-center gap-3 text-sm text-slate-600">
                            <span>{service.duration_minutes} min</span>
                            <span className="text-slate-300">|</span>
                            <span>${service.price.toFixed(2)}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </section>
            );

          case "gallery":
            return galleryImages.length > 0 ? (
              <section key="gallery" className="mx-auto max-w-4xl px-6 py-20">
                <h2
                  className="text-3xl font-bold"
                  style={{ color: theme.primaryColor }}
                >
                  Gallery
                </h2>
                <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3">
                  {galleryImages.map((img) => (
                    <div
                      key={img.id}
                      className="group relative aspect-square overflow-hidden rounded-lg"
                    >
                      <Image
                        src={img.url}
                        alt={img.alt}
                        fill
                        sizes="(min-width: 768px) 33vw, 50vw"
                        className="object-cover transition group-hover:scale-105"
                      />
                    </div>
                  ))}
                </div>
              </section>
            ) : null;

          case "contact":
            return (
              <section
                key="contact"
                className="px-6 py-20"
                style={{ backgroundColor: theme.primaryColor }}
              >
                <div className="mx-auto max-w-4xl text-white">
                  <h2 className="text-3xl font-bold">Contact Us</h2>
                  <div className="mt-8 grid gap-8 sm:grid-cols-2">
                    <div className="space-y-4">
                      {content.contact.showPhone && clinic.phone && (
                        <div>
                          <p className="text-sm font-medium opacity-75">Phone</p>
                          <p className="text-lg">{clinic.phone}</p>
                        </div>
                      )}
                      {content.contact.showEmail && clinic.email && (
                        <div>
                          <p className="text-sm font-medium opacity-75">Email</p>
                          <p className="text-lg">{clinic.email}</p>
                        </div>
                      )}
                      {content.contact.showAddress && clinic.address && (
                        <div>
                          <p className="text-sm font-medium opacity-75">Address</p>
                          <p className="text-lg">{clinic.address}</p>
                        </div>
                      )}
                    </div>
                    {content.contact.showHours && (
                      <div>
                        <p className="text-sm font-medium opacity-75">Opening Hours</p>
                        <div className="mt-2 space-y-1">
                          {availabilityRules.map((rule) => (
                            <div
                              key={rule.day_of_week}
                              className="flex justify-between text-sm"
                            >
                              <span className="font-medium">
                                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][
                                  rule.day_of_week
                                ]}
                              </span>
                              <span className="opacity-90">
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
                    <div className="mt-8 overflow-hidden rounded-lg">
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
                      className="mt-8 inline-block rounded-full bg-white px-8 py-3 text-sm font-semibold transition hover:bg-slate-100"
                      style={{ color: theme.primaryColor }}
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
