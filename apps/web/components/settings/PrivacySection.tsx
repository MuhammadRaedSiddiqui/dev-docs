"use client";

import { useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { PageHeader, Card } from "@/components/settings/AccountSection";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/lib/toast";

function downloadJson(data: unknown): string {
  const date = new Date().toISOString().slice(0, 10);
  const filename = `devdocs-data-export-${date}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return filename;
}

export function PrivacySection() {
  const { toast } = useToast();
  const { openUserProfile } = useClerk();
  const [deleteText, setDeleteText] = useState("");
  const exportQuery = trpc.account.exportData.useQuery(undefined, {
    enabled: false,
    retry: false,
  });
  const deleteData = trpc.account.deleteData.useMutation();

  async function exportData() {
    toast("Preparing your export…");
    const result = await exportQuery.refetch();
    if (!result.data) {
      toast(result.error?.message ?? "Could not prepare your export");
      return;
    }
    const filename = downloadJson(result.data);
    toast(`Downloaded ${filename}`);
  }

  async function deleteAccountData() {
    try {
      await deleteData.mutateAsync({ confirmation: "DELETE" });
      setDeleteText("");
      toast("DevDocs data deleted. Complete identity deletion in account management.");
      openUserProfile();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not delete your data");
    }
  }

  return (
    <div className="max-w-[640px]">
      <PageHeader title="Privacy & Data" sub="Export or permanently remove your DevDocs data." />
      <div className="flex gap-2.5 p-3.5 rounded-lg border border-hairline bg-sidebar-mist mb-4">
        <span className="text-sm flex-shrink-0">◇</span>
        <div className="text-[12.5px] leading-snug text-ink-secondary">
          Your export includes account details, projects, documentation, interview sessions, messages, and non-secret API-key connection metadata.
        </div>
      </div>
      <Card title="Export your data" sub="Download a machine-readable JSON copy of your DevDocs data.">
        <button
          type="button"
          onClick={exportData}
          disabled={exportQuery.isFetching}
          className="px-4 py-1.5 border border-vellum-border rounded-lg text-xs bg-white text-ink-secondary hover:border-ink hover:text-ink disabled:opacity-50 disabled:cursor-wait"
        >
          {exportQuery.isFetching ? "Preparing export…" : "Download all my data"}
        </button>
      </Card>
      <Card title="Delete account" sub="Permanently delete all DevDocs projects and data, then remove your sign-in identity through Clerk." danger>
        <div className="text-[11px] text-ink-faint mb-2">
          Type <strong className="text-ink">DELETE</strong> to confirm. This cannot be undone.
        </div>
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={deleteText}
            onChange={(event) => setDeleteText(event.target.value)}
            placeholder="DELETE"
            className="px-3 py-2 border border-hairline rounded-lg text-[13px] w-40"
          />
          <button
            type="button"
            disabled={deleteText !== "DELETE" || deleteData.isPending}
            onClick={deleteAccountData}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-ink text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {deleteData.isPending ? "Deleting…" : "Delete data & continue"}
          </button>
        </div>
      </Card>
    </div>
  );
}
