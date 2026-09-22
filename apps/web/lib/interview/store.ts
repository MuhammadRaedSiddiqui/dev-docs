// lib/interview/store.ts
// Real AI streaming wired via lib/ai/stream.ts — supports Anthropic + OpenAI.
// Integration point remaining: persistToSupabase() (see prompt 3).
import { create } from "zustand";
import type { ChatMessage, DomainDefinition, DomainId, DomainPhase, ProjectContext } from "@/lib/types";
import { DOMAINS, getActiveDomains, getDomain, getOpener, buildFullDocument, nextDomainId } from "@/lib/interview/domains";
import { CARD_CHOICES, getAutoChoice } from "@/lib/interview/choices";
import { getActiveConfig, setActiveProvider, type AIProvider } from "@/lib/ai/provider";
import { streamAIResponse, type StreamErrorType } from "@/lib/ai/stream";
import { SessionLogger } from "@/lib/session/logger";
import type { MessageMetadata } from "@devdocs/shared";
import { analytics } from "@/lib/analytics";

// Error messages shown in the chat when a stream fails
const ERROR_MESSAGES: Record<StreamErrorType, string> = {
  auth:       "Your API key was rejected. Go to **Settings → API Key** to update it.",
  rate_limit: "Rate limit reached. Wait a moment and try sending again.",
  timeout:    "The request timed out after 30 seconds. This can happen when the API is under load — try again.",
  network:    "Network error. Check your connection and try again.",
  persistence:"The response was generated but could not be saved. Please retry.",
  unknown:    "An unexpected error occurred. Try again or check the provider's status page.",
};

export interface LastError {
  type: StreamErrorType;
  message: string;
  lastUserMessage: string;
  source: "choice" | "message" | "opener";
  retryDomain?: DomainId;
  retryKey?: string;
  retryValue?: string;
}

interface InterviewState {
  // Core interview state
  lockedContext:    ProjectContext | null;
  lockedChoices:    Partial<Record<DomainId, Record<string, string>>>;
  domainPhases:     Record<DomainId, DomainPhase>;
  currentDomain:    DomainId;
  completedDomains: DomainId[];
  domainContent:    Partial<Record<DomainId, string>>;
  messages:         ChatMessage[];
  elaboration:      string;
  activeDomains:    DomainDefinition[];

  // Project metadata
  projectName:      string;
  projectId:        string | null;

  // Streaming / UI state
  isThinking:       boolean;
  isStreaming:      boolean;
  streamingText:    string;
  isComplete:       boolean;
  lastError:        LastError | null;
  lastUserMessage:  string;

  // Provider state
  currentProvider:  AIProvider | null;
  abortController:  AbortController | null;

  // Session logging
  sessionLogger:    SessionLogger | null;
  messageCount:     number;
  tokenGetter:      (() => Promise<string | null>) | null;
  interviewStartAt: number | null;
  domainStartAt:    number | null;

  // Actions
  setProjectName:    (name: string) => void;
  setProjectId:      (id: string) => void;
  setTokenGetter:    (getter: () => Promise<string | null>) => void;
  initializeSession: (getToken?: () => Promise<string | null>) => Promise<void>;
  setLockedContext:  (ctx: ProjectContext) => void;
  setProvider:       (p: AIProvider) => void;
  lockDomainChoice:  (domain: DomainId, key: string, value: string) => void;
  sendMessage:       (text: string) => void;
  setDomainContent:  (domainId: DomainId, content: string) => void;
  regenerateDomain:  (domainId: DomainId) => void;
  cancelStream:      () => void;
  clearError:        () => void;
  retryLast:         () => void;
  replayOpenerForCurrentDomain: () => void;
  goBackToDomain:    (domainId: DomainId) => void;
  resumeFromSaved:   (data: {
    lockedContext:       ProjectContext;
    lockedChoices:       Partial<Record<DomainId, Record<string, string>>>;
    completedDomains:    DomainId[];
    domainContent:       Partial<Record<DomainId, string>>;
    conversationHistory: ChatMessage[];
    elaboration:         string;
  }) => void;
  reset: () => void;
}

function initialPhases(): Record<DomainId, DomainPhase> {
  return Object.fromEntries(DOMAINS.map(d => [d.id, "not_started"])) as Record<DomainId, DomainPhase>;
}

// ── Internal types ────────────────────────────────────────────────────────────
type S = InterviewState;
type SetFn = (p: Partial<S> | ((s: S) => Partial<S>)) => void;
type GetFn = () => S;

// ── Core reply function ───────────────────────────────────────────────────────
// This is the only place in the store that calls the AI.
// For openers and help responses we pass the opener text directly as userMessage;
// for real user input we pass their actual message.
function runReply(
  set: SetFn,
  get: GetFn,
  userMessage:  string,
  msgOpts:      Partial<ChatMessage>,
  onDone?:      (full: string) => void,
  // When true, the userMessage is an internal opener, not a real user turn —
  // it goes into the system prompt context but not into the messages array.
  isInternalOpener = false,
  domainId?: DomainId,
) {
  const config = getActiveConfig();

  // No API key — show a friendly inline message and stop
  if (!config) {
    const noKeyMsg = "No API key configured. Go to **Settings → API Key** to add your Anthropic or OpenAI key.";
    set(s => ({ messages: [...s.messages, { role: "assistant" as const, content: noKeyMsg, ...msgOpts }] }));
    return;
  }

  // Update current provider in state
  set({ currentProvider: config.provider, isThinking: true, lastError: null });

  // Start timing tracking for session logging
  const state = get();
  const responseDomain = domainId ?? state.currentDomain;
  if (state.sessionLogger) {
    state.sessionLogger.startThinking();
  }

  const controller = new AbortController();
  set({ abortController: controller });

  // 30-second timeout
  const timeoutId = setTimeout(() => {
    if (get().abortController !== controller) return;
    controller.abort();
    const errMsg = ERROR_MESSAGES.timeout;
    const s = get();

    // Log timeout error
    if (s.sessionLogger && s.currentProvider) {
      s.sessionLogger.logAssistantMessage(errMsg, s.currentDomain, s.currentProvider, "timeout");
    }

    set(s => ({
      isThinking: false, isStreaming: false, streamingText: "",
      abortController: null,
      lastError: { type: "timeout", message: errMsg, lastUserMessage: userMessage, source: isInternalOpener ? "opener" as const : "message" as const },
      messages: [...s.messages, { role: "assistant" as const, content: errMsg }],
      messageCount: s.messageCount + 1,
    }));
  }, 30_000);

  // Short thinking delay for UX (gives the dots animation time to appear)
  setTimeout(() => {
    if (controller.signal.aborted || get().abortController !== controller) return;
    const s = get();
    set({ isThinking: false, isStreaming: true, streamingText: "" });

    // Mark streaming start for timing
    if (s.sessionLogger) {
      s.sessionLogger.startStreaming();
    }

    streamAIResponse(
      userMessage,
      { ...config, domainId: responseDomain },
      {
        lockedContext: state.lockedContext!,
        lockedChoices: state.lockedChoices,
        elaboration: state.elaboration,
      },
      {
        onToken: (acc) => set({ streamingText: acc }),

        onDone: (full) => {
          clearTimeout(timeoutId);
          const s = get();
          const content = full.trim();

          // Providers can finish a stream without emitting text. Do not persist
          // an empty chat bubble; surface a retryable error instead.
          if (!content) {
            const message = "The AI response was empty. Please try again.";
            const emptyMsg: ChatMessage = { role: "assistant" as const, content: message };
            set(s => ({
              isThinking: false,
              isStreaming: false,
              streamingText: "",
              abortController: null,
              lastError: { type: "unknown", message, lastUserMessage: userMessage, source: isInternalOpener ? "opener" as const : "message" as const },
              messages: [...s.messages, emptyMsg],
              messageCount: s.messageCount + 1,
            }));
            return;
          }

          // Extract metadata for assistant message logging
          const metadata: MessageMetadata = {
            messageType: msgOpts.isComplete ? "completion" :
                        isInternalOpener ? "opener" :
                        msgOpts.showCards ? "card_picker" : "follow-up",
            isOpener: isInternalOpener,
            showsCardPicker: msgOpts.showCards !== undefined,
          };

          // Log assistant message with timing data
          if (s.sessionLogger && s.currentProvider) {
            s.sessionLogger.logAssistantMessage(content, responseDomain, s.currentProvider, null, metadata);
          }

          set(s => ({
            isStreaming:     false,
            streamingText:   "",
            abortController: null,
            messages:        [...s.messages, { role: "assistant" as const, content, ...msgOpts }],
            messageCount:    s.messageCount + 1,
          }));
          onDone?.(content);
        },

        onError: (type, message) => {
          clearTimeout(timeoutId);
          const s = get();

          // Log error message
          if (s.sessionLogger && s.currentProvider) {
            s.sessionLogger.logAssistantMessage(message, responseDomain, s.currentProvider, type);
          }

          set(s => ({
            isStreaming:     false,
            streamingText:   "",
            isThinking:      false,
            abortController: null,
            lastError:       { type, message, lastUserMessage: userMessage, source: isInternalOpener ? "opener" as const : "message" as const },
            messages:        [...s.messages, { role: "assistant" as const, content: message }],
            messageCount:    s.messageCount + 1,
          }));
        },
      },
      controller.signal,
      s.messages.slice(-6).map(m => ({ role: m.role, content: m.content }))
    );
  }, 400);
}

function runOpener(set: SetFn, get: GetFn, domainId: DomainId) {
  const d     = DOMAINS.find(x => x.id === domainId)!;
  const opener = getOpener(domainId, get().lockedContext!, get().elaboration);
  const opts: Partial<ChatMessage> = d.mode === "cards" ? { showCards: domainId, domainId } : { domainId };
  runReply(set, get, opener, opts, undefined, true);
}

function completeDomain(set: SetFn, get: GetFn, domainId: DomainId, content: string) {
  const start = get().domainStartAt;
  const duration = start ? Date.now() - start : 0;
  set(s => ({
    domainContent:    { ...s.domainContent, [domainId]: content },
    completedDomains: s.completedDomains.includes(domainId)
      ? s.completedDomains
      : [...s.completedDomains, domainId],
    domainPhases:     { ...s.domainPhases, [domainId]: "complete" },
  }));

  // Analytics: time per domain
  if (duration > 0) {
    try {
      const pid = get().projectId ?? "unknown";
      const provider = get().currentProvider ?? "";
      analytics.domainCompletedWithTiming(pid, domainId, duration, provider, "");
    } catch {}
  }

  // Update session with completed domain count
  const state = get();
  if (state.sessionLogger) {
    state.sessionLogger.updateSession({
      totalDomainsCompleted: state.completedDomains.length,
      totalMessages: state.messageCount,
      primaryProvider: state.currentProvider ?? undefined,
    });
  }

  const active = get().activeDomains;
  const next = nextDomainId(domainId, active);
  if (!next) {
    set({ isComplete: true });
    // Analytics: interview completed
    try {
      const pid = get().projectId ?? "unknown";
      const totalMs = get().interviewStartAt ? Date.now() - get().interviewStartAt! : 0;
      analytics.interviewCompleted(pid, get().completedDomains.length, totalMs, "");
    } catch {}

    const finalState = get();
    if (finalState.sessionLogger) {
      void finalState.sessionLogger.endSession(true, {
        totalMessages: finalState.messageCount,
        totalDomainsCompleted: finalState.completedDomains.length,
        primaryProvider: finalState.currentProvider ?? undefined,
      });
    }

    // The final AI flourish is non-critical. Completion persistence and
    // telemetry must not depend on a provider successfully generating it.
    runReply(
      set, get,
      "Generate the final completion message for the interview.",
      { isComplete: true, showDownload: true },
      undefined,
      true
    );
    return;
  }
  // Adaptive branching: auto-pick for solo when choice is obvious
  const ctx = get().lockedContext;
  if (ctx) {
    const auto = getAutoChoice(next, ctx);
    if (auto) {
      const key = getDomain(next).requiredChoiceKey;
      if (key) {
        set({ currentDomain: next, domainStartAt: Date.now() });
        // Small delay for UI to show transition, then auto-lock
        setTimeout(() => {
          const s = get();
          if (s.currentDomain === next && !s.completedDomains.includes(next) && !s.isThinking && !s.isStreaming) {
            s.lockDomainChoice(next, key, auto);
          }
        }, 350);
        return;
      }
    }
  }
  set({ currentDomain: next, domainStartAt: Date.now() });
  runOpener(set, get, next);
}

// ── Store ─────────────────────────────────────────────────────────────────────
export const useInterviewStore = create<InterviewState>((set, get) => ({
  lockedContext:    null,
  lockedChoices:    {},
  domainPhases:     initialPhases(),
  currentDomain:    DOMAINS[0].id,
  completedDomains: [],
  domainContent:    {},
  messages:         [],
  elaboration:      "",
  activeDomains:    DOMAINS,
  projectName:      "",
  projectId:        null,
  isThinking:       false,
  isStreaming:      false,
  streamingText:    "",
  isComplete:       false,
  lastError:        null,
  lastUserMessage:  "",
  currentProvider:  null,
  abortController:  null,
  sessionLogger:    null,
  messageCount:     0,
  tokenGetter:      null,
  interviewStartAt: null,
  domainStartAt:    null,

  setProjectName: (name) => set({ projectName: name }),
  setProjectId: (id) => set({ projectId: id }),
  setProvider: (p) => {
    set({ currentProvider: p });
    setActiveProvider(p);
  },

  setTokenGetter: (getter) => set({ tokenGetter: getter }),

  initializeSession: async (getToken) => {
    const state = get();
    if (!state.projectId || !state.lockedContext) {
      console.warn('Cannot initialize session: missing projectId or lockedContext');
      return;
    }

    // Use provided token getter or stored one
    const tokenGetter = getToken || state.tokenGetter;
    if (!tokenGetter) {
      console.warn('Cannot initialize session: no token getter available');
      return;
    }

    const projectId = state.projectId;
    const logger = new SessionLogger(tokenGetter);
    const sessionId = await logger.startSession({
      projectId,
      metadata: {
        projectType: state.lockedContext.projectType,
        activeDomains: state.activeDomains.map(d => d.id),
        teamSize: state.lockedContext.teamSize,
        timeline: state.lockedContext.timeline,
        budget: state.lockedContext.budget,
        experienceLevel: state.lockedContext.experienceLevel,
      },
    });

    if (sessionId) {
      if (get().projectId !== projectId) {
        void logger.endSession(false);
        return;
      }
      set({ sessionLogger: logger });
      console.log('Session logging initialized:', sessionId);
    } else {
      console.warn('Failed to initialize session logging');
    }
  },

  setLockedContext: (ctx) => {
    const active = getActiveDomains(ctx.projectType);
    const now = Date.now();
    set(s => ({
      lockedContext: ctx,
      activeDomains: active,
      currentDomain: active[0].id,
      domainPhases: { ...s.domainPhases, [active[0].id]: "interviewing" },
      interviewStartAt: now,
      domainStartAt: now,
    }));
    // Analytics: interview started
    try {
      const pid = get().projectId ?? "unknown";
      analytics.interviewStarted(pid, "");
    } catch {}

    void (async () => {
      const state = get();
      const projectId = state.projectId;
      if (!state.sessionLogger && state.projectId && state.tokenGetter) {
        await state.initializeSession();
      }
      if (get().projectId !== projectId || get().lockedContext !== ctx) return;
      runOpener(set, get, active[0].id);
    })();
  },

  lockDomainChoice: (domain, key, value) => {
    set(s => ({
      lockedChoices: { ...s.lockedChoices, [domain]: { ...(s.lockedChoices[domain] ?? {}), [key]: value } },
    }));
    const domainLabel = DOMAINS.find(d => d.id === domain)!.label;
    let label: string;
    if (value === "skipped") {
      label = "Skipped — deferred to v2";
      // For skipped, generate deferred doc locally without AI call
      const deferred = `## ${domainLabel}\n\n**Status:** Deferred to v2 — not applicable for this project.\n\nSkipped during interview. Revisit when scope expands.`;
      completeDomain(set, get, domain, deferred);
      const state = get();
      if (state.sessionLogger) {
        state.sessionLogger.logUserMessage(`Skipped: ${domainLabel}`, domain, { cardChoices: { [key]: value } });
      }
      set(s => ({ messages: [...s.messages, { role: "user" as const, content: `Skipped: ${domainLabel}`, domainId: domain }], messageCount: s.messageCount + 1 }));
      return;
    } else if (value.startsWith("custom:")) {
      label = value.slice(7);
    } else {
      label = CARD_CHOICES[domain]?.find(o => o.id === value)?.label ?? value;
    }

    // Log card selection metadata
    const metadata: MessageMetadata = {
      cardChoices: { [key]: value },
    };

    const state = get();
    if (state.sessionLogger) {
      state.sessionLogger.logUserMessage(`Selected: ${label}`, domain, metadata);
    }

    // Push user "message" (the card selection) then immediately trigger doc gen
    set(s => ({ messages: [...s.messages, { role: "user" as const, content: `Selected: ${label}`, domainId: domain }], messageCount: s.messageCount + 1 }));
    runReply(
      set, get,
      `The user selected "${label}" for ${domainLabel}. Acknowledge the choice briefly (one sentence) and generate the ${domainLabel} documentation section.`,
      { domainId: domain },
      (content) => completeDomain(set, get, domain, content),
      true
    );
  },

  sendMessage: (text) => {
    if (!text.trim() || get().isThinking || get().isStreaming) return;
    const domain = get().currentDomain;
    const d      = DOMAINS.find(x => x.id === domain)!;

    // Validation: planning elaboration should be meaningful (≥10 chars, ideally 20)
    if (domain === "planning" && text.trim().length < 10) {
      const hint = "Could you share a bit more detail? Even one sentence about who it's for and what a user does helps me tailor the rest.";
      set(s => ({ messages: [...s.messages, { role: "assistant" as const, content: hint, domainId: domain }], messageCount: s.messageCount + 1 }));
      return;
    }

    // Log user message to session
    const state = get();
    if (state.sessionLogger) {
      state.sessionLogger.logUserMessage(text, domain);
    }

    set(s => ({ messages: [...s.messages, { role: "user" as const, content: text, domainId: domain }], lastUserMessage: text, messageCount: s.messageCount + 1 }));

    // Post-completion clarification
    if (get().isComplete) {
      runReply(set, get, text, { domainId: domain });
      return;
    }

    if (d.mode === "open") {
      if (domain === "planning") {
        set({ elaboration: text });
        runReply(
          set, get,
          `The user described their project: "${text}". Briefly acknowledge this (1-2 sentences), then generate the Planning & Scope documentation section.`,
          { domainId: domain },
          (content) => completeDomain(set, get, "planning", content),
          true
        );
      } else {
        runReply(set, get, text, { domainId: domain }, (content) => completeDomain(set, get, domain, content));
      }

    } else {
      // "cards" mode — user typed instead of clicking a card, keep picker visible
      runReply(set, get, text, { showCards: domain, domainId: domain });
    }
  },

  setDomainContent: (domainId, content) => {
    set(s => ({ domainContent: { ...s.domainContent, [domainId]: content } }));
  },

  regenerateDomain: (domainId) => {
    const state = get();
    if (!state.lockedContext) return;
    runReply(
      set,
      get,
      `Regenerate the ${DOMAINS.find(d => d.id === domainId)!.label} documentation section using the current project decisions. Output only the replacement markdown section.`,
      {},
      (content) => get().setDomainContent(domainId, content),
      true,
      domainId,
    );
  },

  cancelStream: () => {
    get().abortController?.abort();
    set({ abortController: null, isThinking: false, isStreaming: false, streamingText: "" });
  },

  clearError: () => set({ lastError: null }),

  retryLast: () => {
    const err = get().lastError;
    if (!err) return;
    const { lastUserMessage, source, retryDomain, retryKey, retryValue } = err;
    get().clearError();
    if (source === "choice" && retryDomain && retryKey && retryValue) {
      get().lockDomainChoice(retryDomain, retryKey, retryValue);
      return;
    }
    if (lastUserMessage) {
      if (source === "opener") {
        // Internal generation/opening prompts must not be replayed as visible
        // user messages. The locked choice/message is already in state.
        runReply(set, get, lastUserMessage, {}, undefined, true, get().currentDomain);
      } else {
        get().sendMessage(lastUserMessage);
      }
    }
  },

  replayOpenerForCurrentDomain: () => {
    const s = get();
    if (s.isComplete || !s.lockedContext) return;
    const cur = s.activeDomains.find(d => d.id === s.currentDomain);
    if (!cur || s.completedDomains.includes(cur.id)) return;
    const alreadyHasPicker = s.messages.some(m => m.showCards === cur.id);
    if (alreadyHasPicker) return;
    const opener = getOpener(cur.id, s.lockedContext, s.elaboration);
    const opts: Partial<ChatMessage> = cur.mode === "cards" ? { showCards: cur.id } : {};
    // Push opener as local assistant message without AI call — zero cost, instant picker restore
    set(state => ({
      messages: [...state.messages, { role: "assistant" as const, content: opener, ...opts }],
      messageCount: state.messageCount + 1,
    }));
  },

  goBackToDomain: (domainId) => {
    const s = get();
    if (s.isThinking || s.isStreaming) return;
    if (!s.completedDomains.includes(domainId)) return;
    // Remove domain and any domains after it from completed (linear flow)
    const activeIds = s.activeDomains.map(d => d.id);
    const targetIdx = activeIds.indexOf(domainId);
    if (targetIdx === -1) return;
    const toRemove = new Set(activeIds.slice(targetIdx));
    set(state => {
      // Find first message belonging to toRemove, then truncate from there
      const firstIdx = state.messages.findIndex(m => {
        const md = (m as ChatMessage & { domainId?: DomainId }).domainId;
        if (md && toRemove.has(md)) return true;
        if (m.showCards && toRemove.has(m.showCards)) return true;
        return false;
      });
      const nextMessages = firstIdx === -1
        ? state.messages.filter(m => {
            const md = (m as ChatMessage & { domainId?: DomainId }).domainId;
            if (md && toRemove.has(md)) return false;
            if (m.showCards && toRemove.has(m.showCards)) return false;
            return true;
          })
        : state.messages.slice(0, firstIdx);
      const nextContent = { ...state.domainContent };
      const nextChoices = { ...state.lockedChoices };
      for (const id of toRemove) {
        delete nextContent[id as DomainId];
        delete nextChoices[id as DomainId];
      }
      return {
        currentDomain: domainId,
        completedDomains: state.completedDomains.filter(id => !toRemove.has(id)),
        domainContent: nextContent,
        lockedChoices: nextChoices,
        messages: nextMessages,
        isComplete: false,
        domainStartAt: Date.now(),
        domainPhases: Object.fromEntries(
          DOMAINS.map(d => [
            d.id,
            state.completedDomains.includes(d.id) && !toRemove.has(d.id) ? "complete"
            : d.id === domainId ? "interviewing"
            : "not_started",
          ])
        ) as Record<DomainId, DomainPhase>,
      };
    });
    // Re-emit opener for the domain if no picker already present
    get().replayOpenerForCurrentDomain();
  },

  resumeFromSaved: (data) => {
    const active = getActiveDomains(data.lockedContext.projectType);
    const activeCompleted = data.completedDomains.filter(id => active.some(d => d.id === id));
    const nextIdx = active.findIndex(d => !activeCompleted.includes(d.id));
    // Strip legacy showSchema if present (schema mode removed); keep showCards for hydration
    const cleaned = (data.conversationHistory ?? [])
      .filter(message => message.content.trim().length > 0)
      .map(message => {
        const { showSchema: _ignored, ...rest } = message as ChatMessage & { showSchema?: boolean };
        return rest as ChatMessage;
      });
    const isComplete = nextIdx === -1;
    set({
      lockedContext:    data.lockedContext,
      lockedChoices:    data.lockedChoices,
      completedDomains: data.completedDomains,
      domainContent:    data.domainContent,
      messages:         cleaned,
      elaboration:      data.elaboration,
      activeDomains:    active,
      currentDomain:    nextIdx === -1 ? active[active.length - 1].id : active[nextIdx].id,
      isComplete,
      domainStartAt:    isComplete ? null : Date.now(),
      interviewStartAt: isComplete ? null : Date.now(),
      domainPhases: Object.fromEntries(
        DOMAINS.map(d => [
          d.id,
          data.completedDomains.includes(d.id) ? "complete"
          : active[nextIdx]?.id === d.id ? "interviewing"
          : "not_started",
        ])
      ) as Record<DomainId, DomainPhase>,
    });
  },

  reset: () => {
    get().abortController?.abort();
    void get().sessionLogger?.endSession(false);
    set({
      lockedContext: null, lockedChoices: {}, domainPhases: initialPhases(),
      currentDomain: DOMAINS[0].id, completedDomains: [], domainContent: {},
      messages: [], elaboration: "", activeDomains: DOMAINS, projectName: "",
      isThinking: false, isStreaming: false, streamingText: "", isComplete: false,
      lastError: null, lastUserMessage: "", currentProvider: null, abortController: null,
      projectId: null, sessionLogger: null, messageCount: 0, tokenGetter: null,
      interviewStartAt: null, domainStartAt: null,
    });
  },
}));

export function selectFullDocument(state: InterviewState): string {
  if (!state.lockedContext) return "";
  return buildFullDocument(state.lockedContext, state.domainContent);
}
