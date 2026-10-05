import type { ReactNode } from "react";

import { SettingsSidebar } from "@/components/settings/settings-sidebar";

/**
 * Settings chrome shared by every section, so the rail is drawn once here
 * rather than repeated in each page — the sections themselves only own their
 * heading and their form.
 *
 * The rail comes first in the DOM, so on a phone it sits above the section as
 * a horizontal scroller and from `md` up it becomes the left column. Content
 * sits in a `min-w-0` track because a grid child defaults to `min-width:
 * auto`, which would let a wide form push the rail off the row.
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6 md:grid md:grid-cols-[15rem_minmax(0,1fr)] md:items-start md:gap-6">
      <SettingsSidebar />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
