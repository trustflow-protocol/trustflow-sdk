import { Keypair } from '@stellar/stellar-sdk';
import { ProfileClient } from '../src/profile/client';

const ADDRESS = Keypair.random().publicKey();

const mockHttpGet = jest.fn();
const mockHttpPut = jest.fn();

jest.mock('../src/utils/http', () => ({
  createApiHttpClient: jest.fn(() => ({
    get: mockHttpGet,
    put: mockHttpPut,
  })),
  toApiErrorMessage: (error: unknown) =>
    error instanceof Error ? `Network error: ${error.message}` : `Network error: ${String(error)}`,
}));

describe('ProfileClient', () => {
  beforeEach(() => {
    mockHttpGet.mockReset();
    mockHttpPut.mockReset();
  });

  it('initialises with api url and token', () => {
    const client = new ProfileClient('http://api', 'tok');
    expect(client).toBeDefined();
  });

  describe('getProfile', () => {
    it('returns the profile for a valid address', async () => {
      mockHttpGet.mockResolvedValueOnce({
        data: { address: ADDRESS, displayName: 'Ada' },
      });

      const client = new ProfileClient('http://api', 'tok');
      const result = await client.getProfile(ADDRESS);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.displayName).toBe('Ada');
      }
      expect(mockHttpGet).toHaveBeenCalledWith(`/profiles/${ADDRESS}`);
    });

    it('rejects an invalid Stellar address without calling the API', async () => {
      const client = new ProfileClient('http://api', 'tok');
      const result = await client.getProfile('not-a-stellar-address');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/address/);
      }
      expect(mockHttpGet).not.toHaveBeenCalled();
    });

    it('returns an error result on network failure', async () => {
      mockHttpGet.mockRejectedValueOnce(new Error('connection reset'));

      const client = new ProfileClient('http://api', 'tok');
      const result = await client.getProfile(ADDRESS);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/Network error/);
      }
    });
  });

  describe('updateProfile', () => {
    it('updates the profile with the given fields', async () => {
      mockHttpPut.mockResolvedValueOnce({
        data: { address: ADDRESS, bio: 'Building on Stellar' },
      });

      const client = new ProfileClient('http://api', 'tok');
      const result = await client.updateProfile(ADDRESS, { bio: 'Building on Stellar' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.bio).toBe('Building on Stellar');
      }
      expect(mockHttpPut).toHaveBeenCalledWith(`/profiles/${ADDRESS}`, {
        bio: 'Building on Stellar',
      });
    });

    it('rejects an invalid Stellar address without calling the API', async () => {
      const client = new ProfileClient('http://api', 'tok');
      const result = await client.updateProfile('not-a-stellar-address', { bio: 'x' });

      expect(result.ok).toBe(false);
      expect(mockHttpPut).not.toHaveBeenCalled();
    });

    it('returns an error result on network failure', async () => {
      mockHttpPut.mockRejectedValueOnce(new Error('timeout'));

      const client = new ProfileClient('http://api', 'tok');
      const result = await client.updateProfile(ADDRESS, { bio: 'x' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/Network error/);
      }
    });
  });

  describe('constructor validation and overloads', () => {
    it('constructs from ContractConfig object', () => {
      const client = new ProfileClient({
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
        apiBaseUrl: 'http://api',
        apiKey: 'secret-token',
      });
      expect(client).toBeDefined();
    });

    it('throws INVALID_CONFIG if apiUrl is empty or whitespace', () => {
      expect(() => new ProfileClient('', 'token')).toThrow(
        expect.objectContaining({ code: 'INVALID_CONFIG' }),
      );
      expect(() => new ProfileClient('   ', 'token')).toThrow(
        expect.objectContaining({ code: 'INVALID_CONFIG' }),
      );
      expect(
        () =>
          new ProfileClient({
            contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
            apiBaseUrl: '',
            apiKey: 'token',
          }),
      ).toThrow(expect.objectContaining({ code: 'INVALID_CONFIG' }));
    });

    it('throws INVALID_CONFIG if token is empty or whitespace', () => {
      expect(() => new ProfileClient('http://api', '')).toThrow(
        expect.objectContaining({ code: 'INVALID_CONFIG' }),
      );
      expect(() => new ProfileClient('http://api', '   ')).toThrow(
        expect.objectContaining({ code: 'INVALID_CONFIG' }),
      );
      expect(
        () =>
          new ProfileClient({
            contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
            apiBaseUrl: 'http://api',
            apiKey: '',
          }),
      ).toThrow(expect.objectContaining({ code: 'INVALID_CONFIG' }));
    });
  });

  describe('updateProfile body validation', () => {
    it('rejects displayName exceeding 100 characters', async () => {
      const client = new ProfileClient('http://api', 'tok');
      const result = await client.updateProfile(ADDRESS, { displayName: 'a'.repeat(101) });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/displayName/);
      }
      expect(mockHttpPut).not.toHaveBeenCalled();
    });

    it('rejects bio exceeding 500 characters', async () => {
      const client = new ProfileClient('http://api', 'tok');
      const result = await client.updateProfile(ADDRESS, { bio: 'b'.repeat(501) });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/bio/);
      }
      expect(mockHttpPut).not.toHaveBeenCalled();
    });

    it('rejects malformed avatarUrl', async () => {
      const client = new ProfileClient('http://api', 'tok');
      const result = await client.updateProfile(ADDRESS, { avatarUrl: 'not-a-valid-url' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/avatarUrl/);
      }
      expect(mockHttpPut).not.toHaveBeenCalled();
    });

    it('accepts valid https and ipfs avatarUrl', async () => {
      mockHttpPut.mockResolvedValue({ data: { address: ADDRESS } });
      const client = new ProfileClient('http://api', 'tok');

      const res1 = await client.updateProfile(ADDRESS, {
        avatarUrl: 'https://example.com/avatar.png',
      });
      expect(res1.ok).toBe(true);

      const res2 = await client.updateProfile(ADDRESS, {
        avatarUrl: 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
      });
      expect(res2.ok).toBe(true);

      const res3 = await client.updateProfile(ADDRESS, {
        avatarUrl: 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
      });
      expect(res3.ok).toBe(true);

      const res4 = await client.updateProfile(ADDRESS, {
        avatarUrl: 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/avatar.png',
      });
      expect(res4.ok).toBe(true);
    });

    it('rejects ipfs avatarUrl values with a malformed CID (#623)', async () => {
      mockHttpPut.mockResolvedValue({ data: { address: ADDRESS } });
      const client = new ProfileClient('http://api', 'tok');

      for (const avatarUrl of [
        'ipfs://',
        'ipfs://x',
        'ipfs://not-a-real-cid',
        'ipfs://bafybeic5678',
        `ipfs://Qm${'1'.repeat(44)}`,
      ]) {
        const result = await client.updateProfile(ADDRESS, { avatarUrl });
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toMatch(/avatarUrl/);
        }
      }
      expect(mockHttpPut).not.toHaveBeenCalled();
    });
  });

  describe('profile cache', () => {
    it('serves getProfile from cache on second call without hitting the network', async () => {
      mockHttpGet.mockResolvedValueOnce({ data: { address: ADDRESS, displayName: 'Ada' } });

      const client = new ProfileClient('http://api', 'tok');
      const first = await client.getProfile(ADDRESS);
      const second = await client.getProfile(ADDRESS);

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (first.ok && second.ok) {
        expect(second.data.displayName).toBe('Ada');
      }
      // Only one network call despite two getProfile invocations
      expect(mockHttpGet).toHaveBeenCalledTimes(1);
    });

    it('getProfile after updateProfile returns updated data without an extra network call (regression #750)', async () => {
      mockHttpGet.mockResolvedValueOnce({ data: { address: ADDRESS, displayName: 'Old Name' } });
      mockHttpPut.mockResolvedValueOnce({ data: { address: ADDRESS, displayName: 'New Name' } });

      const client = new ProfileClient('http://api', 'tok');

      // Warm the cache
      const before = await client.getProfile(ADDRESS);
      expect(before.ok).toBe(true);
      if (before.ok) expect(before.data.displayName).toBe('Old Name');

      // Update — cache should be refreshed with the response
      const updated = await client.updateProfile(ADDRESS, { displayName: 'New Name' });
      expect(updated.ok).toBe(true);

      // Immediately read back — must reflect the new name, no additional GET
      const after = await client.getProfile(ADDRESS);
      expect(after.ok).toBe(true);
      if (after.ok) expect(after.data.displayName).toBe('New Name');

      expect(mockHttpGet).toHaveBeenCalledTimes(1);
      expect(mockHttpPut).toHaveBeenCalledTimes(1);
    });

    it('bypasses cache when profileCacheTtlMs is 0', async () => {
      mockHttpGet
        .mockResolvedValueOnce({ data: { address: ADDRESS, displayName: 'First' } })
        .mockResolvedValueOnce({ data: { address: ADDRESS, displayName: 'Second' } });

      const client = new ProfileClient('http://api', 'tok', { profileCacheTtlMs: 0 });
      await client.getProfile(ADDRESS);
      await client.getProfile(ADDRESS);

      expect(mockHttpGet).toHaveBeenCalledTimes(2);
    });
  });
});
