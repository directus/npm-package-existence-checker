// @ts-check

import eslintJs from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';
import typescriptEslint from 'typescript-eslint';

export default typescriptEslint.config(
	// Global config
	{
		languageOptions: {
			ecmaVersion: 2023,
			sourceType: 'module',
			globals: {
				...globals.node,
			},
		},
	},

	// Ignored files
	{
		ignores: ['**/coverage/', '**/dist/', '**/node_modules/'],
	},

	// Enable recommended rules for JS files
	eslintJs.configs.recommended,

	// Enable TypeScript plugin and recommended rules for TypeScript files
	...typescriptEslint.configs.recommended,

	// Custom TypeScript rules
	{
		files: ['**/*.ts'],
		rules: {
			// Allow unused arguments and variables when they begin with an underscore
			'@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
			// Allow ts-directive comments (used to suppress TypeScript compiler errors)
			'@typescript-eslint/ban-ts-comment': 'off',
			// Allow usage of the any type (consider enabling this rule later on)
			'@typescript-eslint/no-explicit-any': 'off',
		},
	},

	eslintConfigPrettier,
);
