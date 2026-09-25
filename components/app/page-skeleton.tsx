import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level loading placeholders.
 *
 * These back the `loading.tsx` files for the app routes. Next.js streams the
 * closest `loading.tsx` the moment a navigation starts and (in production)
 * prefetches it for the sidebar links, so a click paints the destination's
 * frame immediately instead of leaving the previous page frozen while the
 * route's server queries run.
 *
 * They are decorative only — every block is `aria-hidden` by virtue of being
 * inert markup, and `Skeleton` already renders a plain div.
 */

/** Title + one-line subtitle, matching the header block each page renders. */
export function PageHeaderSkeleton({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <div className="space-y-2">
      <Skeleton className="h-8 w-56" />
      {subtitle ? <Skeleton className="h-4 w-80 max-w-full" /> : null}
    </div>
  );
}

/**
 * The most common page shape: a header, a row of stat cards, then full-width
 * panels. `rows` controls how many panels are stacked underneath.
 */
export function AppPageSkeleton({
  cards = 4,
  rows = 2,
  subtitle = true,
  wide = false,
}: {
  cards?: number;
  rows?: number;
  subtitle?: boolean;
  /** Opt out of the shell's `max-w-5xl` cap, like the route itself does. */
  wide?: boolean;
}) {
  return (
    <div className="space-y-6" {...(wide ? { "data-app-wide": "" } : {})}>
      <PageHeaderSkeleton subtitle={subtitle} />

      {cards > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: cards }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full rounded-card" />
          ))}
        </div>
      ) : null}

      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-64 w-full rounded-card" />
      ))}
    </div>
  );
}

/** Stacked list rows — settings, availability, services and similar pages. */
export function ListPageSkeleton({
  rows = 6,
  subtitle = true,
}: {
  rows?: number;
  subtitle?: boolean;
}) {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton subtitle={subtitle} />

      <div className="rounded-card border border-border-light bg-surface p-4">
        <div className="divide-y divide-border-light">
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-8 w-20 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}