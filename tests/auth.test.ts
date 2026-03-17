import { saveSession, loadSession, clearSession } from '../src/auth/session';

describe('Session management', () => {
  const mockStorage: Record<string, string> = {};
  beforeAll(() => {
    (global as any).localStorage = {
      getItem: (k: string) => mockStorage[k] ?? null,
      setItem: (k: string, v: string) => { mockStorage[k] = v; },
      removeItem: (k: string) => { delete mockStorage[k]; },
    };
  });

  it('saves and loads session', () => {
    saveSession('tok123', 'GABC');
    const s = loadSession();
    expect(s?.token).toBe('tok123');
    expect(s?.address).toBe('GABC');
  });

  it('clears session', () => {
    saveSession('tok', 'GABC');
    clearSession();
    expect(loadSession()).toBeNull();
  });
});
