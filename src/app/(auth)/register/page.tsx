import { Metadata } from "next";
import { Suspense } from "react";
import { RegisterForm } from "./form";

export const metadata: Metadata = {
  title: "Create Account | ReviveAI",
  description: "Create a ReviveAI account to start recovering revenue.",
};

export default function RegisterPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-3xl border border-zinc-800 bg-clay-100 p-8 shadow-clay-lg">
        <Suspense>
          <RegisterForm />
        </Suspense>
      </div>
    </div>
  );
}
