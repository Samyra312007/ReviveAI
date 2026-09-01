import { Metadata } from "next";
import { Suspense } from "react";
import { RegisterForm } from "./form";

export const metadata: Metadata = {
  title: "Create Account — ReviveAI",
  description: "Create a ReviveAI account to start recovering revenue.",
};

export default function RegisterPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Suspense>
        <RegisterForm />
      </Suspense>
    </div>
  );
}
