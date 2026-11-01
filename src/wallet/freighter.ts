import { TrustFlowError } from '../errors';

export interface FreighterWallet {
  isAvailable(): boolean;
  getPublicKey(): Promise<string>;
  signTransaction(xdr: string, opts: { network: string }): Promise<{ signedXDR: string }>;
  getNetwork(): Promise<string>;
  /**
   * Signs an arbitrary message (not a transaction) with the wallet's keypair.
   *
   * @param message - The message to sign as a UTF-8 string
   * @returns Base64-encoded ed25519 signature of the UTF-8 message bytes
   */
  signMessage(message: string): Promise<string>;
}

interface FreighterWindow {
  freighter?: {
    getPublicKey?(): Promise<string>;
    signTransaction?(xdr: string, opts: { network: string }): Promise<{ signedXDR: string }>;
    getNetwork?(): Promise<string>;
    signMessage?(message: string): Promise<string>;
  };
}

declare const window: FreighterWindow | undefined;

export function getFreighter(): FreighterWallet | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const w = window?.freighter;
  if (!w) {
    return null;
  }
  return {
    isAvailable: () => true,
    getPublicKey: () => {
      const fn = w.getPublicKey;
      // An older/incompatible Freighter extension may not expose this
      // method; feature-detect it rather than letting a raw TypeError
      // surface from calling it directly.
      if (typeof fn !== 'function') {
        throw TrustFlowError.unsupportedWalletVersion('Freighter', 'getPublicKey');
      }
      return fn();
    },
    signTransaction: (xdr, opts) => {
      const fn = w.signTransaction;
      if (typeof fn !== 'function') {
        throw TrustFlowError.unsupportedWalletVersion('Freighter', 'signTransaction');
      }
      return fn(xdr, opts);
    },
    getNetwork: () => {
      const fn = w.getNetwork;
      if (typeof fn !== 'function') {
        throw TrustFlowError.unsupportedWalletVersion('Freighter', 'getNetwork');
      }
      return fn();
    },
    signMessage: (message) => {
      const fn = w.signMessage;
      if (typeof fn !== 'function') {
        throw TrustFlowError.unsupportedWalletVersion('Freighter', 'signMessage');
      }
      return fn(message);
    },
  };
}

export async function isFreighterInstalled(): Promise<boolean> {
  if (typeof window === 'undefined') {
    return false;
  }
  await new Promise((r) => setTimeout(r, 100));
  return !!window?.freighter;
}
