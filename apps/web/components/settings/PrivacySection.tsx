"use client";

import { useRef, useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { PageHeader, Card, Field, Feedback, SettingsButton, styles } from "./SettingsUI";
import { trpc } from "@/lib/trpc";

function downloadJson(data: unknown): string {
  const filename = `devdocs-data-export-${new Date().toISOString().slice(0, 10)}.json`;
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  try { anchor.click(); } finally { anchor.remove(); URL.revokeObjectURL(url); }
  return filename;
}

export function PrivacySection() {
  const { openUserProfile } = useClerk();
  const [deleteText, setDeleteText] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const [dataDeleted, setDataDeleted] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const exportLock = useRef(false);
  const deleteLock = useRef(false);
  const exportQuery = trpc.account.exportData.useQuery(undefined, { enabled: false, retry: false });
  const deleteData = trpc.account.deleteData.useMutation();

  async function exportData() {
    if (exportLock.current || dataDeleted || deleteLock.current) return;
    exportLock.current = true;
    setExporting(true);
    setExportFeedback({ message: "Preparing your JSON export…" });
    try {
      const result = await exportQuery.refetch();
      if (result.error) throw result.error;
      if (!result.data) throw new Error("Could not prepare your export. Please retry.");
      const filename = downloadJson(result.data);
      setExportFeedback({ message: `Download started: ${filename}` });
    } catch (error) {
      setExportFeedback({ message: error instanceof Error ? error.message : "Could not prepare your export. Please retry.", error: true });
    } finally { exportLock.current = false; setExporting(false); }
  }

  async function continueIdentityRemoval() {
    setIdentityError(null);
    try { await openUserProfile(); }
    catch { setIdentityError("Account management could not open. Use Continue to account management to try again."); }
  }

  async function deleteAccountData() {
    if (deleteText !== "DELETE" || deleteLock.current || dataDeleted || exportLock.current) return;
    deleteLock.current = true;
    setDeleteError(null);
    try {
      await deleteData.mutateAsync({ confirmation: "DELETE" });
      setDataDeleted(true);
      setDeleteText("");
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Could not delete your DevDocs data. Please retry.");
      return;
    } finally { deleteLock.current = false; }
    await continueIdentityRemoval();
  }

  return <div className={styles.content}>
    <PageHeader title="Privacy & Data" sub="Download your DevDocs records or begin staged account removal." />
    <Card title="Export your data" sub="Download a JSON copy of your DevDocs account data.">
      <p className={styles.note}>Includes account details, projects, documentation, interview sessions and messages, and masked API-key connection metadata. Secret API keys and their encrypted values are excluded.</p>
      <p className={styles.note}>This is an account-data export. Use a project’s documentation export for its ZIP of Markdown files.</p>
      <SettingsButton onClick={exportData} disabled={exporting || deleteData.isPending || dataDeleted}>
        {exporting ? "Preparing export…" : "Download data (.json)"}
      </SettingsButton>
      {exportFeedback && <Feedback error={exportFeedback.error}>{exportFeedback.message}</Feedback>}
    </Card>
    <Card
      title={dataDeleted ? "Step 2 of 2 · Remove sign-in identity" : "Step 1 of 2 · Delete DevDocs data"}
      sub={dataDeleted ? "DevDocs data deletion succeeded. Complete the separate sign-in removal step in account management." : "Account removal has two separate stages. This action deletes DevDocs data; sign-in removal follows in account management."}
      danger
    >
      {dataDeleted ? <>
        <Feedback>Step 1 complete · DevDocs data deleted. Your sign-in identity has not been removed by this action.</Feedback>
        <p className={`${styles.muted} mt-3`}>Step 2: use the account deletion option in account management to remove your sign-in identity. Opening account management does not complete that step.</p>
        <div className="mt-4"><SettingsButton onClick={continueIdentityRemoval}>Continue to account management</SettingsButton></div>
        {identityError && <Feedback error>{identityError}</Feedback>}
      </> : <>
        <p className={styles.note}>This action permanently removes your DevDocs account record, projects, documentation, interview sessions and messages, and saved API keys. It cannot be undone.</p>
        <p className={styles.note}>Step 2 of 2: remove your sign-in identity separately in account management. It opens after DevDocs data deletion succeeds; you must complete its account deletion flow there.</p>
        <Field label="Type DELETE to confirm" htmlFor="delete-confirmation">
          <input id="delete-confirmation" type="text" value={deleteText} onChange={event => setDeleteText(event.target.value)}
            placeholder="DELETE" autoComplete="off" spellCheck={false} disabled={deleteData.isPending}
            className={`${styles.input} ${styles.confirmation}`} />
        </Field>
        <SettingsButton variant="danger" pending={deleteData.isPending} disabled={deleteText !== "DELETE" || exporting} onClick={deleteAccountData}>
          {deleteData.isPending ? "Deleting DevDocs data…" : "Delete data & continue"}
        </SettingsButton>
        {deleteData.isPending && <Feedback>Step 1 in progress · Deleting DevDocs data. The separate sign-in removal step follows after this succeeds.</Feedback>}
        {deleteError && <Feedback error>Step 1 could not be completed: {deleteError} Sign-in removal has not started.</Feedback>}
      </>}
    </Card>
  </div>;
}
