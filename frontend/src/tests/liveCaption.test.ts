import { describe, expect, it } from 'vitest';
import {
  buildLiveTranscribeWsUrl,
  downsampleBuffer,
  floatTo16BitPCM,
  isTrivial,
} from '../lib/liveCaption';

describe('LiveCaption audio processing and protocol utilities', () => {
  describe('downsampleBuffer', () => {
    it('returns original buffer unchanged if target rate >= input rate', () => {
      const input = new Float32Array([0.1, 0.2, 0.3, 0.4]);
      const res = downsampleBuffer(input, 16000, 16000);
      expect(res).toBe(input);

      const resHigher = downsampleBuffer(input, 16000, 48000);
      expect(resHigher).toBe(input);
    });

    it('correctly reduces sample count according to downsampling ratio', () => {
      // 48 kHz to 16 kHz is a 3:1 ratio
      const input = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
      const res = downsampleBuffer(input, 48000, 16000);
      expect(res.length).toBe(3);

      // Average of first 3 samples: (0.1 + 0.2 + 0.3) / 3 = 0.2
      expect(res[0]).toBeCloseTo(0.2, 4);
      // Average of middle 3: (0.4 + 0.5 + 0.6) / 3 = 0.5
      expect(res[1]).toBeCloseTo(0.5, 4);
      // Average of last 3: (0.7 + 0.8 + 0.9) / 3 = 0.8
      expect(res[2]).toBeCloseTo(0.8, 4);
    });

    it('handles non-integer downsampling ratios safely', () => {
      const input = new Float32Array(4410); // 44.1 kHz 100ms
      const res = downsampleBuffer(input, 44100, 16000); // -> 1600 samples
      expect(res.length).toBe(1600);
    });
  });

  describe('floatTo16BitPCM', () => {
    it('converts normalized float values to 16-bit little-endian signed integers', () => {
      // 0.0 -> 0, 1.0 -> 32767, -1.0 -> -32768
      const input = new Float32Array([0.0, 1.0, -1.0, 0.5]);
      const buffer = floatTo16BitPCM(input);
      expect(buffer.byteLength).toBe(input.length * 2);

      const view = new DataView(buffer);
      expect(view.getInt16(0, true)).toBe(0);
      expect(view.getInt16(2, true)).toBe(32767);
      expect(view.getInt16(4, true)).toBe(-32768);
      expect(view.getInt16(6, true)).toBe(Math.floor(0.5 * 0x7fff));
    });

    it('clamps values outside [-1.0, 1.0] to prevent audio clipping distortion', () => {
      const input = new Float32Array([2.5, -3.8]);
      const buffer = floatTo16BitPCM(input);
      const view = new DataView(buffer);

      expect(view.getInt16(0, true)).toBe(32767);
      expect(view.getInt16(2, true)).toBe(-32768);
    });
  });

  describe('isTrivial', () => {
    it('identifies whitespace and empty strings as trivial', () => {
      expect(isTrivial('')).toBe(true);
      expect(isTrivial('   ')).toBe(true);
      expect(isTrivial('\n\t')).toBe(true);
    });

    it('identifies punctuation-only tokens as trivial noise', () => {
      expect(isTrivial('.')).toBe(true);
      expect(isTrivial('...')).toBe(true);
      expect(isTrivial('?!-')).toBe(true);
      expect(isTrivial('   ,;   ')).toBe(true);
    });

    it('recognizes valid linguistic words and gestures as non-trivial', () => {
      expect(isTrivial('hello')).toBe(false);
      expect(isTrivial('A')).toBe(false);
      expect(isTrivial('Thank you!')).toBe(false);
    });
  });

  describe('buildLiveTranscribeWsUrl', () => {
    it('generates a valid websocket URL pointing to live-transcribe endpoint', () => {
      const urlStr = buildLiveTranscribeWsUrl();
      expect(urlStr).toMatch(/^wss?:\/\//);
      expect(urlStr).toContain('live-transcribe');
    });
  });
});
