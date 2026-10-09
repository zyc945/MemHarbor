import { build } from 'esbuild';
await build({ entryPoints: ['src/local/main.ts'], outfile: 'dist/local/main.mjs', bundle: true,
  platform: 'node', format: 'esm', target: 'node22', packages: 'external', logLevel: 'info' });
