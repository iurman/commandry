import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PwaStatus } from "./components/PwaStatus";
import "./globals.css";

export const metadata: Metadata = {
  title: "Commandry",
  description: "A local foundation for the Commandry control plane.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Commandry" },
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <PwaStatus />
      </body>
    </html>
  );
}
