import { Suspense } from "react";
import type { Metadata } from "next";

import { DashboardContent } from "@/components/app/dashboard-content";
import { DashboardSkeleton } from "@/components/app/dashboard-skeleton";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}
