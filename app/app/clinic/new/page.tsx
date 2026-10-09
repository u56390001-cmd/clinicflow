import type { Metadata } from "next";

import { OnboardingWizard } from "@/components/clinic/onboarding-wizard";

export const metadata: Metadata = { title: "Set up your clinic" };

export default function ClinicNewPage() {
  return <OnboardingWizard />;
}