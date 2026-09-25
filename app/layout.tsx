import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "MedBook AI",
    template: "%s | MedBook AI",
  },
  description:
    "Clinic management, AI booking receptionist, and website builder for independent doctors and small clinics.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-full">
        {children}
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
