"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";

type GatedLinkProps = {
  href: string;
  children: ReactNode;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">;

/**
 * Landing-page link to a protected product page. Signed-in users go straight
 * to the destination; signed-out visitors are routed to the login page first
 * (with the destination preserved as the callbackUrl).
 */
export function GatedLink({ href, children, ...rest }: GatedLinkProps) {
  const { data: session } = useSession();
  const target = session?.user ? href : `/login?callbackUrl=${encodeURIComponent(href)}`;
  return (
    <Link href={target} {...rest}>
      {children}
    </Link>
  );
}
