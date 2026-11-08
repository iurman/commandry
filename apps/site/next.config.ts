import type { NextConfig } from "next";

// The public site shares commandry.site with the private application, so every
// asset it emits lives under /_site and never collides with the app's /_next.
const assetPrefix = "/_site";
const preview =
  Boolean(process.env.VERCEL_ENV) && process.env.VERCEL_ENV !== "production";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const config: NextConfig = {
  assetPrefix,
  poweredByHeader: false,
  reactStrictMode: true,
  async rewrites() {
    return {
      beforeFiles: [
        { source: `${assetPrefix}/_next/:path*`, destination: "/_next/:path*" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  // These routes belong to the private application. If a request reaches this
  // deployment directly, send it to the application's real sign-in page.
  async redirects() {
    return ["/login", "/sign-in"].map((source) => ({
      source,
      destination: "https://commandry.site/sign-in",
      permanent: false,
    }));
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: preview
          ? [
              ...securityHeaders,
              { key: "X-Robots-Tag", value: "noindex, nofollow" },
            ]
          : securityHeaders,
      },
      {
        source: `${assetPrefix}/:file(icon.svg|apple-icon.png|og.png)`,
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
};

export default config;
