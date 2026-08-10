#!/bin/sh
':' //# ; exec "$(command -v node || ls -1 "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | tail -1)" "$0" "$@"

// <bitbar.title>Worktrees</bitbar.title>
// <bitbar.version>1.0</bitbar.version>
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

const env = (key, fallback) => {
  const fromEnv = process.env[`WORKTREES_${key}`];
  if (usable(fromEnv)) return fromEnv;
  const fromFile = config[key.toLowerCase()];
  return usable(fromFile) ? String(fromFile) : fallback;
};

const ROOTS = env('ROOTS', join(homedir(), 'projects'))
  .split(':')
  .map((root) => root.replace(/^~/, homedir()));
const EDITOR = env('EDITOR', 'Visual Studio Code');
const TERMINAL = env('TERMINAL', 'Terminal');
const ICON = env('ICON', 'arrow.triangle.branch');
const SLOT_BASE = Number(env('SLOT_BASE', '3000'));
const SLOT_STEP = Number(env('SLOT_STEP', '10'));
const HERE = dirname(realpathSync(process.argv[1]));
const REMOVE = join(HERE, 'worktree-remove.sh');
const START = join(HERE, 'dev-start.sh');
const SET = join(HERE, 'config-set.mjs');
const DEV_SCRIPTS = env('DEV_SCRIPTS', 'dev,start,serve').split(',');

const run = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
};

const LANG = env(
  'LANG',
  (run('defaults', ['read', '-g', 'AppleLocale']) || process.env.LANG || '').startsWith('ko')
    ? 'ko'
    : 'en',
);

const TEXT = {
  ko: {
    running: '열린 포트',
    none: '없음',
    stop: '내리기',
    start: '띄우기',
    worktrees: '워크트리',
    prune: (count) => `등록만 남은 것 ${count}개 정리`,
    editor: '에디터',
    terminal: '터미널',
    finder: 'Finder',
    copy: '경로 복사',
    remove: '워크트리 지우기',
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
    stop: 'Stop',
    start: 'Start',
    worktrees: 'Worktrees',
    prune: (count) => `Prune ${count} stale`,
    editor: 'Editor',
    terminal: 'Terminal',
    finder: 'Finder',
    copy: 'Copy path',
    remove: 'Remove worktree',
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

const prunableOf = (repo) =>
  run('git', ['-C', repo, 'worktree', 'list', '--porcelain'])
    .split('\n\n')
    .filter((block) => /^prunable/m.test(block)).length;

const worktreesOf = (repo) =>
  run('git', ['-C', repo, 'worktree', 'list', '--porcelain'])
    .split('\n\n')
    .flatMap((block) => {
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

const cwdOf = (() => {
  const cache = new Map();
  return (pid) => {
    if (!cache.has(pid)) {
      const line = run('lsof', ['-a', '-w', '-p', pid, '-d', 'cwd', '-F', 'n'])
        .split('\n')
        .find((entry) => entry.startsWith('n'));
      cache.set(pid, line ? line.slice(1) : '');
    }
    return cache.get(pid);
  };
})();

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
const stale = new Map(found.map((repo) => [repo, prunableOf(repo)]));
const all = found.flatMap((repo) => {
  const trees = worktreesOf(repo);
  stampAll(repo, trees);
  return trees;
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

for (const { pid, port } of listeners()) {
  const cwd = cwdOf(pid);
  if (!cwd) continue;
  const owner = byLength.find((tree) => cwd === tree.path || cwd.startsWith(`${tree.path}/`));
  if (owner && !owner.ports.some((entry) => entry.port === port)) {
    owner.ports.push({ port, pid });
  }
}

const clash = new Set();
const seen = new Map();
for (const tree of all) {
  if (tree.slot === undefined) continue;
  const key = `${tree.repo}:${tree.slot}`;
  if (seen.has(key)) {
    clash.add(tree.path);
    clash.add(seen.get(key));
  } else {
    seen.set(key, tree.path);
  }
}

const running = all.filter((tree) => tree.ports.length > 0);
const shell = (cmd, ...args) =>
  `bash=${cmd} ${args.map((arg, index) => `param${index + 1}=${arg}`).join(' ')} terminal=false`;
const copy = (text) =>
  shell('/usr/bin/osascript', '-e', `set the clipboard to "${text.replaceAll('"', '')}"`);

const tint = clash.size > 0 ? ' sfcolor=#d97706' : '';
console.log(
  `${running.length}/${all.length}${clash.size > 0 ? ' ⚠' : ''} | sfimage=${ICON}${tint}`,
);
console.log('---');

console.log(`${t.running} | color=#888888`);
if (running.length === 0) {
  console.log(`${t.none} | color=#888888`);
}
for (const tree of running) {
  for (const { port, pid } of [...tree.ports].sort((a, b) => a.port - b.port)) {
    const where = tree.name === tree.repo ? tree.repo : `${tree.repo} / ${tree.name}`;
    console.log(`${port}  ${where} | href=http://localhost:${port}`);
    console.log(`-- ${tree.branch} | color=#888888`);
    console.log(`-- ${t.stop} (pid ${pid}) | bash=/bin/kill param1=${pid} terminal=false refresh=true`);
  }
}

console.log('---');
console.log(`${t.worktrees} | color=#888888`);
const byRepo = new Map();
for (const tree of all) {
  byRepo.set(tree.repo, [...(byRepo.get(tree.repo) ?? []), tree]);
}
const repoPath = new Map(found.map((path) => [basename(path), path]));
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
  for (const tree of trees) {
    const dot = tree.ports.length > 0 ? '●' : '○';
    const mark = clash.has(tree.path) ? ' ⚠' : '';
    const slot =
      tree.slot === undefined ? '' : `  slot ${tree.slot} (${SLOT_BASE + tree.slot * SLOT_STEP})`;
    const dirty = tree.dirty ? ' ✳︎' : '';
    console.log(
      `-- ${dot} ${tree.name}${dirty}${mark} | ${shell('/usr/bin/open', '-a', EDITOR, tree.path)}`,
    );
    console.log(`---- ${tree.branch} | color=#888888`);
    console.log(`---- ${tree.when}${slot}${tree.dirty ? `  ${t.dirty}` : ''} | color=#888888`);
    if (tree.dev) {
      for (const script of tree.dev.scripts) {
        console.log(
          `---- ${t.start}: ${script} | bash=${START} param1=${tree.path} param2=${tree.dev.manager} param3=${script} terminal=true`,
        );
      }
      console.log('---- ---');
    }
    console.log(`---- ${t.editor} | ` + shell('/usr/bin/open', '-a', EDITOR, tree.path));
    console.log(`---- ${t.terminal} | ` + shell('/usr/bin/open', '-a', TERMINAL, tree.path));
    console.log(`---- ${t.finder} | ` + shell('/usr/bin/open', tree.path));
    console.log(`---- ${t.copy} | ` + copy(tree.path));
    if (tree.name !== tree.repo) {
      console.log('---- ---');
      console.log(
        `---- ${t.remove}${tree.dirty ? ` (${t.dirty})` : ''} | ${shell(REMOVE, repoPath.get(tree.repo), tree.path)} refresh=true`,
      );
    }
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
