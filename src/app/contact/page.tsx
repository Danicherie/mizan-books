import type { Metadata } from "next";
import { ContactPage } from "@/components/marketing/InfoPages";
import { publicContactEmail } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Contact",
  description: "Write to Mizan Books about a subscription, a privacy request, or your books.",
  alternates: { canonical: "/contact" },
};

export default function Page() {
  return <ContactPage publicEmail={publicContactEmail()} />;
}
