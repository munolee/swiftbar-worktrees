#!/bin/sh
':' //# ; exec "$(command -v node || ls -1 "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | tail -1)" "$0" "$@"

// <bitbar.title>Worktrees</bitbar.title>
// <bitbar.version>1.1</bitbar.version>
// <bitbar.author>munolee</bitbar.author>
// <bitbar.desc>git worktrees and live dev ports</bitbar.desc>
// <bitbar.dependencies>node,git,lsof</bitbar.dependencies>
// <bitbar.abouturl>https://github.com/munolee/swiftbar-worktrees</bitbar.abouturl>
// <bitbar.github>munolee</bitbar.github>

import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_PATH = join(homedir(), '.config', 'swiftbar-worktrees.json');
const config = (() => {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
})();

const usable = (value) => value !== undefined && String(value).trim() !== '';

// fallback may be a function, so an expensive default is only paid for when nothing is set
const env = (key, fallback) => {
  const fromEnv = process.env[`WORKTREES_${key}`];
  if (usable(fromEnv)) return fromEnv;
  const fromFile = config[key.toLowerCase()];
  if (usable(fromFile)) return String(fromFile);
  return typeof fallback === 'function' ? fallback() : fallback;
};

const ROOTS = env('ROOTS', join(homedir(), 'projects'))
  .split(':')
  .map((root) => root.replace(/^~/, homedir()));
const EDITOR = env('EDITOR', 'Visual Studio Code');
const TERMINAL = env('TERMINAL', 'Terminal');
const ICON = env('ICON', 'arrow.triangle.branch');
const SLOT_BASE = Number(env('SLOT_BASE', '3000'));
const SLOT_STEP = Number(env('SLOT_STEP', '10'));
const COLLAPSE = Number(env('COLLAPSE', '5'));
const HERE = dirname(realpathSync(process.argv[1]));
const REMOVE = join(HERE, 'worktree-remove.sh');
const START = join(HERE, 'dev-start.sh');
const COPY = join(HERE, 'copy-path.sh');
const SET = join(HERE, 'config-set.mjs');
const DEV_SCRIPTS = env('DEV_SCRIPTS', 'dev,start,serve').split(',');

const run = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
};

const LANG = env('LANG', () =>
  (run('defaults', ['read', '-g', 'AppleLocale']) || process.env.LANG || '').startsWith('ko')
    ? 'ko'
    : 'en',
);

const TEXT = {
  ko: {
    running: '열린 포트',
    none: '없음',
    others: '워크트리 밖',
    stop: '내리기',
    start: '띄우기',
    worktrees: '워크트리',
    prune: (count) => `등록만 남은 것 ${count}개 정리`,
    more: (count) => `그 외 ${count}개`,
    editor: '에디터',
    terminal: '터미널',
    finder: 'Finder',
    copy: '경로 복사',
    remove: '워크트리 지우기',
    removeAlso: (count) => `서버 ${count}개 같이 내림`,
    dirty: '작업 중',
    refresh: '새로고침',
    settings: '설정',
    language: '언어',
    system: '시스템 따름',
    icon: '아이콘',
    editorLabel: '에디터 앱',
    terminalLabel: '터미널 앱',
    rootsLabel: '찾을 폴더',
    openConfig: '설정 파일 열기',
  },
  en: {
    running: 'Open ports',
    none: 'none',
    others: 'Outside worktrees',
    stop: 'Stop',
    start: 'Start',
    worktrees: 'Worktrees',
    prune: (count) => `Prune ${count} stale`,
    more: (count) => `${count} more`,
    editor: 'Editor',
    terminal: 'Terminal',
    finder: 'Finder',
    copy: 'Copy path',
    remove: 'Remove worktree',
    removeAlso: (count) => `stops ${count} server`,
    dirty: 'uncommitted',
    refresh: 'Refresh',
    settings: 'Settings',
    language: 'Language',
    system: 'Follow system',
    icon: 'Icon',
    editorLabel: 'Editor app',
    terminalLabel: 'Terminal app',
    rootsLabel: 'Scan folders',
    openConfig: 'Open config file',
  },
};
const t = TEXT[LANG] ?? TEXT.en;

const repos = () =>
  ROOTS.flatMap((root) => {
    if (!existsSync(root)) return [];
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(root, entry.name))
      .filter((path) => {
        const linked = join(path, '.git', 'worktrees');
        return existsSync(linked) && readdirSync(linked).length > 0;
      });
  });

const slotOf = (path) => {
  const file = join(path, '.env.local');
  if (!existsSync(file)) return undefined;
  const found = /DEV_PORT_OFFSET=(\d+)/.exec(readFileSync(file, 'utf8'));
  return found ? Number(found[1]) : undefined;
};

const LOCKFILES = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
];

const devTasksOf = (path) => {
  const manifest = join(path, 'package.json');
  if (!existsSync(manifest)) return undefined;
  let scripts;
  try {
    scripts = Object.keys(JSON.parse(readFileSync(manifest, 'utf8')).scripts ?? {});
  } catch {
    return undefined;
  }
  const named = scripts.filter((name) =>
    DEV_SCRIPTS.some((want) => name === want || name.startsWith(`${want}:`)),
  );
  if (named.length === 0) return undefined;
  const found = LOCKFILES.find(([file]) => existsSync(join(path, file)));
  return { manager: found ? found[1] : 'npm', scripts: named };
};

// one `git worktree list` per repo, read for both the trees and the stale count
const inspect = (repo) => {
  const blocks = run('git', ['-C', repo, 'worktree', 'list', '--porcelain']).split('\n\n');
  const trees = blocks.flatMap((block) => {
    const path = /^worktree (.+)$/m.exec(block)?.[1];
    if (path === undefined || !existsSync(path)) return [];
    return [
      {
        repo: basename(repo),
        path,
        name: basename(path),
        branch: /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? '(detached)',
        head: /^HEAD (.+)$/m.exec(block)?.[1] ?? '',
        slot: slotOf(path),
        dev: devTasksOf(path),
        ports: [],
      },
    ];
  });
  return { trees, stale: blocks.filter((block) => /^prunable/m.test(block)).length };
};

const listeners = () => {
  const rows = [];
  let pid = '';
  for (const line of run('lsof', ['-nP', '-w', '-iTCP', '-sTCP:LISTEN', '-F', 'pn']).split('\n')) {
    if (line.startsWith('p')) pid = line.slice(1);
    else if (line.startsWith('n') && pid) {
      const port = Number(line.split(':').pop());
      if (Number.isFinite(port)) rows.push({ pid, port });
    }
  }
  return rows;
};

// one lsof for every listening pid at once, instead of one call per pid
const cwdsOf = (pids) => {
  const found = new Map();
  if (pids.length === 0) return found;
  const out = run('lsof', ['-a', '-w', '-p', pids.join(','), '-d', 'cwd', '-F', 'pn']);
  let pid = '';
  for (const line of out.split('\n')) {
    if (line.startsWith('p')) pid = line.slice(1);
    else if (line.startsWith('n') && pid) found.set(pid, line.slice(1));
  }
  return found;
};

const stampAll = (repo, trees) => {
  const heads = trees.map((tree) => tree.head).filter(Boolean);
  if (heads.length === 0) return;
  const lines = run('git', ['-C', repo, 'log', '--no-walk', '--format=%H %cr', ...heads]).split('\n');
  const when = new Map(
    lines.flatMap((line) => {
      const at = line.indexOf(' ');
      return at > 0 ? [[line.slice(0, at), line.slice(at + 1)]] : [];
    }),
  );
  for (const tree of trees) tree.when = when.get(tree.head) ?? '';
};

const found = repos();
const stale = new Map();
const all = found.flatMap((repo) => {
  const seen = inspect(repo);
  stale.set(repo, seen.stale);
  stampAll(repo, seen.trees);
  return seen.trees;
});
const byLength = [...all].sort((a, b) => b.path.length - a.path.length);

const exec = promisify(execFile);
await Promise.all(
  all.map(async (tree) => {
    try {
      const { stdout } = await exec(
        'git',
        ['-C', tree.path, 'status', '--porcelain', '--untracked-files=no'],
        { encoding: 'utf8' },
      );
      tree.dirty = stdout.trim() !== '';
    } catch {
      tree.dirty = false;
    }
  }),
);

const projectOf = (cwd) => {
  const root = ROOTS.find((dir) => cwd.startsWith(`${dir}/`));
  return root ? cwd.slice(root.length + 1).split('/')[0] : undefined;
};

const open = listeners();
const cwds = cwdsOf([...new Set(open.map((entry) => entry.pid))]);
const others = [];
for (const { pid, port } of open) {
  const cwd = cwds.get(pid);
  if (!cwd) continue;
  const owner = byLength.find((tree) => cwd === tree.path || cwd.startsWith(`${tree.path}/`));
  if (owner) {
    if (!owner.ports.some((entry) => entry.port === port)) owner.ports.push({ port, pid });
    continue;
  }
  // a server running under a scanned root that no worktree claims still deserves a line
  const project = projectOf(cwd);
  if (project && !others.some((entry) => entry.port === port)) others.push({ port, pid, project });
}

const clash = new Set();
const slots = new Map();
for (const tree of all) {
  if (tree.slot === undefined) continue;
  const key = `${tree.repo}:${tree.slot}`;
  if (slots.has(key)) {
    clash.add(tree.path);
    clash.add(slots.get(key));
  } else {
    slots.set(key, tree.path);
  }
}

const running = all.filter((tree) => tree.ports.length > 0);

// SwiftBar splits a menu line on spaces to read key=value, so a value holding a
// space has to be quoted or it gets cut at the first word
const arg = (value) => {
  const text = String(value);
  return /[\s"]/.test(text) ? `"${text.replaceAll('"', '')}"` : text;
};
const cmd = (command, ...args) =>
  `bash=${arg(command)} ${args.map((value, index) => `param${index + 1}=${arg(value)}`).join(' ')}`;
const shell = (command, ...args) => `${cmd(command, ...args)} terminal=false`;

const tint = clash.size > 0 ? ' sfcolor=#d97706' : '';
console.log(`${running.length}/${all.length}${clash.size > 0 ? ' ⚠' : ''} | sfimage=${ICON}${tint}`);
console.log('---');

console.log(`${t.running} | color=#888888`);
if (running.length === 0 && others.length === 0) {
  console.log(`${t.none} | color=#888888`);
}
for (const tree of running) {
  for (const { port, pid } of [...tree.ports].sort((a, b) => a.port - b.port)) {
    const where = tree.name === tree.repo ? tree.repo : `${tree.repo} / ${tree.name}`;
    console.log(`${port}  ${where} | href=http://localhost:${port}`);
    console.log(`-- ${tree.branch} | color=#888888`);
    console.log(`-- ${t.stop} (pid ${pid}) | ${shell('/bin/kill', pid)} refresh=true`);
  }
}
if (others.length > 0) {
  console.log(`${t.others} | color=#888888`);
  for (const { port, pid, project } of [...others].sort((a, b) => a.port - b.port)) {
    console.log(`${port}  ${project} | href=http://localhost:${port}`);
    console.log(`-- ${t.stop} (pid ${pid}) | ${shell('/bin/kill', pid)} refresh=true`);
  }
}

console.log('---');
console.log(`${t.worktrees} | color=#888888`);
const byRepo = new Map();
for (const tree of all) {
  byRepo.set(tree.repo, [...(byRepo.get(tree.repo) ?? []), tree]);
}
const repoPath = new Map(found.map((path) => [basename(path), path]));

const printTree = (tree, depth) => {
  const at = '-'.repeat(depth);
  const under = '-'.repeat(depth + 2);
  const dot = tree.ports.length > 0 ? '●' : '○';
  const mark = clash.has(tree.path) ? ' ⚠' : '';
  const slot =
    tree.slot === undefined ? '' : `  slot ${tree.slot} (${SLOT_BASE + tree.slot * SLOT_STEP})`;
  const dirty = tree.dirty ? ' ✳︎' : '';
  console.log(
    `${at} ${dot} ${tree.name}${dirty}${mark} | ${shell('/usr/bin/open', '-a', EDITOR, tree.path)}`,
  );
  console.log(`${under} ${tree.branch} | color=#888888`);
  console.log(`${under} ${tree.when}${slot}${tree.dirty ? `  ${t.dirty}` : ''} | color=#888888`);
  if (tree.dev) {
    for (const script of tree.dev.scripts) {
      console.log(
        `${under} ${t.start}: ${script} | ${cmd(START, tree.path, tree.dev.manager, script)} terminal=true`,
      );
    }
    console.log(`${under} ---`);
  }
  console.log(`${under} ${t.editor} | ${shell('/usr/bin/open', '-a', EDITOR, tree.path)}`);
  console.log(`${under} ${t.terminal} | ${shell('/usr/bin/open', '-a', TERMINAL, tree.path)}`);
  console.log(`${under} ${t.finder} | ${shell('/usr/bin/open', tree.path)}`);
  console.log(`${under} ${t.copy} | ${shell(COPY, tree.path)}`);
  if (tree.name !== tree.repo) {
    const pids = tree.ports.map((entry) => entry.pid);
    const notes = [tree.dirty ? t.dirty : '', pids.length > 0 ? t.removeAlso(pids.length) : '']
      .filter(Boolean)
      .join(', ');
    console.log(`${under} ---`);
    console.log(
      `${under} ${t.remove}${notes ? ` (${notes})` : ''} | ${shell(REMOVE, repoPath.get(tree.repo), tree.path, ...pids)} refresh=true`,
    );
  }
};

for (const [repo, trees] of [...byRepo].sort((a, b) => b[1].length - a[1].length)) {
  const live = trees.filter((tree) => tree.ports.length > 0).length;
  const warn = trees.some((tree) => clash.has(tree.path)) ? ' ⚠' : '';
  const dirtyCount = trees.filter((tree) => tree.dirty).length;
  const dead = stale.get(repoPath.get(repo)) ?? 0;
  const marks = [`${live}/${trees.length}`, dirtyCount > 0 ? `✳︎${dirtyCount}` : ''].filter(Boolean);
  console.log(`${repo}${warn}  ${marks.join('  ')}`);
  if (dead > 0) {
    console.log(
      `-- ${t.prune(dead)} | ${shell('/usr/bin/git', '-C', repoPath.get(repo), 'worktree', 'prune')} refresh=true`,
    );
    console.log('-- ---');
  }
  // a repo can hold dozens of worktrees, so only the ones asking for attention stay in the open
  const notable = (tree) => tree.ports.length > 0 || tree.dirty || tree.name === repo;
  const quiet = trees.filter((tree) => !notable(tree));
  for (const tree of trees.filter(notable)) printTree(tree, 2);
  if (quiet.length > COLLAPSE) {
    console.log(`-- ${t.more(quiet.length)}`);
    for (const tree of quiet) printTree(tree, 4);
  } else {
    for (const tree of quiet) printTree(tree, 2);
  }
}

const EDITOR_APPS = [
  'Cursor',
  'Visual Studio Code',
  'Zed',
  'Sublime Text',
  'WebStorm',
  'IntelliJ IDEA',
  'Nova',
  'Xcode',
];
const TERMINAL_APPS = ['Terminal', 'iTerm', 'Warp', 'Ghostty', 'Alacritty', 'kitty', 'WezTerm'];
const ICONS = [
  'arrow.triangle.branch',
  'square.stack.3d.up',
  'rectangle.3.group',
  'folder.badge.gearshape',
  'externaldrive.connected.to.line.below',
];

const installed = (names) =>
  names.filter((name) =>
    ['/Applications', join(homedir(), 'Applications')].some((dir) =>
      existsSync(join(dir, `${name}.app`)),
    ),
  );

const choice = (label, key, value, current) =>
  `---- ${label} | ${shell(SET, key, value)} refresh=true${current ? ' checked=true' : ''}`;

console.log('---');
console.log(t.settings);

console.log(`-- ${t.language}`);
console.log(choice(t.system, 'lang', '', config.lang === undefined));
console.log(choice('한국어', 'lang', 'ko', config.lang === 'ko'));
console.log(choice('English', 'lang', 'en', config.lang === 'en'));

console.log(`-- ${t.editorLabel}`);
for (const app of installed(EDITOR_APPS)) {
  console.log(choice(app, 'editor', app, EDITOR.toLowerCase() === app.toLowerCase()));
}

console.log(`-- ${t.terminalLabel}`);
for (const app of installed(TERMINAL_APPS)) {
  console.log(choice(app, 'terminal', app, TERMINAL.toLowerCase() === app.toLowerCase()));
}

console.log(`-- ${t.icon}`);
for (const name of ICONS) {
  console.log(`${choice(name, 'icon', name, ICON === name)} sfimage=${name}`);
}

console.log(`-- ${t.rootsLabel}: ${ROOTS.join(' ')} | ${shell(SET, 'roots', '--ask')} refresh=true`);
console.log(`-- ${t.openConfig} | ${shell('/usr/bin/open', '-t', CONFIG_PATH)}`);

console.log('---');
console.log(`${t.refresh} | refresh=true`);
