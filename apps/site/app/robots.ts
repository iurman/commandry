import type { MetadataRoute } from "next";

// Only the public landing page and its own assets are crawlable. Everything
// else on commandry.site belongs to the private application.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/$", "/_site/"], disallow: ["/"] }],
    sitemap: "https://commandry.site/sitemap.xml",
    host: "https://commandry.site",
  };
}
