import type { Metadata } from "next";
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
      <body className="antialiased">{children}</body>
    </html>
  );
}
