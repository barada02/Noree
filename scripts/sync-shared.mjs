#!/usr/bin/env node
// Copies shared/ into both apps. It is a copy, not an import, for two reasons: pm2 runs dist/main.js,
// which only stays at that path while everything compiled lives under back_end/src, and each app must
// resolve yjs from its own node_modules or the browser bundle gets two Yjs instances.
// The copies are git-ignored. Edit shared/ only. Pass --watch to keep copying during development.
import { cpSync, existsSync, rmSync, watch } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'shared');
const targets = [
  // Specs run in the backend (CI's npm test). The frontend's tsc has no vitest globals.
  { dir: join(root, 'back_end/src/shared'), specs: true },
  { dir: join(root, 'front_end/src/shared'), specs: false },
];

function sync() {
  for (const { dir, specs } of targets) {
    if (existsSync(dir)) rmSync(dir, { recursive: true });
    cpSync(source, dir, {
      recursive: true,
      filter: (file) => specs || !file.endsWith('.spec.ts'),
    });
  }
}

sync();

if (process.argv.includes('--watch')) {
  let timer;
  watch(source, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      sync();
      console.log('shared/ synced');
    }, 100);
  });
  console.log('watching shared/');
}
