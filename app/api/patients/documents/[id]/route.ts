import { NextRequest, NextResponse } from "next/server";

import { getCurrentClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";
import { PATIENT_DOCUMENTS_BUCKET } from "@/types/database";

/**
 * Short by design. A signed URL is a bearer token for a medical record — long
 * enough to follow a redirect and load the file, not long enough to be useful
 * if it ends up in a chat log or a shared browser history.
 */
const SIGNED_URL_EXPIRY_SECONDS = 60;

/**
 * Open a patient document.
 *
 * `patient-documents` is a private bucket, so there is no URL that can be
 * rendered into a page. Instead the UI links here with a document id; this
 * route re-checks that the caller's clinic owns the row, mints a signed URL and
 * redirects to it. `file_path` never reaches the browser.
 *
 * Unlike `app/api/billing/proof/[id]/route.ts` this uses the caller's own
 * client rather than the service role: the storage RLS policies added in 0029
 * already scope reads to clinic members by the first path segment, so signing
 * succeeds for exactly the people who are allowed to read the object and no
 * service key is needed.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: documentId } = await params;

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

  const access = await getCurrentClinic(supabase);
  if (!access) {
    return NextResponse.json(
      { ok: false, error: "No clinic for this account." },
      { status: 403 },
    );
  }

  // Scoping the lookup by clinic means a document belonging to another clinic
  // is indistinguishable from one that does not exist — no existence oracle.
  const { data: document, error } = await supabase
    .from("patient_documents")
    .select("id, document_name, file_path, mime_type")
    .eq("clinic_id", access.clinic.id)
    .eq("id", documentId)
    .maybeSingle();

  if (error) {
    console.error("[patients/documents] lookup failed", {
      clinicId: access.clinic.id,
      code: error.code,
      message: error.message,
    });
    return NextResponse.json(
      { ok: false, error: "Could not load that document." },
      { status: 500 },
    );
  }
  if (!document) {
    return NextResponse.json(
      { ok: false, error: "Document not found." },
      { status: 404 },
    );
  }

  // `?download=1` forces a save dialog; the default opens PDFs and images
  // inline, which is what a clinician glancing at a report wants.
  const download = request.nextUrl.searchParams.get("download") === "1";

  // `?embed=1` streams the bytes same-origin instead of redirecting. The
  // preview modal needs this: a cross-origin signed URL would render in an
  // iframe, but `iframe.contentWindow.print()` is cross-origin blocked, so
  // print-from-modal requires the document to share this app's origin.
  const embed = request.nextUrl.searchParams.get("embed") === "1";

  if (embed) {
    const { data: blob, error: downloadError } = await supabase.storage
      .from(PATIENT_DOCUMENTS_BUCKET)
      .download(document.file_path);

    if (downloadError || !blob) {
      console.error("[patients/documents] embed download failed", {
        documentId,
        message: downloadError?.message,
      });
      return NextResponse.json(
        { ok: false, error: "Could not open that document." },
        { status: 500 },
      );
    }

    // filename* carries the real name through non-ASCII characters.
    const asciiName = document.document_name.replace(/[^\x20-\x7e]/g, "_");
    const response = new NextResponse(blob, {
      headers: {
        "Content-Type": document.mime_type,
        "Content-Disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(document.document_name)}`,
        // Same rule as the redirect below: never cached, never held.
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
    return response;
  }

  // `?w=` requests a resized render (gallery thumbnails, before/after
  // sliders). Storage's image transform runs server-side so the browser never
  // downloads a 12 MP dermatoscope capture for a 48px tile. If the project
  // cannot render transforms we fall back to the original bytes — a slow
  // thumbnail beats a broken one.
  const widthParam = Number(request.nextUrl.searchParams.get("w") ?? "");
  const width =
    Number.isFinite(widthParam) && widthParam >= 32 && widthParam <= 2000
      ? Math.round(widthParam)
      : null;

  const { data: signed, error: signError } = await supabase.storage
    .from(PATIENT_DOCUMENTS_BUCKET)
    .createSignedUrl(
      document.file_path,
      SIGNED_URL_EXPIRY_SECONDS,
      width
        ? { transform: { width } }
        : download
          ? { download: document.document_name }
          : undefined,
    );

  let signedUrl = signed?.signedUrl ?? null;
  if ((signError || !signedUrl) && width) {
    // Transform not supported (free-tier storage or non-image) — plain sign.
    const retry = await supabase.storage
      .from(PATIENT_DOCUMENTS_BUCKET)
      .createSignedUrl(
        document.file_path,
        SIGNED_URL_EXPIRY_SECONDS,
        download ? { download: document.document_name } : undefined,
      );
    signedUrl = retry.data?.signedUrl ?? null;
    if (!signedUrl) {
      console.error("[patients/documents] signing failed", {
        documentId,
        message: retry.error?.message,
      });
      return NextResponse.json(
        { ok: false, error: "Could not open that document." },
        { status: 500 },
      );
    }
  }

  if (!signedUrl) {
    console.error("[patients/documents] signing failed", {
      documentId,
      message: signError?.message,
    });
    return NextResponse.json(
      { ok: false, error: "Could not open that document." },
      { status: 500 },
    );
  }

  const response = NextResponse.redirect(signedUrl, 302);
  // The redirect target expires in a minute; a cached 302 would hand out a dead
  // URL, and an intermediary must never hold on to this one.
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
