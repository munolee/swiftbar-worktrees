# swiftbar-worktrees

A [SwiftBar](https://github.com/swiftbar/SwiftBar) plugin that lists every git worktree on your machine and shows which dev servers are actually running in them.

Git tells you which worktrees exist. `lsof` tells you which ports are open. Neither tells you *which worktree owns port 3000*. This plugin joins the two.

```
2/50
─────────────────────────────
Open ports
  3010  client                    → opens http://localhost:3010
  3310  client
  4020  client
─────────────────────────────
Worktrees
  client        1/16  ✳︎6         → grouped by repository
  jira-kanban   0/21
  sio           0/9
─────────────────────────────
Settings
Refresh
```

`1/16` is running servers over worktrees. `✳︎6` counts the ones holding uncommitted work.

## What it does

- Finds every repository under your project roots that has linked worktrees, and lists them grouped by repository.
- Maps each listening TCP port to the worktree that owns it, by resolving the listening process's working directory.
- Marks worktrees holding uncommitted work with `✳︎`, so you can see what is safe to remove before you remove it.
- Flags worktrees that claim the same dev port slot, so two checkouts never silently fight over a port.
- Opens a running port in the browser, or a worktree in your editor, with one click.
- Starts a dev server in that worktree, reading the scripts straight out of its `package.json`.
- Stops a server by its pid, removes a worktree, or prunes stale registrations, all from the menu.

## Install

Requires macOS, [SwiftBar](https://github.com/swiftbar/SwiftBar), node, git and lsof.

```sh
git clone https://github.com/munolee/swiftbar-worktrees.git
mkdir -p ~/SwiftBarPlugins
ln -s "$PWD/swiftbar-worktrees/worktrees.30s.mjs" ~/SwiftBarPlugins/worktrees.30s.mjs
```

Point SwiftBar at `~/SwiftBarPlugins` on first launch. The `30s` in the filename is the refresh interval; rename it to change how often it runs.

## Settings

Everything is in the Settings submenu. Language, menu bar icon, editor and terminal are pick lists, and only the editors and terminals actually installed on the machine are offered. Scan folders opens a text prompt.

Settings write to `~/.config/swiftbar-worktrees.json`, so you can edit that directly instead.

```json
{
  "editor": "Cursor",
  "terminal": "iTerm",
  "roots": "~/projects:~/work"
}
```

Environment variables override the file, and both are optional.

| Variable | Config key | Default | Meaning |
| --- | --- | --- | --- |
| `WORKTREES_ROOTS` | `roots` | `~/projects` | Colon separated directories to scan for repositories |
| `WORKTREES_EDITOR` | `editor` | `Visual Studio Code` | Application opened for a worktree |
| `WORKTREES_TERMINAL` | `terminal` | `Terminal` | Application opened for a shell |
| `WORKTREES_ICON` | `icon` | `arrow.triangle.branch` | SF Symbol shown in the menu bar |
| `WORKTREES_LANG` | `lang` | system locale | `en` or `ko` |
| `WORKTREES_DEV_SCRIPTS` | `dev_scripts` | `dev,start,serve` | Script names offered under Start |
| `WORKTREES_SLOT_BASE` | `slot_base` | `3000` | First port of the slot scheme, see below |
| `WORKTREES_SLOT_STEP` | `slot_step` | `10` | Ports per slot |

SwiftBar launches plugins from the GUI session, so your shell profile is never read. Use the menu or the config file unless you export variables into the login session yourself.

## Port slots

If your repository gives each worktree a block of dev ports through a `DEV_PORT_OFFSET` entry in `.env.local`, the plugin reads it, shows the expected ports next to each worktree, and warns with `⚠` when two worktrees in the same repository claim the same slot.

```sh
# .env.local
DEV_PORT_OFFSET=1   # gateway 3010, and so on
```

Without that convention the column is simply omitted.

## Starting a dev server

A worktree with a `package.json` gets a Start entry per matching script. Names match exactly or with a `:` suffix, so `dev` and `dev:web` are offered while `dev-port` is not. The package manager comes from whichever lockfile is present.

The command runs in a terminal window so you can watch it and stop it with `⌃C`.

## Removing worktrees

The remove action runs `git worktree remove` **without** `--force`. Git refuses when the worktree has uncommitted changes or is locked, and the reason is shown in a dialog rather than swallowed. A confirmation dialog comes first, and the main checkout of a repository never gets the action at all.

Worktrees whose directory is already gone are cleaned with `git worktree prune` from the repository submenu.

## Performance

Repositories are filtered by checking for a non-empty `.git/worktrees` directory before any git process runs, so hundreds of repositories cost one directory read each. Roughly three seconds on a machine with 50 worktrees and a busy process table, most of it spent resolving the working directory of every listening process. The uncommitted check runs in parallel and adds well under a second. The default 30 second refresh keeps all of that in the background.

## License

MIT
