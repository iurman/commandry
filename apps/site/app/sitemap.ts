import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://commandry.site/",
      lastModified: new Date("2026-11-07T00:00:00Z"),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
