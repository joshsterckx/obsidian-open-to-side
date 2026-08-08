import { Platform } from "obsidian";

export interface TriggerCombo {
	/** Cmd on macOS, Ctrl elsewhere — Obsidian's "mod" key. */
	mod: boolean;
	alt: boolean;
	shift: boolean;
}

/**
 * The click combinations that can trigger a side-open.
 *
 * Deliberately a fixed set rather than free-form modifiers: a combo with no modifier at all would
 * hijack every ordinary click in the app.
 */
export const TRIGGERS: Record<string, TriggerCombo> = {
	"mod+alt": { mod: true, alt: true, shift: false },
	"mod+shift": { mod: true, alt: false, shift: true },
	mod: { mod: true, alt: false, shift: false },
	"alt+shift": { mod: false, alt: true, shift: true },
	alt: { mod: false, alt: true, shift: false },
	shift: { mod: false, alt: false, shift: true },
};

export type TriggerId = keyof typeof TRIGGERS;

export const DEFAULT_TRIGGER: TriggerId = "mod+alt";

/** Human-readable combo, using the key names of the current platform. */
export function triggerLabel(id: TriggerId): string {
	const combo = TRIGGERS[id];
	if (!combo) return id;

	const parts: string[] = [];
	if (combo.mod) parts.push(Platform.isMacOS ? "Cmd" : "Ctrl");
	if (combo.alt) parts.push(Platform.isMacOS ? "Option" : "Alt");
	if (combo.shift) parts.push("Shift");
	return `${parts.join("+")}+click`;
}

/**
 * Whether a click matches the configured combo.
 *
 * Matched exactly, including the modifiers that must be *absent* — otherwise choosing Alt+click
 * would also fire on Cmd+Alt+click, and there would be no way to keep a native combo free.
 */
export function matchesTrigger(evt: MouseEvent, id: TriggerId): boolean {
	const combo = TRIGGERS[id];
	if (!combo) return false;

	// Ignore anything but a primary-button click; middle-click is Obsidian's own "new tab".
	if (evt.button !== 0) return false;

	const mod = Platform.isMacOS ? evt.metaKey : evt.ctrlKey;
	return mod === combo.mod && evt.altKey === combo.alt && evt.shiftKey === combo.shift;
}

/** True when Obsidian already treats this combo as "open in a split" on its own. */
export function isNativeSplitCombo(id: TriggerId): boolean {
	return id === "mod+alt";
}
