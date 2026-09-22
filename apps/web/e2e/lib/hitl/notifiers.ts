// apps/web/e2e/lib/hitl/notifiers.ts
// Swappable notification channels for HITL pauses.
// A failed notification must NEVER crash the pause — degrade to console.

export interface HitlNotification {
  testTitle: string;
  reason: string;
  screenshotPath?: string;
  resumeToken: string;
  resumeUrl?: string;
}

export interface Notifier {
  name: string;
  notify(n: HitlNotification): Promise<void>;
}

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

export function notifyTerminal(): Notifier {
  return {
    name: "terminal",
    async notify(n) {
      const lines = [
        "",
        `${ANSI.yellow}${ANSI.bold}⏸  HITL PAUSE — human input needed${ANSI.reset}`,
        `${ANSI.dim}Test:${ANSI.reset}   ${n.testTitle}`,
        `${ANSI.dim}Reason:${ANSI.reset} ${n.reason}`,
      ];
      if (n.screenshotPath) lines.push(`${ANSI.dim}Shot:${ANSI.reset}   ${n.screenshotPath}`);
      lines.push(
        `${ANSI.cyan}Press ENTER once done, or type SKIP + ENTER to skip this step.${ANSI.reset}`,
        "",
      );
      console.log(lines.join("\n"));
    },
  };
}

export function notifyWebhook(): Notifier {
  return {
    name: "webhook",
    async notify(n) {
      const url = process.env.HITL_WEBHOOK_URL;
      if (!url) {
        console.warn("[hitl] HITL_WEBHOOK_URL unset — skipping webhook notify (terminal only).");
        return;
      }
      try {
        // Slack-compatible payload; works with plain webhooks too.
        const text =
          `⏸ HITL pause: *${n.testTitle}*\n` +
          `Reason: ${n.reason}\n` +
          (n.resumeUrl ? `Resume: ${n.resumeUrl}\n` : "") +
          (n.screenshotPath ? `Screenshot: ${n.screenshotPath}\n` : "") +
          `Token: \`${n.resumeToken}\``;
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) {
          console.warn(`[hitl] webhook notify failed: HTTP ${res.status} — continuing with terminal only.`);
        }
      } catch (err) {
        // Webhook failures degrade to terminal-only logging, never fail the pause.
        console.warn(`[hitl] webhook notify errored (${err}) — continuing with terminal only.`);
      }
    },
  };
}
