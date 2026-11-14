/**
 * Strict TypeScript types, domain contracts, and runtime type guards
 * for ASL (American Sign Language) linguistic gloss notation and reciprocal translation.
 * Scheduled Milestone: Type Safety, Linting & Polish (2026-11-14).
 */

export type NonManualMarker =
  | 'wh_q'       // WH-question (furrowed brows)
  | 'yn_q'       // Yes/No question (raised brows)
  | 'negation'   // Head shake
  | 'affirmation'// Head nod
  | 'topic'      // Raised brows, slight head tilt
  | 'conditional'// Raised brows with head tilt
  | 'neutral';

export type GlossTokenType =
  | 'lexical'     // Standard dictionary sign: e.g. "HELLO", "STUDENT"
  | 'fingerspell' // Loan sign / spelled word: e.g. "#DOG", "#JOB"
  | 'index'       // Pronominal pointing: e.g. "IX:1", "IX:2", "IX:loc"
  | 'compound'    // Combined sign: e.g. "BELIEVE^SEE"
  | 'classifier'; // Depicting sign: e.g. "CL:3(car_drive_by)"

export interface SignGlossToken {
  readonly id: string;
  readonly gloss: string;
  readonly type: GlossTokenType;
  readonly nonManual?: NonManualMarker;
  readonly repetitions?: number;
  readonly durationMs?: number;
  readonly spatialAnchor?: 'left' | 'center' | 'right';
}

export interface SignGlossSequence {
  readonly sequenceId: string;
  readonly tokens: readonly SignGlossToken[];
  readonly englishTranslation?: string;
  readonly confidence: number;
  readonly verified: boolean;
}

/**
 * Validates that an unknown object conforms strictly to the SignGlossToken contract.
 */
export function isSignGlossToken(val: unknown): val is SignGlossToken {
  if (!val || typeof val !== 'object') return false;
  const t = val as Record<string, unknown>;

  const validTypes: readonly GlossTokenType[] = [
    'lexical', 'fingerspell', 'index', 'compound', 'classifier'
  ];

  if (typeof t.id !== 'string' || t.id.trim().length === 0) return false;
  if (typeof t.gloss !== 'string' || t.gloss.trim().length === 0) return false;
  if (!validTypes.includes(t.type as GlossTokenType)) return false;

  if (t.repetitions !== undefined && (typeof t.repetitions !== 'number' || t.repetitions < 1)) {
    return false;
  }

  if (t.durationMs !== undefined && (typeof t.durationMs !== 'number' || t.durationMs <= 0)) {
    return false;
  }

  return true;
}

/**
 * Validates that an unknown object conforms strictly to the SignGlossSequence contract.
 */
export function isGlossSequence(val: unknown): val is SignGlossSequence {
  if (!val || typeof val !== 'object') return false;
  const s = val as Record<string, unknown>;

  if (typeof s.sequenceId !== 'string' || s.sequenceId.trim().length === 0) return false;
  if (typeof s.confidence !== 'number' || s.confidence < 0.0 || s.confidence > 1.0) return false;
  if (typeof s.verified !== 'boolean') return false;
  if (!Array.isArray(s.tokens)) return false;

  return s.tokens.every(token => isSignGlossToken(token));
}

/**
 * Normalizes and tokenizes a raw ASL gloss string (e.g., "#CAT IX:1 SEE q[WHAT]")
 * into strict typed SignGlossToken objects.
 */
export function parseGlossString(raw: string): SignGlossToken[] {
  if (!raw || typeof raw !== 'string') return [];

  const rawTokens = raw.trim().split(/\s+/).filter(Boolean);
  const result: SignGlossToken[] = [];

  for (let i = 0; i < rawTokens.length; i++) {
    const rawTok = rawTokens[i];
    let cleaned = rawTok.toUpperCase();
    let nmm: NonManualMarker = 'neutral';

    // Parse non-manual markers: e.g. Q[WHO], NEG[WANT]
    const nmmMatch = cleaned.match(/^(WH_Q|YN_Q|NEG|AFF|T|COND)\[(.+)\]$/i);
    if (nmmMatch) {
      const tag = nmmMatch[1].toUpperCase();
      cleaned = nmmMatch[2];
      if (tag === 'WH_Q' || tag === 'Q') nmm = 'wh_q';
      else if (tag === 'YN_Q') nmm = 'yn_q';
      else if (tag === 'NEG') nmm = 'negation';
      else if (tag === 'AFF') nmm = 'affirmation';
      else if (tag === 'T') nmm = 'topic';
      else if (tag === 'COND') nmm = 'conditional';
    }

    let type: GlossTokenType = 'lexical';
    if (cleaned.startsWith('#')) {
      type = 'fingerspell';
    } else if (cleaned.startsWith('IX:') || cleaned.startsWith('IX-')) {
      type = 'index';
    } else if (cleaned.includes('^')) {
      type = 'compound';
    } else if (cleaned.startsWith('CL:')) {
      type = 'classifier';
    }

    // Repetitions check: e.g. WORK++
    let repetitions = 1;
    if (cleaned.endsWith('++')) {
      repetitions = 3;
      cleaned = cleaned.replace(/\+\+$/, '');
    } else if (cleaned.endsWith('+')) {
      repetitions = 2;
      cleaned = cleaned.replace(/\+$/, '');
    }

    result.push({
      id: `tok_${i}_${cleaned}`,
      gloss: cleaned,
      type,
      nonManual: nmm,
      repetitions: repetitions > 1 ? repetitions : undefined,
    });
  }

  return result;
}

/**
 * Reconstructs a canonical standardized ASL gloss notation string from typed tokens.
 */
export function serializeGlossTokens(tokens: readonly SignGlossToken[]): string {
  if (!tokens || tokens.length === 0) return '';

  return tokens
    .map(tok => {
      let base = tok.gloss;
      if (tok.repetitions && tok.repetitions >= 3) base += '++';
      else if (tok.repetitions === 2) base += '+';

      if (tok.nonManual && tok.nonManual !== 'neutral') {
        const prefix = tok.nonManual === 'wh_q' ? 'WH_Q'
          : tok.nonManual === 'yn_q' ? 'YN_Q'
          : tok.nonManual === 'negation' ? 'NEG'
          : tok.nonManual === 'affirmation' ? 'AFF'
          : tok.nonManual === 'topic' ? 'T'
          : 'COND';
        return `${prefix}[${base}]`;
      }
      return base;
    })
    .join(' ');
}
