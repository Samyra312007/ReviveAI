import { PageHeader } from "@/components/ui";
import { NotificationSettings } from "./form";

export const dynamic = "force-dynamic";

export default function NotificationSettingsPage() {
  return (
    <>
      <PageHeader
        title="Notification Settings"
        description="Choose which channels ReviveAI uses to reach your customers, and when."
      />
      <NotificationSettings />
    </>
  );
}