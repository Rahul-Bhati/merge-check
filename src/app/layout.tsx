import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Merge Check",
  description: "A pull-request check that walks the screens a change can break and never edits the branch.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="wrap">
          <header className="site">
            <Link className="brand" href="/">Merge Check</Link>
            <nav>
              <Link href="/repos">Repositories</Link>
              <Link href="/permissions">Permissions</Link>
              <Link href="/branch-protection">Branch protection</Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
