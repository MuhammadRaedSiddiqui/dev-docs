"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { PageHeader, Card, Field, Badge, Feedback, SettingsButton, styles } from "./SettingsUI";
import { type AIProvider, PROVIDER_MODELS, ACTIVE_PROVIDER_KEY } from "@/lib/ai/provider";
import { fetchKeys, saveKey, deleteKey } from "@/lib/ai/keys";
import { cn } from "@/lib/utils";

type KeyProvider = Exclude<AIProvider, "bedrock">;
const KEY_PROVIDERS: KeyProvider[] = ["anthropic", "openai", "metamuse"];
const LABELS: Record<AIProvider, string> = { anthropic: "Anthropic", openai: "OpenAI", metamuse: "Meta Muse", bedrock: "Amazon Bedrock" };
const KEY_LINKS: Record<KeyProvider, string> = { anthropic: "https://console.anthropic.com", openai: "https://platform.openai.com/api-keys", metamuse: "https://meta.ai/api" };
interface ProviderState {
  saved: boolean; maskedKey: string; showInput: boolean; showRemove: boolean;
  keyInput: string; pending: "save" | "remove" | null;
  error: string | null; feedback: string | null;
}
const initialState = (): ProviderState => ({ saved: false, maskedKey: "", showInput: false, showRemove: false, keyInput: "", pending: null, error: null, feedback: null });
type BedrockStatus = { configured: boolean; region: string | null; model: string | null };

export function ApiKeySection({ onConnectedChange }: { onConnectedChange: (provider: AIProvider, connected: boolean) => void }) {
  const { getToken } = useAuth();
  const [activeTab, setActiveTab] = useState<KeyProvider>("anthropic");
  const [activeProvider, setActiveProvider] = useState<AIProvider>("anthropic");
  const [states, setStates] = useState<Record<KeyProvider, ProviderState>>({ anthropic: initialState(), openai: initialState(), metamuse: initialState() });
  const [keysLoading, setKeysLoading] = useState(true);
  const [keysError, setKeysError] = useState<string | null>(null);
  const [bedrockStatus, setBedrockStatus] = useState<BedrockStatus | null>(null);
  const [bedrockError, setBedrockError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [selectionFeedback, setSelectionFeedback] = useState<string | null>(null);
  const locks = useRef(new Set<KeyProvider>());

  useEffect(() => {
    let cancelled = false;
    setKeysLoading(true);
    setKeysError(null);
    fetchKeys(getToken).then(stored => {
      if (cancelled) return;
      setStates(previous => {
        const next = { ...previous };
        for (const provider of KEY_PROVIDERS) {
          const key = stored.find(k => k.provider === provider);
          next[provider] = { ...previous[provider], saved: !!key, maskedKey: key?.maskedKey ?? "" };
        }
        return next;
      });
    }).catch(() => {
      if (!cancelled) setKeysError("Could not load saved keys. Retry before changing credentials.");
    }).finally(() => { if (!cancelled) setKeysLoading(false); });
    setBedrockStatus(null);
    setBedrockError(false);
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    fetch(`${apiBase}/ai/bedrock-status`).then(async response => {
      if (!response.ok) throw new Error("Unavailable");
      const data = await response.json();
      if (typeof data.configured !== "boolean") throw new Error("Invalid configuration status");
      if (!cancelled) setBedrockStatus(data);
    }).catch(() => { if (!cancelled) setBedrockError(true); });
    const storedProvider = localStorage.getItem(ACTIVE_PROVIDER_KEY);
    setActiveProvider(storedProvider && Object.prototype.hasOwnProperty.call(PROVIDER_MODELS, storedProvider) ? storedProvider as AIProvider : "anthropic");
    return () => { cancelled = true; };
  }, [getToken, loadAttempt]);

  function update(provider: KeyProvider, patch: Partial<ProviderState>) {
    setStates(previous => ({ ...previous, [provider]: { ...previous[provider], ...patch } }));
  }
  function select(provider: AIProvider) {
    if (provider === "bedrock" ? !bedrockStatus?.configured : keysLoading || !!keysError || !states[provider].saved) return;
    localStorage.setItem(ACTIVE_PROVIDER_KEY, provider);
    setActiveProvider(provider);
    setSelectionFeedback(`${LABELS[provider]} selected for subsequent AI requests in this browser.`);
  }
  async function handleVerify(provider: KeyProvider) {
    const key = states[provider].keyInput.trim();
    if (!key || locks.current.has(provider) || keysLoading || keysError) return;
    locks.current.add(provider);
    update(provider, { pending: "save", error: null, feedback: null });
    try {
      const { maskedKey, error } = await saveKey(getToken, provider, key);
      if (error || !maskedKey) {
        update(provider, { error: error ?? "Could not save your key. Please retry." });
        return;
      }
      // Preserve the existing first-key preference behavior.
      if (!localStorage.getItem(ACTIVE_PROVIDER_KEY)) {
        localStorage.setItem(ACTIVE_PROVIDER_KEY, provider);
        setActiveProvider(provider);
        setSelectionFeedback(`${LABELS[provider]} selected as your first saved provider in this browser.`);
      }
      update(provider, { saved: true, maskedKey, showInput: false, keyInput: "", feedback: "Credential check completed and key saved." });
      onConnectedChange(provider, true);
    } catch {
      update(provider, { error: "Could not finish saving your key. Please retry." });
    } finally {
      locks.current.delete(provider);
      update(provider, { pending: null });
    }
  }
  async function handleRemove(provider: KeyProvider) {
    if (locks.current.has(provider)) return;
    locks.current.add(provider);
    update(provider, { pending: "remove", error: null, feedback: null });
    try {
      if (!await deleteKey(getToken, provider)) {
        update(provider, { error: "Could not remove your key. Please retry." });
        return;
      }
      if (activeProvider === provider) {
        const other = KEY_PROVIDERS.find(p => p !== provider && states[p].saved);
        if (other) localStorage.setItem(ACTIVE_PROVIDER_KEY, other);
        else localStorage.removeItem(ACTIVE_PROVIDER_KEY);
        setActiveProvider(other ?? "anthropic");
        setSelectionFeedback(other ? `${LABELS[other]} selected after removing the active key.` : "No saved key remains. The browser preference has returned to Anthropic; add a key or choose configured Bedrock to use AI.");
      }
      update(provider, { saved: false, maskedKey: "", showRemove: false, showInput: false, keyInput: "", feedback: "Key removed." });
      onConnectedChange(provider, false);
    } finally {
      locks.current.delete(provider);
      update(provider, { pending: null });
    }
  }

  const s = states[activeTab];
  const blocked = keysLoading || !!keysError || !!s.pending;
  return <div className={styles.content}>
    <PageHeader title="AI Providers & Keys" sub="Manage provider credentials and choose the AI provider for this browser." />
    <Card title="Manage provider credentials" sub="These tabs choose which provider’s key you manage. Switching tabs does not change the active AI provider.">
      <div className={styles.tabs} aria-label="Credential provider">
        {KEY_PROVIDERS.map(provider => <SettingsButton key={provider} aria-pressed={activeTab === provider}
          className={activeTab === provider ? styles.selectedTab : undefined} onClick={() => setActiveTab(provider)}>
          {LABELS[provider]}
        </SettingsButton>)}
      </div>
      {keysLoading ? <Feedback>Loading saved keys…</Feedback> : keysError ? <>
        <Feedback error>{keysError}</Feedback>
        <div className="mt-3"><SettingsButton onClick={() => setLoadAttempt(n => n + 1)}>Retry loading</SettingsButton></div>
      </> : <>
        <div className={styles.savedKey}>
          <Badge>{s.pending === "save" ? "Verifying & saving" : s.pending === "remove" ? "Removing" : s.saved ? "Key saved" : "Not configured"}</Badge>
          {s.saved && <code>{s.maskedKey}</code>}
          {s.saved && <p className={`${styles.metadata} mt-2`}>Saved credentials are not continuously verified.</p>}
        </div>
        {s.saved && !s.showInput ? <>
          <div className={styles.actions}>
            <SettingsButton disabled={blocked} onClick={() => update(activeTab, { showInput: true, showRemove: false, error: null, feedback: null })}>Update key</SettingsButton>
            <SettingsButton disabled={blocked} onClick={() => update(activeTab, { showRemove: true, error: null, feedback: null })}>Remove key</SettingsButton>
          </div>
          {s.showRemove && <div className="mt-4">
            <p className={styles.note}>Remove the {LABELS[activeTab]} key? AI requests using this provider will need a new key.</p>
            <div className={styles.actions}>
              <SettingsButton variant="danger" pending={s.pending === "remove"} disabled={blocked} onClick={() => handleRemove(activeTab)}>{s.pending === "remove" ? "Removing…" : "Remove key"}</SettingsButton>
              <SettingsButton disabled={blocked} onClick={() => update(activeTab, { showRemove: false, error: null })}>Cancel</SettingsButton>
            </div>
          </div>}
        </> : <form onSubmit={event => { event.preventDefault(); void handleVerify(activeTab); }}>
          <Field label={`${LABELS[activeTab]} API key`} htmlFor={`key-${activeTab}`}>
            <input id={`key-${activeTab}`} type="password" autoComplete="off" spellCheck={false} value={s.keyInput}
              disabled={blocked} aria-invalid={!!s.error} aria-describedby={s.error ? "credential-error" : undefined}
              onChange={event => update(activeTab, { keyInput: event.target.value, error: null, feedback: null })}
              placeholder={activeTab === "anthropic" ? "sk-ant-api03-..." : activeTab === "openai" ? "sk-..." : "LLM_..."}
              className={styles.input} />
          </Field>
          <p className={`${styles.metadata} mb-4`}>Create a key in the <a className={styles.link} href={KEY_LINKS[activeTab]} target="_blank" rel="noreferrer">{LABELS[activeTab]} portal</a>.{s.saved && " Your saved key stays in place if replacement fails."}</p>
          <div className={styles.actions}>
            <SettingsButton type="submit" variant="primary" disabled={blocked || !s.keyInput.trim()}>{s.pending === "save" ? "Verifying & saving…" : "Verify & save"}</SettingsButton>
            {s.saved && <SettingsButton disabled={blocked} onClick={() => update(activeTab, { showInput: false, keyInput: "", error: null })}>Cancel</SettingsButton>}
          </div>
        </form>}
        {s.error && <div id="credential-error"><Feedback error>{s.error}</Feedback></div>}
        {s.pending === "save" && <Feedback>Checking your credentials with the provider and saving the key.</Feedback>}
        {s.feedback && <Feedback>{s.feedback}</Feedback>}
      </>}
      <p className={`${styles.metadata} mt-5`}>Saved keys are encrypted on the server. Only masked key details are returned to Settings.</p>
      <details className={styles.disclosure}>
        <summary>Security details</summary>
        <p>Your entered key is sent to the DevDocs API for a provider credential check, then encrypted before database storage. The server decrypts saved keys for AI requests. The browser does not store the raw key in local storage.</p>
        <p>Saving a key does not guarantee future provider access, model permissions, or available balance.</p>
      </details>
    </Card>
    <Card title="Choose the AI provider" sub="This browser preference applies to subsequent AI requests for new and existing projects. Saved project data and documentation are not rewritten.">
      <p className={styles.note}>Models are configured by the application or server. With no saved preference, your first saved key also selects its provider.</p>
      <div className={styles.stack} aria-label="AI provider selection">
        {([...KEY_PROVIDERS, "bedrock"] as AIProvider[]).map(provider => {
          const bedrock = provider === "bedrock";
          const available = bedrock ? !!bedrockStatus?.configured : !keysLoading && !keysError && states[provider].saved;
          const credentialStatus = bedrock
            ? bedrockError ? "Configuration unavailable" : !bedrockStatus ? "Checking configuration" : bedrockStatus.configured ? "Server configured" : "Not configured"
            : keysLoading ? "Loading keys" : keysError ? "Key status unavailable" : states[provider].saved ? "Key saved" : "Not configured";
          const current = activeProvider === provider;
          const model = bedrock ? bedrockStatus?.model : PROVIDER_MODELS[provider].default;
          const reason = available ? null : bedrock
            ? bedrockError ? "Could not check server configuration. Retry loading to check again." : !bedrockStatus ? "Checking server configuration…" : "Ask the server administrator to configure Bedrock."
            : keysLoading ? "Loading saved credentials…" : keysError ? "Retry loading keys to check availability." : "Add an API key to enable.";
          return <div key={provider} className={cn(styles.provider, current && styles.selectedProvider)}>
            <button type="button" className={styles.providerButton} disabled={!available} aria-pressed={current} onClick={() => select(provider)}>
              <span className="min-w-0"><span className={styles.providerName}>{LABELS[provider]}</span>
                {model && <span className={styles.providerModel}>Model: {model}</span>}
              </span>
              <span className={styles.providerBadges}>{current && <Badge active>Active</Badge>}<Badge>{credentialStatus}</Badge></span>
            </button>
            {reason && <p className={styles.reason}>{reason}</p>}
            {bedrock && <details className={styles.disclosure}>
              <summary>Configuration details</summary>
              <p>Bedrock credentials and model are managed by the server administrator. No personal AWS credentials are needed here.</p>
              {bedrockStatus?.configured && <p>Region: {bedrockStatus.region}. Model: <span className="break-all">{bedrockStatus.model}</span>. Server configuration does not verify current model access.</p>}
            </details>}
          </div>;
        })}
      </div>
      {bedrockError && <div className="mt-3"><SettingsButton onClick={() => setLoadAttempt(n => n + 1)}>Retry loading</SettingsButton></div>}
      {selectionFeedback && <Feedback>{selectionFeedback}</Feedback>}
      <p className={`${styles.metadata} mt-4`}>Active marks your browser selection. Key saved and Server configured describe credential availability, not a live connection check.</p>
      <p className={`${styles.metadata} mt-4`}>Provider usage charges and monitoring are explained in Plan & Billing.</p>
    </Card>
  </div>;
}
