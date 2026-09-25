import { DashboardSkeleton } from "@/components/app/dashboard-skeleton";

/** Mirrors the page's own Suspense fallback so navigation and first paint match. */
export default function DashboardLoading() {
  return <DashboardSkeleton />;
}