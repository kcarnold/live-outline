import { describe, it, expect } from 'vitest';
import { isListenLanguage, listenFavorites, LISTEN_LANGUAGE_CODES } from './listenLanguages';

describe('listenFavorites', () => {
  it('drops English for an English-spoken session', () => {
    expect(listenFavorites('en')).toEqual(['fr', 'es']);
  });

  it('adds English when the session is spoken in another language', () => {
    expect(listenFavorites('fr')).toContain('en');
  });

  it('never offers the spoken language as a favorite', () => {
    for (const code of ['en', 'fr', 'es', 'ht']) {
      expect(listenFavorites(code)).not.toContain(code);
    }
  });

  it('offers only supported listen languages', () => {
    for (const code of listenFavorites('fr')) {
      expect(LISTEN_LANGUAGE_CODES).toContain(code);
    }
  });
});

describe('isListenLanguage', () => {
  it('accepts every code the pickers offer', () => {
    for (const code of LISTEN_LANGUAGE_CODES) expect(isListenLanguage(code)).toBe(true);
  });

  it('rejects the near misses, which are the ones that do damage', () => {
    // Each of these is a reasonable thing for a human to type and none is a code this
    // system holds. Downstream every comparison is `===` on an opaque string, so a near
    // miss reads as "a different language" everywhere rather than as a mistake anywhere.
    for (const code of ['en-US', 'pt-BR', 'EN', 'he', 'en ', '']) {
      expect(isListenLanguage(code)).toBe(false);
    }
  });

  it('does not treat the spoken language as automatically valid', () => {
    // "Original" is deliberately absent from the list, so callers that must allow it —
    // the listen- route in App.tsx — say so themselves rather than this softening.
    expect(isListenLanguage('ht')).toBe(false); // spoken here, unsupported by Gemini Live
  });
});
