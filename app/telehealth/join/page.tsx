import type { Metadata } from "next";
import { Suspense } from "react";
import { PhoneOff } from "lucide-react";

import {
  TelehealthJoinClient,
  TelehealthJoinLoading,
} from "@/components/telehealth/telehealth-join";
import { createWidgetClient } from "@/lib/supabase/widget";

export const metadata: Metadata = {
  title: "Video Consultation",
  robots: { index: false, follow: false },
};

/**
 * A completed or cancelled room must stop accepting joins immediately, even
 * though its KitToken is still mathematically valid. Read through the
 * service-role client because this route has no session.
 */
async function isRoomJoinable(roomId: string): Promise<boolean> {
  const widget = createWidgetClient();
  const { data } = await widget
    .from("telehealth_sessions")
    .select("status")
    .eq("room_id", roomId)
    .maybeSingle();
  if (!data) return false;
  return data.status === "SCHEDULED" || data.status === "ACTIVE";
}

function ExpiredCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-app px-4">
      <div className="max-w-sm rounded-control border-[0.5px] border-hairline bg-surface p-6 text-center shadow-dropdown">
        <PhoneOff
          className="mx-auto mb-3 size-8 text-status-destructive"
          aria-hidden="true"
        />
        <h1 className="text-[15px] font-bold text-ink">{title}</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">
          {body}
        </p>
      </div>
    </div>
  );
}

/**
 * Phase 8 — public, zero-app patient entry point for a telehealth room. The URL
 * carries `room` and the short-lived KitToken; both come from the doctor's
 * `startTelehealthSessionAction`. This route is deliberately outside `/app/*`,
 * so the middleware leaves it unauthenticated.
 */
export default async function TelehealthJoinPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string; token?: string }>;
}) {
  const { room, token } = await searchParams;

  if (!room || !token) {
    return (
      <ExpiredCard
        title="Link not valid"
        body="This consultation link is incomplete. Please open the link your clinic sent you."
      />
    );
  }

  if (!(await isRoomJoinable(room))) {
    return (
      <ExpiredCard
        title="This consultation has ended"
        body="The call is no longer active. Please contact your clinic to schedule another consultation."
      />
    );
  }

  return (
    <Suspense fallback={<TelehealthJoinLoading />}>
      <TelehealthJoinClient roomId={room} token={token} />
    </Suspense>
  );
}
