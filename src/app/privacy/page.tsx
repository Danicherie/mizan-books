import type { Metadata } from "next";
import { PrivacyPage } from "@/components/marketing/InfoPages";

export const metadata: Metadata = {
  title: "Privacy (draft)",
  description: "Draft privacy notes for Mizan Books. Not a finished privacy policy.",
  alternates: { canonical: "/privacy" },
  robots: { index: false, follow: true },
};

export default function Page() {
  return <PrivacyPage />;
}
