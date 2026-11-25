import type { Metadata } from "next";
import { MarketingHome } from "@/components/marketing/LandingPage";

const description =
  "Mizan Books is double-entry accounting for small businesses, in English, Amharic, Afaan Oromo, Somali, and Arabic.";

export const metadata: Metadata = {
  title: { absolute: "Mizan Books — Double-entry accounting for small businesses" },
  description,
  alternates: { canonical: "/" },
  openGraph: {
    title: "Mizan Books — Double-entry accounting for small businesses",
    description,
    url: "https://mizanbooks.tech",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Mizan Books" }],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Mizan Books",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: "https://mizanbooks.tech",
  description,
  inLanguage: ["en", "am", "om", "so", "ar"],
};

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <MarketingHome />
    </>
  );
}
