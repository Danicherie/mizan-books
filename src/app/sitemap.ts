import type { MetadataRoute } from "next";

const BASE = "https://mizanbooks.tech";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-11-25");
  return [
    { url: `${BASE}/`, lastModified, changeFrequency: "monthly", priority: 1 },
    { url: `${BASE}/about`, lastModified, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/contact`, lastModified, changeFrequency: "yearly", priority: 0.4 },
    { url: `${BASE}/privacy`, lastModified, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/terms`, lastModified, changeFrequency: "yearly", priority: 0.2 },
  ];
}
