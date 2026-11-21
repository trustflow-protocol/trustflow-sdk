import { hash } from '@stellar/stellar-sdk';
import { TrustFlowClient } from '../client';
import type { ContractConfig } from '../types/contract';
import type {
  CastVoteParams,
  CastVoteResult,
  VoteChoice,
  VoteCommitment,
  RevealVoteResult,
  SubmitRevealParams,
  SubmitRevealResult,
  JurorClientOptions,
} from '../types/juror';
export type { JurorClientOptions } from '../types/juror';
import type { SDKResult } from '../types/index';

import { buildVoteArgs, buildRevealArgs } from '../contract/build';
import { invokeContract } from '../contract/invoke';
import { VoteSchema } from '../schemas';
import { TrustFlowError } from '../errors';
import { randomBytes } from '../utils/crypto';
import { isValidEscrowId, isValidStellarAddress } from '../utils/validation';

const VALID_CHOICES: VoteChoice[] = ['approve', 'reject', 'abstain'];

/**
 * Constructs a vote commitment matching the contracts/trustflow/src/lib.rs hash_vote
 * preimage specification: `sha256(vote_byte ++ 32_byte_salt)`.
 *
 * Note: Commit-reveal voting only supports binary decisions (true for depositor,
 * false for beneficiary) matching the contract `hash_vote` specification.
 * It cannot represent 'abstain'. Callers needing an 'abstain' vote must cast
 * a plaintext vote instead.
 *
 * @param voteForDepositor - true if voting in favour of depositor (1), false for beneficiary (0). Cannot be 'abstain'.
 * @param salt - Optional 32-byte cryptographically secure random salt. If omitted,
 *               32 cryptographically secure random bytes are automatically generated.
 * @returns VoteCommitment object containing commitment hash, salt, and encoded formats.
 */
export function createVoteCommitment(voteForDepositor: boolean, salt?: Uint8Array): VoteCommitment {
  if ((voteForDepositor as unknown) === 'abstain') {
    throw new TrustFlowError(
      "Commit-reveal voting does not support 'abstain'. Callers needing 'abstain' must cast a plaintext vote instead.",
      'VALIDATION_ERROR',
    );
  }

  if (typeof voteForDepositor !== 'boolean') {
    throw new TrustFlowError('voteForDepositor must be a boolean', 'VALIDATION_ERROR');
  }

  let finalSalt: Uint8Array;
  if (salt !== undefined) {
    if (!(salt instanceof Uint8Array) || salt.length !== 32) {
      throw new TrustFlowError('Salt must be exactly 32 bytes', 'VALIDATION_ERROR');
    }
    finalSalt = salt;
  } else {
    finalSalt = randomBytes(32);
  }

  const voteByte = voteForDepositor ? 1 : 0;
  const preimage = new Uint8Array(33);
  preimage[0] = voteByte;
  preimage.set(finalSalt, 1);

  const commitment = new Uint8Array(hash(Buffer.from(preimage)));
  const commitmentHex = Buffer.from(commitment).toString('hex');
  const saltHex = Buffer.from(finalSalt).toString('hex');
  const ciphertext = Buffer.from(commitment).toString('base64');

  return {
    commitment,
    salt: finalSalt,
    commitmentHex,
    saltHex,
    ciphertext,
    voteForDepositor,
  };
}

/**
 * Constructs a reveal payload and verifies the reconstructed commitment matching
 * the contract hash_vote specification: `sha256(vote_byte ++ 32_byte_salt)`.
 *
 * Note: Commit-reveal voting only supports binary decisions (true for depositor,
 * false for beneficiary) matching the contract `hash_vote` specification.
 * It cannot represent 'abstain'. Callers needing an 'abstain' vote must cast
 * a plaintext vote instead.
 *
 * @param voteForDepositor - The original vote choice (true for depositor, false for beneficiary). Cannot be 'abstain'.
 * @param salt - The 32-byte secret salt used during commitment creation
 * @returns RevealVoteResult containing the vote, salt, and verified commitment hash
 */
export function revealVote(voteForDepositor: boolean, salt: Uint8Array): RevealVoteResult {
  if ((voteForDepositor as unknown) === 'abstain') {
    throw new TrustFlowError(
      "Commit-reveal voting does not support 'abstain'. Callers needing 'abstain' must cast a plaintext vote instead.",
      'VALIDATION_ERROR',
    );
  }

  if (typeof voteForDepositor !== 'boolean') {
    throw new TrustFlowError('voteForDepositor must be a boolean', 'VALIDATION_ERROR');
  }
  if (!(salt instanceof Uint8Array) || salt.length !== 32) {
    throw new TrustFlowError('Salt must be exactly 32 bytes', 'VALIDATION_ERROR');
  }

  const voteByte = voteForDepositor ? 1 : 0;
  const preimage = new Uint8Array(33);
  preimage[0] = voteByte;
  preimage.set(salt, 1);

  const commitment = new Uint8Array(hash(Buffer.from(preimage)));
  const commitmentHex = Buffer.from(commitment).toString('hex');
  const saltHex = Buffer.from(salt).toString('hex');

  return {
    voteForDepositor,
    voteByte,
    salt,
    saltHex,
    commitment,
    commitmentHex,
  };
}

/**
 * Client for casting and revealing juror votes on TrustFlow disputes.
 *
 * Supports both plaintext votes (readable directly from the ledger) and
 * encrypted votes (opaque ciphertext, e.g. for a commit-reveal scheme) —
 * see `VotePayload` in `types/juror`.
 *
 * @example
 * ```typescript
 * const jurors = new JurorClient(contractConfig);
 * // 1. Commit phase: generate commitment and salt
 * const commitment = jurors.createVoteCommitment(true);
 *
 * // 2. Vote phase: cast encrypted vote with commitment ciphertext
 * const voteResult = await jurors.vote({
 *   disputeId: 'dsp-1',
 *   jurorAddress: 'GJUROR...',
 *   vote: { encrypted: true, ciphertext: commitment.ciphertext },
 * });
 * if (voteResult.ok) console.log('Voted! tx:', voteResult.data.txHash);
 *
 * // 3. Local verification: verify reveal payload matches commitment
 * const verified = jurors.revealVote(true, commitment.salt);
 *
 * // 4. Reveal phase: submit revealed vote on-chain
 * const revealResult = await jurors.submitReveal({
 *   disputeId: 'dsp-1',
 *   jurorAddress: 'GJUROR...',
 *   voteForDepositor: true,
 *   salt: commitment.salt,
 * });
 * if (revealResult.ok) console.log('Revealed! tx:', revealResult.data.txHash);
 * ```
 */

function resolveNodeCrypto(): any {
  try {
    const proc = typeof process !== 'undefined' ? (process as any) : undefined;
    if (typeof proc?.getBuiltinModule === 'function') {
      const builtin = proc.getBuiltinModule('crypto');
      if (builtin) return builtin;
    }
    const req = typeof require !== 'undefined' ? require : undefined;
    return req ? req('crypto') : undefined;
  } catch {
    return undefined;
  }
}

function normalizeAesKey(key: Uint8Array | string): Uint8Array {
  if (typeof key === 'string') {
    if (/^[0-9a-fA-F]{64}$/.test(key)) {
      return new Uint8Array(Buffer.from(key, 'hex'));
    }
    const nodeCrypto = resolveNodeCrypto();
    if (nodeCrypto?.createHash) {
      return new Uint8Array(nodeCrypto.createHash('sha256').update(key, 'utf8').digest());
    }
    const { hash: stellarHash } = require('@stellar/stellar-sdk');
    return new Uint8Array(stellarHash(Buffer.from(key, 'utf8')));
  }
  if (key instanceof Uint8Array && key.length === 32) {
    return key;
  }
  throw new TrustFlowError(
    'Encryption key must be a 32-byte Uint8Array, a 64-character hex string, or a passphrase string',
    'ENCRYPTION_ERROR',
  );
}

/**
 * Encrypts a juror vote choice using AES-256-GCM with a fresh cryptographically
 * secure 12-byte random IV per call (#745), returning a base64 payload encoding
 * `iv (12 bytes) || authTag (16 bytes) || ciphertext`.
 *
 * Because a new CSPRNG IV is drawn on every invocation, encrypting the same vote
 * choice twice with the same key always produces distinct ciphertexts.
 */
export function encryptVote(choice: VoteChoice | boolean, key: Uint8Array | string): string {
  const plaintext =
    typeof choice === 'boolean' ? (choice ? 'approve' : 'reject') : String(choice);
  if (!VALID_CHOICES.includes(plaintext as VoteChoice)) {
    throw new TrustFlowError(
      `vote choice must be one of: ${VALID_CHOICES.join(', ')}`,
      'VALIDATION_ERROR',
    );
  }
  const keyBytes = normalizeAesKey(key);
  const iv = randomBytes(12);
  const nodeCrypto = resolveNodeCrypto();
  if (!nodeCrypto?.createCipheriv) {
    throw new TrustFlowError('AES-256-GCM vote encryption is unavailable in this environment', 'ENCRYPTION_ERROR');
  }
  const cipher = nodeCrypto.createCipheriv('aes-256-gcm', Buffer.from(keyBytes), Buffer.from(iv));
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from(iv), tag, encrypted]).toString('base64');
}

/**
 * Decrypts a base64 vote ciphertext produced by {@link encryptVote} and verifies
 * its AES-256-GCM authentication tag (#745).
 */
export function decryptVote(ciphertextBase64: string, key: Uint8Array | string): VoteChoice {
  const keyBytes = normalizeAesKey(key);
  let raw: Buffer;
  try {
    raw = Buffer.from(ciphertextBase64, 'base64');
  } catch (e) {
    throw new TrustFlowError('Invalid base64 vote ciphertext', 'DECRYPTION_ERROR', e);
  }
  if (raw.length <= 28) {
    throw new TrustFlowError('Malformed vote ciphertext: payload too short', 'DECRYPTION_ERROR');
  }
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const nodeCrypto = resolveNodeCrypto();
  if (!nodeCrypto?.createDecipheriv) {
    throw new TrustFlowError('AES-256-GCM vote decryption is unavailable in this environment', 'DECRYPTION_ERROR');
  }
  try {
    const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', Buffer.from(keyBytes), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    if (!VALID_CHOICES.includes(plaintext as VoteChoice)) {
      throw new TrustFlowError(`Decrypted vote is not a valid choice: ${plaintext}`, 'DECRYPTION_ERROR');
    }
    return plaintext as VoteChoice;
  } catch (e) {
    if (e instanceof TrustFlowError) throw e;
    throw new TrustFlowError('Failed to decrypt vote ciphertext: authentication failed', 'DECRYPTION_ERROR', e);
  }
}

export class JurorClient {
  private readonly storedSalts = new Map<string, { salt: Uint8Array; expiresAt?: number }>();
  private _trustFlowClient?: TrustFlowClient;

  constructor(
    private readonly config: ContractConfig,
    private readonly options: JurorClientOptions = {},
  ) {
    const max = options.maxStoredSalts;
    if (max !== undefined && !(max === Infinity || (Number.isInteger(max) && max >= 0))) {
      throw new TrustFlowError(
        'maxStoredSalts must be a non-negative integer (0 retains no salts)',
        'VALIDATION_ERROR',
      );
    }
  }

  /**
   * Lazily builds (and caches) the {@link TrustFlowClient} used to submit
   * contract calls, sharing the same `contractId`/network/RPC settings this
   * `JurorClient` was constructed with.
   */
  private getTrustFlowClient(): TrustFlowClient {
    this._trustFlowClient ??= new TrustFlowClient({
      contractId: this.config.contractId,
      network: this.config.network,
      rpcUrl: this.config.rpcUrl,
      networkPassphrase: this.config.networkPassphrase,
      apiBaseUrl: this.config.apiBaseUrl,
      apiKey: this.config.apiKey,
      timeoutMs: this.config.timeoutMs,
    });
    return this._trustFlowClient;
  }

  /**
   * Constructs a vote commitment matching the contract hash_vote preimage layout:
   * `sha256(vote_byte ++ 32_byte_salt)`.
   * Securely generates a 32-byte random salt if not provided, and stores the salt
   * locally on this client instance for the subsequent reveal phase.
   *
   * Evicts expired salts if `saltTtlMs` is configured, and evicts oldest entries if
   * `maxStoredSalts` capacity limit is exceeded. When `maxStoredSalts` is 0,
   * the salt is returned to the caller but not stored.
   *
   * @param voteForDepositor - true for depositor (1), false for beneficiary (0)
   * @param salt - Optional 32-byte salt; generated automatically if omitted
   * @returns VoteCommitment with commitment hash, salt, and hex/base64 strings
   */
  createVoteCommitment(voteForDepositor: boolean, salt?: Uint8Array): VoteCommitment {
    const commitment = createVoteCommitment(voteForDepositor, salt);
    const key = commitment.commitmentHex;

    if (this.options.saltTtlMs !== undefined) {
      const now = Date.now();
      for (const [k, v] of this.storedSalts.entries()) {
        if (v.expiresAt !== undefined && v.expiresAt <= now) {
          this.storedSalts.delete(k);
        }
      }
    }

    if (this.options.maxStoredSalts === 0) {
      // Retain nothing: a limit of 0 means no salt may be kept.
      return commitment;
    }

    if (
      this.options.maxStoredSalts !== undefined &&
      this.options.maxStoredSalts > 0 &&
      this.storedSalts.size >= this.options.maxStoredSalts &&
      !this.storedSalts.has(key)
    ) {
      const oldestKey = this.storedSalts.keys().next().value;
      if (oldestKey !== undefined) {
        this.storedSalts.delete(oldestKey);
      }
    }

    const expiresAt =
      this.options.saltTtlMs !== undefined ? Date.now() + this.options.saltTtlMs : undefined;
    this.storedSalts.set(key, { salt: commitment.salt, expiresAt });
    return commitment;
  }

  /**
   * Reconstructs and verifies a juror's vote reveal payload matching the contract hash_vote preimage.
   *
   * @param voteForDepositor - Original vote choice
   * @param salt - 32-byte salt
   * @returns RevealVoteResult
   */
  revealVote(voteForDepositor: boolean, salt: Uint8Array): RevealVoteResult {
    return revealVote(voteForDepositor, salt);
  }

  /**
   * Retrieves a locally stored salt by commitment hash (Uint8Array or hex string).
   * Expired salts are evicted lazily upon read.
   *
   * @param commitment - The commitment hash Uint8Array or hex string
   * @returns The 32-byte salt if stored locally and not expired, or undefined
   */
  getStoredSalt(commitment: Uint8Array | string): Uint8Array | undefined {
    const key =
      typeof commitment === 'string'
        ? commitment.toLowerCase()
        : Buffer.from(commitment).toString('hex');
    const entry = this.storedSalts.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      this.storedSalts.delete(key);
      return undefined;
    }
    return entry.salt;
  }

  /**
   * Removes an individual locally stored salt by commitment hash (Uint8Array or hex string).
   *
   * @param commitment - The commitment hash Uint8Array or hex string
   * @returns true if an entry existed and was removed, false otherwise
   */
  removeStoredSalt(commitment: Uint8Array | string): boolean {
    const key =
      typeof commitment === 'string'
        ? commitment.toLowerCase()
        : Buffer.from(commitment).toString('hex');
    return this.storedSalts.delete(key);
  }

  /**
   * Clears all locally stored salts.
   */
  clearStoredSalts(): void {
    this.storedSalts.clear();
  }

  static createVoteCommitment(voteForDepositor: boolean, salt?: Uint8Array): VoteCommitment {
    return createVoteCommitment(voteForDepositor, salt);
  }

  static revealVote(voteForDepositor: boolean, salt: Uint8Array): RevealVoteResult {
    return revealVote(voteForDepositor, salt);
  }

  encryptVote(choice: VoteChoice | boolean, key: Uint8Array | string): string {
    return encryptVote(choice, key);
  }

  decryptVote(ciphertextBase64: string, key: Uint8Array | string): VoteChoice {
    return decryptVote(ciphertextBase64, key);
  }

  static encryptVote(choice: VoteChoice | boolean, key: Uint8Array | string): string {
    return encryptVote(choice, key);
  }

  static decryptVote(ciphertextBase64: string, key: Uint8Array | string): VoteChoice {
    return decryptVote(ciphertextBase64, key);
  }

  /**
   * Casts a juror's vote on a dispute via the TrustFlow contract.
   *
   * @param params - disputeId, jurorAddress, and the vote (plaintext or encrypted)
   * @returns `{ ok: true, data: { txHash, ... } }` on success, `{ ok: false, error }` on failure
   */
  async vote(params: CastVoteParams): Promise<SDKResult<CastVoteResult>> {
    const validation = VoteSchema.safeParse({
      disputeId: params.disputeId,
      jurorAddress: params.jurorAddress,
      vote: params.vote,
    });
    if (!validation.success) {
      const fieldErrors = Object.entries(validation.error.flatten().fieldErrors)
        .map(([field, msgs]) => `${field}: ${msgs?.join(', ')}`)
        .join('; ');
      return { ok: false, error: `Validation failed: ${fieldErrors}` };
    }

    if (!params.vote.encrypted && !VALID_CHOICES.includes(params.vote.choice as VoteChoice)) {
      return { ok: false, error: `vote.choice must be one of: ${VALID_CHOICES.join(', ')}` };
    }

    let args: unknown[];
    try {
      args = buildVoteArgs(params.disputeId, params.jurorAddress, params.vote);
    } catch (e) {
      return { ok: false, error: `Failed to encode vote arguments: ${String(e)}` };
    }

    const result = await invokeContract(
      this.getTrustFlowClient(),
      'cast_vote',
      args,
      params.jurorAddress,
    );
    if (!result.success) {
      return { ok: false, error: result.error ?? 'Vote submission failed' };
    }
    if (typeof result.txHash !== 'string' || !result.txHash) {
      return { ok: false, error: 'Vote submitted without a valid transaction hash' };
    }

    return {
      ok: true,
      data: {
        txHash: result.txHash,
        disputeId: params.disputeId,
        jurorAddress: params.jurorAddress,
        encrypted: params.vote.encrypted,
      },
    };
  }

  /**
   * Submits a juror's vote reveal on-chain via the TrustFlow contract.
   *
   * Encodes disputeId, jurorAddress, voteForDepositor, and salt as Soroban ScVal
   * call arguments and prepares the transaction.
   *
   * Note: Commit-reveal voting only supports binary decisions (true for depositor,
   * false for beneficiary). It cannot represent 'abstain'.
   *
   * @param params - disputeId, jurorAddress, voteForDepositor, and secret salt
   * @returns `{ ok: true, data: { txHash, ... } }` on success, `{ ok: false, error }` on failure
   */
  async submitReveal(params: SubmitRevealParams): Promise<SDKResult<SubmitRevealResult>>;
  async submitReveal(
    disputeId: string,
    jurorAddress: string,
    voteForDepositor: boolean,
    salt: Uint8Array | string,
  ): Promise<SDKResult<SubmitRevealResult>>;
  async submitReveal(
    paramsOrDisputeId: SubmitRevealParams | string,
    jurorAddress?: string,
    voteForDepositor?: boolean,
    salt?: Uint8Array | string,
  ): Promise<SDKResult<SubmitRevealResult>> {
    let p: SubmitRevealParams;
    if (typeof paramsOrDisputeId === 'object' && paramsOrDisputeId !== null) {
      p = paramsOrDisputeId;
    } else {
      p = {
        disputeId: paramsOrDisputeId,
        jurorAddress: jurorAddress!,
        voteForDepositor: voteForDepositor!,
        salt: salt!,
      };
    }

    if (!isValidEscrowId(p.disputeId)) {
      return { ok: false, error: 'disputeId is required' };
    }
    if (!isValidStellarAddress(p.jurorAddress)) {
      return {
        ok: false,
        error: `Invalid Stellar address for "jurorAddress": ${p.jurorAddress}`,
      };
    }
    if ((p.voteForDepositor as unknown) === 'abstain') {
      return {
        ok: false,
        error:
          "Commit-reveal voting does not support 'abstain'. Callers needing 'abstain' must cast a plaintext vote instead.",
      };
    }
    if (typeof p.voteForDepositor !== 'boolean') {
      return { ok: false, error: 'voteForDepositor must be a boolean' };
    }

    if (!p.salt) {
      return { ok: false, error: 'salt is required' };
    }
    if (typeof p.salt === 'string') {
      if (p.salt.length !== 64 || !/^[0-9a-fA-F]+$/.test(p.salt)) {
        return { ok: false, error: 'Salt must be exactly 32 bytes (64 hex characters)' };
      }
    } else if (p.salt instanceof Uint8Array) {
      if (p.salt.length !== 32) {
        return { ok: false, error: 'Salt must be exactly 32 bytes' };
      }
    } else {
      return { ok: false, error: 'Salt must be a 32-byte Uint8Array or 64-character hex string' };
    }

    let args: unknown[];
    try {
      args = buildRevealArgs(p.disputeId, p.jurorAddress, p.voteForDepositor, p.salt);
    } catch (e) {
      return { ok: false, error: `Failed to encode reveal arguments: ${String(e)}` };
    }

    const result = await invokeContract(
      this.getTrustFlowClient(),
      'reveal_vote',
      args,
      p.jurorAddress,
    );
    if (!result.success) {
      return { ok: false, error: result.error ?? 'Vote reveal submission failed' };
    }
    if (typeof result.txHash !== 'string' || !result.txHash) {
      return { ok: false, error: 'Vote reveal submitted without a valid transaction hash' };
    }

    return {
      ok: true,
      data: {
        txHash: result.txHash,
        disputeId: p.disputeId,
        jurorAddress: p.jurorAddress,
        voteForDepositor: p.voteForDepositor,
      },
    };
  }
}
