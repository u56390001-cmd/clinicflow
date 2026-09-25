import { Skeleton } from "@/components/ui/skeleton";

/**
 * Master-detail placeholder for the EMR workspace. The route's layout already
 * supplies `data-app-wide`, so this only has to describe the two panes.
 */
export default function PatientsLoading() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(360px,1fr)_2fr]">
      <div className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-56 max-w-full" />
        </div>
        <Skeleton className="h-10 w-full" />
        <div className="rounded-card border border-border-light bg-surface p-4">
          <div className="divide-y divide-border-light">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-card" />
        <Skeleton className="h-64 w-full rounded-card" />
      </div>
    </div>
  );
}