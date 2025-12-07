import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	parseWorkspacePatterns,
	checkPackage,
	expandGlobPattern,
	readPackageJson,
	checkDirectory,
	checkWorkspacePackages,
	type PackageJson,
	type CheckResults,
} from './main.js';

vi.mock('@actions/core', () => ({
	debug: vi.fn(),
	info: vi.fn(),
	error: vi.fn(),
	warning: vi.fn(),
	setFailed: vi.fn(),
	setOutput: vi.fn(),
	getInput: vi.fn(),
}));

vi.mock('fast-glob', () => ({
	default: {
		sync: vi.fn(),
	},
}));

vi.mock('node:fs', () => ({
	existsSync: vi.fn(),
	readFileSync: vi.fn(),
}));

import glob from 'fast-glob';
import * as fs from 'node:fs';
import { join } from 'node:path';

const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('parseWorkspacePatterns', () => {
	it('parses simple workspace patterns', () => {
		const content = `packages:
  - "packages/*"
  - "apps/*"
`;
		const patterns = parseWorkspacePatterns(content);
		expect(patterns).toEqual(['packages/*', 'apps/*']);
	});

	it('parses patterns without quotes', () => {
		const content = `packages:
  - packages/*
  - apps/*
`;
		const patterns = parseWorkspacePatterns(content);
		expect(patterns).toEqual(['packages/*', 'apps/*']);
	});

	it('ignores catalog section', () => {
		const content = `packages:
  - packages/*

catalog:
  lodash: ^4.17.0
`;
		const patterns = parseWorkspacePatterns(content);
		expect(patterns).toEqual(['packages/*']);
	});

	it('returns empty array for missing packages section', () => {
		const content = `catalog:
  lodash: ^4.17.0
`;
		const patterns = parseWorkspacePatterns(content);
		expect(patterns).toEqual([]);
	});

	it('returns empty array for empty file', () => {
		const patterns = parseWorkspacePatterns('');
		expect(patterns).toEqual([]);
	});

	it('returns empty array for null content', () => {
		const content = `# just a comment`;
		const patterns = parseWorkspacePatterns(content);
		expect(patterns).toEqual([]);
	});

	it('returns empty array for invalid YAML', () => {
		const content = `packages: [ unclosed bracket`;
		const patterns = parseWorkspacePatterns(content);
		expect(patterns).toEqual([]);
	});
});

describe('expandGlobPattern', () => {
	it('handles glob errors gracefully', () => {
		const mockGlobSync = glob.sync as unknown as ReturnType<typeof vi.fn>;
		mockGlobSync.mockImplementation(() => {
			throw new Error('Glob failed');
		});

		const result = expandGlobPattern('packages/*', '/root');
		expect(result).toEqual([]);
	});
});

describe('readPackageJson', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns null if file does not exist', () => {
		vi.mocked(fs.existsSync).mockReturnValue(false);
		const result = readPackageJson('/path/to/dir');
		expect(result).toBeNull();
	});

	it('returns parsed package.json if valid', () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue('{"name": "test-pkg", "private": true}');

		const result = readPackageJson('/path/to/dir');
		expect(result).toEqual({ name: 'test-pkg', private: true });
	});

	it('returns null if json is invalid', () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue('{ invalid }');

		const result = readPackageJson('/path/to/dir');
		expect(result).toBeNull();
	});
});

describe('checkPackage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		fetchMock.mockReset();
	});

	it('returns null for package without name', async () => {
		const pkg: PackageJson = {};
		const result = await checkPackage(pkg, 'test-dir');
		expect(result).toBeNull();
	});

	it('returns null for private package', async () => {
		const pkg: PackageJson = { name: 'my-private-pkg', private: true };
		const result = await checkPackage(pkg, 'test-dir');
		expect(result).toEqual({ status: 'private', name: 'my-private-pkg' });
	});

	it('returns existing for package that exists on npm', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
		});
		const pkg: PackageJson = { name: '@actions/core', private: false };
		const result = await checkPackage(pkg, 'test-dir');

		expect(result).toEqual({ status: 'existing', name: '@actions/core' });
	});

	it('returns missing for package that does not exist on npm', async () => {
		fetchMock.mockResolvedValue({
			ok: false,
		});
		const pkg: PackageJson = { name: '@directus/this-package-should-not-exist', private: false };
		const result = await checkPackage(pkg, 'test-dir');

		expect(result).toEqual({ status: 'missing', name: '@directus/this-package-should-not-exist' });
	});

	it('returns missing when fetch throws an error', async () => {
		fetchMock.mockRejectedValue(new Error('Network error'));
		const pkg: PackageJson = { name: 'directus', private: false };
		const result = await checkPackage(pkg, 'test-dir');

		expect(result).toEqual({ status: 'missing', name: 'directus' });
	});
});

describe('checkDirectory', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		fetchMock.mockReset();
	});

	it('checks package in directory and updates results for existing package', async () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue('{"name": "test-pkg", "private": false}');
		fetchMock.mockResolvedValue({ ok: true });

		const results: CheckResults = {
			existingPackages: [],
			missingPackages: [],
			privatePackages: [],
			checkedPackages: [],
		};

		await checkDirectory('.', results);

		expect(results.existingPackages).toEqual(['test-pkg']);
		expect(results.checkedPackages).toEqual(['test-pkg']);
		expect(results.missingPackages).toEqual([]);
		expect(results.privatePackages).toEqual([]);
	});

	it('checks package in directory and updates results for missing package', async () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue('{"name": "missing-pkg", "private": false}');
		fetchMock.mockResolvedValue({ ok: false });

		const results: CheckResults = {
			existingPackages: [],
			missingPackages: [],
			privatePackages: [],
			checkedPackages: [],
		};

		await checkDirectory('.', results);

		expect(results.missingPackages).toEqual(['missing-pkg']);
		expect(results.checkedPackages).toEqual(['missing-pkg']);
		expect(results.existingPackages).toEqual([]);
		expect(results.privatePackages).toEqual([]);
	});

	it('checks package in directory and updates results for private package', async () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue('{"name": "private-pkg", "private": true}');

		const results: CheckResults = {
			existingPackages: [],
			missingPackages: [],
			privatePackages: [],
			checkedPackages: [],
		};

		await checkDirectory('.', results);

		expect(results.privatePackages).toEqual(['private-pkg']);
		expect(results.checkedPackages).toEqual(['private-pkg']);
		expect(results.existingPackages).toEqual([]);
		expect(results.missingPackages).toEqual([]);
	});

	it('does nothing when no package.json exists', async () => {
		vi.mocked(fs.existsSync).mockReturnValue(false);

		const results: CheckResults = {
			existingPackages: [],
			missingPackages: [],
			privatePackages: [],
			checkedPackages: [],
		};

		await checkDirectory('.', results);

		expect(results.existingPackages).toEqual([]);
		expect(results.missingPackages).toEqual([]);
		expect(results.privatePackages).toEqual([]);
		expect(results.checkedPackages).toEqual([]);
	});

	it('skips package if already checked', async () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue('{"name": "already-checked", "private": false}');

		const results: CheckResults = {
			existingPackages: [],
			missingPackages: [],
			privatePackages: [],
			checkedPackages: ['already-checked'],
		};

		await checkDirectory('.', results);

		expect(fetchMock).not.toHaveBeenCalled();
		expect(results.checkedPackages).toEqual(['already-checked']);
	});

	it('checks package in a specific directory', async () => {
		const targetDir = '/custom/dir';
		vi.mocked(fs.existsSync).mockImplementation((path) => path === join(targetDir, 'package.json'));
		vi.mocked(fs.readFileSync).mockImplementation((path) => {
			if (path === join(targetDir, 'package.json')) {
				return '{"name": "custom-pkg", "private": false}';
			}
			throw new Error('File not found');
		});
		fetchMock.mockResolvedValue({ ok: true });

		const results: CheckResults = {
			existingPackages: [],
			missingPackages: [],
			privatePackages: [],
			checkedPackages: [],
		};

		await checkDirectory(targetDir, results);

		expect(results.existingPackages).toEqual(['custom-pkg']);
		expect(fs.existsSync).toHaveBeenCalledWith(join(targetDir, 'package.json'));
	});
});

describe('checkWorkspacePackages', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		fetchMock.mockReset();
	});

	it('does nothing when workspace file does not exist', async () => {
		vi.mocked(fs.existsSync).mockReturnValue(false);

		const results: CheckResults = {
			existingPackages: [],
			missingPackages: [],
			privatePackages: [],
			checkedPackages: [],
		};

		await checkWorkspacePackages(results);

		expect(results.existingPackages).toEqual([]);
		expect(results.missingPackages).toEqual([]);
		expect(results.privatePackages).toEqual([]);
		expect(results.checkedPackages).toEqual([]);
	});

	it('checks workspace packages and updates results', async () => {
		const mockGlobSync = glob.sync as unknown as ReturnType<typeof vi.fn>;

		// First call for checks workspace file
		// Subsequent calls check package.json files
		vi.mocked(fs.existsSync)
			.mockReturnValueOnce(true) // workspace file exists
			.mockReturnValueOnce(true) // pkg1/package.json exists
			.mockReturnValueOnce(true); // pkg2/package.json exists

		vi.mocked(fs.readFileSync)
			.mockReturnValueOnce('packages:\n  - "packages/*"') // workspace file
			.mockReturnValueOnce('{"name": "pkg1", "private": false}') // pkg1
			.mockReturnValueOnce('{"name": "pkg2", "private": false}'); // pkg2

		mockGlobSync.mockReturnValue(['/root/packages/pkg1', '/root/packages/pkg2']);

		fetchMock
			.mockResolvedValueOnce({ ok: true }) // pkg1 exists
			.mockResolvedValueOnce({ ok: false }); // pkg2 missing

		const results: CheckResults = {
			existingPackages: [],
			missingPackages: [],
			privatePackages: [],
			checkedPackages: [],
		};

		await checkWorkspacePackages(results);

		expect(results.existingPackages).toEqual(['pkg1']);
		expect(results.missingPackages).toEqual(['pkg2']);
		expect(results.checkedPackages).toEqual(['pkg1', 'pkg2']);
	});

	it('skips packages already checked', async () => {
		const mockGlobSync = glob.sync as unknown as ReturnType<typeof vi.fn>;

		vi.mocked(fs.existsSync)
			.mockReturnValueOnce(true) // workspace file exists
			.mockReturnValueOnce(true); // pkg1/package.json exists

		vi.mocked(fs.readFileSync)
			.mockReturnValueOnce('packages:\n  - "packages/*"') // workspace file
			.mockReturnValueOnce('{"name": "already-checked", "private": false}'); // pkg1

		mockGlobSync.mockReturnValue(['/root/packages/pkg1']);

		const results: CheckResults = {
			existingPackages: [],
			missingPackages: [],
			privatePackages: [],
			checkedPackages: ['already-checked'], // Already in the list
		};

		await checkWorkspacePackages(results);

		// Should not add it again
		expect(results.checkedPackages).toEqual(['already-checked']);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('handles packages without package.json', async () => {
		const mockGlobSync = glob.sync as unknown as ReturnType<typeof vi.fn>;

		vi.mocked(fs.existsSync)
			.mockReturnValueOnce(true) // workspace file exists
			.mockReturnValueOnce(false); // pkg1/package.json does not exist

		vi.mocked(fs.readFileSync).mockReturnValueOnce('packages:\n  - "packages/*"'); // workspace file

		mockGlobSync.mockReturnValue(['/root/packages/pkg1']);

		const results: CheckResults = {
			existingPackages: [],
			missingPackages: [],
			privatePackages: [],
			checkedPackages: [],
		};

		await checkWorkspacePackages(results);

		expect(results.checkedPackages).toEqual([]);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('checks workspace packages in a specific directory', async () => {
		const targetDir = '/custom/workspace';
		const mockGlobSync = glob.sync as unknown as ReturnType<typeof vi.fn>;

		vi.mocked(fs.existsSync).mockImplementation((path) => {
			if (path === join(targetDir, 'pnpm-workspace.yaml')) return true;
			if (path === join(targetDir, 'packages/pkg1/package.json')) return true;
			return false;
		});

		vi.mocked(fs.readFileSync).mockImplementation((path) => {
			if (path === join(targetDir, 'pnpm-workspace.yaml')) return 'packages:\n  - "packages/*"';
			if (path === join(targetDir, 'packages/pkg1/package.json')) return '{"name": "pkg1", "private": false}';
			throw new Error(`File not found: ${path}`);
		});

		mockGlobSync.mockReturnValue([join(targetDir, 'packages/pkg1')]);
		fetchMock.mockResolvedValue({ ok: true });

		const results: CheckResults = {
			existingPackages: [],
			missingPackages: [],
			privatePackages: [],
			checkedPackages: [],
		};

		await checkWorkspacePackages(results, targetDir);

		expect(results.existingPackages).toEqual(['pkg1']);
		// Verify glob called with correct CWD
		expect(mockGlobSync).toHaveBeenCalledWith('packages/*', expect.objectContaining({ cwd: targetDir }));
		// Verify workspace file read from correct path
		expect(fs.readFileSync).toHaveBeenCalledWith(join(targetDir, 'pnpm-workspace.yaml'), 'utf-8');
	});
	it('handles non-existent directory gracefully', async () => {
		const targetDir = '/non-existent/dir';
		vi.mocked(fs.existsSync).mockReturnValue(false);

		const results: CheckResults = {
			existingPackages: [],
			missingPackages: [],
			privatePackages: [],
			checkedPackages: [],
		};

		await checkWorkspacePackages(results, targetDir);

		expect(results.checkedPackages).toEqual([]);
		// Verify it checked the correct path
		expect(fs.existsSync).toHaveBeenCalledWith(join(targetDir, 'pnpm-workspace.yaml'));
	});
});
