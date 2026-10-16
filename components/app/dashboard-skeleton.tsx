import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the overview layout so the pre-hydration frame does not jump. */
export function DashboardSkeleton() {
  return (
    <div className="medbook-dashboard-overview space-y-6">
      <div className="mb-1 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2.5">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-10 w-32 rounded-[10px]" />
          <Skeleton className="h-10 w-40 rounded-[10px]" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[156px] w-full rounded-[14px]" />
        ))}
      </div>

      <Skeleton className="h-[76px] w-full rounded-[14px]" />

      <div className="grid gap-5 min-[1050px]:grid-cols-[minmax(0,1.65fr)_minmax(285px,1fr)]">
        <Skeleton className="h-[336px] w-full rounded-[14px]" />
        <Skeleton className="h-[336px] w-full rounded-[14px]" />
      </div>

      <div className="grid gap-5 min-[1050px]:grid-cols-[minmax(0,1.65fr)_minmax(285px,1fr)]">
        <Skeleton className="h-[228px] w-full rounded-[14px]" />
        <Skeleton className="h-[228px] w-full rounded-[14px]" />
      </div>
    </div>
  );
}
