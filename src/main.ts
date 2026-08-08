import { Keymap, PaneType, Plugin, Workspace, WorkspaceLeaf } from "obsidian";
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

type GetLeaf = Workspace["getLeaf"];
type IsModEvent = typeof Keymap.isModEvent;
/** Keymap's statics, as a plain object shape so monkey-around can wrap them. */
type KeymapStatics = { isModEvent: IsModEvent };

export default class OpenToSidePlugin extends Plugin {
	settings: OpenToSideSettings = DEFAULT_SETTINGS;

	/** Timestamp of the last trigger click, or 0 once consumed. */
	private splitClickAt = 0;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new OpenToSideSettingTab(this.app, this));

		const plugin = this;

		// Record trigger clicks without intercepting them. Obsidian resolves link clicks on
		// mousedown in some contexts and on click in others, so watch both, in the capture phase
		// so the flag is set before Obsidian's own handlers run.
		const record = (evt: MouseEvent) => {
			if (matchesTrigger(evt, this.settings.trigger)) this.splitClickAt = Date.now();
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
					function (this: unknown, evt?: Parameters<IsModEvent>[0]) {
						if (
							evt instanceof MouseEvent &&
							matchesTrigger(evt, plugin.settings.trigger)
						) {
							return "split";
						}
						return next.call(Keymap, evt);
					},
			})
		);

		// Every split-open funnels through getLeaf("split"), which makes this the one place worth
		// patching to choose *where* the note lands.
		this.register(
			around(this.app.workspace, {
				// Typed loosely on purpose: getLeaf is overloaded, and the narrow overload would
				// drop the `direction` argument when passing through to Obsidian.
				getLeaf: (next: GetLeaf): GetLeaf =>
					function (this: Workspace, ...args: unknown[]): WorkspaceLeaf {
						const redirected = plugin.redirect(
							args[0] as PaneType | boolean | undefined
						);
						if (redirected) return redirected;
						return (next as (...a: unknown[]) => WorkspaceLeaf).apply(this, args);
					} as GetLeaf,
			})
		);
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * Returns the leaf a split request should be redirected into, or null to let Obsidian handle
	 * it natively. Null is the safe answer for anything unexpected — this runs inside a patched
	 * core method, so throwing here would break link opening across the whole vault.
	 */
	private redirect(paneType: PaneType | boolean | undefined): WorkspaceLeaf | null {
		if (paneType !== "split") return null;
		if (!this.consumeSplitClick()) return null;

		try {
			const source = getActiveLeaf(this.app);
			const target =
				resolveSideLeaf(this.app, this.settings) ?? this.createSideColumn();
			if (!target) return null;

			this.app.workspace.revealLeaf(target);

			if (this.settings.keepFocus && source) {
				// The caller focuses the leaf we return, so hand focus back afterwards.
				setTimeout(() => this.app.workspace.setActiveLeaf(source, { focus: true }));
			}

			return target;
		} catch (error) {
			console.error("[open-to-side] falling back to a native split:", error);
			return null;
		}
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
