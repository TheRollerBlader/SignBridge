/**
 * Type-safety and runtime validation tests for ASL sign gloss contracts.
 * Scheduled Milestone: Type Safety, Linting & Polish (2026-11-14).
 */

import { describe, it, expect } from 'vitest';
import {
  isSignGlossToken,
  isGlossSequence,
  parseGlossString,
  serializeGlossTokens,
  type SignGlossToken,
  type SignGlossSequence,
} from '../lib/signGlossTypes';

describe('SignGlossTypes & Runtime Type Guards', () => {
  describe('isSignGlossToken type guard', () => {
    it('accepts valid lexical tokens with proper structure', () => {
      const token: SignGlossToken = {
        id: 'tok_1',
        gloss: 'LEARN',
        type: 'lexical',
        repetitions: 2,
        nonManual: 'neutral',
      };
      expect(isSignGlossToken(token)).toBe(true);
    });

    it('rejects objects with missing or empty gloss text', () => {
      expect(isSignGlossToken({ id: 'tok_1', gloss: '', type: 'lexical' })).toBe(false);
      expect(isSignGlossToken({ id: 'tok_1', type: 'lexical' })).toBe(false);
      expect(isSignGlossToken(null)).toBe(false);
      expect(isSignGlossToken('not_an_object')).toBe(false);
    });

    it('rejects tokens with invalid token types or negative repetitions', () => {
      expect(isSignGlossToken({ id: '1', gloss: 'HI', type: 'invalid_type' })).toBe(false);
      expect(isSignGlossToken({ id: '1', gloss: 'HI', type: 'lexical', repetitions: 0 })).toBe(false);
      expect(isSignGlossToken({ id: '1', gloss: 'HI', type: 'lexical', durationMs: -50 })).toBe(false);
    });
  });

  describe('isGlossSequence type guard', () => {
    it('validates a complete, verified gloss sequence', () => {
      const seq: SignGlossSequence = {
        sequenceId: 'seq_101',
        confidence: 0.94,
        verified: true,
        englishTranslation: 'Where do you work?',
        tokens: [
          { id: '1', gloss: 'IX:2', type: 'index' },
          { id: '2', gloss: 'WORK', type: 'lexical', repetitions: 2 },
          { id: '3', gloss: 'WHERE', type: 'lexical', nonManual: 'wh_q' },
        ],
      };
      expect(isGlossSequence(seq)).toBe(true);
    });

    it('rejects sequences with out-of-range confidence scores', () => {
      const seq = {
        sequenceId: 'seq_102',
        confidence: 1.5, // invalid
        verified: false,
        tokens: [],
      };
      expect(isGlossSequence(seq)).toBe(false);
    });
  });

  describe('parseGlossString tokenizer', () => {
    it('parses fingerspelling loan signs with "#" prefix', () => {
      const tokens = parseGlossString('#DOG #CAT');
      expect(tokens).toHaveLength(2);
      expect(tokens[0].type).toBe('fingerspell');
      expect(tokens[0].gloss).toBe('#DOG');
      expect(tokens[1].type).toBe('fingerspell');
      expect(tokens[1].gloss).toBe('#CAT');
    });

    it('identifies index pointers and compound signs', () => {
      const tokens = parseGlossString('IX:1 BELIEVE^SEE IX:2');
      expect(tokens[0].type).toBe('index');
      expect(tokens[1].type).toBe('compound');
      expect(tokens[2].type).toBe('index');
    });

    it('extracts non-manual markers and repetitions', () => {
      const tokens = parseGlossString('T[WEEKEND] WORK++ WH_Q[WHAT]');
      expect(tokens[0].nonManual).toBe('topic');
      expect(tokens[0].gloss).toBe('WEEKEND');

      expect(tokens[1].repetitions).toBe(3);
      expect(tokens[1].gloss).toBe('WORK');

      expect(tokens[2].nonManual).toBe('wh_q');
      expect(tokens[2].gloss).toBe('WHAT');
    });
  });

  describe('serializeGlossTokens roundtrip', () => {
    it('correctly serializes tokens back to formatted ASL gloss notation', () => {
      const tokens = parseGlossString('T[MORNING] IX:1 COFFEE++ YN_Q[WANT]');
      const serialized = serializeGlossTokens(tokens);
      expect(serialized).toBe('T[MORNING] IX:1 COFFEE++ YN_Q[WANT]');
    });

    it('returns empty string for empty token arrays', () => {
      expect(serializeGlossTokens([])).toBe('');
    });
  });
});
