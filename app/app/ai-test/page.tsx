import { redirect } from "next/navigation";

import { APP_ROUTES } from "@/lib/constants";

export default function AiTestPage() {
  redirect(`${APP_ROUTES.app.aiSettings}?tab=test`);
}
