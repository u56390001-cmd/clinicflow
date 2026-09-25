import { Suspense } from "react";

import { AppHeader } from "@/components/app/app-header";
import { AppSidebar } from "@/components/app/app-sidebar";
import { MobileNavProvider } from "@/components/app/mobile-nav-context";

function AppHeaderFallback() {
  return (
    <div
      className="h-16 shrink-0 border-b border-text-muted/30 bg-surface"
      aria-hidden="true"
    />
  );
}

function AppSidebarFallback() {
  return (
    <>
      <div className="md:hidden" aria-hidden="true" />
      <div
        className="hidden w-64 shrink-0 border-r border-text-muted/30 bg-surface"
        aria-hidden="true"
      />
    </>
  );
}

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <MobileNavProvider>
      <div className="flex min-h-svh flex-col bg-app">
        <Suspense fallback={<AppHeaderFallback />}>
          <AppHeader />
        </Suspense>
        <div className="flex min-w-0 flex-1">
          <Suspense fallback={<AppSidebarFallback />}>
            <AppSidebar />
          </Suspense>
          <div className="min-w-0 flex-1">
            <main className="mx-auto w-full max-w-5xl px-4 py-8">
              {children}
            </main>
          </div>
        </div>
      </div>
    </MobileNavProvider>
  );
}
