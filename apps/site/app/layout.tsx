import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Martian_Mono, Mona_Sans } from "next/font/google";
import "./globals.css";

const sans = Mona_Sans({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-sans",
  display: "swap",
});

const mono = Martian_Mono({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-mono",
  display: "swap",
});

// Only the production deployment is indexable. Vercel previews and branch
// deployments render the same page with noindex.
const indexable = process.env.VERCEL_ENV
  ? process.env.VERCEL_ENV === "production"
  : true;

const description =
  "Commandry is a personal operations system. It relates projects, work, captured knowledge and infrastructure, so a change arrives with the reasons it matters and the context to act on it.";

export const metadata: Metadata = {
  metadataBase: new URL("https://commandry.site"),
  title: "Commandry: a personal operations system",
  description,
  applicationName: "Commandry",
  alternates: { canonical: "/" },
  robots: indexable
    ? { index: true, follow: true }
    : { index: false, follow: false },
  icons: {
    icon: [{ url: "/_site/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/_site/apple-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    type: "website",
    url: "https://commandry.site/",
    siteName: "Commandry",
    title: "Commandry: a personal operations system",
    description,
    images: [
      {
        url: "/_site/og.png",
        width: 1200,
        height: 630,
        alt: "Commandry. Projects, work, knowledge and infrastructure in one connected model.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Commandry: a personal operations system",
    description,
    images: ["/_site/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0f13",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
