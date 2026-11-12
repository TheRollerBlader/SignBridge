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

  private notifyMessages(): void {
    const copy = this.getMessages();
    for (const listener of this.listeners) {
      listener(copy);
    }
  }
}
