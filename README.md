# Open to Side

An Obsidian plugin that makes `Cmd+Alt+click` (`Ctrl+Alt+click` on Windows/Linux) open a link in
the **existing tab group to the right**, instead of creating a brand-new split every time.

Obsidian's native behaviour stacks up a new column on each click, so previewing a handful of
linked notes quickly shreds your layout. This keeps one side column and reuses it — closer to
Notion's side preview panel.

A new split is only created when there isn't a group to the right already.

## Install

Not yet in the community plugin directory. Until then:

- **BRAT** — install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin, then
  *Add beta plugin* with `joshsterckx/obsidian-open-to-side`.
- **Manually** — download `main.js` and `manifest.json` from the
  [latest release](https://github.com/joshsterckx/obsidian-open-to-side/releases/latest) into
  `<vault>/.obsidian/plugins/open-to-side/`, then enable it under Settings → Community plugins.

## Behaviour

- **Only the trigger click and the "Open link under cursor to the right" command are overridden.**
  The command (`Cmd+Option+Enter` by default) opens the link under the cursor in the side group, like
  the trigger click. The "Split right" command and other plugins' split-opens keep Obsidian's
  native behaviour.
- Works for links in Live Preview and Reading mode, and for the file explorer, search results and
  backlinks.
- Clicking from inside the side column opens there rather than chaining a third column.
- Pinned tabs are never replaced.

## Settings

| Setting | Default | Effect |
| --- | --- | --- |
| Trigger | `Cmd+Alt+click` | Which click opens a note in the side group. Also available: `Cmd+click`, `Cmd+Shift+click`, `Alt+click`, `Alt+Shift+click`, `Shift+click`. |
| Use for the keyboard command | On | Also sends Obsidian's "Open link under cursor to the right" command to the side group. Turn off to let it always create a new split. |
| Keep focus in the current note | On | Leaves the cursor where it was, so you can keep reading and previewing. Turn off to jump into the side pane. |
| Reuse the side tab | On | Replaces the side group's current tab, keeping it to a single preview. Turn off to open a new tab each time. |

Combos are matched exactly, so choosing `Alt+click` won't also fire on `Cmd+Alt+click`. Picking a
non-default trigger takes over whatever that combo normally does in Obsidian, and hands
`Cmd+Alt+click` back to its default of always opening a new split.

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

Every split-open funnels through `workspace.getLeaf("split")`, so the plugin patches that single
method rather than trying to intercept link clicks in the DOM — which would need separate handling
for Live Preview, Reading mode, the file explorer, search and backlinks.

To keep the override narrow, a capture-phase listener records whether a trigger click just happened
(it does not intercept), and the patch only redirects when that flag is fresh. The "Open link under
cursor to the right" command ends in the same `getLeaf("split")`, so the plugin wraps that command's
callback to set the same flag while it runs (not while Obsidian only checks whether it is available).

A custom trigger needs one more piece. Obsidian only produces `getLeaf("split")` for its own
`Cmd+Alt+click`, so a combo like plain `Alt+click` would never reach that patch. Obsidian asks the
public `Keymap.isModEvent` what a click means at each link-click site, so the plugin wraps it to
report `"split"` for the chosen combo — which means custom triggers go through Obsidian's own link
handling and keep working everywhere, with no DOM link parsing.

Live Preview needs one exception. Inside the editor, Alt and Shift already mean "rectangular
selection" and "extend selection", so Obsidian bails out of link handling for a plain Alt- or
Shift-click *before* it consults `isModEvent` — its gate is `Keymap.isModifier(evt, "Mod")`. The
plugin wraps that too, reporting `Mod` for the chosen combo, but only for clicks inside an editor,
since that is the only place the gate exists.

Resolving the target group uses some workspace internals that aren't in the public typings
(`children`, `parentSplit`, `leaf.parent`). Every read of them is guarded, so if a future Obsidian
release changes them the plugin falls back to native split behaviour instead of breaking link
opening.
