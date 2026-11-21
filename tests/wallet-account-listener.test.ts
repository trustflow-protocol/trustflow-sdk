import { connectWallet, disconnectWallet } from '../src/wallet/connect';

const KEY_A = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const KEY_B = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBGFR';

type Listener = (event: { source?: unknown; data?: unknown }) => void;

/** A fake `window` that tracks its `message` listeners like a browser would. */
function installWindow(getPublicKey: jest.Mock) {
  const listeners = new Set<Listener>();
  const win = {
    freighter: {
      getPublicKey,
      getNetwork: jest.fn().mockResolvedValue('TESTNET'),
      signTransaction: jest.fn(),
      signMessage: jest.fn(),
    },
    addEventListener: jest.fn((type: string, l: Listener) => {
      if (type === 'message') listeners.add(l);
    }),
    removeEventListener: jest.fn((type: string, l: Listener) => {
      if (type === 'message') listeners.delete(l);
    }),
    post(data: unknown) {
      for (const l of [...listeners]) l({ source: win, data });
    },
  };
  (globalThis as any).window = win;
  return { win, listeners };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(async () => {
  await disconnectWallet();
  delete (globalThis as any).window;
});

describe('connectWallet account-change listener (#737)', () => {
  it('leaves zero listeners after ten connect/disconnect cycles', async () => {
    const { listeners, win } = installWindow(jest.fn().mockResolvedValue(KEY_A));

    for (let i = 0; i < 10; i++) {
      await connectWallet('freighter', { onAccountChange: jest.fn() });
      expect(listeners.size).toBe(1);
      await disconnectWallet();
    }

    expect(listeners.size).toBe(0);
    expect(win.addEventListener).toHaveBeenCalledTimes(10);
    expect(win.removeEventListener).toHaveBeenCalledTimes(10);
  });

  it('replaces rather than stacks the listener when connecting again without disconnecting', async () => {
    const { listeners } = installWindow(jest.fn().mockResolvedValue(KEY_A));

    await connectWallet('freighter', { onAccountChange: jest.fn() });
    await connectWallet('freighter', { onAccountChange: jest.fn() });
    await connectWallet('freighter', { onAccountChange: jest.fn() });

    expect(listeners.size).toBe(1);
  });

  it('keeps a single listener when connect calls overlap, and none if disconnect wins the race', async () => {
    const { listeners } = installWindow(jest.fn().mockResolvedValue(KEY_A));

    await Promise.all([
      connectWallet('freighter', { onAccountChange: jest.fn() }),
      connectWallet('freighter', { onAccountChange: jest.fn() }),
    ]);
    expect(listeners.size).toBe(1);

    const pending = connectWallet('freighter', { onAccountChange: jest.fn() });
    await disconnectWallet();
    await pending;
    expect(listeners.size).toBe(0);
  });

  it('registers no listener when no onAccountChange is given', async () => {
    const { listeners } = installWindow(jest.fn().mockResolvedValue(KEY_A));

    await connectWallet('freighter');

    expect(listeners.size).toBe(0);
  });

  it('registers no listener when the connection fails', async () => {
    const { listeners } = installWindow(jest.fn().mockResolvedValue(''));

    await expect(connectWallet('freighter', { onAccountChange: jest.fn() })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(listeners.size).toBe(0);
  });

  it('reports a changed account once, and a disconnected handler never fires', async () => {
    const getPublicKey = jest.fn().mockResolvedValue(KEY_A);
    const { win } = installWindow(getPublicKey);
    const onAccountChange = jest.fn();

    await connectWallet('freighter', { onAccountChange });

    getPublicKey.mockResolvedValue(KEY_B);
    win.post({ source: 'FREIGHTER_EXTERNAL_MSG_RESPONSE' });
    await flush();
    win.post({ source: 'FREIGHTER_EXTERNAL_MSG_RESPONSE' });
    await flush();
    expect(onAccountChange).toHaveBeenCalledTimes(1);
    expect(onAccountChange).toHaveBeenCalledWith(KEY_B);

    await disconnectWallet();
    getPublicKey.mockResolvedValue(KEY_A);
    win.post({ source: 'FREIGHTER_EXTERNAL_MSG_RESPONSE' });
    await flush();
    expect(onAccountChange).toHaveBeenCalledTimes(1);
  });

  it('ignores messages that are not from Freighter', async () => {
    const getPublicKey = jest.fn().mockResolvedValue(KEY_A);
    const { win } = installWindow(getPublicKey);

    await connectWallet('freighter', { onAccountChange: jest.fn() });
    getPublicKey.mockClear();
    win.post({ source: 'some-other-extension' });
    win.post('plain string');
    await flush();

    expect(getPublicKey).not.toHaveBeenCalled();
  });
});
