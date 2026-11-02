import { useState, useEffect, useRef, useCallback } from 'react';
import type { InferenceResult, OnnxSessionConfig } from './onnxInferenceTypes';
import {
  type WorkerLifecycleStatus,
  type WorkerInferenceResponse,
  isWorkerResponse,
  createInferenceRequest
} from './onnxWorkerProtocol';

export interface UseOnnxWorkerOptions {
  config: OnnxSessionConfig;
  workerFactory?: () => Worker;
  onPrediction?: (result: InferenceResult) => void;
  onError?: (err: Error) => void;
}

export interface UseOnnxWorkerReturn {
  status: WorkerLifecycleStatus;
  latestResult: InferenceResult | null;
  error: Error | null;
  dispatchFrame: (landmarksTensor: Float32Array, frameId: number) => boolean;
  restartWorker: () => void;
}

/**
 * React hook scaffolding for off-main-thread ONNX Web Worker inference.
 * Keeps UI animation and camera rendering fluid at 60fps by offloading tensor inference.
 */
export function useOnnxInferenceWorker({
  config,
  workerFactory,
  onPrediction,
  onError
}: UseOnnxWorkerOptions): UseOnnxWorkerReturn {
  const [status, setStatus] = useState<WorkerLifecycleStatus>('idle');
  const [latestResult, setLatestResult] = useState<InferenceResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const isBusyRef = useRef<boolean>(false);

  const initWorker = useCallback(() => {
    if (!workerFactory || typeof window === 'undefined') {
      setStatus('idle');
      return;
    }

    try {
      setStatus('initializing');
      setError(null);

      const worker = workerFactory();
      workerRef.current = worker;

      worker.onmessage = (event: MessageEvent<unknown>) => {
        if (!isWorkerResponse(event.data)) return;
        const res: WorkerInferenceResponse = event.data;

        if (res.type === 'SESSION_READY' && res.success) {
          setStatus('ready');
        } else if (res.type === 'INFERENCE_COMPLETE' && res.success && res.payload) {
          isBusyRef.current = false;
          setStatus('ready');
          const payload = res.payload as { result: InferenceResult };
          setLatestResult(payload.result);
          onPrediction?.(payload.result);
        } else if (res.type === 'ERROR') {
          isBusyRef.current = false;
          setStatus('error');
          const payload = res.payload as { message: string };
          const err = new Error(payload?.message || 'Worker inference failure');
          setError(err);
          onError?.(err);
        }
      };

      worker.onerror = (evt: ErrorEvent) => {
        isBusyRef.current = false;
        setStatus('error');
        const err = new Error(evt.message || 'Worker runtime error');
        setError(err);
        onError?.(err);
      };

      // Send initial setup payload
      worker.postMessage({
        id: `init_${Date.now()}`,
        type: 'INIT_SESSION',
        payload: { config }
      });
    } catch (err) {
      setStatus('error');
      const errObj = err instanceof Error ? err : new Error(String(err));
      setError(errObj);
      onError?.(errObj);
    }
  }, [config, workerFactory, onPrediction, onError]);

  useEffect(() => {
    initWorker();

    return () => {
      if (workerRef.current) {
        workerRef.current.postMessage({ id: `term_${Date.now()}`, type: 'TERMINATE_SESSION' });
        workerRef.current.terminate();
        workerRef.current = null;
      }
      setStatus('terminated');
    };
  }, [initWorker]);

  const dispatchFrame = useCallback(
    (landmarksTensor: Float32Array, frameId: number): boolean => {
      if (!workerRef.current || isBusyRef.current || status !== 'ready') {
        return false;
      }

      try {
        isBusyRef.current = true;
        const { message, transferables } = createInferenceRequest(landmarksTensor, frameId);
        workerRef.current.postMessage(message, transferables);
        return true;
      } catch {
        isBusyRef.current = false;
        return false;
      }
    },
    [status]
  );

  const restartWorker = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    initWorker();
  }, [initWorker]);

  return {
    status,
    latestResult,
    error,
    dispatchFrame,
    restartWorker
  };
}
