"use client";

import { useMemo, useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { KeywordInput } from "@/components/growth-agent/keyword-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  generateGrowthDraft,
  getGrowthKeywordSuggestions,
  type GrowthGenerateResult,
} from "@/lib/actions/growth-agent";

/**
 * Topic options.
 *
 * Built from the clinic's own live service list, with two open options for
 * anything the catalogue does not cover. The prototype offered four hardcoded
 * dental subjects to every clinic in the product; a physiotherapy practice
 * would have been told to write about teeth whitening.
 */
function buildTopicOptions(serviceNames: string[]) {
  const seen = new Set<string>();
  const options: string[] = [];
  for (const name of serviceNames) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push(name);
  }
  options.push("New patient information", "A clinic update or announcement");
  return options.slice(0, 20);
}

const TONE_OPTIONS = [
  { value: "professional", label: "Warm and measured" },
  { value: "promotional", label: "Direct and upbeat" },
  { value: "educational", label: "Plain and useful" },
] as const;

const CTA_OPTIONS = ["Book Now", "Call Today", "Learn More", "Get in touch"] as const;

export type GeneratorDraft = {
  topic: string;
  keywords: string[];
  tone: string;
  cta: string;
};

/**
 * The generator form.
 *
 * Fully controlled: the four fields live in the page, not here. That is what
 * lets the preview beside it and the queue below it read from one source of
 * truth instead of each keeping a copy of the draft — the failure mode behind
 * most "the preview says something different from what got saved" bugs.
 */
export function PostGenerator({
  draft,
  onDraftChange,
  serviceNames,
  canEdit,
  onGenerated,
}: {
  draft: GeneratorDraft;
  onDraftChange: (next: GeneratorDraft) => void;
  serviceNames: string[];
  canEdit: boolean;
  onGenerated: (generated: GrowthGenerateResult) => void;
}) {
  const topics = useMemo(() => buildTopicOptions(serviceNames), [serviceNames]);
  const [isPending, startTransition] = useTransition();
  const [isSuggesting, setIsSuggesting] = useState(false);

  const set = <K extends keyof GeneratorDraft>(key: K, value: GeneratorDraft[K]) =>
    onDraftChange({ ...draft, [key]: value });

  const suggest = () => {
    setIsSuggesting(true);
    startTransition(async () => {
      const result = await getGrowthKeywordSuggestions();
      setIsSuggesting(false);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      if (result.data.keywords.length === 0) {
        toast.error(
          "No suggestions yet. Add your services in Settings and they will show up here.",
        );
        return;
      }
      // Merge rather than replace — a clinic that picked its own keywords keeps
      // them, and a suggestion already present is not duplicated.
      const merged = [...draft.keywords];
      for (const keyword of result.data.keywords) {
        if (merged.length >= 8) break;
        if (!merged.some((k) => k.toLowerCase() === keyword.toLowerCase())) {
          merged.push(keyword);
        }
      }
      onDraftChange({ ...draft, keywords: merged });
    });
  };

  const generate = () => {
    const formData = new FormData();
    formData.set("topic", draft.topic);
    formData.set("keywords", JSON.stringify(draft.keywords));
    formData.set("tone", draft.tone);
    formData.set("cta", draft.cta);

    startTransition(async () => {
      const result = await generateGrowthDraft(null, formData);
      if (result.ok) {
        onGenerated(result.data);
        toast.success("Draft saved to your queue.");
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <section
      aria-label="Post generator"
      className="rounded-card border border-text-muted/30 bg-surface shadow-card"
    >
      <div className="border-b border-text-muted/20 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-text-primary">
            Write a post
          </h2>
          <span className="inline-flex items-center gap-1 rounded-pill bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            <Sparkles className="size-3" aria-hidden="true" />
            AI draft
          </span>
        </div>
        <p className="mt-0.5 text-sm text-text-secondary">
          Pick a subject and the draft lands in your queue, ready to review.
        </p>
      </div>

      <div className="space-y-5 p-5">
        <div>
          <Label htmlFor="growth-topic" className="text-sm">
            What is this post about?
          </Label>
          <NativeSelect
            id="growth-topic"
            value={draft.topic}
            onChange={(event) => set("topic", event.target.value)}
            disabled={!canEdit}
            className="mt-1.5"
          >
            {topics.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div>
          <Label htmlFor="growth-keywords" className="text-sm">
            Search terms to cover
          </Label>
          <div className="mt-1.5">
            <KeywordInput
              id="growth-keywords"
              keywords={draft.keywords}
              onChange={(keywords) => set("keywords", keywords)}
              onSuggest={suggest}
              suggesting={isSuggesting}
              disabled={!canEdit}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="growth-tone" className="text-sm">
              Tone
            </Label>
            <NativeSelect
              id="growth-tone"
              value={draft.tone}
              onChange={(event) => set("tone", event.target.value)}
              disabled={!canEdit}
              className="mt-1.5"
            >
              {TONE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor="growth-cta" className="text-sm">
              Button text
            </Label>
            <NativeSelect
              id="growth-cta"
              value={draft.cta}
              onChange={(event) => set("cta", event.target.value)}
              disabled={!canEdit}
              className="mt-1.5"
            >
              {CTA_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>

        <Button
          type="button"
          onClick={generate}
          disabled={!canEdit || isPending || draft.topic.trim().length === 0}
          className="w-full"
          size="lg"
        >
          {isPending ? <Spinner /> : <Sparkles aria-hidden="true" />}
          {isPending ? "Writing your draft…" : "Generate draft"}
        </Button>

        {!canEdit ? (
          <p className="text-xs text-text-secondary">
            You can read this page, but only owners and admins can generate and
            publish posts.
          </p>
        ) : null}
      </div>
    </section>
  );
}
