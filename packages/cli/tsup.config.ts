import { defineConfig } from 'tsup';

/**
 * Bundles the CLI and its workspace packages into a single runnable file.
 * `better-sqlite3` stays external: it is a native module and must be installed
 * by the consumer's package manager.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['cjs'],
  platform: 'node',
  target: 'node20',
  clean: true,
  sourcemap: true,
  splitting: false,
  banner: { js: '#!/usr/bin/env node' },
  external: ['better-sqlite3'],
  noExternal: ['@crosssync/core', '@crosssync/shared', 'commander'],
});
