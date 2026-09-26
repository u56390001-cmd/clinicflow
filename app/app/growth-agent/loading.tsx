/**
 * Growth Agent placeholder.
 *
 * Structured to match the real layout — connection strip, four metric boxes, a
 * 7/5 pair, queue, settings — rather than one generic grey block. A skeleton of
 * the wrong shape is worse than none: it promises a page that arrives looking
 * nothing like it, which reads as a bug rather than as loading.
 *
 * `data-app-wide` is already on the route's `layout.tsx`, so this only has to
 * describe the content.
 */
export default function GrowthAgentLoading() {
  return (
    <div className="min-w-0 animate-pulse">
      <div className="mb-6 space-y-2">
        <div className="h-7 w-48 rounded bg-text-muted/15" />
        <div className="h-4 w-80 max-w-full rounded bg-text-muted/10" />
      </div>

      <div className="space-y-6">
        <div className="h-[88px] rounded-card border border-text-muted/20 bg-surface" />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-[132px] rounded-card border border-text-muted/20 bg-surface"
            />
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          <div className="h-[420px] rounded-card border border-text-muted/20 bg-surface lg:col-span-7" />
          <div className="h-[420px] rounded-card border border-text-muted/20 bg-surface lg:col-span-5" />
        </div>

        <div className="h-64 rounded-card border border-text-muted/20 bg-surface" />
        <div className="h-56 rounded-card border border-text-muted/20 bg-surface" />
      </div>
    </div>
  );
}
