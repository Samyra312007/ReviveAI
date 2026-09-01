"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
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

export function Nav() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <nav className="flex flex-wrap items-center gap-1">
      {LINKS.map((link) => {
        const active =
          link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              active
                ? "bg-emerald-500/15 font-medium text-emerald-400"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            {link.label}
          </Link>
        );
      })}

      <div className="ml-2 border-l border-zinc-800 pl-2">
        {session?.user ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">
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
    </nav>
  );
}
