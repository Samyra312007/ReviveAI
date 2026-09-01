import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/nav";
import { AuthSessionProvider } from "@/components/session-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "ReviveAI — Autonomous Revenue Recovery",
  description:
    "Detect → diagnose → intervene → recover lost revenue for merchants.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        <AuthSessionProvider>
          <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-3">
              <Link href="/" className="text-lg font-bold tracking-tight">
                Revive<span className="text-emerald-500">AI</span>
              </Link>
              <Nav />
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
