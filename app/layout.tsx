import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "FibroScan Reviewer - DEMO",
  description: "Review and sign FibroScan reports",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="bg-white border-b border-slate-200">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/" className="text-xl font-semibold text-slate-900">
              FibroScan Reviewer - DEMO
            </Link>
            <span className="text-xs text-slate-500">
              CAP: Karlas 2017 (default) / Eddowes 2019 (NAFLD) | LSM: EASL CPG 2021
            </span>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
