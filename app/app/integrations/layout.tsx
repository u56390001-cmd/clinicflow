/**
 * `data-app-wide` opts this route out of the app shell's `max-w-5xl` cap (see
 * the `main:has(> [data-app-wide])` rule in `app/globals.css`).
 *
 * The dashboard is a three-column card grid per category. Inside the default
 * 5xl cap those columns land at roughly 320px each, which pushes every card's
 * description to four clamped lines and leaves the status/action footer tight.
 * The extra width is what makes the grid read as three columns rather than a
 * narrow stack that only becomes a grid on very large screens.
 */
export default function IntegrationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div data-app-wide className="min-w-0">{children}</div>;
}
