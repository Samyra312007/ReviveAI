"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/results", label: "Results" },
  { href: "/timeline", label: "Timeline" },
  { href: "/council", label: "Council" },
  { href: "/guardrails", label: "Guardrails" },
  { href: "/exceptions", label: "Exceptions" },
  { href: "/audit", label: "Audit Log" },
  { href: "/voice", label: "Voice" },
  { href: "/promises", label: "Promises" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1">
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
    </nav>
  );
}
