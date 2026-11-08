import type { Metadata } from "next";
import { Mark } from "../components/Mark";

export const metadata: Metadata = {
  title: "Not found | Commandry",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="missing" id="main">
      <Mark size={48} />
      <p className="mono-label">404</p>
      <h1 className="missing-title">There is nothing at this address.</h1>
      <p className="missing-copy">The public site is a single page.</p>
      <a className="button" href="/">
        Go to Commandry
      </a>
    </main>
  );
}
