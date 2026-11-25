import type { Metadata } from "next";
import { AboutPage } from "@/components/marketing/InfoPages";

export const metadata: Metadata = {
  title: "About",
  description: "Mizan Books is double-entry accounting for small businesses that work in more than one language.",
  alternates: { canonical: "/about" },
};

export default function Page() {
  return <AboutPage />;
}
