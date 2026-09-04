import type { Metadata } from "next";
import { Nav } from "@/components/nav";
import { AuthSessionProvider } from "@/components/session-provider";
import "./globals.css";

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
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        <AuthSessionProvider>
          <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
            <Nav />
          </header>
          <main className="px-6 py-8">{children}</main>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
