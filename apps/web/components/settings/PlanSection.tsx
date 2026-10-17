import { PageHeader, Card, Badge, styles } from "./SettingsUI";

export function PlanSection() {
  return <div className={styles.content}>
    <PageHeader title="Plan & Billing" sub="Your DevDocs access and where AI usage is billed." />
    <Card title="Current access" sub="DevDocs currently has no subscription charge or configured project quota.">
      <div className="mb-4"><Badge>Free workspace access</Badge></div>
      <ul className={styles.list}>
        <li>All supported documentation domains and templates</li>
        <li>Editable documentation and project ZIP export</li>
        <li>AI generation with saved provider keys or server-configured Bedrock</li>
      </ul>
    </Card>
    <Card title="AI usage & billing" sub="AI provider charges are separate from DevDocs access.">
      <div className={styles.stack}>
        <p className={styles.muted}>For Anthropic, OpenAI, and Meta Muse, usage is charged to the provider account or project associated with your API key. Monitor usage and billing with that provider.</p>
        <div className={styles.actions}>
          <a className={styles.link} href="https://console.anthropic.com" target="_blank" rel="noreferrer">Anthropic Console</a>
          <a className={styles.link} href="https://platform.openai.com/usage" target="_blank" rel="noreferrer">OpenAI usage</a>
          <a className={styles.link} href="https://meta.ai/api" target="_blank" rel="noreferrer">Meta Muse portal</a>
        </div>
        <p className={styles.muted}>Amazon Bedrock uses server-managed AWS credentials. Usage is billed to that AWS account; its administrator monitors costs in the <a className={styles.link} href="https://console.aws.amazon.com/bedrock" target="_blank" rel="noreferrer">AWS console</a>.</p>
        <p className={styles.metadata}>DevDocs does not provide a provider usage or cost dashboard.</p>
      </div>
    </Card>
    <section className={styles.roadmap}>
      <h2>Future plans</h2>
      <p>Hosted keys, team workspaces, versioning, and PDF export are roadmap ideas. They are not available to purchase, and pricing and availability have not been announced.</p>
    </section>
  </div>;
}