"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronsLeft,
  ChevronsRight,
  Globe,
  Loader2,
  Maximize2,
  Minimize2,
  Monitor,
  Save,
  Smartphone,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  EditorLeftPanel,
  SECTION_ICONS,
} from "@/components/website/editor-left-panel";
import { Inspector } from "@/components/website/inspector";
import { WebsiteTemplate } from "@/components/website/template-index";
import {
  WidgetPreview,
  type WidgetAiSettings,
} from "@/components/website/widget-preview";
import { publishWebsite, saveWebsite } from "@/lib/actions/website";
import type { WebsiteConfig, WebsiteSectionId } from "@/types/website";
import type { WebsiteImage, WebsiteStatus } from "@/types/database";
import { cn } from "@/lib/utils";

type Props = {
  clinicId: string;
  clinicName: string;
  clinicDoctorName: string | null;
  clinicPhone: string | null;
  clinicEmail: string | null;
  clinicAddress: string | null;
  clinicSlug: string;
  websiteId: string;
  initialConfig: WebsiteConfig;
  initialImages: WebsiteImage[];
  initialStatus: WebsiteStatus;
  /** Clinic-wide assistant settings, so the preview can run the real chat. */
  aiSettings: WidgetAiSettings;
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
  doctors: Array<{
    id: string;
    name: string;
    specialty: string | null;
    photo_url: string | null;
    years_of_experience: number | null;
    qualification: string | null;
    professional_description: string | null;
    credentials?: string[] | null;
    consultation_fee?: number | null;
    follow_up_fee?: number | null;
    follow_up_valid_for?: number | null;
    follow_up_period?: "days" | "weeks" | "months" | null;
  }>;
};

type Device = "desktop" | "mobile";

export default function WebsiteBuilder({
  clinicId,
  clinicName,
  clinicDoctorName,
  clinicPhone,
  clinicEmail,
  clinicAddress,
  clinicSlug,
  initialConfig,
  initialImages,
  initialStatus,
  aiSettings,
  services,
  availabilityRules,
  doctors,
}: Props) {
  const [config, setConfig] = useState<WebsiteConfig>(initialConfig);
  const [images, setImages] = useState<WebsiteImage[]>(initialImages);
  const [selectedId, setSelectedId] = useState<WebsiteSectionId | null>(null);
  const [device, setDevice] = useState<Device>("desktop");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [status, setStatus] = useState<WebsiteStatus>(initialStatus);
  const [dirty, setDirty] = useState(false);
  /** Page sections collapses to a narrow icon rail so the canvas gets the width. */
  const [sectionsCollapsed, setSectionsCollapsed] = useState(false);
  /** The inspector collapses the same way, for editing on a narrow screen. */
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  /** Fullscreen shows the website preview alone, with no side panels. */
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  /** The docked preview frame, so the chat panel can size itself to the page. */
  const frameRef = useRef<HTMLDivElement>(null);
  /** Same measurement for the fullscreen copy, which is a separate element. */
  const fullscreenFrameRef = useRef<HTMLDivElement>(null);

  // Escape leaves fullscreen. Anyone checking a booking flow on a laptop
  // expects the same exit they get from any other overlay.
  useEffect(() => {
    if (!previewFullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewFullscreen]);

  const updateConfig = (next: WebsiteConfig) => {
    setConfig(next);
    setDirty(true);
  };

  const handleImageUpdate = (next: WebsiteImage[]) => {
    setImages(next);
    setDirty(true);
  };

  /**
   * Turn an unknown thrown value into a sentence worth reading.
   *
   * Server Actions reject with a plain `Error` whose message is frequently just
   * "An unexpected response was received from the server", which tells a clinic
   * nothing and hides the detail that would explain it. Showing the real text is
   * the difference between a five-second fix and a lost afternoon.
   */
  function explain(error: unknown): string {
    if (error instanceof Error && error.message.trim()) return error.message;
    if (typeof error === "string" && error.trim()) return error;
    return "An unexpected response was received from the server.";
  }

  /** Returns whether the save landed, so Publish can chain off it. */
  const handleSave = async (): Promise<boolean> => {
    setSaving(true);
    try {
      const formData = new FormData();
      formData.set("template", config.template);
      formData.set("content", JSON.stringify(config.content));
      formData.set("theme", JSON.stringify(config.theme));
      formData.set("widget", JSON.stringify(config.widget));
      formData.set("seo", JSON.stringify(config.seo));
      formData.set("locale", JSON.stringify(config.locale));

      const result = await saveWebsite(null, formData);
      if (!result.ok) {
        toast.error(result.message);
        return false;
      }
      toast.success("Changes saved.");
      setDirty(false);
      return true;
    } catch (error) {
      // Keep the original stack in the console; the toast only carries the text.
      console.error("[website] save failed", error);
      toast.error(`Could not save: ${explain(error)}`, { duration: 8000 });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async (nextStatus: "published" | "unpublished") => {
    // Publish always saves first. A clinic that edits and hits Publish expects
    // what they see on screen to be what goes live, and a separate "remember to
    // save" step is how that expectation gets broken.
    if (dirty) {
      const saved = await handleSave();
      if (!saved) return;
    }
    setPublishing(true);
    try {
      const formData = new FormData();
      formData.set("status", nextStatus);
      const result = await publishWebsite(null, formData);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setStatus(nextStatus);
      toast.success(
        nextStatus === "published"
          ? "Website published."
          : "Website unpublished.",
      );
    } catch (error) {
      console.error("[website] publish failed", error);
      toast.error(`Could not publish: ${explain(error)}`, { duration: 8000 });
    } finally {
      setPublishing(false);
    }
  };

  const isPublished = status === "published";

  // Built from one function so the docked canvas and the fullscreen popup render
  // the exact same site. Duplicating this JSX is how a preview stops matching the
  // page.
  //
  // The `idPrefix` argument is what keeps the two copies from colliding. Entering
  // fullscreen leaves the docked canvas mounted underneath, so both sets of
  // section ids are in the document at once and a bare `id="services"` would
  // resolve to whichever came first — the preview hidden behind the overlay —
  // making every nav click look like it did nothing. A fixed per-instance string
  // also stays identical between the server render and hydration, which a
  // `useId()` would not.
  const buildFrame = (idPrefix: string, frameRef: React.RefObject<HTMLDivElement | null>) => {
    const preview = (
      <WebsiteTemplate
        idPrefix={idPrefix}
        config={config}
        images={images}
        clinic={{
          name: clinicName,
          doctor_name: clinicDoctorName,
          phone: clinicPhone,
          email: clinicEmail,
          address: clinicAddress,
        }}
        services={services}
        doctors={doctors}
        availabilityRules={availabilityRules}
        widgetSlug={clinicSlug}
        locale={config.locale}
        interactive={true}
        selectedSectionId={selectedId}
        onSelectSection={(id) => setSelectedId(id as WebsiteSectionId)}
        showHeader={config.theme.showHeader}
      />
    );

    /* The framed site, width-switched by the device toggle, followed by the live
       assistant. Both have to sit directly inside the scrolling pane: the widget
       wrapper is `sticky`, and sticky only pins to a real scroll container. */
    return (
      <>
        <div
          className={cn(
            "mx-auto transition-all",
            device === "mobile" ? "max-w-[390px]" : "max-w-full",
          )}
        >
          {/* `overflow-clip`, not `overflow-hidden`, and the distinction is the whole
              point. Both round the preview's corners, but `hidden` also makes this
              box a scroll container, which becomes the nearest scrollport for the
              site header inside it — so `position: sticky` on that header pins it to
              a box that never scrolls and it drifts away with the content instead.
              `clip` clips without creating a scrollport, so the header resolves the
              real scroll container (this preview pane) and stays put. */}
          <div
            ref={frameRef}
            className="overflow-clip rounded-control border border-text-muted/20 bg-white shadow-card"
          >
            {preview}
          </div>
        </div>

        <WidgetPreview
          config={config}
          ai={aiSettings}
          clinicSlug={clinicSlug}
          clinicName={clinicName}
          frameRef={frameRef}
        />
      </>
    );
  };

  const orderedSections = [...config.content.sections].sort(
    (a, b) => a.order - b.order,
  );

  /** Shared device switch, used in the toolbar and in fullscreen. */
  const deviceToggle = (
    <div className="flex gap-1 rounded-control bg-app p-1">
      <button
        type="button"
        aria-label="Desktop preview"
        aria-pressed={device === "desktop"}
        onClick={() => setDevice("desktop")}
        className={cn(
          "rounded-control p-1.5",
          device === "desktop"
            ? "bg-surface text-text-primary shadow-card"
            : "text-text-muted",
        )}
      >
        <Monitor className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Mobile preview"
        aria-pressed={device === "mobile"}
        onClick={() => setDevice("mobile")}
        className={cn(
          "rounded-control p-1.5",
          device === "mobile"
            ? "bg-surface text-text-primary shadow-card"
            : "text-text-muted",
        )}
      >
        <Smartphone className="size-4" aria-hidden="true" />
      </button>
    </div>
  );

  const dirtyBadge = dirty ? (
    <span className="flex items-center gap-1 text-xs text-text-muted">
      <span className="size-1.5 rounded-pill bg-status-warning" />
      Unsaved changes
    </span>
  ) : null;

  /* Collapsed rail: one icon per section, still selectable, so narrowing the
     column never costs access to a section. */
  const sectionRail = (
    <div
      id="page-sections-panel"
      className="flex flex-1 flex-col items-center gap-1 overflow-y-auto bg-surface py-2"
    >
      {orderedSections.map((section) => {
        const Icon = SECTION_ICONS[section.id];
        const isSelected = section.id === selectedId;
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => setSelectedId(section.id)}
            aria-current={isSelected ? "true" : undefined}
            aria-label={`Edit ${section.label}`}
            title={
              section.visible
                ? `Edit ${section.label}`
                : `${section.label} (hidden)`
            }
            className={cn(
              "flex size-9 items-center justify-center rounded-control transition-colors",
              isSelected
                ? "bg-primary/10 text-primary"
                : section.visible
                  ? "text-text-secondary hover:bg-app"
                  : "text-text-muted/50 hover:bg-app",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );

  const toggleSection = (id: WebsiteSectionId) => {
    const sections = config.content.sections.map((section) =>
      section.id === id ? { ...section, visible: !section.visible } : section,
    );
    updateConfig({ ...config, content: { ...config.content, sections } });
  };

  const moveSection = (id: WebsiteSectionId, direction: -1 | 1) => {
    const sections = [...config.content.sections].sort(
      (a, b) => a.order - b.order,
    );
    const index = sections.findIndex((section) => section.id === id);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= sections.length) return;
    [sections[index], sections[target]] = [sections[target], sections[index]];
    updateConfig({
      ...config,
      content: {
        ...config.content,
        sections: sections.map((section, i) => ({ ...section, order: i })),
      },
    });
  };

  const reorderSection = (fromId: WebsiteSectionId, toId: WebsiteSectionId) => {
    const sections = [...config.content.sections].sort(
      (a, b) => a.order - b.order,
    );
    const from = sections.findIndex((section) => section.id === fromId);
    const to = sections.findIndex((section) => section.id === toId);
    if (from === -1 || to === -1) return;
    const [moved] = sections.splice(from, 1);
    sections.splice(to, 0, moved);
    updateConfig({
      ...config,
      content: {
        ...config.content,
        sections: sections.map((section, i) => ({ ...section, order: i })),
      },
    });
  };

  return (
    <div className="flex h-screen flex-col">
      {/* Top toolbar */}
      <header className="flex items-center justify-between border-b border-text-muted/20 bg-surface px-4 py-2.5">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-text-primary">
            Website Builder
          </h1>
          <Badge variant={isPublished ? "success" : "outline"}>
            {isPublished ? "Published" : "Draft"}
          </Badge>
          {dirtyBadge}
        </div>

        <div className="flex items-center gap-2">
          {deviceToggle}

          <Button
            type="button"
            variant="outline"
            onClick={() => void handleSave()}
            disabled={saving || !dirty}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
            ) : (
              <Save data-icon="inline-start" />
            )}
            Save
          </Button>

          {isPublished ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void handlePublish("unpublished")}
              disabled={publishing}
            >
              <ArrowLeft data-icon="inline-start" />
              Unpublish
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => void handlePublish("published")}
              disabled={publishing}
            >
              <Globe data-icon="inline-start" />
              Publish
            </Button>
          )}
        </div>
      </header>

      {/* Three-pane layout */}
      <div className="flex min-h-0 flex-1">
        {/* Left: sections outline, collapsible to an icon rail */}
        <aside
          className={cn(
            "flex flex-shrink-0 flex-col border-e border-text-muted/20 transition-[width]",
            sectionsCollapsed ? "w-14" : "w-72",
          )}
        >
          <div className="flex items-center justify-end border-b border-text-muted/20 bg-surface px-1.5 py-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setSectionsCollapsed((previous) => !previous)}
              aria-expanded={!sectionsCollapsed}
              aria-controls="page-sections-panel"
              aria-label={
                sectionsCollapsed
                  ? "Expand page sections"
                  : "Collapse page sections"
              }
              title={
                sectionsCollapsed
                  ? "Expand page sections"
                  : "Collapse page sections"
              }
              className="size-7"
            >
              {sectionsCollapsed ? (
                <ChevronsRight className="size-4" />
              ) : (
                <ChevronsLeft className="size-4" />
              )}
            </Button>
          </div>

          {sectionsCollapsed ? (
            sectionRail
          ) : (
            <div id="page-sections-panel" className="min-h-0 flex-1">
              <EditorLeftPanel
                sections={config.content.sections}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onToggle={toggleSection}
                onMove={moveSection}
                onReorder={reorderSection}
              />
            </div>
          )}
        </aside>

        {/* Center: the editing column. It sits between the two rails because
            that is where the eye already is — the section you picked on the
            left and the change it makes on the right are both in the middle,
            so no reading of the layout crosses the screen. */}
        <aside
          className={cn(
            "flex flex-shrink-0 flex-col border-e border-text-muted/20 transition-[width]",
            inspectorCollapsed ? "w-14" : "w-96",
          )}
        >
          <div className="flex items-center justify-end border-b border-text-muted/20 bg-surface px-1.5 py-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setInspectorCollapsed((previous) => !previous)}
              aria-expanded={!inspectorCollapsed}
              aria-controls="inspector-panel"
              aria-label={
                inspectorCollapsed
                  ? "Expand the editing panel"
                  : "Collapse the editing panel"
              }
              title={
                inspectorCollapsed
                  ? "Expand the editing panel"
                  : "Collapse the editing panel"
              }
              className="size-7"
            >
              {inspectorCollapsed ? (
                <ChevronsRight className="size-4" />
              ) : (
                <ChevronsLeft className="size-4" />
              )}
            </Button>
          </div>

          <div id="inspector-panel" className="min-h-0 flex-1">
            <Inspector
              selectedSectionId={selectedId}
              config={config}
              images={images}
              onUpdateConfig={updateConfig}
              onUpdateImages={handleImageUpdate}
              clinicId={clinicId}
              clinicSlug={clinicSlug}
              collapsed={inspectorCollapsed}
              onToggleCollapsed={() => setInspectorCollapsed((previous) => !previous)}
            />
          </div>
        </aside>

        {/* Right: preview canvas */}
        <main className="flex min-w-0 flex-1 flex-col bg-app">
          <div className="flex items-center justify-end border-b border-text-muted/20 bg-surface px-2 py-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setPreviewFullscreen(true)}
              aria-label="Open website preview full screen"
              title="Full screen preview"
              className="size-7"
            >
              <Maximize2 className="size-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {buildFrame("canvas", frameRef)}
          </div>
        </main>
      </div>

      {/* Fullscreen: the website alone, no side panels. */}
      {previewFullscreen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Website preview"
          className="fixed inset-0 z-50 flex flex-col bg-app"
        >
          <div className="flex items-center justify-between border-b border-text-muted/20 bg-surface px-4 py-2.5">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-text-primary">
                Website preview
              </h2>
              <Badge variant="outline">
                {device === "mobile" ? "Mobile" : "Desktop"}
              </Badge>
              {dirtyBadge}
            </div>

            <div className="flex items-center gap-2">
              {/* The device switch still applies here. A fullscreen preview that
                 ignored it would be a different page, not this one. */}
              {deviceToggle}

              <Button
                type="button"
                variant="outline"
                onClick={() => setPreviewFullscreen(false)}
              >
                <Minimize2 data-icon="inline-start" />
                Exit full screen
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setPreviewFullscreen(false)}
                aria-label="Close full screen preview"
                className="size-8"
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {buildFrame("fullscreen", fullscreenFrameRef)}
          </div>
        </div>
      ) : null}
    </div>
  );
}