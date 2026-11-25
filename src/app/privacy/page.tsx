import type { Metadata } from "next";
import { PrivacyPage } from "@/components/marketing/InfoPages";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Mizan Books handles account details, company books, the session cookie, and server logs.",
  alternates: { canonical: "/privacy" },
};

export default function Page() {
  return <PrivacyPage />;
}
