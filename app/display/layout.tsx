import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Queue Display",
  description: "Live patient queue display for waiting area",
};

export default function DisplayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased">
      {children}
    </div>
  );
}
