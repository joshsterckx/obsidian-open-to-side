import { App, PluginSettingTab, Setting } from "obsidian";
import type OpenToSidePlugin from "./main";
import {
	DEFAULT_TRIGGER,
	TRIGGERS,
	TriggerId,
	isNativeSplitCombo,
	triggerLabel,
} from "./trigger";

export interface OpenToSideSettings {
	/** Which click combination opens a note in the side group. */
	trigger: TriggerId;
	/** Return focus to the note you clicked from, instead of jumping to the side pane. */
	keepFocus: boolean;
	/** Replace the side group's current tab instead of stacking up a new one each click. */
	reuseTab: boolean;
}

export const DEFAULT_SETTINGS: OpenToSideSettings = {
	trigger: DEFAULT_TRIGGER,
	keepFocus: true,
	reuseTab: true,
};

export class OpenToSideSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: OpenToSidePlugin) {
		super(app, plugin);
	}

	/** Spell out what the chosen combo displaces, since a non-default one takes over a shortcut. */
	private triggerDesc(): string {
		const current = triggerLabel(this.plugin.settings.trigger);
		if (isNativeSplitCombo(this.plugin.settings.trigger)) {
			return `Which click opens a note in the side group. ${current} is Obsidian's own shortcut for opening in a split.`;
		}
		return `Which click opens a note in the side group. ${current} will no longer do whatever it normally does in Obsidian, and ${triggerLabel(
			"mod+alt"
		)} goes back to its default of always opening a new split.`;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Trigger")
			.setDesc(this.triggerDesc())
			.addDropdown((dropdown) => {
				for (const id of Object.keys(TRIGGERS)) {
					dropdown.addOption(id, triggerLabel(id));
				}
				dropdown.setValue(this.plugin.settings.trigger).onChange(async (value) => {
					this.plugin.settings.trigger = value;
					await this.plugin.saveSettings();
					// The description explains what the chosen combo displaces, so redraw it.
					this.display();
				});
			});

		new Setting(containerEl)
			.setName("Keep focus in the current note")
			.setDesc(
				"Leave the cursor where it was instead of moving it into the side pane, so you can keep reading and previewing."
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.keepFocus).onChange(async (value) => {
					this.plugin.settings.keepFocus = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Reuse the side tab")
			.setDesc(
				"Replace what is already open in the side group, keeping it to a single preview tab. Pinned tabs are never replaced. Turn this off to open a new tab each time."
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.reuseTab).onChange(async (value) => {
					this.plugin.settings.reuseTab = value;
					await this.plugin.saveSettings();
				})
			);
	}
}
