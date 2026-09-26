/**
 * `data-app-wide` opts this route out of the app shell's `max-w-5xl` cap (see
 * the `main:has(> [data-app-wide])` rule in `app/globals.css`). The Growth Agent
 * needs the extra width: the generator and the live preview sit side by side at
 * 7/5, and at 5xl that pair is too narrow for a post to be readable while the
 * form beside it is still usable.
 */
export default function GrowthAgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div data-app-wide className="min-w-0">{children}</div>;
}
