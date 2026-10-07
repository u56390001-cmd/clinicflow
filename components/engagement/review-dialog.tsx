"use client";

import { useState } from "react";
import { Star } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type ReviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (rating: number, reviewerName: string, comment: string) => Promise<boolean>;
  disabled?: boolean;
};

const RATING_LABELS = ["Poor", "Fair", "Good", "Very Good", "Excellent"];

/** Log a Google review from the metrics card — feeds the real rating tiles. */
export function ReviewDialog({
  open,
  onOpenChange,
  onSave,
  disabled = false,
}: ReviewDialogProps) {
  const [rating, setRating] = useState(5);
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const ok = await onSave(rating, name, comment);
    setSaving(false);
    if (ok) {
      setName("");
      setComment("");
      setRating(5);
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log a Google Review</DialogTitle>
          <DialogDescription>
            Record a review your clinic received — it updates the review
            metrics on this page right away.
          </DialogDescription>
        </DialogHeader>

        <div>
          <p className="text-xs font-medium text-text-primary">Rating</p>
          <div className="mt-2 flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                disabled={disabled}
                aria-label={`${value} stars`}
                onClick={() => setRating(value)}
                className="disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Star
                  className={cn(
                    "size-7 transition-colors",
                    value <= rating ? "fill-primary text-primary" : "text-text-muted/40",
                  )}
                  aria-hidden="true"
                />
              </button>
            ))}
            <span className="ml-2 text-xs text-text-secondary">
              {RATING_LABELS[rating - 1]}
            </span>
          </div>
        </div>

        <div>
          <label htmlFor="reviewer-name" className="text-xs font-medium text-text-primary">
            Reviewer name
          </label>
          <Input
            id="reviewer-name"
            value={name}
            disabled={disabled}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Rahul S."
            className="mt-1.5 text-sm"
          />
        </div>

        <div>
          <label htmlFor="review-comment" className="text-xs font-medium text-text-primary">
            Comment
          </label>
          <Textarea
            id="review-comment"
            value={comment}
            disabled={disabled}
            onChange={(event) => setComment(event.target.value)}
            placeholder="What did the patient say?"
            rows={3}
            className="mt-1.5 text-sm"
          />
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={disabled || saving}
            onClick={handleSave}
          >
            {saving ? "Saving…" : "Save Review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}