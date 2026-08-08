import { Keymap, PaneType, Plugin, Workspace, WorkspaceLeaf } from "obsidian";
import { around } from "monkey-around";
import { getActiveLeaf, resolveSideLeaf } from "./side-group";
import {
	DEFAULT_SETTINGS,
	OpenToSideSettingTab,
	OpenToSideSettings,
} from "./settings";

/**
 * How long after a mod+alt click a split request still counts as coming from that click.
 * Generous enough for the click handler to reach getLeaf, short enough that a stale flag can
 * never redirect an unrelated split later on.
 */
const CLICK_WINDOW_MS = 500;

type GetLeaf = Workspace["getLeaf"];

export default class OpenToSidePlugin extends Plugin {
	settings: OpenToSideSettings = DEFAULT_SETTINGS;

	/** Timestamp of the last mod+alt click, or 0 once consumed. */
	private splitClickAt = 0;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new OpenToSideSettingTab(this.app, this));

		// Record mod+alt clicks without intercepting them. Obsidian resolves link clicks on
		// mousedown in some contexts and on click in others, so watch both, in the capture phase
		// so the flag is set before Obsidian's own handlers run.
		const record = (evt: MouseEvent) => {
			if (Keymap.isModEvent(evt) === "split") this.splitClickAt = Date.now();
		};
		this.registerDomEvent(document, "mousedown", record, { capture: true });
		this.registerDomEvent(document, "click", record, { capture: true });

		// Every mod+alt click funnels through getLeaf("split"), which makes this the one place
		// worth patching — it covers links in Live Preview, Reading mode, the file explorer,
		// search results and backlinks alike.
		const plugin = this;
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

	/** True if a mod+alt click just happened. One-shot: the flag is cleared on read. */
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
