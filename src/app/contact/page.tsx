import type { Metadata } from "next";
import { ContactPage } from "@/components/marketing/InfoPages";

export const metadata: Metadata = {
  title: "Contact",
  description: "Draft contact page for Mizan Books. The form does not send messages yet.",
  alternates: { canonical: "/contact" },
};

export default function Page() {
  return <ContactPage />;
}
