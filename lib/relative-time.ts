/**
 * Compact relative timestamp used by the header notification feeds.
 * Client-safe: reads the browser clock at call time. Format mirrors the
 * reference notification design ("1 minute ago", "7 hours ago").
 */
export function relativeTimeAgo(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const diffMs = Math.max(0, now - then);
  const totalMinutes = Math.floor(diffMs / 60_000);
  if (totalMinutes < 1) return "just now";
  if (totalMinutes < 60) {
    return `${totalMinutes} minute${totalMinutes === 1 ? "" : "s"} ago`;
  }

  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    return `${totalHours} hour${totalHours === 1 ? "" : "s"} ago`;
  }

  const totalDays = Math.floor(totalHours / 24);
  if (totalDays < 30) {
    return `${totalDays} day${totalDays === 1 ? "" : "s"} ago`;
  }

  const totalMonths = Math.floor(totalDays / 30);
  return `${totalMonths} month${totalMonths === 1 ? "" : "s"} ago`;
}

/**
 * Compact relative timestamp for list rows ("2m ago", "1h ago",
 * "Yesterday", "24d ago") — matches the messages dashboard reference.
 */
export function relativeTimeShort(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const diffMs = Math.max(0, now - then);
  if (diffMs < 60_000) return "just now";

  const totalMinutes = Math.floor(diffMs / 60_000);
  if (totalMinutes < 60) return `${totalMinutes}m ago`;

  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) return `${totalHours}h ago`;

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();
  const yesterdayMs = todayMs - 86_400_000;
  if (then >= yesterdayMs && then < todayMs) return "Yesterday";

  const totalDays = Math.floor(totalHours / 24);
  if (totalDays < 60) return `${totalDays}d ago`;
  return `${Math.floor(totalDays / 30)}mo ago`;
}