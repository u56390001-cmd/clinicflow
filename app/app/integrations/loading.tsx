/**
 * Integrations placeholder.
 *
 * Mirrors the real layout — title row with a counter pill, a search/filter bar,
 * then three category sections of 1×3 cards — rather than one generic grey
 * block. A skeleton of the wrong shape is worse than none: it promises a page
 * that arrives looking nothing like it, which reads as a bug rather than as
 * loading.
 *
 * `data-app-wide` is already on the route's `layout.tsx`, so this only has to
 * describe the content.
 */
export default function IntegrationsLoading() {
  return (
    <div className="min-w-0 animate-pulse">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-40 rounded bg-text-muted/15" />
          <div className="h-4 w-72 max-w-full rounded bg-text-muted/10" />
        </div>
        <div className="h-8 w-24 rounded-pill border border-text-muted/20 bg-surface" />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="h-10 min-w-[220px] flex-1 rounded-control border border-text-muted/20 bg-surface" />
        <div className="h-10 w-[180px] rounded-control border border-text-muted/20 bg-surface" />
      </div>

      <div className="mt-6 space-y-6">
        {[3, 2, 3].map((cards, section) => (
          <section key={section}>
            <div className="mb-3 space-y-2">
              <div className="h-4 w-44 rounded bg-text-muted/15" />
              <div className="h-3 w-80 max-w-full rounded bg-text-muted/10" />
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: cards }).map((_, index) => (
                <div
                  key={index}
                  className="h-[188px] rounded-card border border-text-muted/20 bg-surface"
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
