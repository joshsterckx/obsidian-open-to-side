import { Command, Keymap, Plugin, Workspace, WorkspaceLeaf } from "obsidian";
import { around } from "monkey-around";
import { getActiveLeaf, resolveSideLeaf } from "./side-group";
import {
	DEFAULT_SETTINGS,
	OpenToSideSettingTab,
	OpenToSideSettings,
} from "./settings";
import { matchesTrigger } from "./trigger";

/**
 * How long after a trigger click a split request still counts as coming from that click.
 * Generous enough for the click handler to reach getLeaf, short enough that a stale flag can
 * never redirect an unrelated split later on.
 */
const CLICK_WINDOW_MS = 500;

/** Obsidian's built-in "Open link under cursor to the right" command. */
const SPLIT_COMMAND_ID = "editor:open-link-in-new-split";

type GetLeaf = Workspace["getLeaf"];
type IsModEvent = typeof Keymap.isModEvent;
type IsModifier = typeof Keymap.isModifier;
/** Keymap's statics, as a plain object shape so monkey-around can wrap them. */
interface KeymapStatics {
	isModEvent: IsModEvent;
	isModifier: IsModifier;
}

/** Whether a click landed inside a CodeMirror editor surface. */
function inEditor(evt: MouseEvent): boolean {
	return evt.target instanceof Element && !!evt.target.closest(".cm-editor");
}

export default class OpenToSidePlugin extends Plugin {
	settings: OpenToSideSettings = DEFAULT_SETTINGS;

	/** Timestamp of the last trigger click, or 0 once consumed. */
	private splitClickAt = 0;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new OpenToSideSettingTab(this.app, this));

		// Read through to the live settings on every click, so changing the trigger takes effect
		// without reloading the plugin.
		const matches = (evt: MouseEvent) => matchesTrigger(evt, this.settings.trigger);

		// Record trigger clicks without intercepting them. Obsidian resolves link clicks on
		// mousedown in some contexts and on click in others, so watch both, in the capture phase
		// so the flag is set before Obsidian's own handlers run.
		const record = (evt: MouseEvent) => {
			if (matches(evt)) this.splitClickAt = Date.now();
		};
		this.registerDomEvent(document, "mousedown", record, { capture: true });
		this.registerDomEvent(document, "click", record, { capture: true });

		// Obsidian asks isModEvent what a click means at every link-click site, then passes the
		// answer to getLeaf. Reporting "split" for the chosen combo is what lets a non-native
		// trigger like plain Alt+click work at all — and it does so through Obsidian's own link
		// handling, so notes, the file explorer, search and backlinks are all covered without
		// this plugin having to parse links out of the DOM itself.
		this.register(
			around(Keymap as unknown as KeymapStatics, {
				isModEvent:
					(next: IsModEvent): IsModEvent =>
					(evt?: Parameters<IsModEvent>[0]) => {
						if (evt instanceof MouseEvent && matches(evt)) return "split";
						return next.call(Keymap, evt);
					},

				// Live Preview refuses to treat a plain Alt- or Shift-click as a link click at
				// all: it bails out before ever asking isModEvent, because in the editor those
				// modifiers mean "rectangular selection" and "extend selection". The gate it
				// checks is isModifier(evt, "Mod"), so reporting Mod for the chosen combo is what
				// lets a non-Mod trigger work on wikilinks in the body of a note.
				//
				// Confined to clicks inside an editor, since that is the only place the gate
				// exists — elsewhere, claiming Mod is held could trigger unrelated behaviour like
				// multi-select in the file explorer.
				isModifier:
					(next: IsModifier): IsModifier =>
					(evt: Parameters<IsModifier>[0], modifier) => {
						if (
							modifier === "Mod" &&
							evt instanceof MouseEvent &&
							inEditor(evt) &&
							matches(evt)
						) {
							return true;
						}
						return next.call(Keymap, evt, modifier);
					},
			})
		);

		// The keyboard command ends in the same getLeaf("split") as the click, so arming the
		// flag while the command runs is all it takes to route it to the side group too.
		this.app.workspace.onLayoutReady(() => {
			this.patchSplitCommand();
		});

		const redirect = (paneType: unknown) => this.redirect(paneType);

		// Every split-open funnels through getLeaf("split"), which makes this the one place worth
		// patching to choose *where* the note lands.
		this.register(
			around(this.app.workspace, {
				// Typed loosely on purpose: getLeaf is overloaded, and the narrow overload would
				// drop the `direction` argument when passing through to Obsidian.
				getLeaf: (next: GetLeaf): GetLeaf =>
					function (this: Workspace, ...args: unknown[]): WorkspaceLeaf {
						return (
							redirect(args[0]) ??
							(next as (...a: unknown[]) => WorkspaceLeaf).apply(this, args)
						);
					},
			})
		);
	}

	async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as Partial<OpenToSideSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...stored };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * Returns the leaf a split request should be redirected into, or null to let Obsidian handle
	 * it natively. Null is the safe answer for anything unexpected — this runs inside a patched
	 * core method, so throwing here would break link opening across the whole vault.
	 */
	private redirect(paneType: unknown): WorkspaceLeaf | null {
		if (paneType !== "split") return null;
		if (!this.consumeSplitClick()) return null;

		try {
			const source = getActiveLeaf(this.app);
			const target =
				resolveSideLeaf(this.app, this.settings) ?? this.createSideColumn();
			if (!target) return null;

			// Nothing to wait for: the caller opens the file into the leaf we return, and the
			// reveal only has to bring its tab to the front of the group.
			void this.app.workspace.revealLeaf(target);

			if (this.settings.keepFocus && source) {
				// The caller focuses the leaf we return, so hand focus back afterwards.
				window.setTimeout(() => {
					this.app.workspace.setActiveLeaf(source, { focus: true });
				});
			}

			return target;
		} catch (error) {
			console.error("[open-to-side] falling back to a native split:", error);
			return null;
		}
	}

	/**
	 * Wrap the built-in split command so running it counts as a trigger. Only the executing call
	 * arms the flag, never the availability check (`checking === true`), so the command palette
	 * merely listing it cannot redirect an unrelated split. If the command is missing (desktop
	 * only, or renamed in a future version), it is left alone.
	 */
	private patchSplitCommand(): void {
		const command = this.app.commands?.commands?.[SPLIT_COMMAND_ID];
		if (!command) return;
		const arm = () => {
			if (this.settings.keyboardCommand) this.splitClickAt = Date.now();
		};
		type CheckCallback = NonNullable<Command["checkCallback"]>;
		type Callback = NonNullable<Command["callback"]>;
		const patches: Partial<Record<"checkCallback" | "callback", unknown>> = {};
		if (command.checkCallback) {
			patches.checkCallback = (next: CheckCallback): CheckCallback =>
				function (this: unknown, checking: boolean) {
					if (!checking) arm();
					return next.call(this, checking);
				};
		}
		if (command.callback) {
			patches.callback = (next: Callback): Callback =>
				function (this: unknown) {
					arm();
					return next.call(this) as unknown;
				};
		}
		this.register(around(command, patches as Parameters<typeof around<Command>>[1]));
	}

	/** True if a trigger click just happened. One-shot: the flag is cleared on read. */
	private consumeSplitClick(): boolean {
		const at = this.splitClickAt;
		this.splitClickAt = 0;
		return at !== 0 && Date.now() - at < CLICK_WINDOW_MS;
	}

	/** No group to the right yet — make one. */
	private createSideColumn(): WorkspaceLeaf | null {
		// Split from a main-area leaf rather than the active one, which may be in a sidebar.
		const anchor = this.app.workspace.getMostRecentLeaf(this.app.workspace.rootSplit);
		if (!anchor) return null;
		return this.app.workspace.createLeafBySplit(anchor, "vertical", false);
	}
}
