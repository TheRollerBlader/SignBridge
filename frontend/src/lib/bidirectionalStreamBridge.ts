/**
 * Bidirectional Conversation Stream Bridge for SignBridge.
 * Unifies real-time hearing speech transcription streams and ASL gesture recognition
 * predictions into a deterministic, chronological dialogue session with backpressure
 * and reconnection management.
 */

export type StreamParticipant = 'signer' | 'speaker';

export interface DialogueMessage {
  id: string;
  participant: StreamParticipant;
  text: string;
  timestamp: number;
  confidence: number;
  isFinal: boolean;
  rawGloss?: string[];
}

export type StreamConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface WebSocketLike {
  readyState: number;
  send(data: string | ArrayBuffer | ArrayBufferView): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

export interface StreamBridgeConfig {
  wsEndpoint?: string;
  reconnectAttempts?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  heartbeatIntervalMs?: number;
}

export class BidirectionalStreamBridge {
  private status: StreamConnectionStatus = 'disconnected';
  private messages: DialogueMessage[] = [];
  private listeners: Set<(messages: DialogueMessage[]) => void> = new Set();
  private statusListeners: Set<(status: StreamConnectionStatus) => void> = new Set();
  private reconnectCount = 0;
  private socket: WebSocketLike | null = null;
  private socketFactory: WebSocketFactory | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private intentionallyClosed = false;
  private readonly config: Required<StreamBridgeConfig>;

  constructor(config: StreamBridgeConfig = {}) {
    this.config = {
      wsEndpoint: config.wsEndpoint ?? 'ws://localhost:8000/api/ws/dialogue',
      reconnectAttempts: config.reconnectAttempts ?? 5,
      baseBackoffMs: config.baseBackoffMs ?? 500,
      maxBackoffMs: config.maxBackoffMs ?? 8000,
      heartbeatIntervalMs: config.heartbeatIntervalMs ?? 15000,
    };
  }

  public getStatus(): StreamConnectionStatus {
    return this.status;
  }

  public getMessages(): DialogueMessage[] {
    return [...this.messages];
  }

  public onMessagesChange(callback: (messages: DialogueMessage[]) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  public onStatusChange(callback: (status: StreamConnectionStatus) => void): () => void {
    this.statusListeners.add(callback);
    return () => this.statusListeners.delete(callback);
  }

  public setStatus(status: StreamConnectionStatus): void {
    this.status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }

  /**
   * Ingests a new or partial speech transcription chunk from a hearing interlocutor.
   */
  public ingestSpeechChunk(chunkId: string, text: string, isFinal: boolean, confidence = 0.95): DialogueMessage {
    const existingIndex = this.messages.findIndex((m) => m.id === chunkId);
    const message: DialogueMessage = {
      id: chunkId,
      participant: 'speaker',
      text: text.trim(),
      timestamp: Date.now(),
      confidence,
      isFinal,
    };

    if (existingIndex >= 0) {
      this.messages[existingIndex] = message;
    } else {
      this.messages.push(message);
    }

    this.notifyMessages();
    return message;
  }

  /**
   * Ingests an ASL recognition prediction event from client-side ONNX / MediaPipe.
   */
  public ingestSignPrediction(
    eventId: string,
    glossText: string,
    confidence: number,
    isFinal: boolean,
    glossTokens?: string[]
  ): DialogueMessage {
    const existingIndex = this.messages.findIndex((m) => m.id === eventId);
    const message: DialogueMessage = {
      id: eventId,
      participant: 'signer',
      text: glossText.trim(),
      timestamp: Date.now(),
      confidence,
      isFinal,
      rawGloss: glossTokens,
    };

    if (existingIndex >= 0) {
      this.messages[existingIndex] = message;
    } else {
      this.messages.push(message);
    }

    this.notifyMessages();
    return message;
  }

  /**
   * Computes the exponential backoff delay for reconnecting to streaming endpoints.
   */
  public getBackoffDelayMs(): number {
    const delay = Math.min(
      this.config.maxBackoffMs,
      this.config.baseBackoffMs * Math.pow(2, this.reconnectCount)
    );
    return delay;
  }

  public recordConnectionFailure(): boolean {
    this.reconnectCount++;
    if (this.reconnectCount > this.config.reconnectAttempts) {
      this.setStatus('error');
      return false;
    }
    this.setStatus('reconnecting');
    return true;
  }

  public recordConnectionSuccess(): void {
    this.reconnectCount = 0;
    this.setStatus('connected');
  }

  public clearDialogue(): void {
    this.messages = [];
    this.notifyMessages();
  }

  /**
   * Opens a WebSocket connection using either a custom factory (for testing) or native WebSocket.
   */
  public connect(factory?: WebSocketFactory): void {
    this.clearTimers();
    this.intentionallyClosed = false;

    const resolvedFactory =
      factory ??
      this.socketFactory ??
      ((url: string) => new WebSocket(url) as unknown as WebSocketLike);
    this.socketFactory = resolvedFactory;

    this.setStatus('connecting');
    const ws = resolvedFactory(this.config.wsEndpoint);
    this.socket = ws;

    ws.onopen = () => {
      this.recordConnectionSuccess();
      this.startHeartbeat();
    };

    ws.onmessage = (event) => {
      if (typeof event?.data === 'string') {
        this.handleIncomingPayload(event.data);
      }
    };

    ws.onerror = () => {
      // Close handler manages reconnect scheduling cleanly.
    };

    ws.onclose = () => {
      this.stopHeartbeat();
      this.socket = null;
      if (this.intentionallyClosed) {
        this.setStatus('disconnected');
        return;
      }
      if (this.recordConnectionFailure()) {
        const delayMs = this.getBackoffDelayMs();
        this.reconnectTimer = setTimeout(() => {
          if (!this.intentionallyClosed) {
            this.connect(this.socketFactory ?? undefined);
          }
        }, delayMs);
      }
    };
  }

  /**
   * Gracefully terminates the WebSocket session and cancels pending reconnect/heartbeat timers.
   */
  public disconnect(): void {
    this.intentionallyClosed = true;
    this.clearTimers();
    if (this.socket) {
      try {
        this.socket.close(1000, 'Client disconnected');
      } catch {
        // Ignore teardown errors
      }
      this.socket = null;
    }
    this.reconnectCount = 0;
    this.setStatus('disconnected');
  }

  /**
   * Parses incoming WebSocket JSON frames from the Gemini Live / ASL backend.
   */
  public handleIncomingPayload(raw: string | Record<string, unknown>): DialogueMessage | null {
    let payload: Record<string, unknown>;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        payload = parsed as Record<string, unknown>;
      } catch {
        return null;
      }
    } else {
      payload = raw;
    }

    const kind = String(payload.type ?? '');
    if (kind === 'pong' || kind === 'heartbeat') {
      return null;
    }

    const text = typeof payload.text === 'string' ? payload.text : '';
    if (!text.trim()) {
      return null;
    }

    const id = typeof payload.id === 'string' && payload.id ? payload.id : `${kind}_${Date.now()}`;
    const isFinal = Boolean(payload.isFinal ?? payload.is_final ?? true);
    const rawConfidence = Number(payload.confidence ?? 0.95);
    const confidence = Number.isFinite(rawConfidence) ? Math.min(1, Math.max(0, rawConfidence)) : 0.95;

    if (kind === 'transcript' || kind === 'speech') {
      return this.ingestSpeechChunk(id, text, isFinal, confidence);
    }

    if (kind === 'sign' || kind === 'gloss') {
      const glossTokens = Array.isArray(payload.gloss)
        ? payload.gloss.filter((token): token is string => typeof token === 'string')
        : undefined;
      return this.ingestSignPrediction(id, text, confidence, isFinal, glossTokens);
    }

    return null;
  }

  /**
   * Transmits a 16kHz PCM audio buffer over the active WebSocket connection.
   */
  public sendAudioFrame(pcmChunk: ArrayBuffer | ArrayBufferView): boolean {
    if (!this.socket || this.socket.readyState !== 1) {
      return false;
    }
    this.socket.send(pcmChunk);
    return true;
  }

  /**
   * Transmits a recognized ASL gloss event over the active WebSocket connection.
   */
  public sendSignEvent(glossText: string, confidence: number, glossTokens?: string[]): boolean {
    if (!this.socket || this.socket.readyState !== 1) {
      return false;
    }
    this.socket.send(
      JSON.stringify({
        type: 'sign',
        text: glossText,
        confidence,
        gloss: glossTokens ?? [],
        timestamp: Date.now(),
      })
    );
    return true;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.socket && this.socket.readyState === 1) {
        this.socket.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      }
    }, this.config.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private clearTimers(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private notifyMessages(): void {
    const copy = this.getMessages();
    for (const listener of this.listeners) {
      listener(copy);
    }
  }
}
