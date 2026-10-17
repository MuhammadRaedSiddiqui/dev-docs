"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { PageHeader, Card, Badge, SettingsButton, styles } from "./SettingsUI";

function formatMemberSince(createdAt: Date | null | undefined): string {
  if (!createdAt) return "Member";
  return `Member since ${new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(createdAt)}`;
}

export function AccountSection() {
  const { isLoaded, user } = useUser();
  const { openUserProfile } = useClerk();
  if (!isLoaded) return <p className={styles.content} role="status">Loading account…</p>;
  if (!user) return <p className={styles.content}>Sign in to view your account.</p>;

  const email = user.primaryEmailAddress?.emailAddress;
  const name = user.fullName ?? user.username ?? email ?? "Member";
  const isVerified = user.primaryEmailAddress?.verification.status === "verified";
  const hasTwoStep = user.totpEnabled || user.backupCodeEnabled || user.phoneNumbers.some(phone => phone.reservedForSecondFactor);

  return <div className={styles.content}>
    <PageHeader title="Account" sub="Manage your profile and sign-in settings." />
    <Card title="Profile" sub="Update your name, email addresses, and profile photo in account management.">
      <div className={styles.identity}>
        <div aria-label={`${name} avatar`} className={styles.avatar} style={user.hasImage ? { backgroundImage: `url(${user.imageUrl})` } : undefined}>
          {!user.hasImage && name.charAt(0).toUpperCase()}
        </div>
        <div className={styles.identityInfo}><div className={styles.identityName}>{name}</div><p className={styles.metadata}>{formatMemberSince(user.createdAt)}</p></div>
      </div>
      <div className={styles.field}>
        <p className="font-medium mb-2">Primary email address</p>
        <div className={styles.row}><p className={styles.value}>{email ?? "No primary email"}</p>{email && <Badge>{isVerified ? "Verified" : "Unverified"}</Badge>}</div>
        <p className={`${styles.metadata} mt-2`}>Email changes and verification are handled in Manage profile.</p>
      </div>
      <SettingsButton onClick={() => openUserProfile()}>Manage profile</SettingsButton>
    </Card>
    <Card title="Security" sub="Manage sign-in methods, two-step verification, and active sessions in account management.">
      <dl className={`${styles.stack} mb-5`}>
        <div className={styles.row}><dt>Password</dt><dd className={styles.muted}>{user.passwordEnabled ? "Enabled" : "Passwordless sign-in"}</dd></div>
        <div className={styles.row}><dt>Two-step verification</dt><dd className={styles.muted}>{hasTwoStep ? "Enabled" : "Not configured"}</dd></div>
      </dl>
      <SettingsButton onClick={() => openUserProfile()}>Manage security and sessions</SettingsButton>
    </Card>
  </div>;
}