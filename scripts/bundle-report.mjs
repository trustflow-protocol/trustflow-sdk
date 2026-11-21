// Bundle-size breakdown for the contract module (#736).
//
// Bundles a few partial-usage scenarios straight from `src/` with esbuild and
// reports, for each, the minified and brotli size plus how many of those bytes
// come from the Soroban spec machinery (spec.ts, bindings.ts, abstract.ts).
// Peer-weight dependencies (`@stellar/stellar-sdk`, `axios`, `zod`) are left
// external, matching the `ignore` lists in `.size-limit.json`, so the numbers
// are the SDK's own code only.
//
// Each scenario is measured twice:
//   current    — the source as it is
//   prototype  — `TrustFlowClient` without its `createContractBinding` method,
//                i.e. what apps would ship once that method is removed in
//                favour of the standalone `@trustflow/sdk/contract` export
//
// Usage: npm run size:report [-- --json]

import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = (p) => JSON.stringify(path.join(root, 'src', p));
const SPEC_MACHINERY = /src\/contract\/(spec|bindings|abstract)\.ts$/;

const SCENARIOS = {
  'TrustFlowClient (root)': `import { TrustFlowClient } from ${src('index.ts')}; console.log(TrustFlowClient);`,
  'TrustFlowEscrowClient (./escrow)': `import { TrustFlowEscrowClient } from ${src('escrow/index.ts')}; console.log(TrustFlowEscrowClient);`,
  'readContractState (./contract)': `import { readContractState } from ${src('contract/index.ts')}; console.log(readContractState);`,
  'invokeContract + readContractState (./contract)': `import { invokeContract, readContractState } from ${src('contract/index.ts')}; console.log(invokeContract, readContractState);`,
  'createContractBinding (./contract)': `import { createContractBinding } from ${src('contract/index.ts')}; console.log(createContractBinding);`,
};

/** Strips `TrustFlowClient.createContractBinding` and its runtime import from client.ts. */
function withoutClientBindingMethod() {
  return {
    name: 'without-client-binding-method',
    setup(b) {
      b.onLoad({ filter: /src[\\/]client\.ts$/ }, (args) => {
        let code = fs.readFileSync(args.path, 'utf8');
        code = code.replace(
          /import \{ createContractBinding, SorobanContractClient \} from '\.\/contract';/,
          "import type { SorobanContractClient } from './contract';",
        );
        const start = code.indexOf('  createContractBinding<');
        if (start === -1) throw new Error('createContractBinding method not found in client.ts');
        const end = code.indexOf('\n  }\n', start) + '\n  }\n'.length;
        return { contents: code.slice(0, start) + code.slice(end), loader: 'ts' };
      });
    },
  };
}

async function measure(entryCode, plugins) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-bundle-'));
  const entry = path.join(dir, 'entry.ts');
  fs.writeFileSync(entry, entryCode);
  try {
    const result = await build({
      entryPoints: [entry],
      bundle: true,
      minify: true,
      format: 'esm',
      platform: 'neutral',
      mainFields: ['module', 'main'],
      write: false,
      metafile: true,
      logLevel: 'silent',
      external: ['@stellar/stellar-sdk', 'axios', 'zod', 'http', 'https', 'node:*'],
      plugins,
    });
    const bytes = result.outputFiles[0].contents;
    const [output] = Object.values(result.metafile.outputs);
    const spec = Object.entries(output.inputs)
      .filter(([file]) => SPEC_MACHINERY.test(file))
      .reduce((total, [, info]) => total + info.bytesInOutput, 0);
    return { minified: bytes.length, brotli: zlib.brotliCompressSync(bytes).length, spec };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const rows = [];
for (const [name, code] of Object.entries(SCENARIOS)) {
  const current = await measure(code, []);
  const prototype = await measure(code, [withoutClientBindingMethod()]);
  rows.push({ name, current, prototype });
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  const pct = (a, b) => (a === 0 ? '—' : `${(((a - b) / a) * 100).toFixed(0)}%`);
  console.log(
    'Scenario | current min / brotli (spec share) | prototype min / brotli | saved (brotli)',
  );
  console.log('--- | --- | --- | ---');
  for (const { name, current: c, prototype: p } of rows) {
    console.log(
      `${name} | ${kb(c.minified)} / ${kb(c.brotli)} (${kb(c.spec)} spec, ${pct(c.minified, c.minified - c.spec)}) | ` +
        `${kb(p.minified)} / ${kb(p.brotli)} | ${pct(c.brotli, p.brotli)}`,
    );
  }
}
