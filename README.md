# swiftbar-worktrees

A [SwiftBar](https://github.com/swiftbar/SwiftBar) plugin that lists every git worktree on your machine and shows which dev servers are actually running in them.

Git tells you which worktrees exist. `lsof` tells you which ports are open. Neither tells you *which worktree owns port 3000*. This plugin joins the two.

```
1/49
├─ Running
│   3010  client          → opens http://localhost:3010
│   3310  client
│   4020  client
└─ Worktrees
    client       1/16
    jira-kanban  0/21
    sio          0/9
```

## What it does

- Finds every repository under your project roots that has linked worktrees, and lists them grouped by repository.
- Maps each listening TCP port to the worktree that owns it, by resolving the listening process's working directory.
- Flags worktrees that claim the same dev port slot, so two checkouts never silently fight over a port.
- Opens a running port in the browser, or a worktree in your editor, with one click.
- Starts a dev server in that worktree, reading the scripts straight out of its `package.json`.
- Removes a worktree, or prunes stale registrations, from the menu.

## Install

Requires macOS, [SwiftBar](https://github.com/swiftbar/SwiftBar), node, git and lsof.

```sh
git clone https://github.com/munolee/swiftbar-worktrees.git
ln -s "$PWD/swiftbar-worktrees/worktrees.30s.mjs" ~/SwiftBarPlugins/worktrees.30s.mjs
```

Point SwiftBar at `~/SwiftBarPlugins` on first launch. The `30s` in the filename is the refresh interval; rename it to change how often it runs.

## Configure

Put a JSON file at `~/.config/swiftbar-worktrees.json`, using the lower case name of any variable below.

```json
{
  "editor": "cursor",
  "terminal": "iTerm",
  "roots": "~/projects:~/work"
}
```

Environment variables override the file, and both are optional.

| Variable | Default | Meaning |
| --- | --- | --- |
| `WORKTREES_ROOTS` | `~/projects` | Colon separated directories to scan for repositories |
| `WORKTREES_EDITOR` | `Visual Studio Code` | Application name used to open a worktree |
| `WORKTREES_TERMINAL` | `Terminal` | Application name used to open a shell |
| `WORKTREES_ICON` | `arrow.triangle.branch` | SF Symbol shown in the menu bar |
| `WORKTREES_SLOT_BASE` | `3000` | First port of the slot scheme, see below |
| `WORKTREES_SLOT_STEP` | `10` | Ports per slot |
| `WORKTREES_LANG` | system locale | `en` or `ko` |
| `WORKTREES_DEV_SCRIPTS` | `dev,start,serve` | Comma separated script names offered under Start |

Menu labels follow the macOS system language and fall back to English. Set `WORKTREES_LANG` to pin one.

SwiftBar launches plugins from the GUI session, so your shell profile is not read. Use the config file unless you export the variables into the login session yourself.

## Port slots

If your repository assigns each worktree a block of dev ports through a `DEV_PORT_OFFSET` entry in `.env.local`, this plugin reads it, shows the expected ports next to each worktree, and warns when two worktrees in the same repository claim the same slot.

```sh
# .env.local
DEV_PORT_OFFSET=1   # gateway 3010, and so on
```

If you do not use that convention the plugin simply omits the column.

## Starting a dev server

A worktree with a `package.json` gets a Start entry per matching script. Names listed in `WORKTREES_DEV_SCRIPTS` match exactly or with a `:` suffix, so `dev` and `dev:web` are offered while `dev-port` is not. The package manager comes from whichever lockfile is present.

The command runs in a terminal window so you can watch it and stop it with `⌃C`. SwiftBar decides which terminal application that is.

## Removing worktrees

The remove action runs `git worktree remove` **without** `--force`. Git refuses when the worktree has uncommitted changes or is locked, and the failure is shown in a dialog rather than swallowed. Nothing is deleted behind your back.

Stale registrations, worktrees whose directory is already gone, are cleaned with `git worktree prune` from the repository submenu.

## Performance

Repositories are filtered by checking for a non-empty `.git/worktrees` directory before any git process runs, so hundreds of repositories cost one directory read each. The slow part is resolving the working directory of every listening process, roughly two seconds on a busy machine. The default 30 second refresh keeps that comfortably in the background.

## License

MIT
