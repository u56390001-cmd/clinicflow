import type { Metadata } from "next";
import { Suspense } from "react";
import { PhoneOff } from "lucide-react";

import {
  TelehealthJoinClient,
  TelehealthJoinLoading,
} from "@/components/telehealth/telehealth-join";
import { createWidgetClient } from "@/lib/supabase/widget";
import { patientLinkTokenMatches } from "@/lib/zego/server";

export const metadata: Metadata = {
  title: "Video Consultation",
  robots: { index: false, follow: false },
  manifest: null,
};

type JoinableSession = {
  patientName: string | null;
  doctorName: string | null;
};

/**
 * A completed or cancelled room must stop accepting joins immediately, even
 * though its KitToken is still mathematically valid — and the presented token
 * must be the one that was handed out with this session. Read through the
 * service-role client because this route has no session.
 */
async function resolveJoinableSession(
  roomId: string,
  token: string,
): Promise<JoinableSession | null> {
  const widget = createWidgetClient();
  const { data } = await widget
    .from("telehealth_sessions")
    .select("status, metadata")
    .eq("room_id", roomId)
    .maybeSingle();
  if (!data) return null;
  if (data.status !== "SCHEDULED" && data.status !== "ACTIVE") return null;

  const meta = (data.metadata ?? {}) as Record<string, unknown>;
  if (!patientLinkTokenMatches(meta.patient_token_hash, token)) return null;

  return {
    patientName: typeof meta.patient_name === "string" ? meta.patient_name : null,
    doctorName: typeof meta.doctor_name === "string" ? meta.doctor_name : null,
  };
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

  const session = await resolveJoinableSession(room, token);
  if (!session) {
    return (
      <ExpiredCard
        title="This consultation has ended"
        body="The call is no longer active. Please contact your clinic to schedule another consultation."
      />
    );
  }

  return (
    <Suspense fallback={<TelehealthJoinLoading />}>
      <TelehealthJoinClient
        roomId={room}
        token={token}
        patientName={session.patientName}
        doctorName={session.doctorName}
      />
    </Suspense>
  );
}
