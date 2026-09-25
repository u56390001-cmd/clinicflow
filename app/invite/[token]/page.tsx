import type { Metadata } from "next";
import Link from "next/link";

import { AcceptInviteButton } from "@/components/auth/accept-invite";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getInvitePreviewAction, type InvitePreview } from "@/lib/actions/team";
import { APP_ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Team invitation" };

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Tokens are 64-char hex strings; anything else can't be valid.
  const preview: InvitePreview = /^[0-9a-f]{64}$/.test(token)
    ? await getInvitePreviewAction(token)
    : { kind: "invalid" };

  if (preview.kind === "invalid") {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Invitation unavailable</CardTitle>
          <CardDescription>
            This invitation link is invalid, expired, or has already been used.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Button asChild variant="outline">
            <Link href={APP_ROUTES.auth.login}>Go to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const invitedAs = (
    <p className="text-sm text-text-secondary">
      You&apos;ve been invited to join{" "}
      <span className="font-medium text-text-primary">{preview.clinicName}</span> with the
      email{" "}
      <span className="font-medium text-text-primary">{preview.email}</span>.
    </p>
  );

  // Not signed in — ask them to sign in / sign up with the invited address.
  if (!user) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Join {preview.clinicName}</CardTitle>
          <CardDescription>
            Sign in with the invited email address to accept this invitation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {invitedAs}
          <div className="flex flex-col gap-2">
            <Button asChild>
              <Link
                href={`${APP_ROUTES.auth.login}?next=${encodeURIComponent(`/invite/${token}`)}`}
              >
                Sign in to accept
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`${APP_ROUTES.auth.signup}?email=${encodeURIComponent(preview.email)}&next=${encodeURIComponent(`/invite/${token}`)}`}>
                Create an account
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Signed in as someone else.
  if (user.email?.toLowerCase() !== preview.email.toLowerCase()) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Wrong account</CardTitle>
          <CardDescription>
            This invitation was sent to{" "}
            <span className="font-medium text-text-primary">{preview.email}</span>, but
            you&apos;re signed in as{" "}
            <span className="font-medium text-text-primary">{user.email}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-text-secondary">
            Sign out and sign in with the invited email address to accept it.
          </p>
          <Button asChild variant="outline">
            <Link href={APP_ROUTES.app.dashboard}>Back to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Signed in as the invited user — one click to join.
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Join {preview.clinicName}</CardTitle>
        <CardDescription>Accept your invitation to get started.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {invitedAs}
        <AcceptInviteButton token={token} clinicName={preview.clinicName} />
      </CardContent>
    </Card>
  );
}