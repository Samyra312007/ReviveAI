"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

const TOGGLE_ID = "reviveai-nav-toggle";

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

/** Uncheck the hidden checkbox (used after clicking a drawer link). */
function closeDrawer() {
  const input = document.getElementById(TOGGLE_ID) as HTMLInputElement | null;
  if (input) input.checked = false;
}

function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {open ? (
        <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      ) : (
        <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function Nav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => pathname.startsWith(href);

  // Keep the icon in sync with the checkbox. The drawer itself is toggled by
  // pure CSS (peer-checked), so it works even before/without JavaScript.
  useEffect(() => {
    const input = document.getElementById(TOGGLE_ID) as HTMLInputElement | null;
    if (!input) return;
    const onToggle = () => setOpen(input.checked);
    input.addEventListener("change", onToggle);
    return () => input.removeEventListener("change", onToggle);
  }, []);

  return (
    <>
      {/* Hidden checkbox drives the drawer via CSS (peer-checked) */}
      <input
        id={TOGGLE_ID}
        type="checkbox"
        className="peer sr-only"
        aria-hidden="true"
      />

      {/* Top bar */}
      <div className="flex h-14 w-full items-center gap-2 px-4 sm:px-6">
        {/* Hamburger — far-left corner, padded from the screen edge */}
        <label
          htmlFor={TOGGLE_ID}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              const input = document.getElementById(TOGGLE_ID) as HTMLInputElement | null;
              if (input) {
                input.checked = !input.checked;
                setOpen(input.checked);
              }
            }
          }}
          className="flex cursor-pointer items-center rounded-lg border border-zinc-800 p-2 text-zinc-300 outline-none transition hover:border-zinc-600 hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-emerald-500/60"
        >
          <HamburgerIcon open={open} />
        </label>

        <Link href="/" className="whitespace-nowrap text-lg font-bold tracking-tight text-zinc-950">
          Revive<span className="text-emerald-400">AI</span>
        </Link>

        {/* Auth control — always visible in the main bar */}
        <div className="ml-auto flex items-center gap-2">
          {session?.user ? (
            <div className="flex items-center gap-3">
              <span className="hidden max-w-[160px] truncate text-xs text-zinc-500 md:inline">
                {session.user.name ?? session.user.email}
              </span>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="rounded-lg px-3 py-1.5 text-sm text-zinc-300 transition hover:bg-zinc-800 hover:text-zinc-100"
              >
                Sign out
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-zinc-950 shadow-clay-btn transition hover:bg-emerald-450 active:translate-y-0.5"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>

      {/* Side drawer — CSS-only open/close (no JavaScript required) */}
      <div
        className="pointer-events-none absolute left-0 top-full z-50 flex h-[calc(100dvh-3.5rem)] w-72 max-w-[85vw] -translate-x-full flex-col border-r border-zinc-800 bg-clay-100 opacity-0 shadow-clay-lg transition-all duration-200 peer-checked:translate-x-0 peer-checked:opacity-100 peer-checked:pointer-events-auto"
        id="reviveai-nav-drawer"
      >
        <div className="flex shrink-0 items-center justify-end border-b border-zinc-800 px-3 py-2.5">
          <label
            htmlFor={TOGGLE_ID}
            aria-label="Close menu"
            className="flex cursor-pointer rounded-lg border border-zinc-800 p-1.5 text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-100"
          >
            <HamburgerIcon open />
          </label>
        </div>

        <nav className="drawer-scroll flex-1 overflow-y-auto px-3 py-4">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={closeDrawer}
              className={`mb-1 block rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive(link.href)
                  ? "bg-emerald-500/15 font-medium text-emerald-400"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <div className="my-3 border-t border-zinc-800" />
          {SECONDARY.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={closeDrawer}
              className={`mb-1 block rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive(link.href)
                  ? "bg-emerald-500/15 font-medium text-emerald-400"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="shrink-0 border-t border-zinc-800 p-4">
          {session?.user ? (
            <div className="space-y-2">
              <div className="truncate px-1 text-xs text-zinc-500">
                {session.user.name ?? session.user.email}
              </div>
              <button
                onClick={() => {
                  closeDrawer();
                  signOut({ callbackUrl: "/" });
                }}
                className="w-full rounded-lg border border-zinc-800 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-900 hover:text-zinc-100"
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <Link
                href="/login"
                onClick={closeDrawer}
                className="block w-full rounded-full bg-emerald-500 px-4 py-2 text-center text-sm font-semibold text-zinc-950 shadow-clay-btn transition hover:bg-emerald-450 active:translate-y-0.5"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                onClick={closeDrawer}
                className="block w-full rounded-lg border border-zinc-800 px-4 py-2 text-center text-sm text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-900"
              >
                Create an account
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
