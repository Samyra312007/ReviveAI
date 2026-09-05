import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import { Nav } from "@/components/nav";
import { AuthSessionProvider } from "@/components/session-provider";
import "./globals.css";

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ReviveAI | Autonomous Revenue Recovery",
  description:
    "Detect → diagnose → intervene → recover lost revenue for merchants.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={figtree.variable}>
      <body className="min-h-screen bg-clay-50 text-zinc-100 antialiased">
        <AuthSessionProvider>
          <header className="sticky top-0 z-40 border-b border-zinc-800 bg-clay-50/85 backdrop-blur">
            <Nav />
          </header>
          <main className="px-6 py-8">{children}</main>
        </AuthSessionProvider>
      </body>
    </html>
  );
}