import { MockWalletAdapter, createPlaywrightWalletScript } from '../src/testing';

describe('MockWalletAdapter rejection and browser injection (Issue #478)', () => {
  it('simulates user rejection via rejectNext()', async () => {
    const wallet = new MockWalletAdapter();
    expect(await wallet.signTransaction('AAAA')).toBe('AAAA');

    wallet.rejectNext('User declined transaction');
    await expect(wallet.signTransaction('AAAA')).rejects.toThrow('User declined transaction');

    // Subsequent calls succeed
    expect(await wallet.signTransaction('AAAA')).toBe('AAAA');
  });

  it('simulates rejection on connect', async () => {
    const wallet = new MockWalletAdapter({ shouldReject: true });
    await expect(wallet.connect()).rejects.toThrow('User rejected request');
  });

  it('provides a window.freighter-shaped object via toFreighterGlobal()', async () => {
    const wallet = new MockWalletAdapter();
    const globalObj = wallet.toFreighterGlobal();

    expect(await globalObj.isConnected()).toBe(true);
    expect(await globalObj.getPublicKey()).toBe(wallet.publicKey);
    const res = await globalObj.signTransaction('AAAA');
    expect(res.signedXDR).toBe('AAAA');
  });

  it('generates a valid Playwright init script via createPlaywrightWalletScript()', () => {
    const script = createPlaywrightWalletScript({ publicKey: 'G123' });
    expect(script).toContain('window.freighter');
    expect(script).toContain('G123');
  });

  it('rejects only the first call when shouldReject is true in createPlaywrightWalletScript (#637)', async () => {
    const win: Record<string, any> = {};
    const script = createPlaywrightWalletScript({ publicKey: 'G123', shouldReject: true });
    new Function('window', script)(win);

    await expect(win.freighter.signTransaction('AAAA')).rejects.toThrow('User rejected request');
    await expect(win.freighter.signTransaction('AAAA')).resolves.toEqual({ signedXDR: 'AAAA' });
    await expect(win.freighter.getPublicKey()).resolves.toBe('G123');
  });

  it('honours rejectNextError in createPlaywrightWalletScript as a one-shot rejection (#637)', async () => {
    const win: Record<string, any> = {};
    const script = createPlaywrightWalletScript({
      publicKey: 'G123',
      rejectNextError: new Error('Custom rejection reason'),
    });
    new Function('window', script)(win);

    await expect(win.freighter.getPublicKey()).rejects.toThrow('Custom rejection reason');
    await expect(win.freighter.getPublicKey()).resolves.toBe('G123');
  });
});
