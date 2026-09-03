"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/records", label: "Records" },
  { href: "/results", label: "Results" },
  { href: "/timeline", label: "Timeline" },
  { href: "/council", label: "Council" },
  { href: "/simulator", label: "Simulator" },
  { href: "/guardrails", label: "Guardrails" },
  { href: "/exceptions", label: "Exceptions" },
  { href: "/audit", label: "Audit Log" },
  { href: "/voice", label: "Voice" },
  { href: "/promises", label: "Promises" },
  { href: "/fleet", label: "Fleet" },
];

const SECONDARY = [
  { href: "/onboarding", label: "Onboarding" },
  { href: "/settings/notifications", label: "Notifications" },
];

export function Nav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);

  const linkClass = (href: string) =>
    `rounded-lg px-3 py-1.5 text-sm transition-colors ${
      pathname.startsWith(href)
        ? "bg-emerald-500/15 font-medium text-emerald-400"
        : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
    }`;

  return (
    <nav className="flex items-center gap-1">
      {/* Desktop links */}
      <div className="hidden flex-wrap items-center gap-1 lg:flex">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className={linkClass(link.href)}>
            {link.label}
          </Link>
        ))}
        {session?.user && (
          <Link href="/settings/notifications" className={linkClass("/settings")}>
            Settings
          </Link>
        )}
        <div className="ml-2 border-l border-zinc-800 pl-2">
          {session?.user ? (
            <div className="flex items-center gap-2">
              <span className="hidden max-w-[140px] truncate text-xs text-zinc-500 xl:inline">
                {session.user.name ?? session.user.email}
              </span>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="rounded-lg px-2.5 py-1 text-xs text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
              >
                Sign out
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/20"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>

      {/* Mobile hamburger */}
      <button
        onClick={() => setOpen(!open)}
        className="rounded-lg border border-zinc-800 p-2 text-zinc-400 transition hover:text-zinc-200 lg:hidden"
        aria-label="Toggle menu"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          {open ? (
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          ) : (
            <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          )}
        </svg>
      </button>

      {/* Mobile menu */}
      {open && (
        <div className="absolute inset-x-0 top-full z-50 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-6 py-4">
            {[...LINKS, ...SECONDARY].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname.startsWith(link.href)
                    ? "bg-emerald-500/15 font-medium text-emerald-400"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-2 border-t border-zinc-800 pt-3">
              {session?.user ? (
                <div className="flex items-center justify-between px-1">
                  <span className="truncate text-xs text-zinc-500">
                    {session.user.name ?? session.user.email}
                  </span>
                  <button
                    onClick={() => signOut({ callbackUrl: "/" })}
                    className="rounded-lg px-2.5 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400"
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}