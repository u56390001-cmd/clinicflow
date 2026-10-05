"use client";

import { useEffect, useState } from "react";
import {
  Globe2,
  Image as ImageIcon,
  LayoutList,
  Loader2,
  Palette,
  Smartphone,
  Tag,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChipList,
  ColorField,
  InspectorGroup,
  LiveDataNote,
  LongTextField,
  Segmented,
  TextField,
  ToggleRow,
} from "@/components/website/editor-fields";
import { ImageManager } from "@/components/website/website-images";
import {
  connectWebsiteDomain,
  disconnectWebsiteDomain,
  readWebsiteDomain,
  verifyWebsiteDomain,
} from "@/lib/actions/website";
import { SITE_FONT_STACKS, directionForLanguage } from "@/types/website";
import type {
  WebsiteConfig,
  WebsiteLanguage,
  WebsiteSectionId,
} from "@/types/website";
import type { WebsiteDomainStatus, WebsiteImage } from "@/types/database";
import { cn } from "@/lib/utils";

/**
 * The builder's right rail.
 *
 * One panel, six tabs, no page reload. The Content tab follows whatever section
 * is selected in the left rail — the two are views onto one piece of state, so
 * selecting from either side moves the other. The rest are page-wide settings
 * that have no natural home in a section, which is exactly why they are tabs
 * rather than more fields stuffed into Content.
 *
 * Saving is deliberately *not* here. One save button in one place is the only
 * honest version of "your changes are stored"; a second one in this panel would
 * be a second answer to that question.
 */

type TabId = "content" | "design" | "images" | "widget" | "seo" | "domain";

const TABS: ReadonlyArray<{ id: TabId; label: string; icon: LucideIcon }> = [
  { id: "content", label: "Content", icon: LayoutList },
  { id: "design", label: "Design", icon: Palette },
  { id: "images", label: "Images", icon: ImageIcon },
  { id: "widget", label: "Widget", icon: Smartphone },
  { id: "seo", label: "SEO", icon: Tag },
  { id: "domain", label: "Domain", icon: Globe2 },
];

type Props = {
  selectedSectionId: WebsiteSectionId | null;
  config: WebsiteConfig;
  images: WebsiteImage[];
  clinicId: string;
  /** Public path of this site, used to describe what a domain replaces. */
  clinicSlug: string;
  onUpdateConfig: (next: WebsiteConfig) => void;
  onUpdateImages: (next: WebsiteImage[]) => void;
  /** Collapsed to an icon rail. Owned by the builder, which sizes the column. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

export function Inspector({
  selectedSectionId,
  config,
  images,
  clinicId,
  clinicSlug,
  onUpdateConfig,
  onUpdateImages,
  collapsed,
  onToggleCollapsed,
}: Props) {
  const [tab, setTab] = useState<TabId>("content");

  // Selecting a section from the preview should land on the fields for it, not
  // leave the doctor staring at a Design tab that has nothing to do with their
  // click. Image tabs are the exception — the Images tab *is* about them.
  useEffect(() => {
    if (selectedSectionId) setTab("content");
  }, [selectedSectionId]);

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Collapsed: one icon per tab, mirroring the sections rail beside it.
          Picking a tab reopens the panel on that tab — clicking an icon that
          quietly did nothing would be worse than a slightly wider button. */}
      {collapsed ? (
        <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto bg-surface py-2">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-label={label}
              title={label}
              onClick={() => {
                setTab(id);
                onToggleCollapsed();
              }}
              className="flex size-9 items-center justify-center rounded-control text-text-secondary transition-colors hover:bg-app"
            >
              <Icon className="size-4" aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="flex gap-0.5 overflow-x-auto border-b border-text-muted/20 px-2 py-1.5">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 rounded-control px-1 py-1.5 text-[11px] font-medium transition-colors",
              tab === id
                ? "bg-primary/10 text-primary"
                : "text-text-muted hover:bg-app hover:text-text-secondary",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "content" ? (
          <ContentTab selectedSectionId={selectedSectionId} config={config} onUpdate={onUpdateConfig} />
        ) : null}
        {tab === "design" ? (
          <DesignTab config={config} onUpdate={onUpdateConfig} />
        ) : null}
        {tab === "images" ? (
          <div className="flex flex-col gap-4 px-4 py-4">
            <ImageManager
              clinicId={clinicId}
              images={images}
              onChange={onUpdateImages}
            />
          </div>
        ) : null}
        {tab === "widget" ? <WidgetTab config={config} onUpdate={onUpdateConfig} /> : null}
        {tab === "seo" ? <SeoTab config={config} onUpdate={onUpdateConfig} /> : null}
        {tab === "domain" ? <DomainTab slug={clinicSlug} /> : null}
      </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

function ContentTab({
  selectedSectionId,
  config,
  onUpdate,
}: {
  selectedSectionId: WebsiteSectionId | null;
  config: WebsiteConfig;
  onUpdate: (next: WebsiteConfig) => void;
}) {
  const { content } = config;

  if (!selectedSectionId) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
        <LayoutList className="size-7 text-text-muted" aria-hidden="true" />
        <p className="text-sm font-medium text-text-secondary">No section selected</p>
        <p className="text-xs leading-relaxed text-text-muted">
          Pick a section from the outline on the left, or click one in the preview,
          to edit what it says.
        </p>
      </div>
    );
  }

  const patch = (slot: Partial<WebsiteConfig["content"]>) =>
    onUpdate({ ...config, content: { ...content, ...slot } });

  const section = content.sections.find((entry) => entry.id === selectedSectionId);

  return (
    <div>
      {section ? (
        <InspectorGroup
          title={section.label}
          description={`Position ${section.order + 1} on the page.`}
        >
          <ToggleRow
            label="Show this section"
            description={
              section.visible
                ? "Visitors can see it on the published site."
                : "It stays on your page but is hidden from visitors."
            }
            checked={section.visible}
            onChange={(visible) =>
              patch({
                sections: content.sections.map((entry) =>
                  entry.id === section.id ? { ...entry, visible } : entry,
                ),
              })
            }
          />
        </InspectorGroup>
      ) : null}

      {selectedSectionId === "hero" ? (
        <InspectorGroup title="Hero" description="The first thing every visitor reads.">
          <LongTextField
            label="Headline"
            value={content.hero.headline}
            onChange={(value) => patch({ hero: { ...content.hero, headline: value } })}
            placeholder="Book an appointment today"
            maxLength={120}
            hint="One line. Say what the clinic is and who it is for."
          />
          <LongTextField
            label="Description"
            value={content.hero.description}
            onChange={(value) =>
              patch({ hero: { ...content.hero, description: value } })
            }
            placeholder="Evening and Saturday appointments available."
            maxLength={280}
            hint="Two sentences at most. This is what appears under the headline."
          />
          <TextField
            label="Button text"
            value={content.hero.ctaText}
            onChange={(value) => patch({ hero: { ...content.hero, ctaText: value } })}
            placeholder="Book an Appointment"
            maxLength={40}
          />
          <TextField
            label="Button link"
            value={content.hero.ctaUrl}
            onChange={(value) => patch({ hero: { ...content.hero, ctaUrl: value } })}
            placeholder="Leave empty to open the booking assistant"
            type="url"
            hint="Leave empty and the button opens your AI booking assistant instead."
          />
          <TextField
            label="Second button label"
            value={content.hero.ctaSecondaryLabel ?? ""}
            onChange={(value) =>
              patch({ hero: { ...content.hero, ctaSecondaryLabel: value || undefined } })
            }
            placeholder="Call the clinic"
            maxLength={40}
            hint="Optional. Renders as a phone link if the clinic has a number."
          />
        </InspectorGroup>
      ) : null}

      {selectedSectionId === "doctors" ? (
        <InspectorGroup title="Doctors" description="Your team, pulled from ClinicFlow.">
          <LiveDataNote>
            Names, photos, qualifications and descriptions come from the{" "}
            <strong>Doctors</strong> page. Edit them there and this section follows
            automatically — nothing to retype here.
          </LiveDataNote>
          <TextField
            label="Heading"
            value={content.doctors.title}
            onChange={(value) => patch({ doctors: { ...content.doctors, title: value } })}
            maxLength={60}
          />
          <LongTextField
            label="Description"
            value={content.doctors.description}
            onChange={(value) =>
              patch({ doctors: { ...content.doctors, description: value } })
            }
            maxLength={200}
          />
          <TextField
            label="How many doctors to show"
            value={String(content.doctors.limit)}
            onChange={(value) => {
              const limit = Number.parseInt(value, 10);
              patch({
                doctors: {
                  ...content.doctors,
                  limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 24) : 6,
                },
              });
            }}
            type="number"
            hint="Between 1 and 24. The rest stay on the Doctors page."
          />
          <TextField
            label="Button text"
            value={content.doctors.ctaText}
            onChange={(value) =>
              patch({ doctors: { ...content.doctors, ctaText: value } })
            }
            placeholder="Book with our team"
            maxLength={40}
          />
        </InspectorGroup>
      ) : null}

      {selectedSectionId === "about" ? (
        <InspectorGroup title="About clinic" description="Your story and credentials.">
          <TextField
            label="Heading"
            value={content.about.title}
            onChange={(value) => patch({ about: { ...content.about, title: value } })}
            maxLength={60}
          />
          <LongTextField
            label="Your story"
            value={content.about.bio}
            onChange={(value) => patch({ about: { ...content.about, bio: value } })}
            rows={6}
            maxLength={1200}
            hint="When the clinic opened, who founded it, what patients can expect."
          />
          <LongTextField
            label="Credentials"
            value={content.about.credentials}
            onChange={(value) =>
              patch({ about: { ...content.about, credentials: value } })
            }
            rows={3}
            maxLength={400}
            hint="Degrees, fellowships and memberships."
          />
          <ChipList
            label="Certifications"
            values={content.about.certifications ?? []}
            onChange={(values) => patch({ about: { ...content.about, certifications: values } })}
            placeholder="Board Certified"
            hint="Shown as small badges. Press Enter after each one."
          />
          <ChipList
            label="Facilities"
            values={content.about.facilities ?? []}
            onChange={(values) => patch({ about: { ...content.about, facilities: values } })}
            placeholder="On-site pharmacy"
            hint="Parking, wheelchair access, imaging — the things patients ask about."
          />
        </InspectorGroup>
      ) : null}

      {selectedSectionId === "services" ? (
        <InspectorGroup title="Services" description="Your treatments, pulled from ClinicFlow.">
          <LiveDataNote>
            Service names, durations and prices come from the{" "}
            <strong>Services</strong> page. Add, rename or retire them there and this
            list keeps itself in step.
          </LiveDataNote>
          <p className="text-sm text-text-muted">
            To change what appears, edit your services in ClinicFlow.
          </p>
        </InspectorGroup>
      ) : null}

      {selectedSectionId === "booking" ? (
        <InspectorGroup title="Booking" description="How a patient books with you.">
          <TextField
            label="Heading"
            value={content.booking.title}
            onChange={(value) => patch({ booking: { ...content.booking, title: value } })}
            maxLength={60}
          />
          <LongTextField
            label="Description"
            value={content.booking.description}
            onChange={(value) =>
              patch({ booking: { ...content.booking, description: value } })
            }
            rows={3}
            maxLength={240}
          />
          <ToggleRow
            label="Show the next opening"
            description="Adds a live line saying when you are next open, so a patient knows before they click."
            checked={content.booking.showNextSlot}
            onChange={(showNextSlot) =>
              patch({ booking: { ...content.booking, showNextSlot } })
            }
          />
          <TextField
            label="Button text"
            value={content.booking.ctaText}
            onChange={(value) =>
              patch({ booking: { ...content.booking, ctaText: value } })
            }
            maxLength={40}
          />
        </InspectorGroup>
      ) : null}

      {selectedSectionId === "gallery" ? (
        <InspectorGroup title="Gallery" description="Photos of your clinic.">
          <p className="text-sm leading-relaxed text-text-muted">
            Gallery photos are managed on the{" "}
            <strong>Images</strong> tab. Add them there and they appear here in the
            order you set.
          </p>
        </InspectorGroup>
      ) : null}

      {selectedSectionId === "experience" ? (
        <InspectorGroup
          title="Experience"
          description="Numbers that earn trust. Only claim what is true."
        >
          <TextField
            label="Heading"
            value={content.experience.title}
            onChange={(value) =>
              patch({ experience: { ...content.experience, title: value } })
            }
            maxLength={60}
          />
          <TextField
            label="Label under the first number"
            value={content.experience.yearsLabel}
            onChange={(value) =>
              patch({ experience: { ...content.experience, yearsLabel: value } })
            }
            maxLength={40}
          />
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-text-secondary">Statistics</p>
            {content.experience.stats.map((stat, index) => (
              <div key={index} className="flex gap-2 rounded-control border border-text-muted/20 bg-app p-2">
                <TextField
                  label={`Number ${index + 1}`}
                  value={stat.value}
                  onChange={(value) => {
                    const stats = [...content.experience.stats];
                    stats[index] = { ...stat, value };
                    patch({ experience: { ...content.experience, stats } });
                  }}
                  maxLength={12}
                />
                <TextField
                  label={`Caption ${index + 1}`}
                  value={stat.label}
                  onChange={(value) => {
                    const stats = [...content.experience.stats];
                    stats[index] = { ...stat, label: value };
                    patch({ experience: { ...content.experience, stats } });
                  }}
                  maxLength={40}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove statistic ${index + 1}`}
                  disabled={content.experience.stats.length <= 1}
                  onClick={() =>
                    patch({
                      experience: {
                        ...content.experience,
                        stats: content.experience.stats.filter((_, i) => i !== index),
                      },
                    })
                  }
                  className="mt-5 size-9 shrink-0"
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                patch({
                  experience: {
                    ...content.experience,
                    stats: [...content.experience.stats, { value: "", label: "" }],
                  },
                })
              }
            >
              Add a statistic
            </Button>
          </div>
        </InspectorGroup>
      ) : null}

      {selectedSectionId === "faq" ? <FaqGroup content={content} patch={patch} /> : null}

      {selectedSectionId === "contact" ? (
        <InspectorGroup title="Contact" description="How patients reach you.">
          <TextField
            label="Heading"
            value={content.contact.title}
            onChange={(value) => patch({ contact: { ...content.contact, title: value } })}
            maxLength={60}
          />
          <LiveDataNote>
            Phone, email, address and opening hours are read from ClinicFlow settings.
            Use the switches below to choose what this section shows.
          </LiveDataNote>
          <ToggleRow
            label="Phone number"
            checked={content.contact.showPhone}
            onChange={(showPhone) => patch({ contact: { ...content.contact, showPhone } })}
          />
          <ToggleRow
            label="Email address"
            checked={content.contact.showEmail}
            onChange={(showEmail) => patch({ contact: { ...content.contact, showEmail } })}
          />
          <ToggleRow
            label="Address"
            checked={content.contact.showAddress}
            onChange={(showAddress) => patch({ contact: { ...content.contact, showAddress } })}
          />
          <ToggleRow
            label="Opening hours"
            checked={content.contact.showHours}
            onChange={(showHours) => patch({ contact: { ...content.contact, showHours } })}
          />
          <TextField
            label="Button text"
            value={content.contact.bookingCtaText}
            onChange={(value) =>
              patch({ contact: { ...content.contact, bookingCtaText: value } })
            }
            maxLength={40}
          />
          <TextField
            label="Google Maps embed link"
            value={content.contact.mapEmbedUrl ?? ""}
            onChange={(value) =>
              patch({ contact: { ...content.contact, mapEmbedUrl: value } })
            }
            type="url"
            placeholder="https://www.google.com/maps/embed?pb=..."
            hint="In Google Maps, choose Share → Embed a map and paste the link here."
          />
        </InspectorGroup>
      ) : null}
    </div>
  );
}

/** FAQ items are a list, so they get add/remove/reorder rather than one field. */
function FaqGroup({
  content,
  patch,
}: {
  content: WebsiteConfig["content"];
  patch: (slot: Partial<WebsiteConfig["content"]>) => void;
}) {
  const faq = content.faq;

  return (
    <InspectorGroup
      title="Questions"
      description="What patients ask before a first appointment."
    >
      <TextField
        label="Heading"
        value={faq.title}
        onChange={(value) => patch({ faq: { ...faq, title: value } })}
        maxLength={60}
      />

      {faq.items.length === 0 ? (
        <p className="text-sm text-text-muted">
          No questions yet. Add the two or three your receptionist answers most.
        </p>
      ) : null}

      {faq.items.map((item, index) => (
        <div
          key={item.id}
          className="flex flex-col gap-2 rounded-control border border-text-muted/20 bg-app p-2.5"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Question {index + 1}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Delete question ${index + 1}`}
              onClick={() =>
                patch({ faq: { ...faq, items: faq.items.filter((_, i) => i !== index) } })
              }
              className="size-7"
            >
              <Trash2 />
            </Button>
          </div>
          <LongTextField
            label="Question"
            value={item.question}
            onChange={(value) => {
              const items = [...faq.items];
              items[index] = { ...item, question: value };
              patch({ faq: { ...faq, items } });
            }}
            rows={2}
            maxLength={200}
          />
          <LongTextField
            label="Answer"
            value={item.answer}
            onChange={(value) => {
              const items = [...faq.items];
              items[index] = { ...item, answer: value };
              patch({ faq: { ...faq, items } });
            }}
            rows={4}
            maxLength={600}
          />
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          patch({
            faq: {
              ...faq,
              items: [
                ...faq.items,
                {
                  id: crypto.randomUUID(),
                  question: "",
                  answer: "",
                },
              ],
            },
          })
        }
      >
        Add a question
      </Button>
    </InspectorGroup>
  );
}

// ---------------------------------------------------------------------------
// Design
// ---------------------------------------------------------------------------

function DesignTab({
  config,
  onUpdate,
}: {
  config: WebsiteConfig;
  onUpdate: (next: WebsiteConfig) => void;
}) {
  const { theme } = config;
  const patch = (next: Partial<typeof theme>) => onUpdate({ ...config, theme: { ...theme, ...next } });

  return (
    <div>
      <InspectorGroup
        title="Colours"
        description="Used for buttons, links, borders and section washes."
      >
        <ColorField
          label="Brand colour"
          value={theme.primaryColor}
          onChange={(primaryColor) => patch({ primaryColor })}
          hint="The main colour of your site."
        />
        <ColorField
          label="Text colour"
          value={theme.textColor}
          onChange={(textColor) => patch({ textColor })}
          hint="Headings and body copy. Keep it dark enough to read comfortably."
        />
      </InspectorGroup>

      <InspectorGroup title="Typography" description="One typeface for the whole site.">
        <Segmented
          label="Body font"
          value={theme.fontFamily}
          options={SITE_FONT_STACKS.map((font) => ({ value: font.stack, label: font.label }))}
          onChange={(fontFamily) => patch({ fontFamily })}
          hint="No extra fonts are downloaded, so your site loads as fast as ours does."
        />
        <Segmented
          label="Heading font"
          value={theme.headingFont}
          options={[
            { value: "same", label: "Same" },
            { value: "serif", label: "Serif" },
            { value: "wide", label: "Wide" },
            { value: "humanist", label: "Humanist" },
          ]}
          onChange={(headingFont) => patch({ headingFont })}
          hint="Headings only. Two faces is the most a page can carry well."
        />
      </InspectorGroup>

      <InspectorGroup title="Buttons and corners" description="Shapes every card and button.">
        <Segmented
          label="Button style"
          value={theme.buttonStyle}
          options={[
            { value: "solid", label: "Solid" },
            { value: "soft", label: "Soft" },
            { value: "outline", label: "Outline" },
            { value: "inverse", label: "Inverse" },
          ]}
          onChange={(buttonStyle) => patch({ buttonStyle })}
        />
        <Segmented
          label="Corner style"
          value={theme.cornerStyle}
          options={[
            { value: "sharp", label: "Sharp" },
            { value: "soft", label: "Soft" },
            { value: "round", label: "Round" },
          ]}
          onChange={(cornerStyle) => patch({ cornerStyle })}
        />
      </InspectorGroup>

      <InspectorGroup title="Layout" description="Where the page lines up.">
        <Segmented
          label="Heading alignment"
          value={theme.alignment}
          options={[
            { value: "left", label: "Left" },
            { value: "center", label: "Centered" },
          ]}
          onChange={(alignment) => patch({ alignment })}
          hint="Applies to the hero and every section heading."
        />
        <ToggleRow
          label="Show the header bar"
          description="A sticky bar with your logo and a Book button. Turn it off if you want the hero to run to the very top."
          checked={theme.showHeader}
          onChange={(showHeader) => patch({ showHeader })}
        />
      </InspectorGroup>

      <InspectorGroup title="Logo" description="Shown in the header bar.">
        <TextField
          label="Logo URL"
          value={theme.logoUrl}
          onChange={(logoUrl) => patch({ logoUrl })}
          type="url"
          placeholder="Leave empty to use the logo from Settings"
          hint="Paste a direct link to the image. If empty, we use the clinic logo you uploaded in Settings."
        />
      </InspectorGroup>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

function WidgetTab({
  config,
  onUpdate,
}: {
  config: WebsiteConfig;
  onUpdate: (next: WebsiteConfig) => void;
}) {
  const { widget, theme, locale } = config;
  const patch = (next: Partial<typeof widget>) =>
    onUpdate({ ...config, widget: { ...widget, ...next } });

  return (
    <div>
      <InspectorGroup
        title="Booking assistant"
        description="The floating chat bubble patients use to book."
      >
        <ToggleRow
          label="Show the assistant"
          description="A small button in the corner of every page, including doctor profiles. It is the main way patients book."
          checked={widget.enabled}
          onChange={(enabled) => patch({ enabled })}
        />
        <Segmented
          label="Button position"
          value={widget.position}
          options={[
            { value: "bottom-right", label: "Bottom right" },
            { value: "bottom-left", label: "Bottom left" },
          ]}
          onChange={(position) => patch({ position })}
        />
        <Segmented
          label="Language it opens in"
          value={widget.language}
          options={[
            { value: "en", label: "English" },
            { value: "ur", label: "Urdu" },
            { value: "ar", label: "Arabic" },
          ]}
          onChange={(language) =>
            onUpdate({
              ...config,
              widget: { ...widget, language },
              locale: { ...locale, direction: directionForLanguage(language) },
            })
          }
          hint="Sets the site writing direction to match."
        />
      </InspectorGroup>

      <InspectorGroup
        title="Button colour"
        description="Matching the site means the assistant never looks bolted on."
      >
        <Segmented
          label="Colour"
          value={widget.colorMode}
          options={[
            { value: "brand", label: "Match website" },
            { value: "custom", label: "Pick a colour" },
          ]}
          onChange={(colorMode) => patch({ colorMode })}
          hint={
            widget.colorMode === "brand"
              ? `Following the website colour ${theme.primaryColor}. Change it under Design.`
              : undefined
          }
        />
        {widget.colorMode === "custom" ? (
          <ColorField
            label="Assistant colour"
            value={widget.color}
            onChange={(color) => patch({ color })}
          />
        ) : null}
      </InspectorGroup>

      <InspectorGroup title="Clinic-wide settings">
        <p className="text-[11px] leading-relaxed text-text-muted">
          The assistant name, greeting, avatar and headline subtitle live under{" "}
          <span className="font-medium text-text-secondary">AI Agent</span>, and
          its master switch lives there too. Switching the assistant off there
          turns it off everywhere, including on this website — this tab cannot
          turn it back on.
        </p>
        <a
          href="/app/ai-settings"
          className="text-xs font-medium text-primary underline underline-offset-4"
        >
          Open AI Agent settings
        </a>
      </InspectorGroup>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SEO
// ---------------------------------------------------------------------------

function SeoTab({
  config,
  onUpdate,
}: {
  config: WebsiteConfig;
  onUpdate: (next: WebsiteConfig) => void;
}) {
  const { seo, locale } = config;
  const patch = (next: Partial<typeof seo>) => onUpdate({ ...config, seo: { ...seo, ...next } });

  const title = seo.title || "Your clinic name — Book Online";
  const description =
    seo.description || "Your one-sentence description of the clinic appears here.";

  return (
    <div>
      <InspectorGroup
        title="Search result preview"
        description="What a patient sees when your site appears in Google."
      >
        <div className="rounded-control border border-text-muted/25 bg-surface p-3">
          <p className="truncate text-xs text-text-muted">your-clinic.com</p>
          <p className="mt-0.5 truncate text-base font-medium text-[#1a0dab]">
            {title}
          </p>
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-text-secondary">
            {description}
          </p>
        </div>
        <p className="text-[11px] leading-relaxed text-text-muted">
          Google truncates titles near 60 characters and descriptions near 160.
        </p>
      </InspectorGroup>

      <InspectorGroup title="Search text" description="Optional — we derive it if you leave it blank.">
        <LongTextField
          label="Page title"
          value={seo.title}
          onChange={(value) => patch({ title: value })}
          maxLength={70}
          rows={2}
        />
        <LongTextField
          label="Page description"
          value={seo.description}
          onChange={(value) => patch({ description: value })}
          maxLength={180}
          rows={3}
        />
        <TextField
          label="Keywords"
          value={seo.keywords}
          onChange={(value) => patch({ keywords: value })}
          placeholder="dentist, teeth cleaning, appointment"
          hint="Comma separated. Modern search engines mostly ignore these, but some still read them."
        />
        <TextField
          label="Sharing image URL"
          value={seo.ogImage}
          onChange={(value) => patch({ ogImage: value })}
          type="url"
          placeholder="Leave empty to use your hero banner"
          hint="The picture WhatsApp and Facebook show when someone shares your link. Landscape, about 1200×630."
        />
      </InspectorGroup>

      <InspectorGroup title="Visibility" description="Who can find this site.">
        <ToggleRow
          label="Keep out of search results"
          description="Adds a noindex tag. Useful while you are still writing, but remember to turn it off before you finish."
          checked={seo.noindex}
          onChange={(noindex) => patch({ noindex })}
        />
      </InspectorGroup>

      <InspectorGroup title="Language" description="Helps search engines and screen readers.">
        <Segmented<WebsiteLanguage>
          label="Site language"
          value={locale.language}
          options={[
            { value: "en", label: "English" },
            { value: "ur", label: "Urdu" },
            { value: "ar", label: "Arabic" },
          ]}
          onChange={(language) =>
            onUpdate({
              ...config,
              locale: { ...locale, language, direction: directionForLanguage(language) },
            })
          }
          hint="Sets the text direction automatically. You can override it below."
        />
        <Segmented
          label="Writing direction"
          value={locale.direction}
          options={[
            { value: "ltr", label: "Left to right" },
            { value: "rtl", label: "Right to left" },
          ]}
          onChange={(direction) => onUpdate({ ...config, locale: { ...locale, direction } })}
          hint="Override if the page content does not match the language."
        />
      </InspectorGroup>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Domain
// ---------------------------------------------------------------------------

type DomainState = {
  domain: string | null;
  domain_status: WebsiteDomainStatus;
  token: string | null;
  records: {
    cname: ReadonlyArray<{ type: string; name: string; value: string }>;
    txt: ReadonlyArray<{ type: string; name: string; value: string }>;
  } | null;
};

const STATUS_COPY: Record<WebsiteDomainStatus, { label: string; variant: "outline" | "success" | "default" }> = {
  none: { label: "Not connected", variant: "outline" },
  pending: { label: "Waiting for DNS", variant: "default" },
  verified: { label: "Verified", variant: "success" },
  failed: { label: "Not found yet", variant: "outline" },
};

function DomainTab({ slug }: { slug: string }) {
  const [state, setState] = useState<DomainState | null>(null);
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState<"connect" | "verify" | "disconnect" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    const result = await readWebsiteDomain();
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    if (!result.data) return;
    setState(result.data);
    setDomain(result.data.domain ?? "");
  }

  // Read on mount. `readWebsiteDomain` degrades to "none" when migration 0059
  // has not been applied, so this never has to guard for a missing column.
  // Intentionally runs once — re-reading on every render would fight the
  // optimistic status this tab shows while a DNS check is in flight.
  useEffect(() => {
    void refresh();
  }, []);

  /** Run a domain action, surface its message, then re-read the stored state. */
  async function run(
    key: NonNullable<typeof busy>,
    action: () => Promise<{ ok: true } | { ok: false; message: string }>,
  ) {
    setBusy(key);
    setMessage(null);
    try {
      const result = await action();
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      await refresh();
    } catch {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function connect() {
    const formData = new FormData();
    formData.set("domain", domain);
    const result = await connectWebsiteDomain(null, formData);
    if (result.ok) {
      setMessage("Domain saved. Add the DNS records at your host, then check again.");
    } else {
      setMessage(result.message);
    }
    return result;
  }

  async function verify() {
    const result = await verifyWebsiteDomain();
    if (result.ok) {
      setMessage(result.data?.message ?? "Ownership confirmed.");
    } else {
      setMessage(result.message);
    }
    return result;
  }

  async function disconnect() {
    const result = await disconnectWebsiteDomain();
    if (result.ok) setMessage("Domain removed.");
    else setMessage(result.message);
    return result;
  }

  const status = state?.domain_status ?? "none";

  return (
    <div>
      <InspectorGroup
        title="Custom domain"
        description={`Serve this site from your own web address instead of /site/${slug}.`}
      >
        {state === null ? (
          <p className="flex items-center gap-2 text-sm text-text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Checking your domain…
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <Badge variant={STATUS_COPY[status].variant}>
                {STATUS_COPY[status].label}
              </Badge>
              {state.domain ? (
                <span className="truncate text-sm font-medium text-text-primary">
                  {state.domain}
                </span>
              ) : null}
            </div>

            {state.domain && state.records ? (
              <DnsTable records={state.records} />
            ) : (
              <TextField
                label="Your domain"
                value={domain}
                onChange={(value) => setDomain(value)}
                type="url"
                placeholder="drsmithclinic.com"
                hint="Just the domain — no https:// and no trailing slash."
              />
            )}

            <div className="flex flex-wrap gap-2">
              {state.domain ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void run("verify", verify)}
                  disabled={busy !== null || status === "verified"}
                >
                  {busy === "verify" ? (
                    <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
                  ) : null}
                  Check DNS again
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void run("connect", connect)}
                  disabled={busy !== null || domain.trim().length === 0}
                >
                  {busy === "connect" ? (
                    <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
                  ) : null}
                  Connect domain
                </Button>
              )}

              {state.domain ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void run("disconnect", disconnect)}
                  disabled={busy !== null}
                >
                  Remove domain
                </Button>
              ) : null}
            </div>

            {message ? (
              <p className="rounded-control border border-text-muted/25 bg-app p-3 text-xs leading-relaxed text-text-secondary">
                {message}
              </p>
            ) : null}
          </>
        )}
      </InspectorGroup>

      <InspectorGroup title="How this works" description="No code required.">
        <ol className="flex list-decimal flex-col gap-2 ps-4 text-sm leading-relaxed text-text-secondary">
          <li>
            Add the domain here. We give you two DNS records to copy.
          </li>
          <li>
            Paste them into your domain host (GoDaddy, Hostinger, Namecheap — whatever
            you bought it from).
          </li>
          <li>
            Come back and press <strong>Check DNS again</strong>. DNS usually settles
            within an hour.
          </li>
        </ol>
        <p className="text-[11px] leading-relaxed text-text-muted">
          We can confirm you control the domain. Serving the site on that hostname and
          issuing its SSL certificate is handled by our hosting layer, so those steps
          can take a little longer than the check.
        </p>
      </InspectorGroup>
    </div>
  );
}

/** The two DNS records, with copy buttons — the reason this panel exists. */
function DnsTable({
  records,
}: {
  records: NonNullable<DomainState["records"]>;
}) {
  const rows = [...records.cname, ...records.txt];

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-text-secondary">
        Add these at your domain host
      </p>
      <div className="overflow-hidden rounded-control border border-text-muted/25">
        <table className="w-full text-start text-xs">
          <thead className="bg-app text-text-muted">
            <tr>
              <th scope="col" className="px-2 py-1.5 text-start font-medium">
                Type
              </th>
              <th scope="col" className="px-2 py-1.5 text-start font-medium">
                Name
              </th>
              <th scope="col" className="px-2 py-1.5 text-start font-medium">
                Value
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-text-muted/15">
            {rows.map((row) => (
              <tr key={`${row.type}-${row.name}`}>
                <td className="px-2 py-1.5 font-mono font-medium text-text-primary">
                  {row.type}
                </td>
                <td className="px-2 py-1.5 font-mono text-text-secondary">
                  {row.name}
                </td>
                <td className="px-2 py-1.5 font-mono break-all text-text-secondary">
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}