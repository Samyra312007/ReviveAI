import { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./form";

export const metadata: Metadata = {
  title: "Sign In — ReviveAI",
  description: "Sign in to access the ReviveAI dashboard.",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-3xl border border-zinc-800 bg-clay-100 p-8 shadow-clay-lg">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
