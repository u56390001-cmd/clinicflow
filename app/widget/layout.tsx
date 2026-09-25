export const metadata = {
  robots: "noindex, nofollow",
};

/**
 * Minimal layout for /widget/* — renders children directly without the
 * app shell (no AppHeader, no max-w-5xl wrapper). The root layout's
 * <html>/<body> still wraps this, but we override all visual styling via
 * the page content so the widget renders standalone in an iframe context.
 */
export default function WidgetLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
