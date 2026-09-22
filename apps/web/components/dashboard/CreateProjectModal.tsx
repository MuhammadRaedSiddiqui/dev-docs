"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import type { ProjectType } from "@/lib/types";
import { type AIProvider, ACTIVE_PROVIDER_KEY } from "@/lib/ai/provider";
import { fetchKeys, saveKey } from "@/lib/ai/keys";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, type: ProjectType) => void;
  creating?: boolean;
}

const TYPES: { id: ProjectType; label: string; icon: string }[] = [
  { id: "saas", label: "SaaS product", icon: "◈" },
  { id: "api", label: "API service", icon: "⟨⟩" },
  { id: "internal_tool", label: "Internal tool", icon: "⚙" },
  { id: "mobile", label: "Mobile app", icon: "◻" },
  { id: "landing_page", label: "Landing page", icon: "◇" },
  { id: "other", label: "Other", icon: "○" },
];

type Step = "details" | "apikey";

export function CreateProjectModal({ open, onClose, onCreate, creating }: Props) {
  const { getToken } = useAuth();
  const [name, setName] = useState("");
  const [type, setType] = useState<ProjectType | null>(null);
  const [step, setStep] = useState<Step>("details");
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [provider, setProvider] = useState<AIProvider>("anthropic");
  const [keyInput, setKeyInput] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [checkingKeys, setCheckingKeys] = useState(false);
  const [bedrockStatus, setBedrockStatus] = useState<{ configured: boolean; region: string | null; model: string | null } | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep("details");
    setName("");
    setType(null);
    setKeyInput("");
    setVerifyError(null);
    setHasKey(null);
    setCheckingKeys(true);

    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    let cancelled = false;
    (async () => {
      try {
        const keys = await fetchKeys(getToken);
        if (cancelled) return;
        setHasKey(keys.length > 0);
      } catch {
        if (!cancelled) setHasKey(false);
      } finally {
        if (!cancelled) setCheckingKeys(false);
      }
    })();
    fetch(`${apiBase}/ai/bedrock-status`)
      .then(r => r.json())
      .then(data => { if (!cancelled) setBedrockStatus(data); })
      .catch(() => { if (!cancelled) setBedrockStatus({ configured: false, region: null, model: null }); });
    return () => { cancelled = true; };
  }, [open, getToken]);

  if (!open) return null;

  if (creating) {
    return (
      <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50">
        <div className="bg-white border border-hairline rounded-lg w-[480px] overflow-hidden">
          <div className="px-6 py-16 flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-2 border-ink/20 border-t-ink rounded-full animate-spin" />
            <div className="text-center">
              <div className="font-serif-heading text-base text-ink">Creating your project...</div>
              <div className="text-[13px] text-ink-muted mt-1">Setting up the interview workspace</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function handleNext() {
    if (!name.trim() || !type) return;
    if (hasKey) {
      onCreate(name.trim(), type);
    } else {
      setStep("apikey");
    }
  }

  async function handleVerifyAndCreate() {
    if (provider === "bedrock") return;
    const key = keyInput.trim();
    if (!key) return;

    if (key.length < 20) {
      setVerifyError("That doesn’t look like a valid API key. Keys are usually 40+ characters.");
      return;
    }
    if (provider === "anthropic" && !key.startsWith("sk-ant-")) {
      setVerifyError("Anthropic keys start with sk-ant-. Double-check you copied the full key.");
      return;
    }
    if (provider === "metamuse" && !key.startsWith("LLM_")) {
      setVerifyError("Meta Muse keys start with LLM_. Double-check you copied the full key.");
      return;
    }

    setVerifying(true);
    setVerifyError(null);

    const { maskedKey, error } = await saveKey(getToken, provider, key);
    if (error || !maskedKey) {
      setVerifying(false);
      setVerifyError(error ?? "Invalid API key. Please check the key and try again.");
      return;
    }

    localStorage.setItem(ACTIVE_PROVIDER_KEY, provider);
    setVerifying(false);
    onCreate(name.trim(), type!);
  }

  if (step === "apikey") {
    return (
      <div
        className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="bg-white border border-hairline rounded-lg w-[480px] overflow-hidden">
          <div className="px-6 pt-5 pb-4 border-b border-vellum-border">
            <h3 className="font-serif-heading text-lg text-ink">Connect your AI provider</h3>
            <p className="text-[13px] text-ink-muted mt-1">
              An API key is required to power the planning interview.
            </p>
          </div>
          <div className="px-6 py-5">
            {/* Provider selection */}
            <div className="mb-4">
              <label className="block text-[13px] font-medium text-ink mb-1.5">Provider</label>
              <div className="flex gap-2">
                {(["anthropic", "openai", "metamuse"] as AIProvider[]).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { setProvider(p); setVerifyError(null); setKeyInput(""); }}
                    className={cn(
                      "flex-1 px-3.5 py-2.5 border rounded-lg text-[13px] font-medium transition-all text-center",
                      provider === p
                        ? "border-ink border-[1.5px] bg-white text-ink"
                        : "border-vellum-border bg-white text-ink-muted hover:border-ink"
                    )}
                  >
                    {p === "anthropic" ? "Anthropic" : p === "openai" ? "OpenAI" : "Meta Muse"}
                  </button>
                ))}
                {bedrockStatus?.configured && (
                  <button
                    type="button"
                    onClick={() => { setProvider("bedrock"); setVerifyError(null); setKeyInput(""); }}
                    className={cn(
                      "flex-1 px-3.5 py-2.5 border rounded-lg text-[13px] font-medium transition-all text-center",
                      provider === "bedrock"
                        ? "border-ink border-[1.5px] bg-white text-ink"
                        : "border-vellum-border bg-white text-ink-muted hover:border-ink"
                    )}
                  >
                    Bedrock
                  </button>
                )}
              </div>
            </div>

            {provider === "bedrock" ? (
              <div className="flex gap-2.5 p-3 rounded-lg border border-hairline bg-sidebar-mist">
                <span className="text-sm flex-shrink-0 mt-0.5">☁️</span>
                <div className="text-[11px] leading-snug text-ink-secondary">
                  <span className="font-medium">Amazon Bedrock is configured on this server.</span><br />
                  Region: {bedrockStatus?.region ?? "us-east-1"} · No API key needed — uses server credentials.
                </div>
              </div>
            ) : (
              <>
                {/* Key input */}
                <div className="mb-1">
                  <label className="block text-[13px] font-medium text-ink mb-1.5">
                    {provider === "anthropic" ? "Anthropic" : provider === "openai" ? "OpenAI" : "Meta Muse"} API key
                  </label>
                  <input
                    type="text"
                    value={keyInput}
                    onChange={e => { setKeyInput(e.target.value); setVerifyError(null); }}
                    onKeyDown={e => e.key === "Enter" && handleVerifyAndCreate()}
                    placeholder={provider === "anthropic" ? "sk-ant-api03-..." : provider === "openai" ? "sk-..." : "LLM_..."}
                    className="w-full px-3 py-2.5 border border-ink/15 rounded-vellum text-[13px] bg-white text-ink font-mono focus:outline-none focus:border-ink/30"
                  />
                  {verifyError && (
                    <div className="text-[11px] mt-1.5 text-ink-muted">{verifyError}</div>
                  )}
                  <div className="text-[11px] text-ink-faint mt-1.5">
                    {provider === "anthropic" ? (
                      <>Get your key at{" "}
                        <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" className="text-ink underline">console.anthropic.com</a>
                      </>
                    ) : provider === "openai" ? (
                      <>Get your key at{" "}
                        <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-ink underline">platform.openai.com</a>
                      </>
                    ) : (
                      <>Get your key at{" "}
                        <a href="https://meta.ai/api" target="_blank" rel="noreferrer" className="text-ink underline">meta.ai/api</a>
                      </>
                    )}
                  </div>
                </div>

                {/* BYOK notice */}
                <div className="flex gap-2.5 p-3 rounded-lg border border-hairline bg-sidebar-mist mt-4">
                  <span className="text-sm flex-shrink-0 mt-0.5">🔒</span>
                  <div className="text-[11px] leading-snug text-ink-secondary">
                    Your key is sent once over HTTPS, verified, and encrypted at rest (AES-256-GCM). It&apos;s never stored in the browser.
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="px-6 py-3.5 border-t border-vellum-border flex gap-2 justify-end bg-white">
            <button
              type="button"
              onClick={() => setStep("details")}
              className="px-4 py-2 border border-vellum-border rounded-lg text-[13px] bg-white text-ink-secondary"
            >
              Back
            </button>
            {provider === "bedrock" ? (
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem(ACTIVE_PROVIDER_KEY, "bedrock");
                  onCreate(name.trim(), type!);
                }}
                className="px-5 py-2 bg-ink text-vellum rounded-lg text-[13px] font-medium"
              >
                Start planning →
              </button>
            ) : (
              <button
                type="button"
                disabled={!keyInput.trim() || verifying}
                onClick={handleVerifyAndCreate}
                className="px-5 py-2 bg-ink text-vellum rounded-lg text-[13px] font-medium disabled:opacity-35 disabled:cursor-not-allowed"
              >
                {verifying ? "Verifying..." : "Verify & start planning →"}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
        <div className="bg-white border border-hairline rounded-lg w-[480px] overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b border-vellum-border">
          <h3 className="font-serif-heading text-lg text-ink">New project</h3>
          <p className="text-[13px] text-ink-muted mt-1">Name your project and pick a type — then the AI takes over.</p>
        </div>
        <div className="px-6 py-5">
          <div className="mb-4">
            <label htmlFor="proj-name" className="block text-[13px] font-medium text-ink mb-1.5">Project name</label>
            <input
              id="proj-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. TaskFlow SaaS"
              className="w-full px-3 py-2.5 border border-ink/15 rounded-vellum text-[13px] bg-white text-ink focus:outline-none focus:border-ink/30"
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-ink mb-1.5">What are you building?</label>
            <div className="grid grid-cols-3 gap-2">
              {TYPES.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setType(t.id)}
                  className={cn(
                    "p-2.5 border rounded-lg text-center transition-all bg-white",
                    type === t.id ? "border-ink border-[1.5px]" : "border-vellum-border hover:border-ink"
                  )}
                >
                  <div className="text-lg mb-1">{t.icon}</div>
                  <div className="text-[11px] font-medium text-ink">{t.label}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="px-6 py-3.5 border-t border-vellum-border flex gap-2 justify-end bg-white">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-vellum-border rounded-lg text-[13px] bg-white text-ink-secondary">
            Cancel
          </button>
          <button
            type="button"
            disabled={!name.trim() || !type || checkingKeys || creating}
            onClick={handleNext}
            className="px-5 py-2 bg-ink text-vellum rounded-lg text-[13px] font-medium disabled:opacity-35 disabled:cursor-not-allowed"
          >
            {checkingKeys ? "Checking..." : hasKey ? "Start planning →" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}
