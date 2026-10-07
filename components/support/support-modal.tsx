"use client";

/**
 * Support request modal (migration 0061).
 *
 * The four fields mirror `support_tickets` exactly: a drop-down of request
 * types, a subject, a detailed description and a priority. Submitting goes
 * through `submitSupportTicketAction` — which Zod-checks the same lists this
 * modal iterates — with a spinner on the button while it flies and an inline
 * error if the database refuses the row.
 */

import { useState, useTransition } from "react";
import { Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { submitSupportTicketAction } from "@/lib/actions/support";
import {
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_TYPES,
} from "@/lib/validation/schemas";

export function SupportModal({
  open,
  onOpenChange,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted: () => void;
}) {
  const [type, setType] = useState<string>(SUPPORT_TICKET_TYPES[0]);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<string>("Medium");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setType(SUPPORT_TICKET_TYPES[0]);
    setSubject("");
    setDescription("");
    setPriority("Medium");
    setError(null);
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await submitSupportTicketAction({
        type,
        subject,
        description,
        priority,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      reset();
      onOpenChange(false);
      onSubmitted();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-text-primary">
            Open a support request
          </DialogTitle>
          <DialogDescription>
            Tell us what happened or what you would like improved. Our support
            team reads every ticket and replies to the email on your account.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="support-type">Request type</Label>
            <NativeSelect
              id="support-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              disabled={isPending}
            >
              {SUPPORT_TICKET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="support-subject">Subject</Label>
            <Input
              id="support-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. WhatsApp messages stopped arriving"
              disabled={isPending}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="support-description">Details</Label>
            <Textarea
              id="support-description"
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened? What did you expect? Include any error messages or the steps to reproduce."
              disabled={isPending}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="support-priority">Priority</Label>
            <NativeSelect
              id="support-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              disabled={isPending}
            >
              {SUPPORT_TICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-card border border-status-destructive/30 bg-red-50 p-3 text-sm text-red-700"
          >
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Spinner size="sm" />}
            Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}