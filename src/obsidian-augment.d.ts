import "obsidian";

/*
 * Obsidian's workspace tree is only partially described by the public typings: the
 * parent/child links that make it navigable are real at runtime but undeclared. These are the
 * same internals the Vertical Tabs plugin relies on, so they are stable in practice — but every
 * read of them in this plugin is still guarded, so a future API change degrades to Obsidian's
 * native split behaviour rather than throwing inside a patched core method.
 */
declare module "obsidian" {
	interface WorkspaceItem {
		parentSplit?: WorkspaceParent;
	}

	interface WorkspaceParent {
		children?: WorkspaceItem[];
	}

	interface WorkspaceSplit {
		direction?: SplitDirection;
	}

	interface WorkspaceLeaf {
		parent?: WorkspaceParent;
		pinned?: boolean;
	}

	interface App {
		commands?: { commands?: Record<string, Command> };
	}

	interface Workspace {
		createLeafInParent(parent: WorkspaceParent, index: number): WorkspaceLeaf;
		getMostRecentLeaf(root?: WorkspaceParent): WorkspaceLeaf | null;
	}
}
