// apps/web/e2e/lib/hitl/resumeServer.ts
// Minimal resume endpoint for CI HITL pauses.
//
//   POST /resume/:token   Authorization: Bearer ${HITL_RESUME_SECRET}
//   Body (optional): { "action": "skip" } — marks the pause skipped.
//
// SECURITY: bind this port for the human operator only
// (VPN / SSH tunnel / temporary ngrok URL) — NEVER expose publicly.
import * as http from "node:http";

type Waiter = {
  token: string;
  resolve: (action: string) => void;
  timer: NodeJS.Timeout;
};

const waiters = new Map<string, Waiter>();
let server: http.Server | null = null;
let activePort = 0;

export function resumePort(): number {
  return Number(process.env.HITL_RESUME_PORT ?? 9234);
}

function ensureServer(port: number): http.Server {
  if (server) return server;
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const match = url.pathname.match(/^\/resume\/([\w-]+)$/);
    if (req.method !== "POST" || !match) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not_found" }));
      return;
    }
    const secret = process.env.HITL_RESUME_SECRET ?? "";
    const auth = req.headers.authorization ?? "";
    if (!secret || auth !== `Bearer ${secret}`) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    const token = match[1];
    const waiter = waiters.get(token);
    if (!waiter) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unknown_or_expired_token" }));
      return;
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let action = "resume";
      try {
        const parsed = body ? JSON.parse(body) : {};
        if (parsed?.action === "skip") action = "skip";
      } catch {
        action = "resume";
      }
      waiters.delete(token);
      clearTimeout(waiter.timer);
      waiter.resolve(action);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, action }));
      maybeClose();
    });
  });
  server.listen(port);
  activePort = port;
  return server;
}

function maybeClose() {
  // Auto-close idle listeners once all pending pauses resolve.
  if (waiters.size === 0 && server) {
    const s = server;
    server = null;
    s.close(() => {});
  }
}

export function resumeUrlFor(token: string): string {
  return `http://localhost:${activePort || resumePort()}/resume/${token}`;
}

/** Register a pause token; resolves with "resume" | "skip" when POSTed. */
export function waitForResume(token: string, timeoutMs: number): Promise<string> {
  const port = resumePort();
  ensureServer(port);
  return new Promise<string>((resolve) => {
    const timer = setTimeout(() => {
      waiters.delete(token);
      maybeClose();
      resolve("__timeout__");
    }, timeoutMs);
    // Allow the process to exit even if a pause is pending (CI safety).
    timer.unref?.();
    waiters.set(token, { token, resolve, timer });
  });
}
