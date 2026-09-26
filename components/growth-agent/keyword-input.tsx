"use client";

import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/** Mirrors the limit in `growthGenerateSchema`; eight is a targeting aid, past
 *  this it is stuffing. */
const KEYWORD_LIMIT = 8;

/**
 * Keyword tag input.
 *
 * Built rather than borrowed because the behaviour a person expects from a tag
 * field is mostly keyboard behaviour, and the reference prototype had none of
 * it: Enter added a tag, nothing removed the last one, and a comma silently
 * became part of a keyword. Here —
 *
 *   Enter / comma  add the tag
 *   Backspace      on an empty field removes the last tag
 *   Escape         clears a half-typed value
 *
 * The `#` is added by the renderer, not typed by the user, and stripped on the
 * way back out, so `#Dental` and `Dental` can never both be in the array.
 */
export function KeywordInput({
  keywords,
  onChange,
  onSuggest,
  suggesting = false,
  disabled = false,
  id,
}: {
  keywords: string[];
  onChange: (next: string[]) => void;
  onSuggest?: () => void;
  suggesting?: boolean;
  disabled?: boolean;
  id?: string;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const atLimit = keywords.length >= KEYWORD_LIMIT;

  const commit = (raw: string) => {
    const cleaned = raw.trim().replace(/^#+/, "").trim();
    if (!cleaned || atLimit) return;
    // Case-insensitive dedupe: "Dental" and "dental" are one tag to a reader.
    if (keywords.some((k) => k.toLowerCase() === cleaned.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...keywords, cleaned.slice(0, 40)]);
    setDraft("");
  };

  const removeAt = (index: number) => {
    onChange(keywords.filter((_, i) => i !== index));
    // Return focus so the keyboard flow continues without a mouse.
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commit(draft);
      return;
    }
    if (event.key === "Backspace" && draft === "" && keywords.length > 0) {
      event.preventDefault();
      removeAt(keywords.length - 1);
      return;
    }
    if (event.key === "Escape") {
      setDraft("");
    }
  };

  return (
    <div>
      <div
        onClick={() => inputRef.current?.focus()}
        className={cn(
          "flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-control border bg-surface px-2 py-2 transition-colors",
          disabled
            ? "cursor-not-allowed border-text-muted/20 bg-app opacity-60"
            : "cursor-text border-text-muted/40 hover:border-text-muted/70 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30",
        )}
      >
        {keywords.map((keyword, index) => (
          <span
            key={keyword}
            className="inline-flex items-center gap-1 rounded-control border border-primary/20 bg-primary/10 py-0.5 pl-2 pr-1 text-xs font-medium text-primary"
          >
            <span className="max-w-[140px] truncate">#{keyword}</span>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                removeAt(index);
              }}
              disabled={disabled}
              aria-label={`Remove keyword ${keyword}`}
              className="rounded-sm p-0.5 text-primary/60 transition-colors hover:bg-primary/20 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </span>
        ))}

        {!atLimit ? (
          <input
            ref={inputRef}
            id={id}
            type="text"
            value={draft}
            disabled={disabled}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            // A comma is a commit key, not a character — swallow it before it
            // reaches the field so it can never end up inside a keyword.
            onBlur={() => commit(draft)}
            placeholder={
              keywords.length === 0
                ? "Add a keyword, then press Enter"
                : "Add another"
            }
            className="min-w-[120px] flex-1 border-0 bg-transparent p-0.5 text-sm text-text-primary outline-none placeholder:text-text-muted disabled:cursor-not-allowed"
          />
        ) : null}
      </div>

      <div className="mt-1.5 flex items-start justify-between gap-3">
        <p className="text-xs text-text-secondary">
          {atLimit ? (
            <span className="text-status-warning">
              {KEYWORD_LIMIT} keywords is the limit. Remove one to add another.
            </span>
          ) : (
            "Keywords shape the wording. They are never printed as hashtags."
          )}
        </p>
        {onSuggest ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onSuggest}
            disabled={disabled || suggesting || atLimit}
            className="h-7 shrink-0 px-2 text-xs text-primary hover:bg-primary/10"
          >
            {suggesting ? (
              <Spinner size="sm" />
            ) : (
              <Plus className="size-3.5" aria-hidden="true" />
            )}
            Suggest from my services
          </Button>
        ) : null}
      </div>
    </div>
  );
}
