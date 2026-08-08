import { App, PluginSettingTab, Setting } from "obsidian";
import type OpenToSidePlugin from "./main";

export interface OpenToSideSettings {
	/** Return focus to the note you clicked from, instead of jumping to the side pane. */
	keepFocus: boolean;
	/** Replace the side group's current tab instead of stacking up a new one each click. */
	reuseTab: boolean;
}

export const DEFAULT_SETTINGS: OpenToSideSettings = {
	keepFocus: true,
	reuseTab: true,
};

export class OpenToSideSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: OpenToSidePlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

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
