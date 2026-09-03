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
   * @param specEntries - Array of Soroban spec entries (XDR base64 strings, ScSpecEntry objects, or Buffers)
   */
  constructor(specEntries: (xdr.ScSpecEntry | string | Uint8Array | Buffer)[]) {
    this.entries = this.parseEntries(specEntries);
    this.indexEntries();
  }

  private parseEntries(
    inputList: (xdr.ScSpecEntry | string | Uint8Array | Buffer)[],
  ): xdr.ScSpecEntry[] {
    const result: xdr.ScSpecEntry[] = [];
    for (const item of inputList) {
      if (item instanceof xdr.ScSpecEntry) {
        result.push(item);
      } else if (typeof item === 'string') {
        try {
          result.push(xdr.ScSpecEntry.fromXDR(item, 'base64'));
        } catch {
          result.push(xdr.ScSpecEntry.fromXDR(item, 'hex'));
        }
      } else if (item instanceof Uint8Array || Buffer.isBuffer(item)) {
        result.push(xdr.ScSpecEntry.fromXDR(Buffer.from(item)));
      }
    }
    return result;
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
            const caseKind = c.switch().name;
            if (caseKind === 'scSpecUdtUnionCaseVoidV0') {
              const v = (c as any).voidV0();
              return { name: v.name().toString(), doc: v.doc().toString() };
            } else {
              const t = (c as any).tupleV0();
              return { name: t.name().toString(), doc: t.doc().toString(), typeList: t.typeList() };
            }
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
   * @param methodName - Method name defined in contract spec
   * @param args - Positional arguments array or object map of named parameters
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
      argsArray = fnSpec.inputs.map((inp) => (args as Record<string, unknown>)[inp.name]);
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

    return fnSpec.inputs.map((inp, idx) => this.valToScVal(argsArray[idx], inp.type));
  }

  /**
   * Converts a single JavaScript value into an `xdr.ScVal` matching the spec type definition.
   *
   * @param val - JavaScript value to encode
   * @param typeDef - Soroban spec type definition
   */
  valToScVal(val: unknown, typeDef: xdr.ScSpecTypeDef): xdr.ScVal {
    const kind = typeDef.switch().name;

    switch (kind) {
      case 'scSpecTypeVal':
        return nativeToScVal(val);
      case 'scSpecTypeBool':
        return nativeToScVal(Boolean(val), { type: 'bool' });
      case 'scSpecTypeVoid':
        return xdr.ScVal.scvVoid();
      case 'scSpecTypeU32':
        return nativeToScVal(Number(val), { type: 'u32' });
      case 'scSpecTypeI32':
        return nativeToScVal(Number(val), { type: 'i32' });
      case 'scSpecTypeU64':
        return nativeToScVal(BigInt(val as string | number | bigint), { type: 'u64' });
      case 'scSpecTypeI64':
        return nativeToScVal(BigInt(val as string | number | bigint), { type: 'i64' });
      case 'scSpecTypeTime' as any:
        return nativeToScVal(BigInt(val as string | number | bigint), { type: 'u64' });
      case 'scSpecTypeDuration':
        return nativeToScVal(BigInt(val as string | number | bigint), { type: 'u64' });
      case 'scSpecTypeU128':
        return nativeToScVal(BigInt(val as string | number | bigint), { type: 'i128' });
      case 'scSpecTypeI128':
        return nativeToScVal(BigInt(val as string | number | bigint), { type: 'i128' });
      case 'scSpecTypeU256':
        return nativeToScVal(BigInt(val as string | number | bigint), { type: 'u256' });
      case 'scSpecTypeI256':
        return nativeToScVal(BigInt(val as string | number | bigint), { type: 'i256' });
      case 'scSpecTypeBytes':
      case 'scSpecTypeBytesN':
        if (typeof val === 'string') {
          return nativeToScVal(Buffer.from(val, 'hex'), { type: 'bytes' });
        }
        return nativeToScVal(val, { type: 'bytes' });
      case 'scSpecTypeString':
        return nativeToScVal(String(val), { type: 'string' });
      case 'scSpecTypeSymbol':
        return nativeToScVal(String(val), { type: 'symbol' });
      case 'scSpecTypeAddress':
        return new Address(String(val)).toScVal();
      case 'scSpecTypeOption': {
        if (val === null || val === undefined) {
          return xdr.ScVal.scvVoid();
        }
        const innerType = typeDef.option().valueType();
        return this.valToScVal(val, innerType);
      }
      case 'scSpecTypeVec': {
        if (!Array.isArray(val)) {
          throw new TrustFlowError(`Expected array for vector argument`, 'INVALID_CONTRACT_CALL');
        }
        const elemType = typeDef.vec().elementType();
        const converted = val.map((v) => this.valToScVal(v, elemType));
        return xdr.ScVal.scvVec(converted);
      }
      case 'scSpecTypeMap': {
        const keyType = typeDef.map().keyType();
        const valType = typeDef.map().valueType();
        const entries: xdr.ScMapEntry[] = [];
        if (val instanceof Map) {
          for (const [k, v] of val.entries()) {
            entries.push(
              new xdr.ScMapEntry({
                key: this.valToScVal(k, keyType),
                val: this.valToScVal(v, valType),
              }),
            );
          }
        } else if (typeof val === 'object' && val !== null) {
          for (const [k, v] of Object.entries(val)) {
            entries.push(
              new xdr.ScMapEntry({
                key: this.valToScVal(k, keyType),
                val: this.valToScVal(v, valType),
              }),
            );
          }
        }
        return xdr.ScVal.scvMap(entries);
      }
      case 'scSpecTypeTuple': {
        if (!Array.isArray(val)) {
          throw new TrustFlowError(`Expected array for tuple argument`, 'INVALID_CONTRACT_CALL');
        }
        const types = typeDef.tuple().valueTypes();
        const converted = val.map((v, i) => this.valToScVal(v, types[i]));
        return xdr.ScVal.scvVec(converted);
      }
      case 'scSpecTypeUdt': {
        const udtName = typeDef.udt().name().toString();
        const structSpec = this.structs.get(udtName);
        if (structSpec && typeof val === 'object' && val !== null) {
          const mapEntries: xdr.ScMapEntry[] = [];
          for (const field of structSpec.fields) {
            const fieldValue = (val as Record<string, unknown>)[field.name];
            mapEntries.push(
              new xdr.ScMapEntry({
                key: nativeToScVal(field.name, { type: 'symbol' }),
                val: this.valToScVal(fieldValue, field.type),
              }),
            );
          }
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
