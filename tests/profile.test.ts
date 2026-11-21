import { Keypair } from '@stellar/stellar-sdk';
import { ProfileClient } from '../src/profile/client';

const ADDRESS = Keypair.random().publicKey();

const mockHttpGet = jest.fn();
const mockHttpPut = jest.fn();
const mockHttpPost = jest.fn();

jest.mock('../src/utils/http', () => ({
  createApiHttpClient: jest.fn(() => ({
    get: mockHttpGet,
    put: mockHttpPut,
    post: mockHttpPost,
  })),
  toApiErrorMessage: (error: unknown) =>
    error instanceof Error ? `Network error: ${error.message}` : `Network error: ${String(error)}`,
}));

describe('ProfileClient', () => {
  beforeEach(() => {
    mockHttpGet.mockReset();
    mockHttpPut.mockReset();
    mockHttpPost.mockReset();
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

  // ── searchProfiles (#751) ─────────────────────────────────────────────────
  describe('searchProfiles', () => {
    it('returns search results for a plain query', async () => {
      mockHttpGet.mockResolvedValueOnce({ data: [{ address: ADDRESS, displayName: 'Alice' }] });

      const client = new ProfileClient('http://api', 'tok');
      const result = await client.searchProfiles({ q: 'Alice' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data[0].displayName).toBe('Alice');
      }
    });

    it('URL-encodes & in the query so it does not split into a second parameter', async () => {
      mockHttpGet.mockResolvedValueOnce({ data: [] });

      const client = new ProfileClient('http://api', 'tok');
      await client.searchProfiles({ q: 'name&tag=x' });

      const calledUrl: string = mockHttpGet.mock.calls[0][0];
      // The raw '&' must be percent-encoded; the word 'tag' must NOT appear as
      // a separate query key.
      expect(calledUrl).toContain('q=name%26tag%3Dx');
      expect(calledUrl).not.toMatch(/[?&]tag=/);
    });

    it("URL-encodes O'Brien (apostrophe)", async () => {
      mockHttpGet.mockResolvedValueOnce({ data: [] });

      const client = new ProfileClient('http://api', 'tok');
      await client.searchProfiles({ q: "O'Brien" });

      const calledUrl: string = mockHttpGet.mock.calls[0][0];
      expect(calledUrl).toContain("O%27Brien");
    });

    it('URL-encodes # in the query', async () => {
      mockHttpGet.mockResolvedValueOnce({ data: [] });

      const client = new ProfileClient('http://api', 'tok');
      await client.searchProfiles({ q: 'tag#1' });

      const calledUrl: string = mockHttpGet.mock.calls[0][0];
      expect(calledUrl).toContain('tag%231');
    });

    it('URL-encodes + in the query', async () => {
      mockHttpGet.mockResolvedValueOnce({ data: [] });

      const client = new ProfileClient('http://api', 'tok');
      await client.searchProfiles({ q: 'a+b' });

      const calledUrl: string = mockHttpGet.mock.calls[0][0];
      expect(calledUrl).toContain('a%2Bb');
    });

    it('URL-encodes non-ASCII characters', async () => {
      mockHttpGet.mockResolvedValueOnce({ data: [] });

      const client = new ProfileClient('http://api', 'tok');
      await client.searchProfiles({ q: 'Ólafur' });

      const calledUrl: string = mockHttpGet.mock.calls[0][0];
      // 'Ó' encodes to %C3%93
      expect(calledUrl).toContain('%C3%93');
    });

    it('appends optional limit and offset parameters', async () => {
      mockHttpGet.mockResolvedValueOnce({ data: [] });

      const client = new ProfileClient('http://api', 'tok');
      await client.searchProfiles({ q: 'alice', limit: 10, offset: 20 });

      const calledUrl: string = mockHttpGet.mock.calls[0][0];
      expect(calledUrl).toContain('limit=10');
      expect(calledUrl).toContain('offset=20');
    });

    it('returns an error result when q is empty', async () => {
      const client = new ProfileClient('http://api', 'tok');
      const result = await client.searchProfiles({ q: '' });

      expect(result.ok).toBe(false);
      expect(mockHttpGet).not.toHaveBeenCalled();
    });

    it('returns an error result on network failure', async () => {
      mockHttpGet.mockRejectedValueOnce(new Error('timeout'));

      const client = new ProfileClient('http://api', 'tok');
      const result = await client.searchProfiles({ q: 'alice' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/Network error/);
      }
    });
  });
});
