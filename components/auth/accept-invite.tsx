"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { acceptInviteAction } from "@/lib/actions/team";

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
    startTransition(async () => {
      const result = await acceptInviteAction(token);
      if (result.kind === "accepted") {
        router.push("/app/dashboard");
        router.refresh();
        return;
      }
      setError(
        result.kind === "wrong-user"
          ? `This invitation was sent to ${result.invitedEmail}. Sign in with that address to accept it.`
          : result.kind === "error"
            ? result.message
            : "This invitation is no longer valid.",
      );
    });
  };

  return (
    <div className="space-y-2">
      <Button onClick={handleAccept} disabled={pending} className="w-full">
        {pending ? "Joining…" : `Accept invitation to ${clinicName}`}
      </Button>
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
