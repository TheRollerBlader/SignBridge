import { describe, it, expect, beforeEach } from 'vitest';
import {
  VocabularyStoreManager,
  type SignVocabularyEntry,
} from '../lib/vocabularyStore';

describe('SignBridge VocabularyStoreManager', () => {
  let store: VocabularyStoreManager;

  const sampleSign1: SignVocabularyEntry = {
    id: 'sign_a',
    term: 'hello',
    gloss: 'HELLO',
    category: 'word',
    description: 'Flat hand touching temple moving outward',
    synonyms: ['hi', 'greetings'],
    confidenceThreshold: 0.88,
    lastSyncedAt: Date.now(),
  };

  const sampleSign2: SignVocabularyEntry = {
    id: 'sign_b',
    term: 'thank you',
    gloss: 'THANK-YOU',
    category: 'word',
    description: 'Flat hand on chin moving forward towards conversational partner',
    confidenceThreshold: 0.90,
    lastSyncedAt: Date.now(),
  };

  const sampleAlphabet: SignVocabularyEntry = {
    id: 'sign_alpha_a',
    term: 'a',
    gloss: 'A',
    category: 'alphabet',
    description: 'Fist with thumb resting beside index finger',
    confidenceThreshold: 0.95,
    lastSyncedAt: Date.now(),
  };

  beforeEach(async () => {
    store = new VocabularyStoreManager();
    await store.init();
    await store.clear();
  });

  it('initializes cleanly and supports putSign and getSign', async () => {
    await store.putSign(sampleSign1);
    const retrieved = await store.getSign('sign_a');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.term).toBe('hello');
    expect(retrieved?.gloss).toBe('HELLO');
    expect(retrieved?.category).toBe('word');
  });

  it('supports retrieval by natural term lookup (case-insensitive)', async () => {
    await store.putSign(sampleSign1);
    const retrieved = await store.getSign('  HELLO ');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe('sign_a');
  });

  it('supports batch insertion of vocabulary entries', async () => {
    const count = await store.putBatch([sampleSign1, sampleSign2, sampleAlphabet]);
    expect(count).toBe(3);

    const catalog = await store.exportCatalog();
    expect(catalog.length).toBe(3);
  });

  it('filters vocabulary entries by category and search query', async () => {
    await store.putBatch([sampleSign1, sampleSign2, sampleAlphabet]);

    // Filter by category
    const alphabets = await store.searchSigns({ category: 'alphabet' });
    expect(alphabets.length).toBe(1);
    expect(alphabets[0].gloss).toBe('A');

    // Filter by text query
    const results = await store.searchSigns({ query: 'conversational' });
    expect(results.length).toBe(1);
    expect(results[0].gloss).toBe('THANK-YOU');

    // Filter by synonym
    const synonymResults = await store.searchSigns({ query: 'greetings' });
    expect(synonymResults.length).toBe(1);
    expect(synonymResults[0].term).toBe('hello');
  });

  it('handles item deletion and clear', async () => {
    await store.putSign(sampleSign1);
    expect(await store.getSign('sign_a')).not.toBeNull();

    const deleted = await store.deleteSign('sign_a');
    expect(deleted).toBe(true);
    expect(await store.getSign('sign_a')).toBeNull();

    await store.putBatch([sampleSign1, sampleSign2]);
    await store.clear();
    const remaining = await store.exportCatalog();
    expect(remaining.length).toBe(0);
  });
});
