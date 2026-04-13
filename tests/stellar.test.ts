import { isValidStellarAddress, isValidContractId } from '../src/utils/validate';

describe('address validation', () => {
  it('accepts valid G address', () => {
    expect(isValidStellarAddress('GBAB2222222222222222222222222222222222222222222222222222222222')).toBe(true);
  });
  it('rejects short address', () => {
    expect(isValidStellarAddress('GABCD')).toBe(false);
  });
  it('accepts valid C contract', () => {
    expect(isValidContractId('CTEST000000000000000000000000000000000000000000000000000000')).toBe(true);
  });
});
