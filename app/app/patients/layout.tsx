/**
 * Patients EMR workspace shell.
 *
 * `data-app-wide` opts this route out of the app shell's max-w-5xl cap (see the
 * `main:has(> [data-app-wide])` rule in `app/globals.css`) — the master-detail
 * split needs the full width so the left pane can hold its 360px minimum while
 * still being roughly a third of the viewport.
 */
export default function PatientsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div data-app-wide className="min-w-0">
      {children}
    </div>
  );
}
