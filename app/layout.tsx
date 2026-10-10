import type { Metadata } from "next";
import { Montserrat, Plus_Jakarta_Sans, Poppins } from "next/font/google";
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

/**
 * Montserrat is the marketing site's display face (refined landing v2). Bold
 * weights (700/800) give hero and section headings a confident, premium
 * presence, replacing the previous lighter Jakarta look on the public page.
 */
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
  weight: ["600", "700", "800"],
});

/**
 * Poppins is the marketing site's body/UI face (refined landing v2). Only the
 * marketing page under `.landing` uses these two faces — the dashboard keeps
 * Plus Jakarta Sans.
 */
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
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
    <html
      lang="en"
      className={`${jakarta.variable} ${montserrat.variable} ${poppins.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-full" suppressHydrationWarning>
        {children}
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
