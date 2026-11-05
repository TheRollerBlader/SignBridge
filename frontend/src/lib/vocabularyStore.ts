/**
 * Offline-first IndexedDB Vocabulary Store & Cache Manager for SignBridge.
 *
 * Caches ASL fingerspelling labels, WLASL word keyframes, and translation glosses
 * locally in the browser to enable offline PWA sign recognition and instantaneous
 * reciprocal translation lookups.
 */

export type SignCategory = 'alphabet' | 'number' | 'word' | 'phrase' | 'custom';

export interface SignVocabularyEntry {
  id: string;
  term: string;
  gloss: string;
  category: SignCategory;
  description?: string;
  synonyms?: string[];
  keyframeVectors?: number[][]; // Normalized 63-dim (21 * 3) hand landmarks
  confidenceThreshold?: number; // Minimum model confidence (e.g. 0.85)
  lastSyncedAt: number; // Unix timestamp ms
}

export interface VocabularyFilterOptions {
  category?: SignCategory;
  query?: string;
  minConfidence?: number;
  limit?: number;
}

const DB_NAME = 'signbridge_vocab_db';
const DB_VERSION = 1;
const STORE_NAME = 'vocabulary';

export class VocabularyStoreManager {
  private memoryStore: Map<string, SignVocabularyEntry> = new Map();
  private db: IDBDatabase | null = null;
  private isBrowserIdbAvailable: boolean;

  constructor() {
    this.isBrowserIdbAvailable =
      typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
  }

  /**
   * Initializes the IndexedDB database or falls back to in-memory store.
   */
  public async init(): Promise<boolean> {
    if (!this.isBrowserIdbAvailable) {
      return true; // Memory fallback ready
    }

    return new Promise((resolve) => {
      try {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            store.createIndex('term', 'term', { unique: false });
            store.createIndex('category', 'category', { unique: false });
            store.createIndex('gloss', 'gloss', { unique: false });
          }
        };

        req.onsuccess = (event) => {
          this.db = (event.target as IDBOpenDBRequest).result;
          resolve(true);
        };

        req.onerror = () => {
          this.isBrowserIdbAvailable = false;
          resolve(false);
        };
      } catch {
        this.isBrowserIdbAvailable = false;
        resolve(false);
      }
    });
  }

  /**
   * Persists or updates a single sign vocabulary entry.
   */
  public async putSign(entry: SignVocabularyEntry): Promise<void> {
    const normalized: SignVocabularyEntry = {
      ...entry,
      term: entry.term.trim().toLowerCase(),
      gloss: entry.gloss.trim().toUpperCase(),
      lastSyncedAt: entry.lastSyncedAt || Date.now(),
    };

    this.memoryStore.set(normalized.id, normalized);

    if (this.db) {
      await new Promise<void>((resolve, reject) => {
        try {
          const tx = this.db!.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.put(normalized);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        } catch (err) {
          reject(err);
        }
      });
    }
  }

  /**
   * Inserts a batch of sign definitions (e.g. from an initial dataset sync).
   */
  public async putBatch(entries: SignVocabularyEntry[]): Promise<number> {
    let count = 0;
    for (const entry of entries) {
      await this.putSign(entry);
      count++;
    }
    return count;
  }

  /**
   * Retrieves a sign entry by exact ID or term.
   */
  public async getSign(idOrTerm: string): Promise<SignVocabularyEntry | null> {
    const normalizedKey = idOrTerm.trim().toLowerCase();

    // Check memory first
    if (this.memoryStore.has(idOrTerm)) {
      return this.memoryStore.get(idOrTerm)!;
    }

    for (const entry of this.memoryStore.values()) {
      if (entry.term === normalizedKey || entry.id === idOrTerm) {
        return entry;
      }
    }

    if (this.db) {
      return new Promise<SignVocabularyEntry | null>((resolve) => {
        try {
          const tx = this.db!.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);

          // Try get by ID
          const idReq = store.get(idOrTerm);
          idReq.onsuccess = () => {
            if (idReq.result) {
              resolve(idReq.result);
              return;
            }

            // Fallback: search by term index
            const termIndex = store.index('term');
            const termReq = termIndex.get(normalizedKey);
            termReq.onsuccess = () => {
              resolve(termReq.result || null);
            };
            termReq.onerror = () => resolve(null);
          };
          idReq.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    }

    return null;
  }

  /**
   * Searches vocabulary entries using partial term match, gloss, or category.
   */
  public async searchSigns(options: VocabularyFilterOptions = {}): Promise<SignVocabularyEntry[]> {
    const all = await this.exportCatalog();
    const query = options.query?.trim().toLowerCase();

    return all
      .filter((item) => {
        if (options.category && item.category !== options.category) {
          return false;
        }
        if (options.minConfidence && (item.confidenceThreshold ?? 0) < options.minConfidence) {
          return false;
        }
        if (query) {
          const matchesTerm = item.term.includes(query);
          const matchesGloss = item.gloss.toLowerCase().includes(query);
          const matchesDesc = item.description?.toLowerCase().includes(query);
          const matchesSynonym = item.synonyms?.some((s) => s.toLowerCase().includes(query));
          return Boolean(matchesTerm || matchesGloss || matchesDesc || matchesSynonym);
        }
        return true;
      })
      .slice(0, options.limit ?? 100);
  }

  /**
   * Deletes a sign entry by ID.
   */
  public async deleteSign(id: string): Promise<boolean> {
    const existedInMemory = this.memoryStore.delete(id);

    if (this.db) {
      return new Promise<boolean>((resolve) => {
        try {
          const tx = this.db!.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.delete(id);
          req.onsuccess = () => resolve(true);
          req.onerror = () => resolve(false);
        } catch {
          resolve(false);
        }
      });
    }

    return existedInMemory;
  }

  /**
   * Exports the entire cached catalog as an array.
   */
  public async exportCatalog(): Promise<SignVocabularyEntry[]> {
    if (this.db) {
      return new Promise<SignVocabularyEntry[]>((resolve) => {
        try {
          const tx = this.db!.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.getAll();
          req.onsuccess = () => {
            const results = (req.result || []) as SignVocabularyEntry[];
            // Also merge any memory additions
            const combinedMap = new Map<string, SignVocabularyEntry>();
            for (const item of results) combinedMap.set(item.id, item);
            for (const [id, item] of this.memoryStore.entries()) combinedMap.set(id, item);
            resolve(Array.from(combinedMap.values()));
          };
          req.onerror = () => resolve(Array.from(this.memoryStore.values()));
        } catch {
          resolve(Array.from(this.memoryStore.values()));
        }
      });
    }

    return Array.from(this.memoryStore.values());
  }

  /**
   * Clears all cached vocabulary entries.
   */
  public async clear(): Promise<void> {
    this.memoryStore.clear();
    if (this.db) {
      await new Promise<void>((resolve) => {
        try {
          const tx = this.db!.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.clear();
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    }
  }
}
