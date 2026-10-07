import type { Metadata } from "next";
import { MessageSquareText } from "lucide-react";

import { EngagementWorkspace } from "@/components/engagement/engagement-workspace";
import { getEngagementSnapshotAction } from "@/lib/actions/engagement";

export const metadata: Metadata = {
  title: "Patient Engagement | MedBookAi",
  description:
    "Automate WhatsApp reminders, drive Google reviews, and keep no-shows down.",
};

/**
 * Patient Engagement — server shell.
 *
 * Fetches the engagement read model (templates, toggles, metrics) and hands it
 * to a single client workspace. Every mutation goes through a server action
 * and revalidates this route, exactly like the add-ons and WhatsApp pages.
 */
export default async function EngagementPage() {
  const result = await getEngagementSnapshotAction();

  if (!result.ok) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            Patient Engagement
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Automate reminders and grow reviews — all over WhatsApp.
          </p>
        </div>
        <div className="py-10 text-center">
          <MessageSquareText
            className="mx-auto size-8 text-text-muted/60"
            aria-hidden="true"
          />
          <p className="mx-auto mt-3 max-w-md text-sm text-text-secondary">
            {result.message}
          </p>
        </div>
      </div>
    );
  }

  return <EngagementWorkspace snapshot={result.data} />;
}