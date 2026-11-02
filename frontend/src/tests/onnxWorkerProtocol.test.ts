import { describe, it, expect } from 'vitest';
import {
  isWorkerRequest,
  isWorkerResponse,
  createInferenceRequest,
  createSuccessResponse,
  createErrorResponse,
  type WorkerInferenceRequest,
  type WorkerInferenceResponse
} from '../lib/onnxWorkerProtocol';
import type { InferenceResult } from '../lib/onnxInferenceTypes';

describe('ONNX Web Worker Protocol Contracts', () => {
  it('validates compliant worker inference requests', () => {
    const validReq: WorkerInferenceRequest = {
      id: 'req_001',
      type: 'RUN_INFERENCE',
      payload: {
        tensorBuffer: new Float32Array(63),
        timestamp: 12345,
        frameId: 42
      }
    };

    expect(isWorkerRequest(validReq)).toBe(true);
    expect(isWorkerRequest(null)).toBe(false);
    expect(isWorkerRequest({})).toBe(false);
    expect(isWorkerRequest({ id: '123', type: 'UNKNOWN_OP' })).toBe(false);
  });

  it('validates compliant worker inference responses', () => {
    const validRes: WorkerInferenceResponse = {
      id: 'res_001',
      type: 'INFERENCE_COMPLETE',
      success: true,
      payload: {
        frameId: 42,
        result: {
          topPrediction: { label: 'A', probability: 0.98 },
          topK: [{ label: 'A', probability: 0.98 }],
          latencyMs: 12.4,
          normalizedTensor: new Float32Array(63),
          wristRelativeSpan: 0.45
        }
      }
    };

    expect(isWorkerResponse(validRes)).toBe(true);
    expect(isWorkerResponse({ id: 'res_002', type: 'ERROR', success: 'yes' })).toBe(false);
  });

  it('correctly extracts transferable ArrayBuffers for zero-copy IPC', () => {
    const tensor = new Float32Array(63);
    for (let i = 0; i < 63; i++) tensor[i] = i * 0.1;

    const { message, transferables } = createInferenceRequest(tensor, 101);

    expect(message.type).toBe('RUN_INFERENCE');
    expect(message.payload && 'frameId' in message.payload && message.payload.frameId).toBe(101);
    expect(transferables.length).toBe(1);
    expect(transferables[0]).toBe(tensor.buffer);
  });

  it('constructs structured success and error response payloads', () => {
    const dummyResult: InferenceResult = {
      topPrediction: { label: 'B', probability: 0.92 },
      topK: [{ label: 'B', probability: 0.92 }],
      latencyMs: 8.5,
      normalizedTensor: new Float32Array(63),
      wristRelativeSpan: 0.32
    };

    const successRes = createSuccessResponse('tx_01', 99, dummyResult);
    expect(successRes.success).toBe(true);
    expect(successRes.type).toBe('INFERENCE_COMPLETE');

    const errorRes = createErrorResponse('tx_02', 'INFERENCE_FAILED', 'WebGL context lost');
    expect(errorRes.success).toBe(false);
    expect(errorRes.type).toBe('ERROR');
    if (errorRes.payload && 'code' in errorRes.payload) {
      expect(errorRes.payload.code).toBe('INFERENCE_FAILED');
    }
  });
});
