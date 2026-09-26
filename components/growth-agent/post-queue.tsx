"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  CalendarClock,
  Check,
  Inbox,
  PencilLine,
  RotateCcw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { GrowthStatusBadge } from "@/components/growth-agent/growth-status-badge";
import { KeywordInput } from "@/components/growth-agent/keyword-input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteGrowthPost,
  publishGrowthPost,
  revertGrowthPost,
  saveGrowthPost,
} from "@/lib/actions/growth-agent";
import { MAX_POST_CHARS } from "@/lib/ai/growth-post";
import type { GrowthPost, GrowthPostStatus } from "@/types/database";

const TONE_OPTIONS = [
  { value: "professional", label: "Warm and measured" },
  { value: "promotional", label: "Direct and upbeat" },
  { value: "educational", label: "Plain and useful" },
] as const;

const CTA_OPTIONS = ["Book Now", "Call Today", "Learn More", "Get in touch"] as const;

/** Tab order for the queue. Only these four exist in the DB enum. */
const FILTERS: { id: "all" | GrowthPostStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Drafts" },
  { id: "scheduled", label: "Scheduled" },
  { id: "published", label: "Published" },
  { id: "failed", label: "Failed" },
];

/**
 * The content queue.
 *
 * Two things this deliberately does not do:
 *
 * 1. It does not hide posts whose status is `failed`. A failed post is the one
 *    row on this page that needs a human, so filtering it out of the default
 *    view would bury it.
 * 2. It does not offer a "Publish" button that implies the text has reached
 *    Google. The action marks the row and the toast says whether it will sync —
 *    that distinction is the whole point of the honest state machine, and
 *    collapsing it into a generic "Published!" toast is how a clinic ends up
 *    believing a post is live when it is not.
 */
export function PostQueue({
  posts,
  isConnected,
  canEdit,
}: {
  posts: GrowthPost[];
  isConnected: boolean;
  canEdit: boolean;
}) {
  const [filter, setFilter] = useState<"all" | GrowthPostStatus>("all");
  const [editing, setEditing] = useState<GrowthPost | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<GrowthPost | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const counts = useMemo(() => {
    const tally: Record<string, number> = { all: posts.length };
    for (const post of posts) tally[post.status] = (tally[post.status] ?? 0) + 1;
    return tally;
  }, [posts]);

  const visible = useMemo(
    () => (filter === "all" ? posts : posts.filter((post) => post.status === filter)),
    [posts, filter],
  );

  const publish = (post: GrowthPost) => {
    setBusyId(post.id);
    startTransition(async () => {
      const result = await publishGrowthPost(post.id);
      setBusyId(null);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      if (result.data.willSync) {
        toast.success("Published to your Google profile.");
      } else {
        toast.success("Marked as published.", {
          description:
            "No Google profile is linked, so this has not reached Google yet. It will sync once you connect one.",
        });
      }
    });
  };

  const revert = (post: GrowthPost) => {
    setBusyId(post.id);
    startTransition(async () => {
      const result = await revertGrowthPost(post.id);
      setBusyId(null);
      if (result.ok) toast.success("Moved back to drafts.");
      else toast.error(result.message);
    });
  };

  const destroy = () => {
    const post = confirmingDelete;
    if (!post) return;
    setBusyId(post.id);
    startTransition(async () => {
      const result = await deleteGrowthPost(post.id);
      setBusyId(null);
      setConfirmingDelete(null);
      if (result.ok) toast.success("Post deleted.");
      else toast.error(result.message);
    });
  };

  return (
    <section
      aria-label="Post queue"
      className="rounded-card border border-text-muted/30 bg-surface"
    >
      <div className="flex flex-col gap-3 border-b border-text-muted/20 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Post queue</h2>
          <p className="mt-0.5 text-sm text-text-secondary">
            Everything written, scheduled and published.
          </p>
        </div>

        <div
          role="group"
          aria-label="Filter posts"
          className="flex flex-wrap gap-1"
        >
          {FILTERS.map((option) => {
            const count = counts[option.id] ?? 0;
            const isActive = filter === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setFilter(option.id)}
                aria-pressed={isActive}
                className={
                  isActive
                    ? "rounded-control bg-secondary px-2.5 py-1 text-xs font-medium text-white"
                    : "rounded-control px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-app hover:text-text-primary"
                }
              >
                {option.label}
                {count > 0 ? (
                  <span className={isActive ? "ml-1.5 text-white/60" : "ml-1.5 text-text-muted"}>
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {posts.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <Inbox
            className="mx-auto size-8 text-text-muted/60"
            aria-hidden="true"
          />
          <p className="mt-3 text-sm font-medium text-text-primary">Nothing here yet</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-text-secondary">
            Generate your first post and it will land here as a draft, ready to
            read before anything goes anywhere.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <p className="text-sm text-text-secondary">
            No {FILTERS.find((f) => f.id === filter)?.label.toLowerCase()} posts.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-text-muted/15">
          {visible.map((post) => (
            <QueueRow
              key={post.id}
              post={post}
              isConnected={isConnected}
              canEdit={canEdit}
              isBusy={busyId === post.id}
              onEdit={() => setEditing(post)}
              onPublish={() => publish(post)}
              onRevert={() => revert(post)}
              onDelete={() => setConfirmingDelete(post)}
            />
          ))}
        </ul>
      )}

      {editing ? (
        <PostEditor
          post={editing}
          onClose={() => setEditing(null)}
          onSaved={() => setEditing(null)}
        />
      ) : null}

      {confirmingDelete ? (
        <ConfirmDialog
          title="Delete this post?"
          description={
            "This removes the post from your queue. It cannot be undone, and it has no effect on anything already published to Google."
          }
          confirmText="Delete post"
          cancelText="Keep it"
          variant="destructive"
          loading={busyId === confirmingDelete.id && isPending}
          onConfirm={destroy}
          onCancel={() => setConfirmingDelete(null)}
        />
      ) : null}
    </section>
  );
}

/** One post. Read-only unless the viewer can edit. */
function QueueRow({
  post,
  isConnected,
  canEdit,
  isBusy,
  onEdit,
  onPublish,
  onRevert,
  onDelete,
}: {
  post: GrowthPost;
  isConnected: boolean;
  canEdit: boolean;
  isBusy: boolean;
  onEdit: () => void;
  onPublish: () => void;
  onRevert: () => void;
  onDelete: () => void;
}) {
  const canPublish = post.status === "draft" || post.status === "scheduled";
  const canRevert = post.status === "published" || post.status === "failed";

  return (
    <li className="px-5 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <GrowthStatusBadge status={post.status} />
            <h3 className="truncate text-sm font-medium text-text-primary">
              {post.topic}
            </h3>
          </div>

          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-text-secondary">
            {post.content}
          </p>

          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
            <span>{formatDate(post.created_at)}</span>
            {post.scheduled_at ? (
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="size-3" aria-hidden="true" />
                Goes out {formatDate(post.scheduled_at)}
              </span>
            ) : null}
            {post.status === "published" && post.published_at ? (
              <span
                className={
                  isConnected ? undefined : "text-status-warning"
                }
              >
                {isConnected
                  ? `Published ${formatDate(post.published_at)}`
                  : `Marked published ${formatDate(post.published_at)} — waiting for a Google profile`}
              </span>
            ) : null}
            {post.keywords.length > 0 ? (
              <span className="truncate">{post.keywords.join(" · ")}</span>
            ) : null}
          </p>

          {post.status === "failed" && post.failure_reason ? (
            <p className="mt-2 rounded-control border border-status-destructive/30 bg-status-destructive/5 px-3 py-2 text-xs text-status-destructive">
              {post.failure_reason}
            </p>
          ) : null}
        </div>

        {canEdit ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            {isBusy ? (
              <span className="flex items-center gap-2 px-1 text-sm text-text-secondary">
                <Spinner size="sm" />
                Working
              </span>
            ) : (
              <>
                {canPublish ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={onEdit}
                    >
                      <PencilLine aria-hidden="true" />
                      Edit
                    </Button>
                    <Button type="button" size="sm" onClick={onPublish}>
                      <Send aria-hidden="true" />
                      Publish
                    </Button>
                  </>
                ) : null}
                {canRevert ? (
                  <Button type="button" size="sm" variant="outline" onClick={onRevert}>
                    <RotateCcw aria-hidden="true" />
                    Reopen
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={onDelete}
                  aria-label={`Delete ${post.topic}`}
                  className="text-text-muted hover:bg-status-destructive/10 hover:text-status-destructive"
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Edit dialog.
 *
 * Scheduling is a real control here, not decoration: a `datetime-local` value
 * that is set moves the post to `scheduled` and the server converts the clinic's
 * local wall-clock time to UTC, so a clinic in Karachi and one in Denver can
 * both pick "9:00am" and get 9:00am their time.
 */
function PostEditor({
  post,
  onClose,
  onSaved,
}: {
  post: GrowthPost;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [content, setContent] = useState(post.content);
  const [topic, setTopic] = useState(post.topic);
  const [keywords, setKeywords] = useState<string[]>(post.keywords);
  const [cta, setCta] = useState(post.cta);
  const [tone, setTone] = useState(post.tone);
  const [scheduledFor, setScheduledFor] = useState(
    post.scheduled_at ? toLocalInputValue(post.scheduled_at) : "",
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const overLimit = content.length > MAX_POST_CHARS;

  const save = () => {
    const formData = new FormData();
    formData.set("postId", post.id);
    formData.set("content", content);
    formData.set("topic", topic);
    formData.set("keywords", JSON.stringify(keywords));
    formData.set("cta", cta);
    formData.set("tone", tone);
    formData.set("scheduledFor", scheduledFor);

    startTransition(async () => {
      const result = await saveGrowthPost(null, formData);
      if (result.ok) {
        toast.success(
          scheduledFor ? "Post updated and scheduled." : "Post updated.",
        );
        onSaved();
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="growth-editor-title"
    >
      <div className="my-auto w-full max-w-2xl rounded-card border border-text-muted/30 bg-surface shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-text-muted/20 px-5 py-4">
          <div className="min-w-0">
            <h2
              id="growth-editor-title"
              className="text-base font-semibold text-text-primary"
            >
              Edit post
            </h2>
            <p className="mt-0.5 text-sm text-text-secondary">
              Changes stay in your queue until you publish them.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-control p-1.5 text-text-muted transition-colors hover:bg-app hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <Label htmlFor="edit-topic" className="text-sm">
              Subject
            </Label>
            <Input
              id="edit-topic"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              className="mt-1.5"
              maxLength={120}
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="edit-content" className="text-sm">
                Post text
              </Label>
              <span
                className={
                  overLimit
                    ? "text-xs font-medium tabular-nums text-status-destructive"
                    : "text-xs tabular-nums text-text-muted"
                }
              >
                {content.length} / {MAX_POST_CHARS}
              </span>
            </div>
            <Textarea
              id="edit-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={7}
              className="mt-1.5 resize-y"
              maxLength={MAX_POST_CHARS * 2}
            />
            {overLimit ? (
              <p className="mt-1 text-xs text-status-destructive">
                Google truncates posts around {MAX_POST_CHARS} characters. Trim it
                before publishing.
              </p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="edit-keywords" className="text-sm">
              Search terms
            </Label>
            <div className="mt-1.5">
              <KeywordInput
                id="edit-keywords"
                keywords={keywords}
                onChange={setKeywords}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="edit-cta" className="text-sm">
                Button text
              </Label>
              <NativeSelect
                id="edit-cta"
                value={cta}
                onChange={(event) => setCta(event.target.value)}
                className="mt-1.5"
              >
                {CTA_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="edit-tone" className="text-sm">
                Tone
              </Label>
              <NativeSelect
                id="edit-tone"
                value={tone}
                onChange={(event) => setTone(event.target.value)}
                className="mt-1.5"
              >
                {TONE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div>
            <Label htmlFor="edit-schedule" className="text-sm">
              Schedule
            </Label>
            <Input
              id="edit-schedule"
              type="datetime-local"
              value={scheduledFor}
              onChange={(event) => setScheduledFor(event.target.value)}
              className="mt-1.5"
            />
            <p className="mt-1 text-xs text-text-secondary">
              Leave empty to keep this a draft. Setting a time schedules it in
              your clinic&rsquo;s local time.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-text-muted/20 px-5 py-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={isPending || overLimit || content.trim().length === 0}
          >
            {isPending ? <Spinner /> : <Check aria-hidden="true" />}
            {scheduledFor ? "Save and schedule" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** UTC instant -> the `YYYY-MM-DDTHH:mm` shape `datetime-local` wants. */
function toLocalInputValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/** Absolute date rather than "3 days ago" — a queued post's age matters. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}
