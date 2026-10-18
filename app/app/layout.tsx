import { Suspense } from "react";

import { AppHeader } from "@/components/app/app-header";
import { AppScrollArea } from "@/components/app/app-scroll-area";
import { AppSidebar } from "@/components/app/app-sidebar";
import { MobileNavProvider } from "@/components/app/mobile-nav-context";
import { PwaInstallListener } from "@/components/app/pwa-install-listener";
import { TelehealthProvider } from "@/components/telehealth/telehealth-provider";

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
        className="hidden h-full w-64 shrink-0 border-r border-text-muted/30 bg-surface md:block"
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
      <PwaInstallListener />
      <TelehealthProvider>
        <div className="flex h-svh flex-col overflow-hidden bg-app">
          <Suspense fallback={<AppHeaderFallback />}>
            <AppHeader />
          </Suspense>
          <div className="flex min-h-0 min-w-0 flex-1">
            <Suspense fallback={<AppSidebarFallback />}>
              <AppSidebar />
            </Suspense>
            <AppScrollArea>
              <main className="mx-auto w-full max-w-5xl px-4 py-8">
                {children}
              </main>
            </AppScrollArea>
          </div>
        </div>
      </TelehealthProvider>
    </MobileNavProvider>
  );
}
