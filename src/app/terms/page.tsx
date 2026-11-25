import type { Metadata } from "next";
import { TermsPage } from "@/components/marketing/InfoPages";

export const metadata: Metadata = {
  title: "Terms (draft)",
  description: "Draft terms placeholder for Mizan Books. Not a finished legal agreement.",
  alternates: { canonical: "/terms" },
  robots: { index: false, follow: true },
};

export default function Page() {
  return <TermsPage />;
}
