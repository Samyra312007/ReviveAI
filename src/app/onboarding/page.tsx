import { PageHeader } from "@/components/ui";
import { OnboardingWizard } from "./wizard";

export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  return (
    <>
      <PageHeader
        title="Get started in 3 steps"
        description="Connect your Razorpay account, import recent failures, and run your first recovery batch."
      />
      <OnboardingWizard />
    </>
  );
}