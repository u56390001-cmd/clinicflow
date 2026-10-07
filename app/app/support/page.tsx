import type { Metadata } from "next";

import { SupportWorkspace } from "@/components/support/support-workspace";

export const metadata: Metadata = {
  title: "Help & Support | MedBookAi",
  description:
    "Get help with your account, AI assistant, bookings, and system settings.",
};

/**
 * Help & Support — server shell.
 *
 * The page is static from the server's perspective (FAQs live in the client
 * component, tickets are written — never read — through a server action), so
 * this shell has nothing to fetch. The app shell layout supplies the next
 * page padding; this just delegates to the workspace.
 */
export default function SupportPage() {
  return <SupportWorkspace />;
}