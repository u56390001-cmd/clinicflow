import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

/**
 * Plus Jakarta Sans is the app's single typeface (`font-sans`). One family
 * throughout, at the weight and tracking the interface actually needs: Jakarta's
 * wide, slightly squared counters hold up at the 11px pill sizes this UI leans
 * on, where a narrower grotesque turns into a grey smear.
 */
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
  // Jakarta's default is 400/700 in two optical sizes; the extra weights are
  // needed for the dense numeric readouts in the patient record.
  weight: ["400", "500", "600", "700", "800"],
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
    <html lang="en" className={jakarta.variable} suppressHydrationWarning>
      <body className="min-h-full">
        {children}
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
