import type { Metadata } from "next";

import { getPlansAction } from "@/lib/actions/billing";
import { createClient } from "@/lib/supabase/server";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "Everything Your Clinic Needs",
  description:
    "Appointment management, patient records, AI booking receptionist and a website builder for independent doctors and small clinics — all in one smart platform.",
};

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const plans = await getPlansAction();

  return <LandingPage signedIn={!!user} plans={plans.ok ? plans.data : []} />;
}