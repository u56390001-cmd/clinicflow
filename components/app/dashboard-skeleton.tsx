import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the overview layout so the pre-hydration frame does not jump. */
export function DashboardSkeleton() {
  return (
    <div className="medbook-dashboard-overview space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-10 w-32 rounded-[9px]" />
          <Skeleton className="h-10 w-40 rounded-[9px]" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[145px] w-full rounded-[13px]" />
        ))}
      </div>

      <Skeleton className="h-[68px] w-full rounded-[12px]" />

      <div className="grid gap-[18px] min-[1050px]:grid-cols-[minmax(0,1.65fr)_minmax(285px,1fr)]">
        <Skeleton className="h-[320px] w-full rounded-[14px]" />
        <Skeleton className="h-[320px] w-full rounded-[14px]" />
      </div>

      <div className="grid gap-[18px] min-[1050px]:grid-cols-[minmax(0,1.65fr)_minmax(285px,1fr)]">
        <Skeleton className="h-[220px] w-full rounded-[14px]" />
        <Skeleton className="h-[220px] w-full rounded-[14px]" />
      </div>
    </div>
  );
}
