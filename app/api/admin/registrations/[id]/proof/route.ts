import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service-scoped";

/**
 * Serve the payment receipt of a registration request.
 *
 * The proofs live in a private bucket, so the admin gets a short-lived signed
 * URL (5 minutes) rather than a permanent link. Only platform admins may ask
 * for one.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: admin } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const service = createServiceClient();
  const { data: registration } = await service
    .from("registration_requests")
    .select("proof_file_path")
    .eq("id", id)
    .maybeSingle();

  if (!registration?.proof_file_path) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  const { data: signed, error } = await service.storage
    .from("registration-proofs")
    .createSignedUrl(registration.proof_file_path, 300);

  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: "Could not open the receipt" }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
