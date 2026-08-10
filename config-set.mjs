#!/bin/sh
':' //# ; exec "$(command -v node || ls -1 "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | tail -1)" "$0" "$@"

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const PATH_TO_CONFIG = join(homedir(), '.config', 'swiftbar-worktrees.json');
const [key, value] = process.argv.slice(2);

if (!key) process.exit(1);

const read = () => {
  if (!existsSync(PATH_TO_CONFIG)) return {};
  try {
    return JSON.parse(readFileSync(PATH_TO_CONFIG, 'utf8'));
  } catch {
    return {};
  }
};

const ask = (current) => {
  const script = `display dialog "Value for ${key}" default answer "${current ?? ''}" buttons {"Cancel", "OK"} default button "OK"`;
  try {
    const out = execFileSync('osascript', ['-e', script], { encoding: 'utf8' });
    return /text returned:(.*)$/.exec(out.trim())?.[1] ?? '';
  } catch {
    return undefined;
  }
};

const config = read();
const next = value === '--ask' ? ask(config[key]) : value;

if (next === undefined) process.exit(0);
if (next === '') delete config[key];
else config[key] = next;

mkdirSync(dirname(PATH_TO_CONFIG), { recursive: true });
writeFileSync(PATH_TO_CONFIG, `${JSON.stringify(config, null, 2)}\n`);
