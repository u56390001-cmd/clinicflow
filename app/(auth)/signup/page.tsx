import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SignupForm } from "@/components/auth/signup-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { APP_ROUTES } from "@/lib/constants";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; next?: string }>;
}) {
  const params = await searchParams;

  // A new clinic account is created by the registration funnel (plan ->
  // payment -> details -> admin approval), so the bare signup page sends
  // visitors there. Signup itself stays reachable for teammates joining an
  // existing clinic through an invitation.
  if (!params.email) {
    redirect(APP_ROUTES.getStarted);
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle>Create your account</CardTitle>
        <CardDescription>
          Get started with your clinic in minutes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignupForm initialEmail={params.email} next={params.next} />
      </CardContent>
    </Card>
  );
}
