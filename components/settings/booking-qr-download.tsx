"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";

import { Button } from "@/components/ui/button";
import { toast } from "sonner";
/**
 * Downloadable QR code for the clinic's booking link.
 *
 * Uses the `qrcode` package (already a dependency) rather than
 * `qrcode.react`, which was imported but never installed — that import is what
 * broke the button.
 *
 * The QR is rendered off-screen to a canvas, then the clinic name and URL are
 * composited underneath it before the PNG is produced. Scanning yields the
 * full URL rather than a bare slug, and a patient who looks at the poster can
 * read the address without scanning it.
 */

type Props = {
  /** Full booking URL to encode. Must be absolute — a relative path scans as nothing. */
  url: string;
  clinicName: string;
};

type Status = "idle" | "working" | "error";

/** Quiet zone in modules; 4 is the spec minimum and survives cheap scanners. */
const MARGIN = 4;

/** Rendered width of the QR itself, in pixels, before the caption is added. */
const QR_SIZE = 1024;

/** Height reserved for the caption block below the QR. */
const CAPTION_HEIGHT = 260;

/** Keeps a very long slug from overflowing the printed card. */
function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function BookingQrDownload({ url, clinicName }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [preview, setPreview] = useState<string | null>(null);

  // Build the preview once per URL so the button has something to show and the
  // canvas work only happens when the link actually changes.
  useEffect(() => {
    let cancelled = false;

    async function build() {
      try {
        const dataUrl = await QRCode.toDataURL(url, {
          errorCorrectionLevel: "M",
          margin: MARGIN,
          width: QR_SIZE,
          color: { dark: "#0f172a", light: "#ffffff" },
        });
        if (!cancelled) setPreview(dataUrl);
      } catch {
        if (!cancelled) setPreview(null);
      }
    }

    void build();
    return () => {
      cancelled = true;
    };
  }, [url]);

  /**
   * Compose the caption under the QR and trigger a download.
   *
   * `toDataURL` is async, so the click handler awaits it. Anchors created
   * programmatically still need to be attached to the document for the
   * download to fire in some browsers.
   */
  const download = useCallback(async () => {
    setStatus("working");

    try {
      const qrDataUrl = await QRCode.toDataURL(url, {
        errorCorrectionLevel: "M",
        margin: MARGIN,
        width: QR_SIZE,
        color: { dark: "#0f172a", light: "#ffffff" },
      });

      const canvas = document.createElement("canvas");
      canvas.width = QR_SIZE + MARGIN * 16;
      canvas.height = QR_SIZE + MARGIN * 16 + CAPTION_HEIGHT;

      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable");

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);

      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Could not render the QR code"));
        image.src = qrDataUrl;
      });
      context.drawImage(image, 0, 0, canvas.width, QR_SIZE + MARGIN * 16);

      // Caption: clinic name, then the link itself.
      context.fillStyle = "#0f172a";
      context.textAlign = "center";

      context.font = "bold 52px system-ui, -apple-system, Segoe UI, sans-serif";
      context.fillText(
        truncate(clinicName, 38),
        canvas.width / 2,
        canvas.height - CAPTION_HEIGHT + 80,
      );

      context.font = "36px system-ui, -apple-system, Segoe UI, sans-serif";
      context.fillStyle = "#475569";
      context.fillText(
        truncate(url.replace(/^https?:\/\//i, ""), 52),
        canvas.width / 2,
        canvas.height - CAPTION_HEIGHT + 150,
      );

      context.font = "30px system-ui, -apple-system, Segoe UI, sans-serif";
      context.fillStyle = "#94a3b8";
      context.fillText(
        "Scan to book an appointment",
        canvas.width / 2,
        canvas.height - 40,
      );

      // `toBlob` rather than `toDataURL`: the PNG can exceed the data-URL size
      // limit once the caption is added.
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) throw new Error("Could not encode the image");

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${truncate(clinicName.replace(/\s+/g, "-").toLowerCase(), 40) || "booking"}-qr.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);

      setStatus("idle");
      toast.success("QR code downloaded");
    } catch {
      setStatus("error");
      toast.error("Could not generate the QR code. Please try again.");
    }
  }, [url, clinicName]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        {/* Decorative: the actual download is rendered on the canvas above. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={preview ?? undefined}
          alt={`QR code linking to ${url}`}
          width={112}
          height={112}
          className="shrink-0 rounded-md border bg-white p-1"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Print-ready QR code</p>
          <p className="text-muted-foreground text-xs">
            PNG with your clinic name and link. Put it on posters, prescriptions
            or your website.
          </p>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={() => void download()}
        disabled={status === "working" || !preview}
      >
        {status === "working" ? "Generating…" : "Download QR code"}
      </Button>

      {status === "error" ? (
        <p className="text-destructive text-xs">
          The QR code could not be generated. Refresh the page and try again.
        </p>
      ) : null}
    </div>
  );
}
