"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { acceptStaffInviteAction } from "@/lib/actions/invites";

/**
 * Accept button for the public invite screen. The token itself is the
 * capability: the server action hashes it, looks the invite up by hash through
 * the service-role client, verifies the viewer is the invited user, and audits
 * the accept.
 */
export function AcceptInviteButton({
  token,
  clinicName,
}: {
  token: string;
  clinicName: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleAccept = () => {
    setError(null);
    startTransition(async () => {
      const result = await acceptStaffInviteAction(token);
      if (result.kind === "accepted") {
        router.push("/app/dashboard");
        router.refresh();
        return;
      }
      setError(
        result.kind === "wrong-user"
          ? `This invitation was sent to ${result.invitedEmail}. Sign in with that address, then open this link again.`
          : result.kind === "error"
            ? result.message
            : "This invitation is no longer valid.",
      );
    });
  };

  return (
    <div className="space-y-2">
      <Button onClick={handleAccept} disabled={pending} className="w-full" size="lg">
        {pending ? "Joining…" : `Join ${clinicName}`}
      </Button>
      {error ? (
        <p className="text-sm text-status-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}