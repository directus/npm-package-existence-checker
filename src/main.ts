import * as core from '@actions/core';
import glob from 'fast-glob';
import { load } from 'js-yaml';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const WORKSPACE_FILE = 'pnpm-workspace.yaml';

export interface PackageJson {
	name?: string;
	private?: boolean;
}

interface WorkspaceConfig {
	packages?: string[];
}

export interface CheckResults {
	existingPackages: string[];
	missingPackages: string[];
	privatePackages: string[];
	checkedPackages: string[];
}

/**
 * Main action logic.
 */
export async function run(): Promise<void> {
	try {
		const results: CheckResults = {
			existingPackages: [],
			missingPackages: [],
			privatePackages: [],
			checkedPackages: [],
		};

		const directory = core.getInput('directory') || '.';

		// Always check root package.json first
		await checkDirectory(directory, results);

		// Check all workspace packages
		await checkWorkspacePackages(results, directory);

		core.setOutput('existing-packages', results.existingPackages.join(','));
		core.setOutput('missing-packages', results.missingPackages.join(','));
		core.setOutput('private-packages', results.privatePackages.join(','));

		if (results.missingPackages.length > 0) {
			core.setFailed(
				`The following packages do not exist on npm:\n${results.missingPackages.map((p) => `  - ${p}`).join('\n')}\n\nPlease create these packages on npm and configure Trusted Publishing before publishing.`,
			);
		} else if (results.existingPackages.length === 0) {
			core.warning('No public packages found to check');
		} else {
			core.info(`All ${results.existingPackages.length} public package(s) exist on npm`);
			if (results.privatePackages.length > 0) {
				core.info(`${results.privatePackages.length} private package(s) skipped`);
			}
		}
	} catch (error) {
		if (error instanceof Error) {
			core.setFailed(error.message);
		}
	}
}

/**
 * Parse pnpm-workspace.yaml to get package patterns.
 */
export function parseWorkspacePatterns(content: string): string[] {
	try {
		const config = load(content) as WorkspaceConfig | null;
		return config?.packages ?? [];
	} catch {
		return [];
	}
}

/**
 * Expand glob patterns to actual directories.
 */
export function expandGlobPattern(pattern: string, baseDir: string): string[] {
	try {
		return glob.sync(pattern, {
			cwd: baseDir,
			onlyDirectories: true,
			absolute: true,
		});
	} catch (error) {
		if (error instanceof Error) {
			core.debug(`Glob error: ${error.message}`);
		}
		return [];
	}
}

/**
 * Check if a package exists on npm.
 */
export async function packageExistsOnNpm(packageName: string): Promise<boolean> {
	try {
		const response = await fetch(`https://registry.npmjs.org/${packageName}`, {
			method: 'HEAD',
		});
		return response.ok;
	} catch (error) {
		if (error instanceof Error) {
			core.debug(`npm registry error for ${packageName}: ${error.message}`);
		}
		return false;
	}
}

/**
 * Read and parse package.json from a directory.
 */
export function readPackageJson(dir: string): PackageJson | null {
	const packageJsonPath = join(dir, 'package.json');
	if (!existsSync(packageJsonPath)) {
		return null;
	}

	try {
		return JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
	} catch {
		return null;
	}
}

/**
 * Check a single package and return whether it's missing.
 */
export async function checkPackage(
	pkg: PackageJson,
	location: string,
): Promise<{ status: 'missing' | 'existing' | 'private'; name: string } | null> {
	if (!pkg.name) {
		core.debug(`Skipping ${location}: no name in package.json`);
		return null;
	}

	if (pkg.private === true) {
		core.debug(`Skipping ${pkg.name}: private package`);
		return { status: 'private', name: pkg.name };
	}

	core.info(`Checking if ${pkg.name} exists on npm...`);

	const exists = await packageExistsOnNpm(pkg.name);

	if (exists) {
		core.info(`${pkg.name} exists on npm`);
		return { status: 'existing', name: pkg.name };
	} else {
		core.error(`Error: ${pkg.name} does not exist on npm`);
		return { status: 'missing', name: pkg.name };
	}
}

/**
 * Check a package in a directory and update results.
 */
export async function checkDirectory(directory: string, results: CheckResults): Promise<void> {
	const pkg = readPackageJson(directory);
	if (!pkg) return;

	// Skip if already checked
	if (pkg.name && results.checkedPackages.includes(pkg.name)) {
		return;
	}

	const result = await checkPackage(pkg, directory);
	if (!result) return;

	results.checkedPackages.push(result.name);
	if (result.status === 'missing') {
		results.missingPackages.push(result.name);
	} else if (result.status === 'existing') {
		results.existingPackages.push(result.name);
	} else if (result.status === 'private') {
		results.privatePackages.push(result.name);
	}
}

/**
 * Check all workspace packages and update results.
 */
export async function checkWorkspacePackages(results: CheckResults, directory: string = '.'): Promise<void> {
	const workspacePath = join(directory, WORKSPACE_FILE);

	if (!existsSync(workspacePath)) {
		return;
	}

	core.info(`Found workspace file: ${workspacePath}`);
	const patterns = parseWorkspacePatterns(readFileSync(workspacePath, 'utf-8'));

	core.debug(`Found patterns: ${patterns.join(', ')}`);

	for (const pattern of patterns) {
		const directories = expandGlobPattern(pattern, directory);

		for (const dir of directories) {
			await checkDirectory(dir, results);
		}
	}
}
