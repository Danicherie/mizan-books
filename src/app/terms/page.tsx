import type { Metadata } from "next";
import { TermsPage } from "@/components/marketing/InfoPages";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms for using Mizan Books, including the 30-day trial, subscriptions, and your books.",
  alternates: { canonical: "/terms" },
};

export default function Page() {
  return <TermsPage />;
}
