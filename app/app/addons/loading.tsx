import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors the Add-ons workspace layout so the storefront does not pop in
 * after the server action resolves: header + stat pills, filter tabs, and a
 * placeholder card grid.
 */
export default function AddonsLoading() {
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-28 rounded-pill" />
          <Skeleton className="h-8 w-36 rounded-pill" />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-pill" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="rounded-card border border-hairline bg-surface p-4 sm:p-5"
          >
            <Skeleton className="size-11 rounded-xl" />
            <Skeleton className="mt-4 h-4 w-20 rounded-pill" />
            <Skeleton className="mt-2 h-4 w-32" />
            <Skeleton className="mt-2 h-3 w-full" />
            <div className="mt-5 flex items-center justify-between border-t border-hairline pt-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-24 rounded-pill" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}