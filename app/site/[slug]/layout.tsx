import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: "index, follow",
};

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
