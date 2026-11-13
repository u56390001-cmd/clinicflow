import { redirect } from "next/navigation";

import { APP_ROUTES } from "@/lib/constants";

export default function AdminPage() {
  redirect(APP_ROUTES.app.adminSubscriptions);
}
