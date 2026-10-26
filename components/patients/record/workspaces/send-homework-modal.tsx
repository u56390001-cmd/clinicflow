"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseList } from "@/components/patients/record/workspaces/specialty-form";

/**
 * 📲 WhatsApp Homework Dispatch (Care Plan).
 *
 * Builds a friendly bilingual (Roman-Urdu leaning) message from the homework
 * chips the clinician has on the plan and hands it to the patient's own chat:
 * the wa.me deep link needs no clinic WhatsApp API integration, and "Copy
 * message" covers any account without a number on file — the final "web of
 * trust" step is flipping the send key inside WhatsApp itself, which is why
 * the modal refuses to fire when there is nothing on file to send to.
 */
export function SendHomeworkModal({
  open,
  onClose,
  patientName,
  whatsappNumber,
  homeworkText,
  followUp,
  clinicName,
}: {
  open: boolean;
  onClose: () => void;
  patientName: string;
  whatsappNumber: string | null;
  homeworkText: string | null;
  followUp: string | null;
  clinicName: string;
}) {
  const tasks = useMemo(
    () => parseList(homeworkText).filter((task) => task.toLowerCase() !== "none"),
    [homeworkText],
  );

  const message = useMemo(() => {
    const lines = [
      `Assalam-o-Alaikum ${patientName},`,
      `${clinicName} ki taraf se aapka aaj ka therapy homework & action plan:`,
      ...tasks.map((task) => `- ${task}`),
      `Agli meeting: ${followUp ?? "jald hi"}. Barah-e-karam apna mood diary / exercise waqt par pura karein.`,
      "Shukriya — agar koi maslah ho to clinic se rabta karein.",
    ].filter(Boolean);
    return lines.join("\n");
  }, [patientName, tasks, clinicName, followUp]);

  const [draft, setDraft] = useState(message);
  useEffect(() => {
    setDraft(message);
  }, [message]);

  // wa.me wants digits with country code only.
  const dest = (whatsappNumber ?? "").replace(/[^\d]/g, "");
  const href = dest ? `https://wa.me/${dest}?text=${encodeURIComponent(draft)}` : "";

  function copyMessage() {
    void navigator.clipboard
      .writeText(draft)
      .then(() => toast.success("Homework message copied — paste it in any chat."))
      .catch(() => toast.error("Clipboard is blocked here. Select and copy manually."));
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent size="wide" className="gap-3">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6 text-sm font-semibold">
            <MessageCircle aria-hidden="true" className="size-4 text-primary" />
            Homework dispatch
          </DialogTitle>
          <p className="text-[11.5px] text-text-muted">
            {dest
              ? "Prefilled message — review, edit if needed, then hand off to WhatsApp."
              : "This patient has no WhatsApp number on file. Copy the message and send it through any channel the family uses."}
          </p>
        </DialogHeader>

        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={8}
          aria-label="Homework message"
          className="w-full resize-y rounded-control border border-text-muted/40 bg-app/60 p-3 text-[12.5px] leading-relaxed text-text-primary"
        />

        {tasks.length === 0 && (
          <p className="rounded-card border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11.5px] text-amber-700">
            No homework chips selected on this plan (or only &ldquo;None&rdquo;). Pick tasks first so
            the message has content worth sending.
          </p>
        )}

        <DialogFooter className="flex-col gap-1.5 sm:flex-row sm:items-center">
          <span className="mr-auto text-[11px] text-text-muted">
            Sending as a normal chat message — nothing is stored in the clinic
            WhatsApp inbox.
          </span>
          <Button type="button" variant="outline" size="sm" onClick={copyMessage}>
            <Copy aria-hidden="true" />
            Copy message
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!dest || tasks.length === 0}
            title={dest ? undefined : "No WhatsApp number on file for this patient"}
            onClick={() => window.open(href, "_blank", "noopener,noreferrer")}
          >
            <MessageCircle aria-hidden="true" />
            Open WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
