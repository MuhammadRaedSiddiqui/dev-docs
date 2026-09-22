"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { cn } from "@/lib/utils";

export function PageHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-6">
      <div className="font-serif-heading text-2xl text-ink mb-1">{title}</div>
      <div className="text-[13px] text-ink-muted">{sub}</div>
    </div>
  );
}

export function Card({ title, sub, children, danger }: {
  title: string;
  sub?: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div className={cn("bg-white border rounded-vellum mb-4 overflow-hidden", danger ? "border-danger-border" : "border-vellum-border")}>
      <div className="px-5 pt-4 pb-3.5 border-b border-hairline bg-sidebar-mist">
        <div className="font-serif-heading text-[15px] mb-0.5 text-ink">{title}</div>
        {sub && <div className="text-xs leading-snug text-ink-muted">{sub}</div>}
      </div>
      <div className="px-5 py-[18px]">{children}</div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3.5">
      <label className="block text-[12.5px] font-medium text-ink mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function formatMemberSince(createdAt: Date | null | undefined): string {
  if (!createdAt) return "Member";
  return `Member since ${new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(createdAt)}`;
}

export function AccountSection() {
  const { isLoaded, user } = useUser();
  const { openUserProfile } = useClerk();

  if (!isLoaded) {
    return <div className="max-w-[640px] text-[13px] text-ink-muted">Loading account…</div>;
  }

  const email = user?.primaryEmailAddress?.emailAddress ?? "No primary email";
  const name = user?.fullName ?? user?.username ?? email;
  const initial = name.charAt(0).toUpperCase();
  const isVerified = user?.primaryEmailAddress?.verification.status === "verified";

  return (
    <div className="max-w-[640px]">
      <PageHeader title="Account" sub="Manage your profile and security." />
      <Card title="Profile" sub="Your identity is securely managed by Clerk.">
        <div className="flex items-center gap-3.5 mb-[18px]">
          <div
            aria-label={`${name} avatar`}
            className="w-14 h-14 rounded-full bg-ink bg-cover bg-center text-white flex items-center justify-center font-serif-heading text-[22px] flex-shrink-0"
            style={user?.hasImage ? { backgroundImage: `url(${user.imageUrl})` } : undefined}
          >
            {!user?.hasImage && initial}
          </div>
          <div>
            <div className="text-[15px] font-medium text-ink">{name}</div>
            <div className="text-xs text-ink-faint mt-0.5">{formatMemberSince(user?.createdAt)}</div>
          </div>
        </div>
        <Field label="Email address">
          <div className="flex items-center gap-2">
            <input type="text" disabled value={email} className="flex-1 px-3 py-2.5 border border-ink/15 rounded-lg text-[13px] bg-vellum text-ink-muted" />
            <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap", isVerified ? "badge-green" : "bg-vellum text-ink-muted")}>
              {isVerified ? "Verified" : "Unverified"}
            </span>
          </div>
        </Field>
        <button type="button" onClick={() => openUserProfile()} className="px-4 py-1.5 bg-ink text-vellum rounded-lg text-xs font-medium">
          Manage profile
        </button>
      </Card>
      <Card title="Security" sub="Manage passwords, verification methods, and active sessions through Clerk.">
        <div className="flex items-center justify-between gap-4 mb-4 text-[12.5px]">
          <span className="text-ink-secondary">Password</span>
          <span className="text-ink-muted">{user?.passwordEnabled ? "Enabled" : "Using passwordless sign-in"}</span>
        </div>
        <div className="flex items-center justify-between gap-4 mb-4 text-[12.5px]">
          <span className="text-ink-secondary">Two-step verification</span>
          <span className="text-ink-muted">{user?.totpEnabled ? "Enabled" : "Not configured"}</span>
        </div>
        <button type="button" onClick={() => openUserProfile()} className="px-4 py-1.5 border border-vellum-border rounded-lg text-xs bg-white text-ink-secondary hover:border-ink">
          Manage security and sessions
        </button>
      </Card>
    </div>
  );
}
