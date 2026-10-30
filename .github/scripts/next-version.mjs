#!/usr/bin/env node
// Pick the version to publish for a package.
//
// Usage:
//   node next-version.mjs <package.json> <published version|""> <auto|patch|minor|major> [--write]
//
// Rules:
//   - never published        -> use the local version as-is
//   - auto + local ahead     -> use the local version as-is (respect a manual bump)
//   - otherwise              -> bump the higher of local / published by the chosen type
//
// Prints the resulting version. With --write the package.json is updated too.

import { readFileSync, writeFileSync } from 'node:fs';

const [, , pkgPath, publishedArg, bump = 'auto', ...flags] = process.argv;
const write = flags.includes('--write');

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const parse = (value) => {
  const match = String(value ?? '')
    .trim()
    .replace(/^v/, '')
    .match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  return match ? match.slice(1, 4).map(Number) : null;
};

const compare = (a, b) => {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
};

if (!['auto', 'patch', 'minor', 'major'].includes(bump)) {
  fail(`Unknown bump type: ${bump}`);
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const local = parse(pkg.version);
if (!local) {
  fail(`Invalid version "${pkg.version}" in ${pkgPath}`);
}

const published = parse(publishedArg);
let next;

if (!published) {
  next = pkg.version;
} else if (bump === 'auto' && compare(local, published) > 0) {
  next = pkg.version;
} else {
  const [major, minor, patch] = compare(local, published) > 0 ? local : published;
  if (bump === 'major') next = `${major + 1}.0.0`;
  else if (bump === 'minor') next = `${major}.${minor + 1}.0`;
  else next = `${major}.${minor}.${patch + 1}`;
}

if (write && next !== pkg.version) {
  pkg.version = next;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

console.log(next);
