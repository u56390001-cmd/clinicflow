import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentClinic } from "@/lib/clinic-access";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const STORAGE_BUCKET = "payment-proofs";
const SIGNED_URL_EXPIRY = 3600; // 1 hour

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("[billing/proof] Missing SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createServiceClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: submissionId } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required." },
      { status: 401 },
    );
  }

  // Fetch the submission to check ownership
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: submission, error: fetchError } = await (supabase as any)
    .from("payment_submissions")
    .select("id, clinic_id, proof_url")
    .eq("id", submissionId)
    .maybeSingle();

  if (fetchError || !submission) {
    return NextResponse.json(
      { ok: false, error: "Submission not found." },
      { status: 404 },
    );
  }

  const sub = submission as { id: string; clinic_id: string; proof_url: string | null };

  // Check access: clinic member OR platform admin
  const access = await getCurrentClinic(supabase);
  const isClinicMember = access?.clinic.id === sub.clinic_id;

  let isAdmin = false;
  if (!isClinicMember) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: adminRow } = await (supabase as any)
      .from("platform_admins")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    isAdmin = !!adminRow;
  }

  if (!isClinicMember && !isAdmin) {
    return NextResponse.json(
      { ok: false, error: "You don't have access to this file." },
      { status: 403 },
    );
  }

  if (!sub.proof_url) {
    return NextResponse.json(
      { ok: false, error: "No proof file attached." },
      { status: 404 },
    );
  }

  // Create a signed URL using the service-role client (bypasses RLS for storage)
  let serviceClient;
  try {
    serviceClient = getServiceClient();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Server configuration error." },
      { status: 500 },
    );
  }

  const { data, error: signedError } = await serviceClient.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(sub.proof_url, SIGNED_URL_EXPIRY);

  if (signedError || !data?.signedUrl) {
    console.error("[billing/proof] signed URL error", signedError);
    return NextResponse.json(
      { ok: false, error: "Failed to generate signed URL." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    url: data.signedUrl,
    expiresInSeconds: SIGNED_URL_EXPIRY,
  });
}
