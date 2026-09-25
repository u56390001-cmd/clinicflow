import { redirect } from "next/navigation";

import { APP_ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? APP_ROUTES.app.dashboard : APP_ROUTES.auth.login);
}
