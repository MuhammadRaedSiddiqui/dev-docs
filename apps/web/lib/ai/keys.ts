// Typed tRPC client for server-backed API-key storage. Raw keys are submitted
// once for verification and encryption and are never returned to the browser.
import type { AIProvider } from "@/lib/ai/provider";
import { makeTRPCClient } from "@/lib/trpc";

export interface StoredKey {
  provider: AIProvider;
  maskedKey: string;
  createdAt: Date | null;
}

type TokenGetter = () => Promise<string | null>;
type KeyProvider = Exclude<AIProvider, "bedrock">;

export async function fetchKeys(getToken: TokenGetter): Promise<StoredKey[]> {
  const keys = await makeTRPCClient(getToken).keys.list.query();
  return keys as StoredKey[];
}

export async function saveKey(
  getToken: TokenGetter,
  provider: KeyProvider,
  key: string,
): Promise<{ maskedKey?: string; error?: string }> {
  try {
    const saved = await makeTRPCClient(getToken).keys.upsert.mutate({ provider, key });
    return { maskedKey: saved.maskedKey };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to save API key." };
  }
}

export async function deleteKey(getToken: TokenGetter, provider: KeyProvider): Promise<boolean> {
  try {
    await makeTRPCClient(getToken).keys.delete.mutate({ provider });
    return true;
  } catch {
    return false;
  }
}
