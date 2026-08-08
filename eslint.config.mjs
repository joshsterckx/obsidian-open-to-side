import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default tseslint.config(
	{ ignores: ["main.js", "esbuild.config.mjs", "scripts/**"] },
	tseslint.configs.strictTypeChecked,
	tseslint.configs.stylisticTypeChecked,
	obsidianmd.configs.recommended,
	{
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			// TypeScript resolves these itself, and it sees the `declare module` scope that
			// no-undef does not.
			"no-undef": "off",
		},
	}
);
