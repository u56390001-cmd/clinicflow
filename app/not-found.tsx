import Link from "next/link";

import { APP_ROUTES } from "@/lib/constants";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-app px-4">
      <div className="max-w-md text-center">
        <p className="text-6xl font-black text-primary/20">404</p>
        <h1 className="mt-4 text-xl font-bold text-text-primary">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          The page you&apos;re looking for doesn&apos;t exist or has been
          moved.
        </p>
        <Link
          href={APP_ROUTES.app.dashboard}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
        >
          Go to dashboard
        </Link>
      </div>
    </main>
  );
}