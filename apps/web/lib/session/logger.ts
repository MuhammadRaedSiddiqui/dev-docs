// apps/web/lib/session/logger.ts
// Client-side session logging for interview interactions
import type {
  CreateSessionRequest,
  UpdateSessionRequest,
  SessionTimingData,
  MessageMetadata,
  AIProvider,
  DomainId,
} from "@devdocs/shared";
import { makeTRPCClient } from "@/lib/trpc";

type TokenGetter = () => Promise<string | null>;

export class SessionLogger {
  private sessionId: string | null = null;
  private timingData: SessionTimingData = {
    thinkingStartedAt: null,
    streamingStartedAt: null,
    requestStartedAt: null,
  };

  constructor(private getToken: TokenGetter) {}

  /**
   * Start a new interview session
   */
  async startSession(request: CreateSessionRequest): Promise<string | null> {
    try {
      const session = await makeTRPCClient(this.getToken).sessions.create.mutate(request);
      this.sessionId = session.id;
      return session.id;
    } catch (error) {
      console.error("Failed to start session:", error);
      return null;
    }
  }

  /**
   * Mark the start of a thinking phase
   */
  startThinking() {
    this.timingData.requestStartedAt = Date.now();
    this.timingData.thinkingStartedAt = Date.now();
  }

  /**
   * Mark the start of streaming phase
   */
  startStreaming() {
    this.timingData.streamingStartedAt = Date.now();
  }

  /**
   * Calculate timing durations
   */
  private calculateTimings() {
    const now = Date.now();
    const { thinkingStartedAt, streamingStartedAt, requestStartedAt } = this.timingData;

    return {
      thinkingDurationMs: streamingStartedAt && thinkingStartedAt
        ? streamingStartedAt - thinkingStartedAt
        : null,
      streamingDurationMs: streamingStartedAt
        ? now - streamingStartedAt
        : null,
      totalDurationMs: requestStartedAt
        ? now - requestStartedAt
        : null,
    };
  }

  /**
   * Log a user message
   */
  async logUserMessage(
    content: string,
    domainId: DomainId,
    metadata: MessageMetadata | null = null
  ): Promise<void> {
    if (!this.sessionId) return;

    try {
      await makeTRPCClient(this.getToken).sessions.logMessage.mutate({
          sessionId: this.sessionId,
          role: "user",
          content,
          domainId,
          provider: null,
          thinkingDurationMs: null,
          streamingDurationMs: null,
          totalDurationMs: null,
          tokensUsed: null,
          errorType: null,
          metadata: metadata as Record<string, unknown> | null,
        });
    } catch (error) {
      console.error("Failed to log user message:", error);
    }
  }

  /**
   * Log an assistant message with timing data
   */
  async logAssistantMessage(
    content: string,
    domainId: DomainId,
    provider: AIProvider,
    errorType: string | null = null,
    metadata: MessageMetadata | null = null
  ): Promise<void> {
    if (!this.sessionId) return;

    const timings = this.calculateTimings();

    try {
      await makeTRPCClient(this.getToken).sessions.logMessage.mutate({
          sessionId: this.sessionId,
          role: "assistant",
          content,
          domainId,
          provider,
          thinkingDurationMs: timings.thinkingDurationMs,
          streamingDurationMs: timings.streamingDurationMs,
          totalDurationMs: timings.totalDurationMs,
          tokensUsed: null, // TODO: Extract from AI response if available
          errorType,
          metadata: metadata as Record<string, unknown> | null,
        });
    } catch (error) {
      console.error("Failed to log assistant message:", error);
    } finally {
      // Reset timing data for next message
      this.resetTimings();
    }
  }

  /**
   * Update session metadata
   */
  async updateSession(updates: UpdateSessionRequest): Promise<void> {
    if (!this.sessionId) return;

    try {
      await makeTRPCClient(this.getToken).sessions.update.mutate({
        sessionId: this.sessionId,
        ...updates,
      });
    } catch (error) {
      console.error("Failed to update session:", error);
    }
  }

  /**
   * End the current session
   */
  async endSession(isComplete: boolean, updates: UpdateSessionRequest = {}): Promise<void> {
    if (!this.sessionId) return;

    try {
      await this.updateSession({
        ...updates,
        isComplete,
        endedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Failed to end session:", error);
    } finally {
      this.sessionId = null;
      this.resetTimings();
    }
  }

  /**
   * Reset timing data for next message
   */
  private resetTimings() {
    this.timingData = {
      thinkingStartedAt: null,
      streamingStartedAt: null,
      requestStartedAt: null,
    };
  }

  /**
   * Get current session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Check if session is active
   */
  isActive(): boolean {
    return this.sessionId !== null;
  }
}
