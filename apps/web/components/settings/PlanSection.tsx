import { PageHeader, Card } from "@/components/settings/AccountSection";

export function PlanSection() {
  return (
    <div className="max-w-[640px]">
      <PageHeader title="Plan & Billing" sub="DevDocs currently operates as a free bring-your-own-key workspace." />
      <Card title="Current access" sub="There is no DevDocs subscription or project quota configured.">
        <ul className="space-y-2 text-[12.5px] text-ink-secondary">
          <li>All supported documentation domains and templates</li>
          <li>Editable documentation with ZIP export</li>
          <li>Anthropic, OpenAI, Meta Muse, or server-configured Bedrock</li>
          <li>AI usage billed directly by your selected provider</li>
        </ul>
      </Card>
      <Card title="Paid plans" sub="Hosted keys, team workspaces, versioning, and PDF export are roadmap ideas—not purchasable plans.">
        <div className="text-[12.5px] leading-relaxed text-ink-muted">
          Pricing and availability have not been announced. This page will show billing controls only after those plans exist.
        </div>
      </Card>
    </div>
  );
}
