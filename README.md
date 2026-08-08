# Open to Side

An Obsidian plugin that makes `Cmd+Alt+click` (`Ctrl+Alt+click` on Windows/Linux) open a link in
the **existing tab group to the right**, instead of creating a brand-new split every time.

Obsidian's native behaviour stacks up a new column on each click, so previewing a handful of
linked notes quickly shreds your layout. This keeps one side column and reuses it — closer to
Notion's side preview panel.

A new split is only created when there isn't a group to the right already.

## Behaviour

- **Only `Cmd+Alt+click` is overridden.** The "Split right" command and other plugins' split-opens
  keep Obsidian's native behaviour.
- Works for links in Live Preview and Reading mode, and for the file explorer, search results and
  backlinks.
- Clicking from inside the side column opens there rather than chaining a third column.
- Pinned tabs are never replaced.

## Settings

| Setting | Default | Effect |
| --- | --- | --- |
| Keep focus in the current note | On | Leaves the cursor where it was, so you can keep reading and previewing. Turn off to jump into the side pane. |
| Reuse the side tab | On | Replaces the side group's current tab, keeping it to a single preview. Turn off to open a new tab each time. |

## Development

```bash
npm install
npm run dev          # watch build
npm run build        # typecheck + production build
npm run install-local  # copy main.js + manifest.json into the vault
```

`install-local` defaults to `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Vault`.
Point it elsewhere with `VAULT=/path/to/vault npm run install-local`.

## How it works

Every `Cmd+Alt+click` funnels through `workspace.getLeaf("split")`, so the plugin patches that
single method rather than trying to intercept link clicks in the DOM — which would need separate
handling for Live Preview, Reading mode, the file explorer, search and backlinks.

To keep the override narrow, a capture-phase listener records whether a mod+alt click just
happened (it does not intercept), and the patch only redirects when that flag is fresh.

Resolving the target group uses some workspace internals that aren't in the public typings
(`children`, `parentSplit`, `leaf.parent`). Every read of them is guarded, so if a future Obsidian
release changes them the plugin falls back to native split behaviour instead of breaking link
opening.
