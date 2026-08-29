import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock factories are hoisted above variable declarations, so we
// use vi.hoisted() to create the mock fns before the factory runs.
const { mockLimit, mockWhere, mockFrom, mockSelect } = vi.hoisted(() => {
	const mockLimit = vi.fn();
	const mockWhere = vi.fn(() => ({ limit: mockLimit }));
	const mockFrom = vi.fn(() => ({ where: mockWhere }));
	const mockSelect = vi.fn(() => ({ from: mockFrom }));
	return { mockLimit, mockWhere, mockFrom, mockSelect };
});

vi.mock('$lib/server/db', () => ({ db: { select: mockSelect } }));
vi.mock('$lib/server/db/schema', () => ({
	userAccountAccess: Symbol('userAccountAccess'),
	scheduledPosts: Symbol('scheduledPosts')
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((_col, _val) => Symbol('eq')),
	and: vi.fn((..._args) => Symbol('and'))
}));

// Import after mocks are set up
import { canAccessAccount, canModifyPost } from './access';

beforeEach(() => {
	vi.clearAllMocks();
	// Default: no rows (access denied)
	mockLimit.mockResolvedValue([]);
});

// -----------------------------------------------
describe('canAccessAccount', () => {
	it('returns true immediately for admins without touching the DB', async () => {
		const result = await canAccessAccount('u1', 'acc1', true);
		expect(result).toBe(true);
		expect(mockSelect).not.toHaveBeenCalled();
	});

	it('returns true when a non-admin has an access row', async () => {
		mockLimit.mockResolvedValueOnce([{ userId: 'u1', accountId: 'acc1' }]);
		const result = await canAccessAccount('u1', 'acc1', false);
		expect(result).toBe(true);
	});

	it('returns false when a non-admin has no access row', async () => {
		mockLimit.mockResolvedValueOnce([]);
		const result = await canAccessAccount('u1', 'acc1', false);
		expect(result).toBe(false);
	});

	it('queries the DB for non-admin users', async () => {
		mockLimit.mockResolvedValueOnce([]);
		await canAccessAccount('u1', 'acc1', false);
		expect(mockSelect).toHaveBeenCalledOnce();
		expect(mockFrom).toHaveBeenCalledOnce();
		expect(mockWhere).toHaveBeenCalledOnce();
	});
});

// -----------------------------------------------
describe('canModifyPost', () => {
	it('returns true immediately for admins without touching the DB', async () => {
		const result = await canModifyPost('u1', 'post1', true);
		expect(result).toBe(true);
		expect(mockSelect).not.toHaveBeenCalled();
	});

	it('returns true when the post belongs to the user', async () => {
		mockLimit.mockResolvedValueOnce([{ id: 'post1', createdBy: 'u1' }]);
		const result = await canModifyPost('u1', 'post1', false);
		expect(result).toBe(true);
	});

	it('returns false when the post does not belong to the user', async () => {
		mockLimit.mockResolvedValueOnce([]);
		const result = await canModifyPost('u1', 'post1', false);
		expect(result).toBe(false);
	});
});
