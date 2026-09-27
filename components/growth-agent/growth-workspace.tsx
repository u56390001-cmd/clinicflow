"use client";

import { useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";

import { AutomationSettings } from "@/components/growth-agent/automation-settings";
import { GoogleConnectCard } from "@/components/growth-agent/google-connect-card";
import {
  GrowthMetricGrid,
  RangePicker,
} from "@/components/growth-agent/growth-metric-grid";
import {
  PostGenerator,
  type GeneratorDraft,
} from "@/components/growth-agent/post-generator";
import { PostPreview } from "@/components/growth-agent/post-preview";
import { PostQueue } from "@/components/growth-agent/post-queue";
import type { GrowthGenerateResult } from "@/lib/actions/growth-agent";
import { composeDraftPreview } from "@/lib/ai/growth-post";
import type { GrowthMetricRangeId } from "@/lib/constants";
import type { GrowthRangeSummary } from "@/lib/growth-agent-queries";
import type { GrowthAgentSettings, GrowthPost } from "@/types/database";

/**
 * Growth Agent workspace.
 *
 * Owns two pieces of state its children cannot derive for themselves: which
 * post the preview is showing, and which metric range is selected. Everything
 * else — the form fields — belongs to a child or is computed from props.
 *
 * The range lives here rather than inside the metric row because the range
 * selector sits in the page header, opposite the title. It is a page-level
 * control in the reference design and it reads as one: it governs every number
 * on the page, not just the four tiles below it.
 *
 * The preview has two sources, in priority order:
 *
 *   1. A just-generated post, so "Generate draft" puts the real text in front of
 *      the person straight away.
 *   2. Otherwise the composed sketch, which moves per keystroke on the form.
 *
 * `generated` is *not* cleared when the form changes, and that is deliberate.
 * Once real generated copy is on screen, replacing it with a placeholder sketch
 * because someone touched the keyword field would throw away the thing they just
 * asked for. Editing the brief does not un-generate a post.
 */
export function GrowthWorkspace({
  settings,
  clinic,
  posts,
  summaries,
  serviceNames,
  canEdit,
  initialDraft,
  callbackReason,
}: {
  settings: GrowthAgentSettings;
  clinic: { name: string; address: string | null; phone: string | null };
  posts: GrowthPost[];
  summaries: GrowthRangeSummary[];
  serviceNames: string[];
  canEdit: boolean;
  initialDraft: GeneratorDraft;
  callbackReason: string | null;
}) {
  const [draft, setDraft] = useState<GeneratorDraft>(initialDraft);
  const [generated, setGenerated] = useState<GrowthGenerateResult | null>(null);
  const [activeRange, setActiveRange] = useState<GrowthMetricRangeId>("30d");

  const isConnected = settings.connection_state === "connected";

  const preview = useMemo(() => {
    if (generated) {
      return { text: generated.content, cta: generated.cta, isDraft: false };
    }
    return {
      text: composeDraftPreview({
        clinicName: clinic.name,
        topic: draft.topic,
        keywords: draft.keywords,
        cta: draft.cta,
      }).text,
      cta: draft.cta,
      isDraft: true,
    };
  }, [generated, draft, clinic.name]);

  return (
    <div className="min-w-0">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            Growth Agent
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Automate post generation, boost search visibility, and monitor clinic
            metrics.
          </p>
        </div>
        <div className="shrink-0">
          <RangePicker
            summaries={summaries}
            activeRange={activeRange}
            onRangeChange={setActiveRange}
          />
        </div>
      </header>

      <div className="space-y-6">
        <GoogleConnectCard
          connectionState={settings.connection_state}
          locationName={settings.google_location_name}
          accountEmail={settings.google_account_email}
          lastError={settings.last_error}
          canEdit={canEdit}
          callbackReason={callbackReason}
        />

        <SyncNotice posts={posts} isConnected={isConnected} />

        <GrowthMetricGrid summaries={summaries} activeRange={activeRange} />

        {/* 2/3 + 1/3, matching the reference. The generator and its settings
            share the wide column so the brief and the automation rules read as
            one workflow; the preview keeps its own column and stays put while
            the left side scrolls. */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <PostGenerator
              draft={draft}
              onDraftChange={setDraft}
              serviceNames={serviceNames}
              canEdit={canEdit}
              onGenerated={setGenerated}
            />

            <AutomationSettings
              settings={settings}
              isConnected={isConnected}
              canEdit={canEdit}
            />
          </div>

          <div className="lg:col-span-1">
            <div className="lg:sticky lg:top-20">
              <PostPreview
                clinicName={clinic.name}
                clinicAddress={clinic.address}
                clinicPhone={clinic.phone}
                postText={preview.text}
                cta={preview.cta}
                isDraft={preview.isDraft}
              />
            </div>
          </div>
        </div>

        <PostQueue posts={posts} isConnected={isConnected} canEdit={canEdit} />
      </div>
    </div>
  );
}

/**
 * One banner, at the top, for the state that is easy to misread.
 *
 * The reference prototype put a green tick next to every published post while
 * the banner above claimed the profile was live, so nothing in the interface
 * ever had to reconcile the two. A single notice that names the situation is
 * both shorter and harder to get wrong: when posts are marked published with no
 * profile linked, the page says so in one place, in plain words, rather than
 * relying on the reader to cross-reference two contradicting labels.
 */
function SyncNotice({
  posts,
  isConnected,
}: {
  posts: GrowthPost[];
  isConnected: boolean;
}) {
  const waitingToSync = posts.filter((post) => post.status === "published").length;
  const scheduled = posts.filter((post) => post.status === "scheduled").length;
  const failed = posts.filter((post) => post.status === "failed").length;

  if (!isConnected && waitingToSync > 0) {
    return (
      <Notice tone="warning">
        {waitingToSync} {waitingToSync === 1 ? "post is" : "posts are"} marked
        published but no Google profile is linked, so{" "}
        {waitingToSync === 1 ? "it is" : "they are"} not visible to patients
        yet. Link a profile and {waitingToSync === 1 ? "it will" : "they will"} sync.
      </Notice>
    );
  }

  if (failed > 0) {
    return (
      <Notice tone="destructive">
        {failed} {failed === 1 ? "post" : "posts"} failed to publish. Open the
        row in the queue to see what went wrong.
      </Notice>
    );
  }

  if (isConnected && scheduled > 0) {
    return (
      <Notice tone="info">
        {scheduled} {scheduled === 1 ? "post is" : "posts are"} scheduled. They
        go out automatically on the day and time you chose.
      </Notice>
    );
  }

  return null;
}

function Notice({
  tone,
  children,
}: {
  tone: "warning" | "destructive" | "info";
  children: React.ReactNode;
}) {
  const tones = {
    warning: "border-status-warning/40 bg-status-warning/10",
    destructive: "border-status-destructive/40 bg-status-destructive/10",
    info: "border-status-info/40 bg-status-info/10",
  } as const;
  const iconTones = {
    warning: "text-status-warning",
    destructive: "text-status-destructive",
    info: "text-status-info",
  } as const;

  return (
    <div
      className={`flex items-start gap-3 rounded-card border px-4 py-3 ${tones[tone]}`}
    >
      <TriangleAlert
        className={`mt-0.5 size-4 shrink-0 ${iconTones[tone]}`}
        aria-hidden="true"
      />
      <p className="text-sm text-text-secondary">{children}</p>
    </div>
  );
}