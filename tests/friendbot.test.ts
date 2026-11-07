import { fundTestnetAccount } from '../src/stellar/account';
import { TrustFlowError } from '../src/errors';

const VALID_ADDRESS = 'GBAB222222222222222222222222222222222222222222222222222A';

describe('fundTestnetAccount', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('funds a new testnet account and returns alreadyFunded: false', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ hash: 'tx-friendbot-123' }),
    } as unknown as Response);

    const result = await fundTestnetAccount(VALID_ADDRESS);
    expect(result).toEqual({
      address: VALID_ADDRESS,
      alreadyFunded: false,
      hash: 'tx-friendbot-123',
    });
  });

  it('treats createAccountAlreadyExist (HTTP 400) as success with alreadyFunded: true', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers(),
      text: async () =>
        JSON.stringify({
          status: 400,
          detail: 'createAccountAlreadyExist',
          extras: { result_codes: { operations: ['op_already_exists'] } },
        }),
    } as unknown as Response);

    const result = await fundTestnetAccount(VALID_ADDRESS);
    expect(result).toEqual({
      address: VALID_ADDRESS,
      alreadyFunded: true,
    });
  });

  it('throws TrustFlowError on non-already-funded 400 errors', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers(),
      text: async () => JSON.stringify({ detail: 'op_malformed' }),
    } as unknown as Response);

    await expect(
      fundTestnetAccount(VALID_ADDRESS, { retry: { maxRetries: 0 } }),
    ).rejects.toThrow(TrustFlowError);
  });
});
