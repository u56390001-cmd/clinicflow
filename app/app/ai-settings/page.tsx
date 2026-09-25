import type { Metadata } from "next";
import Link from "next/link";

import { AiSettingsSection } from "@/components/ai/ai-settings-section";
import { AiTestSection } from "@/components/ai/ai-test-section";
import { APP_ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "AI Agent" };

const AI_TABS = [
  {
    key: "settings",
    label: "Configuration",
    href: APP_ROUTES.app.aiSettings,
  },
  {
    key: "test",
    label: "Test Assistant",
    href: `${APP_ROUTES.app.aiSettings}?tab=test`,
  },
] as const;

type AiTabKey = (typeof AI_TABS)[number]["key"];

function parseAiTab(raw?: string): AiTabKey {
  return raw === "test" ? "test" : "settings";
}

export default async function AiSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab = parseAiTab(tab);

  return (
    <div className="space-y-6">
      <nav
        aria-label="AI settings sections"
        className="flex gap-1 overflow-x-auto"
      >
        {AI_TABS.map((item) => {
          const active = item.key === activeTab;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-control px-3 py-1.5 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-text-secondary hover:bg-app hover:text-text-primary",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {activeTab === "test" ? <AiTestSection /> : <AiSettingsSection />}
    </div>
  );
}
