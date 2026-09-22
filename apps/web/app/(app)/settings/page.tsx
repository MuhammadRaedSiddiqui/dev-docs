// app/(app)/settings/page.tsx
"use client";
import { useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { SettingsSidebar, type SettingsSection } from "@/components/settings/SettingsSidebar";
import { AccountSection } from "@/components/settings/AccountSection";
import { ApiKeySection } from "@/components/settings/ApiKeySection";
import { PlanSection } from "@/components/settings/PlanSection";
import { PrivacySection } from "@/components/settings/PrivacySection";
import type { AIProvider } from "@/lib/ai/provider";
import { trpc } from "@/lib/trpc";

export default function SettingsPage() {
  const [section, setSection] = useState<SettingsSection>("account");
  const keysQuery = trpc.keys.list.useQuery();
  const utils = trpc.useUtils();

  function handleConnectedChange(_provider: AIProvider, connected: boolean) {
    void connected;
    void utils.keys.list.invalidate();
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <SettingsSidebar
          active={section}
          onChange={setSection}
          apiKeyConnected={(keysQuery.data?.length ?? 0) > 0}
        />
        <main className="flex-1 overflow-y-auto px-9 py-7">
          {section === "account" && <AccountSection />}
          {section === "apikey" && (
            <ApiKeySection onConnectedChange={handleConnectedChange} />
          )}
          {section === "plan"    && <PlanSection />}
          {section === "privacy" && <PrivacySection />}
        </main>
      </div>
    </div>
  );
}
