import type { Metadata } from "next";
import { Puzzle } from "lucide-react";

import { IntegrationsWorkspace } from "@/components/integrations/integrations-workspace";
import { getIntegrationsAction } from "@/lib/actions/integrations";

export const metadata: Metadata = {
  title: "Integrations | MedBookAi",
  description:
    "Connect Google, Zoom, Teams, WhatsApp and SMS to your clinic, and manage your live queue.",
};

/**
 * Integrations — server shell.
 *
 * Fetches the snapshot and hands it to a single client component. It holds no
 * state: everything that can change does so through a server action, which
 * revalidates this route.
 *
 * The failure path matters more here than on most pages. `getIntegrationsAction`
 * returns `ok: false` both for a clinic with no membership *and* for a genuine
 * read error, and those two deserve different words — so the no-membership
 * message is the action's, and anything else would be a guess.
 */
export default async function IntegrationsPage() {
  const result = await getIntegrationsAction();

  if (!result.ok) {
    return (
      <div className="py-16 text-center">
        <Puzzle
          className="mx-auto size-8 text-text-muted/60"
          aria-hidden="true"
        />
        <h1 className="mt-3 text-lg font-semibold text-text-primary">
          Integrations unavailable
        </h1>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-text-secondary">
          {result.message}
        </p>
      </div>
    );
  }

  return <IntegrationsWorkspace snapshot={result.data} />;
}
