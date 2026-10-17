export type AIProvider = 'anthropic' | 'openai' | 'bedrock' | 'metamuse';

export interface AIProviderConfig {
  provider: AIProvider;
  projectId: string;
  getToken: () => Promise<string | null>;
}

export const PROVIDER_MODELS: Record<AIProvider, { default: string; label: string }> = {
  anthropic: { default: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  openai: { default: 'gpt-4o', label: 'GPT-4o' },
  bedrock: { default: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0', label: 'Claude via Bedrock' },
  metamuse: { default: 'muse-spark-1.3-contributor', label: 'Muse Spark 1.3 Contributor' },
};

export const ACTIVE_PROVIDER_KEY = 'devdocs_active_provider';
let session: { projectId: string; getToken: () => Promise<string | null> } | null = null;

export function setAISession(projectId: string, getToken: () => Promise<string | null>) {
  session = { projectId, getToken };
}

export function setActiveProvider(provider: AIProvider) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ACTIVE_PROVIDER_KEY, provider);
  } catch {}
}

export function getActiveConfig(): AIProviderConfig | null {
  if (typeof window === 'undefined' || !session) return null;
  let provider: AIProvider | null = null;
  try {
    // Settings owns this preference. Legacy interview overrides must not mask
    // a model selected in Settings or become a second configuration source.
    provider = (localStorage.getItem(ACTIVE_PROVIDER_KEY) ?? 'anthropic') as AIProvider;
  } catch {
    provider = 'anthropic';
  }
  if (!provider || !Object.prototype.hasOwnProperty.call(PROVIDER_MODELS, provider)) provider = 'anthropic';
  return { provider, ...session };
}
