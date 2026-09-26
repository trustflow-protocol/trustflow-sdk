import { Address, nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk';
import { TrustFlowError } from '../errors';

/** Represents an input parameter in a Soroban function spec */
export interface SpecFunctionInput {
  name: string;
  doc: string;
  type: xdr.ScSpecTypeDef;
}

/** Represents a function spec entry in a Soroban contract ABI */
export interface SpecFunction {
  name: string;
  doc: string;
  inputs: SpecFunctionInput[];
  outputs: xdr.ScSpecTypeDef[];
}

/** Represents a field in a Soroban struct UDT spec */
export interface SpecStructField {
  name: string;
  doc: string;
  type: xdr.ScSpecTypeDef;
}

/** Represents a user-defined struct spec entry */
export interface SpecStruct {
  name: string;
  doc: string;
  lib: string;
  fields: SpecStructField[];
}

/** Represents an enum case in a Soroban enum UDT spec */
export interface SpecEnumCase {
  name: string;
  doc: string;
  value: number;
}

/** Represents a user-defined enum spec entry */
export interface SpecEnum {
  name: string;
  doc: string;
  lib: string;
  cases: SpecEnumCase[];
}

/** Represents a case in a Soroban union UDT spec */
export interface SpecUnionCase {
  name: string;
  doc: string;
  typeList?: xdr.ScSpecTypeDef[];
}

/** Represents a user-defined union spec entry */
export interface SpecUnion {
  name: string;
  doc: string;
  lib: string;
  cases: SpecUnionCase[];
}

/** Short, safe description of a value's type for error messages. */
function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'string') return `string ${JSON.stringify(value.slice(0, 40))}`;
  if (typeof value === 'bigint') return `bigint ${value}`;
  if (typeof value === 'object') return 'object';
  return `${typeof value} ${String(value)}`;
}

type IntegerScType =
  | 'u32'
  | 'i32'
  | 'u64'
  | 'i64'
  | 'timepoint'
  | 'duration'
  | 'u128'
  | 'i128'
  | 'u256'
  | 'i256';

interface IntegerSpec {
  /** `nativeToScVal` type name, also used as the expected type in error messages. */
  type: IntegerScType;
  min: bigint;
  max: bigint;
  /** 32-bit types are passed to `nativeToScVal` as a `number`, wider types as a `bigint`. */
  asNumber?: boolean;
}

const unsignedMax = (bits: bigint): bigint => 2n ** bits - 1n;
const signedMin = (bits: bigint): bigint => -(2n ** (bits - 1n));
const signedMax = (bits: bigint): bigint => 2n ** (bits - 1n) - 1n;

/** Integer-like spec types, keyed by `ScSpecType` name. */
const INTEGER_SPECS: Record<string, IntegerSpec> = {
  scSpecTypeU32: { type: 'u32', min: 0n, max: unsignedMax(32n), asNumber: true },
  scSpecTypeI32: { type: 'i32', min: signedMin(32n), max: signedMax(32n), asNumber: true },
  scSpecTypeU64: { type: 'u64', min: 0n, max: unsignedMax(64n) },
  scSpecTypeI64: { type: 'i64', min: signedMin(64n), max: signedMax(64n) },
  scSpecTypeTimepoint: { type: 'timepoint', min: 0n, max: unsignedMax(64n) },
  scSpecTypeDuration: { type: 'duration', min: 0n, max: unsignedMax(64n) },
  scSpecTypeU128: { type: 'u128', min: 0n, max: unsignedMax(128n) },
  scSpecTypeI128: { type: 'i128', min: signedMin(128n), max: signedMax(128n) },
  scSpecTypeU256: { type: 'u256', min: 0n, max: unsignedMax(256n) },
  scSpecTypeI256: { type: 'i256', min: signedMin(256n), max: signedMax(256n) },
};

/** Soroban symbols are 1-32 characters from `[A-Za-z0-9_]`. */
const SYMBOL_PATTERN = /^[A-Za-z0-9_]{1,32}$/;

function invalidValue(path: string, expected: string, val: unknown): TrustFlowError {
  return new TrustFlowError(
    `Invalid ${path}: expected ${expected}, got ${describeValue(val)}`,
    'INVALID_CONTRACT_CALL',
  );
}

/**
 * Accepts a `bigint`, a safe-integer `number` or a base-10 integer string and checks it against
 * the range of the spec type. Never coerces (`'abc'`, `1.5`, `NaN` and booleans are rejected).
 */
function parseInteger(val: unknown, path: string, spec: IntegerSpec): bigint {
  let big: bigint;
  if (typeof val === 'bigint') {
    big = val;
  } else if (typeof val === 'number') {
    if (!Number.isInteger(val)) throw invalidValue(path, `an integer (${spec.type})`, val);
    if (!Number.isSafeInteger(val)) {
      throw new TrustFlowError(
        `Invalid ${path}: ${val} exceeds Number.MAX_SAFE_INTEGER; pass a bigint or a numeric string for ${spec.type}`,
        'INVALID_CONTRACT_CALL',
      );
    }
    big = BigInt(val);
  } else if (typeof val === 'string' && /^-?\d+$/.test(val)) {
    big = BigInt(val);
  } else {
    throw invalidValue(path, `an integer (${spec.type}) as a number, bigint or numeric string`, val);
  }

  if (big < spec.min || big > spec.max) {
    throw new TrustFlowError(
      `Invalid ${path}: ${big} is outside the ${spec.type} range [${spec.min}, ${spec.max}]`,
      'INVALID_CONTRACT_CALL',
    );
  }
  return big;
}

/** Accepts a `Uint8Array`/`Buffer` or an even-length hex string; anything else is rejected. */
function parseBytes(val: unknown, path: string): Buffer {
  if (typeof val === 'string') {
    if (val.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(val)) {
      throw invalidValue(path, 'a hex string (even length, characters 0-9 a-f) or a Uint8Array', val);
    }
    return Buffer.from(val, 'hex');
  }
  if (val instanceof Uint8Array) {
    return Buffer.from(val);
  }
  throw invalidValue(path, 'a hex string or a Uint8Array', val);
}

/**
 * Parser and validator for Soroban Contract Specification (XDR spec entries).
 * Converts JavaScript values to/from Soroban `xdr.ScVal` types according to contract ABIs.
 */
export class SorobanSpec {
  readonly entries: xdr.ScSpecEntry[];
  readonly functions: Map<string, SpecFunction> = new Map();
  readonly structs: Map<string, SpecStruct> = new Map();
  readonly enums: Map<string, SpecEnum> = new Map();
  readonly unions: Map<string, SpecUnion> = new Map();

  /**
   * Constructs a new SorobanSpec parser.
   *
   * @param specEntries - Array of Soroban spec entries (XDR base64/hex strings, ScSpecEntry
   * objects, or Buffers). Entries from a second copy of `@stellar/stellar-sdk` are accepted
   * as long as they expose `toXDR()`.
   * @throws {TrustFlowError} `INVALID_CONTRACT_CALL` naming the index of any entry that is
   * not a supported type or cannot be decoded
   */
  constructor(specEntries: (xdr.ScSpecEntry | string | Uint8Array | Buffer)[]) {
    this.entries = this.parseEntries(specEntries);
    this.indexEntries();
  }

  private parseEntries(inputList: unknown[]): xdr.ScSpecEntry[] {
    const result: xdr.ScSpecEntry[] = [];
    inputList.forEach((item, index) => {
      try {
        result.push(SorobanSpec.parseEntry(item, index));
      } catch (err) {
        if (err instanceof TrustFlowError) throw err;
        throw new TrustFlowError(
          `Invalid spec entry at index ${index}: ${err instanceof Error ? err.message : String(err)}`,
          'INVALID_CONTRACT_CALL',
          err,
        );
      }
    });
    return result;
  }

  private static parseEntry(item: unknown, index: number): xdr.ScSpecEntry {
    if (item instanceof xdr.ScSpecEntry) {
      return item;
    }
    if (typeof item === 'string') {
      try {
        return xdr.ScSpecEntry.fromXDR(item, 'base64');
      } catch {
        return xdr.ScSpecEntry.fromXDR(item, 'hex');
      }
    }
    if (item instanceof Uint8Array || Buffer.isBuffer(item)) {
      return xdr.ScSpecEntry.fromXDR(Buffer.from(item));
    }
    if (
      typeof item === 'object' &&
      item !== null &&
      typeof (item as { toXDR?: unknown }).toXDR === 'function'
    ) {
      return xdr.ScSpecEntry.fromXDR(Buffer.from((item as { toXDR(): Uint8Array }).toXDR()));
    }
    throw new TrustFlowError(
      `Unsupported spec entry at index ${index}: expected an xdr.ScSpecEntry, a base64/hex string, ` +
        `a Uint8Array/Buffer or an object with toXDR(), got ${describeValue(item)}`,
      'INVALID_CONTRACT_CALL',
    );
  }

  private indexEntries(): void {
    for (const entry of this.entries) {
      const kind = entry.switch().name;
      if (kind === 'scSpecEntryFunctionV0') {
        const fn = entry.functionV0();
        const fnName = fn.name().toString();
        const specFn: SpecFunction = {
          name: fnName,
          doc: fn.doc().toString(),
          inputs: fn.inputs().map((i) => ({
            name: i.name().toString(),
            doc: i.doc().toString(),
            type: i.type(),
          })),
          outputs: fn.outputs(),
        };
        this.functions.set(fnName, specFn);
      } else if (kind === 'scSpecEntryUdtStructV0') {
        const st = entry.udtStructV0();
        const stName = st.name().toString();
        const specSt: SpecStruct = {
          name: stName,
          doc: st.doc().toString(),
          lib: st.lib().toString(),
          fields: st.fields().map((f) => ({
            name: f.name().toString(),
            doc: f.doc().toString(),
            type: f.type(),
          })),
        };
        this.structs.set(stName, specSt);
      } else if (kind === 'scSpecEntryUdtEnumV0') {
        const en = entry.udtEnumV0();
        const enName = en.name().toString();
        const specEn: SpecEnum = {
          name: enName,
          doc: en.doc().toString(),
          lib: en.lib().toString(),
          cases: en.cases().map((c) => ({
            name: c.name().toString(),
            doc: c.doc().toString(),
            value: c.value(),
          })),
        };
        this.enums.set(enName, specEn);
      } else if (kind === 'scSpecEntryUdtUnionV0') {
        const un = entry.udtUnionV0();
        const unName = un.name().toString();
        const specUn: SpecUnion = {
          name: unName,
          doc: un.doc().toString(),
          lib: un.lib().toString(),
          cases: un.cases().map((c) => {
            if (c.switch().name === 'scSpecUdtUnionCaseVoidV0') {
              const v = c.voidCase();
              return { name: v.name().toString(), doc: v.doc().toString() };
            }
            const t = c.tupleCase();
            return { name: t.name().toString(), doc: t.doc().toString(), typeList: t.type() };
          }),
        };
        this.unions.set(unName, specUn);
      }
    }
  }

  /**
   * Retrieves function spec for a given function name.
   *
   * @param name - Method name
   */
  getFunction(name: string): SpecFunction | undefined {
    return this.functions.get(name);
  }

  /**
   * Encodes JS function parameters into an array of Soroban `xdr.ScVal` objects.
   *
   * Arguments are validated, never coerced: a missing, misspelled or extra named argument, a
   * value of the wrong type or outside the spec type's range, malformed hex, a wrong `BytesN`
   * length or wrong tuple arity all raise a {@link TrustFlowError} naming the offending
   * parameter (for example `args.metadata[2]`). `Option<T>` parameters may be omitted.
   *
   * @param methodName - Method name defined in contract spec
   * @param args - Positional arguments array or object map of named parameters
   * @throws {TrustFlowError} `INVALID_CONTRACT_CALL` for an unknown method, a wrong argument
   * count, unknown or missing named arguments, or any argument that fails validation
   */
  encodeArgs(methodName: string, args: Record<string, unknown> | unknown[]): xdr.ScVal[] {
    const fnSpec = this.getFunction(methodName);
    if (!fnSpec) {
      throw new TrustFlowError(
        `Method '${methodName}' not found in Soroban contract spec`,
        'INVALID_CONTRACT_CALL',
      );
    }

    let argsArray: unknown[];
    if (Array.isArray(args)) {
      argsArray = args;
    } else if (typeof args === 'object' && args !== null) {
      const record = args as Record<string, unknown>;
      const expected = fnSpec.inputs.map((inp) => inp.name);
      const unknownKeys = Object.keys(record).filter((key) => !expected.includes(key));
      if (unknownKeys.length > 0) {
        throw new TrustFlowError(
          `Unknown argument(s) for method '${methodName}': ${unknownKeys
            .map((key) => `'${key}'`)
            .join(', ')}. Expected: ${expected.length > 0 ? expected.join(', ') : '(none)'}`,
          'INVALID_CONTRACT_CALL',
        );
      }
      argsArray = fnSpec.inputs.map((inp) => record[inp.name]);
    } else {
      throw new TrustFlowError(
        `Invalid arguments for method '${methodName}': expected array or object`,
        'INVALID_CONTRACT_CALL',
      );
    }

    if (argsArray.length !== fnSpec.inputs.length) {
      throw new TrustFlowError(
        `Method '${methodName}' expects ${fnSpec.inputs.length} arguments, got ${argsArray.length}`,
        'INVALID_CONTRACT_CALL',
      );
    }

    return fnSpec.inputs.map((inp, idx) =>
      this.valToScVal(argsArray[idx], inp.type, `args.${inp.name}`),
    );
  }

  /**
   * Converts a single JavaScript value into an `xdr.ScVal` matching the spec type definition.
   *
   * @param val - JavaScript value to encode
   * @param typeDef - Soroban spec type definition
   * @param path - Name of the value used in error messages (defaults to `value`); nested
   * values append `[index]`, `[key]` or `.field`
   * @throws {TrustFlowError} `INVALID_CONTRACT_CALL` if `val` is not a valid value of `typeDef`
   */
  valToScVal(val: unknown, typeDef: xdr.ScSpecTypeDef, path = 'value'): xdr.ScVal {
    try {
      return this.encodeValue(val, typeDef, path);
    } catch (err) {
      if (err instanceof TrustFlowError) throw err;
      throw new TrustFlowError(
        `Invalid ${path}: ${err instanceof Error ? err.message : String(err)}`,
        'INVALID_CONTRACT_CALL',
        err,
      );
    }
  }

  private encodeValue(val: unknown, typeDef: xdr.ScSpecTypeDef, path: string): xdr.ScVal {
    const kind = typeDef.switch().name;

    if (val === undefined && kind !== 'scSpecTypeOption' && kind !== 'scSpecTypeVoid') {
      throw new TrustFlowError(`Missing required argument ${path}`, 'INVALID_CONTRACT_CALL');
    }

    const intSpec = INTEGER_SPECS[kind];
    if (intSpec) {
      const big = parseInteger(val, path, intSpec);
      return nativeToScVal(intSpec.asNumber ? Number(big) : big, { type: intSpec.type });
    }

    switch (kind) {
      case 'scSpecTypeVal':
        return nativeToScVal(val);
      case 'scSpecTypeBool':
        if (typeof val !== 'boolean') throw invalidValue(path, 'a boolean', val);
        return nativeToScVal(val, { type: 'bool' });
      case 'scSpecTypeVoid':
        return xdr.ScVal.scvVoid();
      case 'scSpecTypeBytes':
      case 'scSpecTypeBytesN': {
        const bytes = parseBytes(val, path);
        if (kind === 'scSpecTypeBytesN') {
          const expectedLength = typeDef.bytesN().n();
          if (bytes.length !== expectedLength) {
            throw new TrustFlowError(
              `Invalid ${path}: expected exactly ${expectedLength} bytes, got ${bytes.length}`,
              'INVALID_CONTRACT_CALL',
            );
          }
        }
        return nativeToScVal(bytes, { type: 'bytes' });
      }
      case 'scSpecTypeString':
        if (typeof val !== 'string') throw invalidValue(path, 'a string', val);
        return nativeToScVal(val, { type: 'string' });
      case 'scSpecTypeSymbol':
        if (typeof val !== 'string' || !SYMBOL_PATTERN.test(val)) {
          throw invalidValue(
            path,
            'a symbol (1-32 characters from A-Z, a-z, 0-9 and _)',
            val,
          );
        }
        return nativeToScVal(val, { type: 'symbol' });
      case 'scSpecTypeAddress': {
        if (typeof val !== 'string') throw invalidValue(path, 'a Stellar address string', val);
        try {
          return new Address(val).toScVal();
        } catch (err) {
          throw new TrustFlowError(
            `Invalid ${path}: expected a valid Stellar address (G... account or C... contract), got ${describeValue(val)}`,
            'INVALID_CONTRACT_CALL',
            err,
          );
        }
      }
      case 'scSpecTypeOption': {
        if (val === null || val === undefined) {
          return xdr.ScVal.scvVoid();
        }
        const innerType = typeDef.option().valueType();
        return this.valToScVal(val, innerType, path);
      }
      case 'scSpecTypeVec': {
        if (!Array.isArray(val)) throw invalidValue(path, 'an array', val);
        const elemType = typeDef.vec().elementType();
        const converted = val.map((v, i) => this.valToScVal(v, elemType, `${path}[${i}]`));
        return xdr.ScVal.scvVec(converted);
      }
      case 'scSpecTypeMap': {
        const keyType = typeDef.map().keyType();
        const valType = typeDef.map().valueType();
        let pairs: [unknown, unknown][];
        if (val instanceof Map) {
          pairs = [...val.entries()];
        } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
          pairs = Object.entries(val);
        } else {
          throw invalidValue(path, 'a Map or an object', val);
        }
        const entries = pairs.map(
          ([k, v]) =>
            new xdr.ScMapEntry({
              key: this.valToScVal(k, keyType, `${path}.<key ${String(k)}>`),
              val: this.valToScVal(v, valType, `${path}[${String(k)}]`),
            }),
        );
        return xdr.ScVal.scvMap(entries);
      }
      case 'scSpecTypeTuple': {
        if (!Array.isArray(val)) throw invalidValue(path, 'an array', val);
        const types = typeDef.tuple().valueTypes();
        if (val.length !== types.length) {
          throw new TrustFlowError(
            `Invalid ${path}: expected a tuple of ${types.length} element(s), got ${val.length}`,
            'INVALID_CONTRACT_CALL',
          );
        }
        const converted = val.map((v, i) => this.valToScVal(v, types[i], `${path}[${i}]`));
        return xdr.ScVal.scvVec(converted);
      }
      case 'scSpecTypeUdt': {
        const udtName = typeDef.udt().name().toString();
        const structSpec = this.structs.get(udtName);
        if (structSpec) {
          if (typeof val !== 'object' || val === null || Array.isArray(val)) {
            throw invalidValue(path, `an object for struct ${udtName}`, val);
          }
          const record = val as Record<string, unknown>;
          const fieldNames = structSpec.fields.map((f) => f.name);
          const unknownKeys = Object.keys(record).filter((key) => !fieldNames.includes(key));
          if (unknownKeys.length > 0) {
            throw new TrustFlowError(
              `Invalid ${path}: unknown field(s) for struct ${udtName}: ${unknownKeys
                .map((key) => `'${key}'`)
                .join(', ')}. Expected: ${fieldNames.join(', ')}`,
              'INVALID_CONTRACT_CALL',
            );
          }
          const mapEntries = structSpec.fields.map(
            (field) =>
              new xdr.ScMapEntry({
                key: nativeToScVal(field.name, { type: 'symbol' }),
                val: this.valToScVal(record[field.name], field.type, `${path}.${field.name}`),
              }),
          );
          return xdr.ScVal.scvMap(mapEntries);
        }
        return nativeToScVal(val);
      }
      default:
        return nativeToScVal(val);
    }
  }

  /**
   * Decodes a returned `xdr.ScVal` into native JavaScript value.
   *
   * @param methodName - Function name defined in contract spec
   * @param scVal - ScVal returned from contract simulation or execution
   */
  decodeReturnValue(_methodName: string, scVal: xdr.ScVal): unknown {
    if (!scVal) return undefined;
    try {
      return scValToNative(scVal);
    } catch {
      return scVal;
    }
  }
}
