import { scValToNative, xdr } from '@stellar/stellar-sdk';
import { SorobanSpec } from '../src/contract/spec';
import { generateTypeScriptBindings } from '../src/contract/bindings';
import { TrustFlowError } from '../src/errors';

// Real `xdr` objects only — `@stellar/stellar-sdk` is intentionally not mocked
// here so these tests exercise the actual spec accessors.

const t = {
  u32: () => xdr.ScSpecTypeDef.scSpecTypeU32(),
  string: () => xdr.ScSpecTypeDef.scSpecTypeString(),
  timepoint: () => xdr.ScSpecTypeDef.scSpecTypeTimepoint(),
  duration: () => xdr.ScSpecTypeDef.scSpecTypeDuration(),
  u128: () => xdr.ScSpecTypeDef.scSpecTypeU128(),
  i128: () => xdr.ScSpecTypeDef.scSpecTypeI128(),
};

function voidCase(name: string): xdr.ScSpecUdtUnionCaseV0 {
  return xdr.ScSpecUdtUnionCaseV0.scSpecUdtUnionCaseVoidV0(
    new xdr.ScSpecUdtUnionCaseVoidV0({ doc: `${name} doc`, name }),
  );
}

function tupleCase(name: string, types: xdr.ScSpecTypeDef[]): xdr.ScSpecUdtUnionCaseV0 {
  return xdr.ScSpecUdtUnionCaseV0.scSpecUdtUnionCaseTupleV0(
    new xdr.ScSpecUdtUnionCaseTupleV0({ doc: `${name} doc`, name, type: types }),
  );
}

function unionEntry(name: string, cases: xdr.ScSpecUdtUnionCaseV0[]): xdr.ScSpecEntry {
  return xdr.ScSpecEntry.scSpecEntryUdtUnionV0(
    new xdr.ScSpecUdtUnionV0({ doc: 'a union', lib: 'lib', name, cases }),
  );
}

function fnEntry(
  name: string,
  inputs: { name: string; type: xdr.ScSpecTypeDef }[],
): xdr.ScSpecEntry {
  return xdr.ScSpecEntry.scSpecEntryFunctionV0(
    new xdr.ScSpecFunctionV0({
      doc: '',
      name,
      inputs: inputs.map(
        (i) => new xdr.ScSpecFunctionInputV0({ doc: '', name: i.name, type: i.type }),
      ),
      outputs: [],
    }),
  );
}

describe('SorobanSpec union types (#263)', () => {
  it('indexes a union with a void case and a tuple case', () => {
    const entry = unionEntry('Choice', [
      voidCase('None'),
      tupleCase('Some', [t.u32(), t.string()]),
    ]);

    const spec = new SorobanSpec([entry]);

    const union = spec.unions.get('Choice');
    expect(union).toBeDefined();
    expect(union?.doc).toBe('a union');
    expect(union?.lib).toBe('lib');
    expect(union?.cases.map((c) => c.name)).toEqual(['None', 'Some']);

    const [none, some] = union!.cases;
    expect(none.doc).toBe('None doc');
    expect(none.typeList).toBeUndefined();
    expect(some.doc).toBe('Some doc');
    expect(some.typeList?.map((ty) => ty.switch().name)).toEqual([
      'scSpecTypeU32',
      'scSpecTypeString',
    ]);
  });

  it('indexes unions alongside functions in the same spec', () => {
    const spec = new SorobanSpec([
      unionEntry('Choice', [voidCase('None')]),
      fnEntry('ping', []),
    ]);

    expect(spec.unions.has('Choice')).toBe(true);
    expect(spec.getFunction('ping')).toBeDefined();
  });

  it('round-trips a union entry supplied as a base64 string and as a Buffer', () => {
    const entry = unionEntry('Choice', [voidCase('None'), tupleCase('Some', [t.u32()])]);

    const fromBase64 = new SorobanSpec([entry.toXDR('base64')]);
    const fromBuffer = new SorobanSpec([entry.toXDR()]);

    expect(fromBase64.unions.get('Choice')?.cases.map((c) => c.name)).toEqual(['None', 'Some']);
    expect(fromBuffer.unions.get('Choice')?.cases.map((c) => c.name)).toEqual(['None', 'Some']);
  });
});

describe('SorobanSpec entry parsing (#263)', () => {
  const validEntry = () => fnEntry('ping', []);

  it.each<[string, unknown]>([
    ['a number', 42],
    ['a plain object', { name: 'ping' }],
    ['null', null],
    ['undefined', undefined],
    ['a boolean', true],
  ])('throws a TrustFlowError naming the index for %s', (_label, bad) => {
    let caught: unknown;
    try {
      new SorobanSpec([validEntry(), bad as never]);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(TrustFlowError);
    expect((caught as TrustFlowError).code).toBe('INVALID_CONTRACT_CALL');
    expect((caught as TrustFlowError).message).toContain('index 1');
  });

  it('wraps an undecodable string in a TrustFlowError naming the index', () => {
    let caught: unknown;
    try {
      new SorobanSpec(['not-valid-xdr']);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(TrustFlowError);
    expect((caught as TrustFlowError).code).toBe('INVALID_CONTRACT_CALL');
    expect((caught as TrustFlowError).message).toContain('index 0');
  });

  it('accepts a duck-typed entry that exposes toXDR() (e.g. from a second stellar-sdk copy)', () => {
    const real = validEntry();
    const foreign = { toXDR: () => real.toXDR() };

    const spec = new SorobanSpec([foreign as never]);

    expect(spec.getFunction('ping')).toBeDefined();
  });

  it('still accepts real ScSpecEntry objects, base64 strings, hex strings and Buffers', () => {
    const entry = validEntry();

    const spec = new SorobanSpec([
      entry,
      fnEntry('b64', []).toXDR('base64'),
      fnEntry('hex', []).toXDR('hex'),
      fnEntry('raw', []).toXDR(),
    ]);

    expect([...spec.functions.keys()]).toEqual(['ping', 'b64', 'hex', 'raw']);
  });
});

describe('SorobanSpec u128 / duration / timepoint encoding (#264)', () => {
  const spec = new SorobanSpec([
    fnEntry('schedule', [
      { name: 'at', type: t.timepoint() },
      { name: 'window', type: t.duration() },
      { name: 'amount', type: t.u128() },
    ]),
  ]);

  it('emits scvTimepoint, scvDuration and scvU128 for the three spec types', () => {
    const scVals = spec.encodeArgs('schedule', [5, 6, 7]);

    expect(scVals.map((v) => v.switch().name)).toEqual(['scvTimepoint', 'scvDuration', 'scvU128']);
  });

  it('encodes a u128 in [2^127, 2^128) without error and without losing precision', () => {
    for (const big of [2n ** 127n, 2n ** 127n + 12345n, 2n ** 128n - 1n]) {
      const [, , amount] = spec.encodeArgs('schedule', [1n, 1n, big]);

      expect(amount.switch().name).toBe('scvU128');
      expect(scValToNative(amount)).toBe(big);
    }
  });

  it('encodes each type through the named-argument form too', () => {
    const scVals = spec.encodeArgs('schedule', { at: 5n, window: 6n, amount: 7n });

    expect(scVals.map((v) => v.switch().name)).toEqual(['scvTimepoint', 'scvDuration', 'scvU128']);
  });

  it('still encodes i128 as scvI128', () => {
    const i128Spec = new SorobanSpec([fnEntry('f', [{ name: 'a', type: t.i128() }])]);

    expect(i128Spec.encodeArgs('f', [-5n])[0].switch().name).toBe('scvI128');
  });

  it('decodeReturnValue round-trips timepoint, duration and u128 values', () => {
    const values: [string, bigint][] = [
      ['scvTimepoint', 1_700_000_000n],
      ['scvDuration', 3_600n],
      ['scvU128', 2n ** 127n + 9n],
    ];
    const encoded = spec.encodeArgs('schedule', values.map(([, v]) => v));

    encoded.forEach((scVal, i) => {
      expect(scVal.switch().name).toBe(values[i][0]);
      expect(spec.decodeReturnValue('schedule', scVal)).toBe(values[i][1]);
    });
  });
});

describe('generateTypeScriptBindings timepoint mapping (#264)', () => {
  it('maps timepoint and duration arguments to bigint instead of unknown', () => {
    const code = generateTypeScriptBindings(
      [
        fnEntry('schedule', [
          { name: 'at', type: t.timepoint() },
          { name: 'window', type: t.duration() },
        ]),
      ],
      { className: 'ScheduleClient' },
    );

    expect(code).toContain('{ at: bigint; window: bigint }');
  });
});
