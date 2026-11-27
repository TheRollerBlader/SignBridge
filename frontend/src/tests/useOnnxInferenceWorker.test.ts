import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOnnxInferenceWorker } from '../lib/useOnnxInferenceWorker';
import type { InferenceResult, OnnxSessionConfig } from '../lib/onnxInferenceTypes';

interface MockWorkerInstance {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  posted: Array<{ message: unknown; transfer?: Transferable[] }>;
  terminated: boolean;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
  terminate: () => void;
}

function createMockWorkerFactory() {
  const instances: MockWorkerInstance[] = [];

  const factory = () => {
    const worker: MockWorkerInstance = {
      onmessage: null,
      onerror: null,
      posted: [],
      terminated: false,
      postMessage(message: unknown, transfer?: Transferable[]) {
        this.posted.push({ message, transfer });
      },
      terminate() {
        this.terminated = true;
      },
    };
    instances.push(worker);
    return worker as unknown as Worker;
  };

  return { factory, instances };
}

const DEFAULT_CONFIG: OnnxSessionConfig = {
  modelPath: '/models/asl_fingerspelling.onnx',
  executionProvider: 'webgl',
  numThreads: 2,
  confidenceThreshold: 0.75,
};

function makePredictionFixture(label = 'A', probability = 0.96): InferenceResult {
  return {
    topPrediction: { label, probability },
    topK: [
      { label, probability },
      { label: 'S', probability: 0.03 },
    ],
    latencyMs: 11.4,
    normalizedTensor: new Float32Array(63),
    wristRelativeSpan: 0.28,
  };
}

describe('useOnnxInferenceWorker', () => {
  it('stays idle when no workerFactory is supplied', () => {
    const { result } = renderHook(() =>
      useOnnxInferenceWorker({ config: DEFAULT_CONFIG })
    );

    expect(result.current.status).toBe('idle');
    expect(result.current.latestResult).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.dispatchFrame(new Float32Array(63), 1)).toBe(false);
  });

  it('initializes session, transitions to ready, dispatches frames with backpressure, and terminates on unmount', () => {
    const { factory, instances } = createMockWorkerFactory();
    const onPrediction = vi.fn();

    const { result, unmount } = renderHook(() =>
      useOnnxInferenceWorker({
        config: DEFAULT_CONFIG,
        workerFactory: factory,
        onPrediction,
      })
    );

    expect(instances).toHaveLength(1);
    expect(result.current.status).toBe('initializing');
    expect(instances[0].posted).toHaveLength(1);
    expect(instances[0].posted[0].message).toMatchObject({
      type: 'INIT_SESSION',
      payload: { config: DEFAULT_CONFIG },
    });

    // Dispatch rejected before worker signals SESSION_READY
    expect(result.current.dispatchFrame(new Float32Array(63), 1)).toBe(false);

    // Worker finishes loading model
    act(() => {
      instances[0].onmessage?.({
        data: {
          id: 'init_1',
          type: 'SESSION_READY',
          success: true,
          payload: {
            executionProvider: 'webgl',
            modelPath: DEFAULT_CONFIG.modelPath,
            loadDurationMs: 42,
          },
        },
      } as MessageEvent<unknown>);
    });

    expect(result.current.status).toBe('ready');

    // First frame dispatches with transferable buffer
    const tensorA = new Float32Array(63).fill(0.25);
    let dispatchedFirst = false;
    act(() => {
      dispatchedFirst = result.current.dispatchFrame(tensorA, 10);
    });
    expect(dispatchedFirst).toBe(true);
    expect(instances[0].posted).toHaveLength(2);
    expect(instances[0].posted[1].message).toMatchObject({
      type: 'RUN_INFERENCE',
      payload: { frameId: 10 },
    });
    expect(instances[0].posted[1].transfer).toHaveLength(1);

    // Concurrent frame is dropped while worker is busy
    expect(result.current.dispatchFrame(new Float32Array(63), 11)).toBe(false);

    // Inference completes and releases backpressure lock
    const fixture = makePredictionFixture('B', 0.94);
    act(() => {
      instances[0].onmessage?.({
        data: {
          id: 'inf_10',
          type: 'INFERENCE_COMPLETE',
          success: true,
          payload: { frameId: 10, result: fixture },
        },
      } as MessageEvent<unknown>);
    });

    expect(result.current.latestResult).toEqual(fixture);
    expect(onPrediction).toHaveBeenCalledWith(fixture);
    expect(result.current.dispatchFrame(new Float32Array(63), 12)).toBe(true);

    unmount();
    const lastMessage = instances[0].posted[instances[0].posted.length - 1].message as {
      type: string;
    };
    expect(lastMessage.type).toBe('TERMINATE_SESSION');
    expect(instances[0].terminated).toBe(true);
  });

  it('ignores malformed worker messages and surfaces ERROR responses and ErrorEvents', () => {
    const { factory, instances } = createMockWorkerFactory();
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useOnnxInferenceWorker({
        config: DEFAULT_CONFIG,
        workerFactory: factory,
        onError,
      })
    );

    // Unrecognized message shape is ignored
    act(() => {
      instances[0].onmessage?.({ data: { bogus: true } } as MessageEvent<unknown>);
    });
    expect(result.current.status).toBe('initializing');

    // Structured ERROR payload
    act(() => {
      instances[0].onmessage?.({
        data: {
          id: 'err_1',
          type: 'ERROR',
          success: false,
          payload: { code: 'INIT_FAILED', message: 'WebGL context lost' },
        },
      } as MessageEvent<unknown>);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error?.message).toBe('WebGL context lost');
    expect(onError).toHaveBeenCalledTimes(1);

    // Restart spawns a new worker and recovers
    act(() => {
      result.current.restartWorker();
    });
    expect(instances[0].terminated).toBe(true);
    expect(instances).toHaveLength(2);
    expect(result.current.status).toBe('initializing');
    expect(result.current.error).toBeNull();

    // Native worker ErrorEvent
    act(() => {
      instances[1].onerror?.({ message: 'Uncaught worker panic' } as ErrorEvent);
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error?.message).toBe('Uncaught worker panic');
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('handles workerFactory instantiation exceptions gracefully', () => {
    const onError = vi.fn();
    const failingFactory = () => {
      throw new Error('Workers blocked by CSP');
    };

    const { result } = renderHook(() =>
      useOnnxInferenceWorker({
        config: DEFAULT_CONFIG,
        workerFactory: failingFactory,
        onError,
      })
    );

    expect(result.current.status).toBe('error');
    expect(result.current.error?.message).toBe('Workers blocked by CSP');
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
