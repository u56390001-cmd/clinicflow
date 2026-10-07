import type { Metadata } from "next";
import { Sparkles } from "lucide-react";

import { AddonsWorkspace } from "@/components/addons/addons-workspace";
import { getAddonsSnapshotAction } from "@/lib/actions/addons";

export const metadata: Metadata = {
  title: "Add-ons | MedBookAi",
  description:
    "Extend your clinic with extra capabilities, billed separately from your plan.",
};

/**
 * Add-ons marketplace — server shell.
 *
 * Fetches the storefront snapshot and hands it to a single client component.
 * The shell holds no state: every mutation goes through a server action that
 * revalidates this route, exactly like the integrations page.
 */
export default async function AddonsPage() {
  const result = await getAddonsSnapshotAction();

  if (!result.ok) {
    return (
      <div className="py-16 text-center">
        <Sparkles
          className="mx-auto size-8 text-text-muted/60"
          aria-hidden="true"
        />
        <h1 className="mt-3 text-lg font-semibold text-text-primary">
          Add-ons unavailable
        </h1>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-text-secondary">
          {result.message}
        </p>
      </div>
    );
  }

  return <AddonsWorkspace snapshot={result.data} />;
}