import { describe, expect, it, vi } from 'vitest';
import { run } from './main.js';

vi.mock('./main.js', () => ({
	run: vi.fn(),
}));

describe('index', () => {
	it('runs main', async () => {
		await import('./index.js');
		expect(run).toHaveBeenCalled();
	});
});
