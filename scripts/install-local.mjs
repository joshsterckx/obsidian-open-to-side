import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const PLUGIN_ID = "open-to-side";

// Override with: VAULT="/path/to/vault" npm run install-local
const vault =
	process.env.VAULT ??
	path.join(
		homedir(),
		"Library/Mobile Documents/iCloud~md~obsidian/Documents/Vault"
	);

if (!existsSync(path.join(vault, ".obsidian"))) {
	console.error(`No .obsidian directory found in: ${vault}`);
	console.error(`Set VAULT=/path/to/vault to point somewhere else.`);
	process.exit(1);
}

const dest = path.join(vault, ".obsidian/plugins", PLUGIN_ID);
await mkdir(dest, { recursive: true });

for (const file of ["main.js", "manifest.json"]) {
	if (!existsSync(file)) {
		console.error(`Missing ${file} — run \`npm run build\` first.`);
		process.exit(1);
	}
	await copyFile(file, path.join(dest, file));
}

console.log(`Installed ${PLUGIN_ID} to ${dest}`);
