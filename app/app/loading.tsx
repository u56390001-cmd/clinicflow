import { AppPageSkeleton } from "@/components/app/page-skeleton";

/**
 * Shell-level fallback for every /app/* route that does not define its own.
 *
 * This is the single most important piece of the navigation fix: without a
 * `loading.tsx` anywhere, clicking a sidebar link left the previous page frozen
 * on screen until every server query on the destination had resolved. With this
 * file, Next.js streams the frame immediately and the route's content streams
 * in behind it.
 *
 * Routes with a distinctive shape (dashboard, patients, inbox, calendar)
 * override this with their own `loading.tsx`.
 */
export default function AppLoading() {
  return <AppPageSkeleton cards={0} rows={2} />;
}