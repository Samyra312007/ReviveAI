"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleGoogle() {
    setLoading(true);
    await signIn("google", { callbackUrl: "/dashboard" });
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    const email = String(fd.get("email") ?? "").toLowerCase().trim();
    const password = String(fd.get("password") ?? "");
    const confirm = String(fd.get("confirm") ?? "");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      setLoading(false);
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Registration failed.");
        return;
      }

      // Auto sign-in after registration
      const signInRes = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl: "/dashboard",
      });
      if (signInRes?.error) {
        setError("Account created but sign-in failed. Please sign in manually.");
        router.push("/login");
      } else if (signInRes?.url) {
        router.push(signInRes.url);
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          Create your <span className="text-emerald-400">ReviveAI</span> account
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Start recovering lost revenue in minutes.
        </p>
      </div>

      {/* Google OAuth */}
      <button
        onClick={handleGoogle}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-full border border-zinc-700 bg-white px-4 py-2.5 text-sm font-medium text-zinc-200 shadow-clay-btn transition hover:bg-clay-200 active:translate-y-0.5 disabled:opacity-50"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        Continue with Google
      </button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-zinc-800" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-clay-100 px-2 text-zinc-500">or sign up with email</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="mb-1 block text-xs font-medium text-zinc-400">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            autoComplete="name"
            className="w-full rounded-xl border border-zinc-800 bg-white px-4 py-2.5 text-sm text-zinc-100 shadow-clay-inset outline-none transition focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
            placeholder="Your name"
          />
        </div>
        <div>
          <label htmlFor="email" className="mb-1 block text-xs font-medium text-zinc-400">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-xl border border-zinc-800 bg-white px-4 py-2.5 text-sm text-zinc-100 shadow-clay-inset outline-none transition focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-xs font-medium text-zinc-400">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-xl border border-zinc-800 bg-white px-4 py-2.5 text-sm text-zinc-100 shadow-clay-inset outline-none transition focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
            placeholder="••••••••"
          />
        </div>
        <div>
          <label htmlFor="confirm" className="mb-1 block text-xs font-medium text-zinc-400">
            Confirm Password
          </label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-xl border border-zinc-800 bg-white px-4 py-2.5 text-sm text-zinc-100 shadow-clay-inset outline-none transition focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
            placeholder="••••••••"
          />
        </div>

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-400">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 shadow-clay-btn transition hover:bg-emerald-450 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Creating account…" : "Create Account"}
        </button>
      </form>

      <p className="text-center text-xs text-zinc-500">
        Already have an account?{" "}
        <a href="/login" className="text-emerald-400 hover:underline">
          Sign in
        </a>
      </p>
    </div>
  );
}
