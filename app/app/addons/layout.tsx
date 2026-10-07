/**
 * `data-app-wide` opts this route out of the app shell's `max-w-5xl` cap (see
 * the `main:has(> [data-app-wide])` rule in `app/globals.css`).
 *
 * The storefront is a card grid. Inside the default 5xl cap its columns land
 * at roughly 320px, pushing the description to four clamped lines and leaving
 * the price/action row tight — the extra width is what lets the marketplace
 * read as a storefront grid rather than a narrow stack.
 */
export default function AddonsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div data-app-wide className="min-w-0">{children}</div>;
}