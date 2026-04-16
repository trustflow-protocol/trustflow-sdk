// Hooks require a React environment — these are integration stubs
// Run with: jest --testEnvironment jsdom

describe('hook stubs', () => {
  it('useEscrow module exports correctly', () => {
    const mod = require('../src/hooks/useEscrow');
    expect(typeof mod.useEscrow).toBe('function');
  });
  it('useWallet module exports correctly', () => {
    const mod = require('../src/hooks/useWallet');
    expect(typeof mod.useWallet).toBe('function');
  });
  it('useTransaction module exports correctly', () => {
    const mod = require('../src/hooks/useTransaction');
    expect(typeof mod.useTransaction).toBe('function');
  });
});
