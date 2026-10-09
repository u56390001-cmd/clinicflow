import type { Metadata } from "next";
import Link from "next/link";

import { CheckCircle2, HeartPulse, ShieldAlert } from "lucide-react";

import { AcceptInviteButton } from "@/components/auth/accept-invite";
import { Button } from "@/components/ui/button";
import { INVITE_TOKEN_PATTERN } from "@/lib/auth/invite-token";
import { ROLE_LABELS } from "@/lib/auth/rbac-config";
import {
  getStaffInviteDetails,
  type StaffInviteDetails,
} from "@/lib/actions/invites";
import { APP_ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { ClinicRole } from "@/types/database";

export const metadata: Metadata = { title: "Team invitation" };

const ROLE_BLURBS: Record<ClinicRole, string> = {
  owner: "Owns and manages the clinic",
  clinic_admin:
    "Runs day-to-day operations and manages the team on your behalf",
  doctor: "Sees patients, books appointments and writes prescriptions",
  receptionist: "Manages the front desk — appointments, check-in and billing",
  nurse: "Supports the clinic floor",
  accountant: "Handles billing, payments and reports",
  admin: "Manages the clinic and its team",
  staff: "Helps run the clinic",
};

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const details: StaffInviteDetails = INVITE_TOKEN_PATTERN.test(token)
    ? await getStaffInviteDetails(token)
    : { kind: "invalid" };

  if (details.kind === "invalid") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-app px-4 py-10">
        <div className="w-full max-w-md rounded-card border border-hairline bg-surface p-8 text-center shadow-card">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-status-destructive/10 text-status-destructive">
            <ShieldAlert className="h-6 w-6" aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-text-primary">
            Invitation unavailable
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            This invitation link is invalid, expired, or has already been used.
          </p>
          <Button asChild variant="outline" className="mt-6">
            <Link href={APP_ROUTES.auth.login}>Go to sign in</Link>
          </Button>
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const signedInAsInvitee =
    !!user && user.email?.toLowerCase() === details.email.toLowerCase();
  const signedInWrongUser = !!user && !signedInAsInvitee;

  const nextPath = `/invite/${token}`;
  const roleLabel = ROLE_LABELS[details.role];

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-app px-4 py-10">
      <div className="w-full max-w-3xl overflow-hidden rounded-card border border-hairline bg-surface shadow-card sm:grid sm:grid-cols-[280px_minmax(0,1fr)]">
        {/* Signature teal panel */}
        <aside className="flex flex-col justify-between gap-10 bg-primary p-7 text-white">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-control bg-white text-primary">
              <HeartPulse className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="text-lg font-semibold tracking-tight">MedBook AI</span>
          </div>

          <div>
            <span className="inline-flex items-center rounded-pill bg-white/15 px-2.5 py-0.5 text-xs font-medium text-white">
              {roleLabel}
            </span>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">
              {details.clinicName}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-white/80">
              {ROLE_BLURBS[details.role]}
            </p>
          </div>

          <p className="text-xs leading-relaxed text-white/70">
            Your access is ready to go — no paperwork ahead. Accept this invitation
            and you&apos;re in.
          </p>
        </aside>

        {/* Decision panel */}
        <div className="p-7 sm:p-9">
          {signedInWrongUser ? (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold tracking-tight text-text-primary">
                Signed in as the wrong account
              </h2>
              <p className="text-sm leading-relaxed text-text-secondary">
                This invitation was sent to{" "}
                <span className="font-medium text-text-primary">{details.email}</span>,
                but you&apos;re signed in as{" "}
                <span className="font-medium text-text-primary">{user.email}</span>.
              </p>
              <p className="text-sm text-text-secondary">
                Sign out and sign in with the invited address, then open this link again.
              </p>
              <Button asChild variant="outline" className="mt-2">
                <Link href={APP_ROUTES.app.dashboard}>Back to dashboard</Link>
              </Button>
            </div>
          ) : signedInAsInvitee ? (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-text-primary">
                  One click and you&apos;re on the team
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Joining <span className="font-medium text-text-primary">{details.clinicName}</span> as{" "}
                  <span className="font-medium text-text-primary">{roleLabel}</span>.
                </p>
              </div>

              <ul className="space-y-2.5">
                {[
                  `You'll be added to ${details.clinicName} with ${roleLabel} access.`,
                  "Appointments, patients and billing show up right away — no further setup.",
                  "Your clinic owner can fine-tune access any time.",
                ].map((line) => (
                  <li
                    key={line}
                    className="flex items-start gap-2.5 text-sm text-text-secondary"
                  >
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>

              <AcceptInviteButton token={token} clinicName={details.clinicName} />
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-text-primary">
                  You&apos;ve been invited
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                  {details.clinicName} has invited you to join as{" "}
                  <span className="font-medium text-text-primary">{roleLabel}</span>.
                  Sign in with the invited address{" "}
                  <span className="font-medium text-text-primary">{details.email}</span>{" "}
                  to accept.
                </p>
              </div>

              <ul className="space-y-2.5">
                {[
                  `You'll join ${details.clinicName} with ${roleLabel} access.`,
                  "Appointments, patients and billing show up right away.",
                ].map((line) => (
                  <li
                    key={line}
                    className="flex items-start gap-2.5 text-sm text-text-secondary"
                  >
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>

              <div className="space-y-2">
                <Button asChild size="lg" className="w-full">
                  <Link
                    href={`${APP_ROUTES.auth.login}?next=${encodeURIComponent(nextPath)}`}
                  >
                    Sign in to accept
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="w-full">
                  <Link
                    href={`${APP_ROUTES.auth.signup}?email=${encodeURIComponent(details.email)}&next=${encodeURIComponent(nextPath)}`}
                  >
                    Create an account
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}