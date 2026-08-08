import {
	App,
	View,
	WorkspaceItem,
	WorkspaceLeaf,
	WorkspaceParent,
	WorkspaceSplit,
} from "obsidian";
import type { OpenToSideSettings } from "./settings";

/**
 * The focused leaf, whatever kind of view it holds.
 *
 * Obsidian's plugin guidelines ask you not to read `workspace.activeLeaf` directly; every view
 * carries its own leaf, so asking for the active view gets there without it.
 */
export function getActiveLeaf(app: App): WorkspaceLeaf | null {
	return app.workspace.getActiveViewOfType(View)?.leaf ?? null;
}

/**
 * The main area's root split lays its children out as columns when its direction is "vertical"
 * (a vertical divider between them). Anything else is a stack, which has no "group to the right".
 */
const COLUMNS = "vertical";

/**
 * Find a leaf in the tab group to the right of the active one.
 *
 * Returns null when there is no such group and the caller should create one — either because the
 * main area holds a single group, or because its groups are stacked rather than side by side.
 */
export function resolveSideLeaf(
	app: App,
	settings: OpenToSideSettings
): WorkspaceLeaf | null {
	const root = app.workspace.rootSplit as WorkspaceSplit;
	const columns = root.children;
	if (!columns || columns.length <= 1) return null;
	if (root.direction !== COLUMNS) return null;

	const target = pickColumn(app, root, columns);
	if (!target) return null;

	const tabs = findTabsContainer(app, target);
	if (!tabs) return null;

	return leafInTabs(app, tabs, settings);
}

/** Which top-level column should receive the note. */
function pickColumn(
	app: App,
	root: WorkspaceSplit,
	columns: WorkspaceItem[]
): WorkspaceItem | null {
	const active = getActiveLeaf(app);
	const current = active ? columnOf(active, root) : null;

	// The click came from outside the main area — a sidebar backlink or search result, say.
	// There is no "current column" to sit beside, so use the rightmost one.
	if (!current) return columns[columns.length - 1] ?? null;

	const index = columns.indexOf(current);
	if (index === -1) return columns[columns.length - 1] ?? null;

	// Already in the rightmost column: reuse it rather than chaining another column to the right
	// on every click.
	if (index === columns.length - 1) return current;

	return columns[index + 1] ?? null;
}

/** Walk up from a leaf to the top-level column containing it, or null if it isn't under root. */
function columnOf(leaf: WorkspaceLeaf, root: WorkspaceSplit): WorkspaceItem | null {
	let node: WorkspaceItem | undefined = leaf.parent;
	while (node) {
		const parent: WorkspaceParent | undefined = node.parentSplit;
		if (parent === root) return node;
		node = parent;
	}
	return null;
}

/**
 * Get the tab container inside a column. A column is usually a WorkspaceTabs already, but it can
 * itself be a split holding several stacked groups, so prefer the most recently used one.
 */
function findTabsContainer(app: App, column: WorkspaceItem): WorkspaceParent | null {
	const recent = app.workspace.getMostRecentLeaf(column);
	if (recent?.parent) return recent.parent;

	// getMostRecentLeaf returns null for a column whose leaves have never been focused.
	let node: WorkspaceParent = column;
	for (;;) {
		const first: WorkspaceItem | undefined = node.children?.[0];
		if (!first) return null;
		if (first instanceof WorkspaceLeaf) return node;
		node = first;
	}
}

/** Reuse the group's current tab, or append a new one. */
function leafInTabs(
	app: App,
	tabs: WorkspaceParent,
	settings: OpenToSideSettings
): WorkspaceLeaf | null {
	const children = tabs.children ?? [];

	if (settings.reuseTab) {
		const existing = app.workspace.getMostRecentLeaf(tabs);
		// A pinned tab is the user saying "keep this here", so fall through to a new tab.
		if (existing && !existing.pinned) return existing;
	}

	return app.workspace.createLeafInParent(tabs, children.length);
}
