"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { AlertCircle, CheckCircle2, Download, Link2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { saveGoogleReviewUrlAction } from "@/lib/actions/settings";

/**
 * Google review link + printable QR code (Phase 16). The QR is generated
 * client-side from the URL on demand — nothing is stored except the link
 * itself. Download renders a 1024px PNG, comfortably print-quality for a
 * front-desk card or receipt sticker.
 */

const PREVIEW_SIZE = 256;
const DOWNLOAD_SIZE = 1024;

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function GoogleReviewQrCard({
  savedUrl,
  clinicSlug,
  canWrite,
}: {
  savedUrl: string | null;
  clinicSlug: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(savedUrl ?? "");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const trimmed = value.trim();
  const valid = isValidHttpUrl(trimmed);
  const dirty = trimmed !== (savedUrl ?? "");

  // Live preview — regenerate whenever a valid URL is present.
  useEffect(() => {
    let cancelled = false;
    if (!valid) {
      setPreview(null);
      return;
    }
    QRCode.toDataURL(trimmed, {
      width: PREVIEW_SIZE,
      margin: 2,
      errorCorrectionLevel: "M",
    })
      .then((dataUrl) => {
        if (!cancelled) setPreview(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [trimmed, valid]);

  const handleSave = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveGoogleReviewUrlAction(trimmed);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  const handleDownload = async () => {
    if (!valid) return;
    try {
      const dataUrl = await QRCode.toDataURL(trimmed, {
        width: DOWNLOAD_SIZE,
        margin: 4,
        errorCorrectionLevel: "H",
      });
      const anchor = document.createElement("a");
      anchor.href = dataUrl;
      anchor.download = `google-review-qr-${clinicSlug}.png`;
      anchor.click();
    } catch {
      setError("Could not render the download image. Please try again.");
    }
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Google reviews QR code</CardTitle>
        <CardDescription>
          Paste your Google Business review link, then print the QR code for
          the front desk or receipts — patients scan it to leave a review.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {saved && !error && (
          <Alert variant="success">
            <CheckCircle2 aria-hidden="true" />
            <AlertDescription>Review link saved.</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="google-review-url">Review link</Label>
          <div className="relative">
            <Link2
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
              aria-hidden="true"
            />
            <Input
              id="google-review-url"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setSaved(false);
              }}
              className="pl-9"
              placeholder="https://g.page/r/your-clinic/review"
              autoComplete="off"
              disabled={!canWrite}
            />
          </div>
          {trimmed.length > 0 && !valid && (
            <p className="text-xs text-status-destructive">
              Enter a valid link starting with http:// or https://
            </p>
          )}
          {!canWrite && (
            <p className="text-xs text-text-muted">
              Read-only for staff. Ask an owner or admin to make changes.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-start gap-6">
          <div className="flex flex-col items-center gap-3 rounded-control border border-text-muted/30 bg-surface p-4">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- local data-URL preview; not optimizable by next/image
              <img
                src={preview}
                alt="QR code linking to your Google review page"
                className="h-40 w-40"
              />
            ) : (
              <div
                aria-hidden="true"
                className="flex h-40 w-40 items-center justify-center rounded-control border border-dashed border-text-muted/40 p-4 text-center text-xs text-text-muted"
              >
                Paste a valid review link to see the QR code here.
              </div>
            )}
            {dirty && valid && (
              <p className="text-xs text-amber-600">
                Not saved yet — press “Save link”.
              </p>
            )}
            {valid && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownload}
              >
                <Download aria-hidden="true" />
                Download PNG (print)
              </Button>
            )}
          </div>

          {canWrite && (
            <div className="max-w-xs space-y-2 text-sm text-text-secondary">
              <p>
                The QR code updates live as you type and always matches the
                link in the field.
              </p>
              <p className="text-xs text-text-muted">
                Shortened links work fine. Print at 100% scale or larger;
                keep it flat and unobstructed so phones can scan it easily.
              </p>
              <Button
                type="button"
                onClick={handleSave}
                disabled={!valid || isPending || !dirty}
                aria-busy={isPending}
              >
                {isPending ? <Spinner size="sm" /> : null}
                Save link
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
