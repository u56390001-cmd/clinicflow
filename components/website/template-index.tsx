import { TemplateModern } from "./template-modern";
import { TemplateClassic } from "./template-classic";
import { TemplateMinimal } from "./template-minimal";
import type { SiteAvailabilityRule, SiteDoctor, SiteImage, SiteService } from "@/components/website/site-sections";
import type { WebsiteConfig, WebsiteLocaleContent } from "@/types/website";

export type TemplateProps = {
  config: WebsiteConfig;
  images: SiteImage[];
  clinic: {
    name: string;
    doctor_name: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    /** Falls back to the clinic logo from Settings when the site has none. */
    logoUrl?: string | null;
  };
  services: SiteService[];
  /** Added in the Phase 1 builder — the site reads ClinicFlow's doctor roster. */
  doctors?: SiteDoctor[];
  availabilityRules: SiteAvailabilityRule[];
  widgetSlug: string;
  /**
   * Public slug of the website, used to build internal links such as doctor
   * bios. Omitted in the builder preview, where it falls back to the clinic
   * slug.
   */
  siteSlug?: string | null;
  /**
   * Static, caller-supplied discriminator for anchor ids.
   *
   * Omitted on the public site, where `#services` is the only copy in the
   * document and the readable hash is worth keeping. The builder passes `"canvas"`
   * and `"fullscreen"` because it mounts this renderer twice at once and a bare
   * `id="services"` would then resolve to whichever copy came first in the DOM —
   * usually the preview hidden behind the fullscreen overlay, making nav clicks
   * look broken.
   *
   * This is deliberately a plain prop and not `useId()`. `useId` is derived from
   * the component's position in the render tree, so it only matches between the
   * server and the client while the two trees stay identical. Anything that
   * shifts the tree — a conditional wrapper, a different Suspense boundary in
   * dev — changes the value and produces a hydration mismatch on every `id` in
   * the page. A fixed string cannot drift, because there is nothing to derive.
   */
  idPrefix?: string;
  /**
   * Writing direction for the rendered page. Taken from the site config by the
   * public route; the builder passes it too so an Urdu preview lays out the way
   * the published page will.
   */
  locale?: WebsiteLocaleContent;
  /**
   * Marks a section in the preview canvas so clicking it selects that section
   * in the builder. Never set on the public site.
   */
  interactive?: boolean;
  selectedSectionId?: string | null;
  onSelectSection?: (sectionId: string) => void;
  showHeader?: boolean;
};

const TEMPLATES = {
  modern: TemplateModern,
  classic: TemplateClassic,
  minimal: TemplateMinimal,
} as const;

export function WebsiteTemplate({
  config,
  locale,
  interactive,
  selectedSectionId,
  onSelectSection,
  showHeader = true,
  idPrefix,
  ...rest
}: TemplateProps) {
  const TemplateComponent = TEMPLATES[config.template] ?? TemplateModern;
  return (
    <div
      dir={locale?.direction ?? "ltr"}
      lang={locale?.language ?? "en"}
      className="h-full"
    >
      <TemplateComponent
        config={config}
        locale={locale}
        interactive={interactive}
        selectedSectionId={selectedSectionId}
        onSelectSection={onSelectSection}
        showHeader={showHeader}
        idPrefix={idPrefix}
        {...rest}
      />
    </div>
  );
}
