import type { Metadata } from "next";
import { Megaphone } from "lucide-react";

import { GrowthWorkspace } from "@/components/growth-agent/growth-workspace";
import { getGrowthAgentData } from "@/lib/actions/growth-agent";
import { DEFAULT_GROWTH_SETTINGS } from "@/lib/growth-agent-queries";
import type { GrowthAgentSettings } from "@/types/database";

export const metadata: Metadata = {
  title: "Growth Agent | MedBookAi",
  description:
    "Write, review and schedule Google Business Profile posts for your clinic.",
};

/**
 * Growth Agent — server shell.
 *
 * The page fetches the snapshot and hands it to a single client component. It
 * holds no state of its own: everything on screen that can change does so
 * through a server action, which revalidates this route. Splitting it this way
 * keeps the honest-state logic (which connection state, which range, whether a
 * post can be published) in one place instead of scattered across siblings that
 * each had to be told what the others knew.
 *
 * The one thing this page is careful about is the failure path.
 * `getGrowthAgentData` returns `ok: false` for a clinic with no membership, so
 * this renders an explanation rather than an empty dashboard that looks like
 * "you have no posts".
 */
export default async function GrowthAgentPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>;
}) {
  // The OAuth callback reports itself through a query param, because the round
  // trip through Google ends in a fresh page load with no client state alive.
  // Read here on the server rather than with `useSearchParams` in the card, so
  // the client tree needs no Suspense boundary and the reason is available on
  // the very first render.
  const callbackReason = (await searchParams).google ?? null;

  const result = await getGrowthAgentData();

  if (!result.ok) {
    return (
      <div className="py-16 text-center">
        <Megaphone
          className="mx-auto size-8 text-text-muted/60"
          aria-hidden="true"
        />
        <h1 className="mt-3 text-lg font-semibold text-text-primary">
          Growth Agent unavailable
        </h1>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-text-secondary">
          {result.message}
        </p>
      </div>
    );
  }

  const snapshot = result.data;

  // A clinic that has never opened this page has no settings row. Substituting
  // the defaults here — rather than writing a row on read — keeps "has this
  // clinic configured the Growth Agent?" a question the data can answer.
  const settings: GrowthAgentSettings = snapshot.settings ?? {
    ...DEFAULT_GROWTH_SETTINGS,
    id: "",
    clinic_id: "",
    created_at: "",
    updated_at: "",
  };

  return (
    <GrowthWorkspace
      settings={settings}
      clinic={snapshot.clinic}
      posts={snapshot.posts}
      summaries={snapshot.summaries}
      serviceNames={snapshot.serviceNames}
      canEdit={snapshot.canEdit}
      callbackReason={callbackReason}
      initialDraft={{
        topic: snapshot.serviceNames[0] ?? "New patient information",
        keywords: [],
        tone: "professional",
        cta: "Book Now",
      }}
    />
  );
}
