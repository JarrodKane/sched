import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { publishPost } from './instagram';

const BASE = 'https://graph.instagram.com';
const IG_ID = 'ig123';
const TOKEN = 'tok_abc';
const IMAGE_URL = 'https://cdn.example.com/photo.jpg';

// Helpers to build consistent fetch responses
function jsonResponse(body: unknown, status = 200) {
	return Promise.resolve(
		new Response(JSON.stringify(body), {
			status,
			headers: { 'Content-Type': 'application/json' }
		})
	);
}

function mockFetchSequence(...responses: unknown[]) {
	const fetchMock = vi.fn();
	responses.forEach((r) => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify(r), { headers: { 'Content-Type': 'application/json' } })
		);
	});
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('publishPost — parameter building', () => {
	it('sends media_type=STORIES and no caption for story posts', async () => {
		const fetch = mockFetchSequence(
			{ id: 'container_1' },     // container creation
			{ status_code: 'FINISHED' }, // status poll
			{ id: 'post_1' }           // publish
		);

		await publishPost(IG_ID, TOKEN, 'story', IMAGE_URL, 'should be ignored');

		const containerCall = fetch.mock.calls[0];
		const body = new URLSearchParams(await (containerCall[1] as RequestInit).body as string);
		expect(body.get('media_type')).toBe('STORIES');
		expect(body.get('caption')).toBeNull();
	});

	it('sends caption and no media_type for feed posts', async () => {
		const fetch = mockFetchSequence(
			{ id: 'container_1' },
			{ status_code: 'FINISHED' },
			{ id: 'post_1' }
		);

		await publishPost(IG_ID, TOKEN, 'feed', IMAGE_URL, 'My caption');

		const containerCall = fetch.mock.calls[0];
		const body = new URLSearchParams(await (containerCall[1] as RequestInit).body as string);
		expect(body.get('caption')).toBe('My caption');
		expect(body.get('media_type')).toBeNull();
	});

	it('omits caption entirely when feed post has no caption', async () => {
		const fetch = mockFetchSequence(
			{ id: 'container_1' },
			{ status_code: 'FINISHED' },
			{ id: 'post_1' }
		);

		await publishPost(IG_ID, TOKEN, 'feed', IMAGE_URL, null);

		const containerCall = fetch.mock.calls[0];
		const body = new URLSearchParams(await (containerCall[1] as RequestInit).body as string);
		expect(body.get('caption')).toBeNull();
	});

	it('returns igPostId from the publish response', async () => {
		mockFetchSequence(
			{ id: 'container_1' },
			{ status_code: 'FINISHED' },
			{ id: 'real_ig_post_id' }
		);

		const result = await publishPost(IG_ID, TOKEN, 'feed', IMAGE_URL, null);
		expect(result.igPostId).toBe('real_ig_post_id');
	});

	it('sends the correct endpoint URL for container creation', async () => {
		const fetch = mockFetchSequence(
			{ id: 'container_1' },
			{ status_code: 'FINISHED' },
			{ id: 'post_1' }
		);

		await publishPost(IG_ID, TOKEN, 'feed', IMAGE_URL, null);

		expect(fetch.mock.calls[0][0]).toBe(`${BASE}/${IG_ID}/media`);
	});
});

describe('publishPost — container creation failure', () => {
	it('throws with the API error message when container creation fails', async () => {
		mockFetchSequence({ error: { message: 'Invalid access token' } });

		await expect(publishPost(IG_ID, TOKEN, 'feed', IMAGE_URL, null)).rejects.toThrow(
			'Invalid access token'
		);
	});

	it('throws a generic message when no error field is present', async () => {
		mockFetchSequence({ something: 'unexpected' });

		await expect(publishPost(IG_ID, TOKEN, 'feed', IMAGE_URL, null)).rejects.toThrow(
			'Failed to create media container'
		);
	});
});

describe('publishPost — container readiness polling', () => {
	it('polls until FINISHED and then publishes', async () => {
		const fetch = mockFetchSequence(
			{ id: 'c1' },               // container creation
			{ status_code: 'IN_PROGRESS' }, // poll 1
			{ status_code: 'IN_PROGRESS' }, // poll 2
			{ status_code: 'FINISHED' }, // poll 3 — ready
			{ id: 'p1' }               // publish
		);

		const publishPromise = publishPost(IG_ID, TOKEN, 'feed', IMAGE_URL, null);

		// Advance past the two IN_PROGRESS delays (2000ms each)
		await vi.advanceTimersByTimeAsync(5000);
		const result = await publishPromise;

		expect(result.igPostId).toBe('p1');
		// container create + 3 polls + publish
		expect(fetch).toHaveBeenCalledTimes(5);
	});

	it('throws when container status is ERROR', async () => {
		mockFetchSequence(
			{ id: 'c1' },
			{ status_code: 'ERROR' }
		);

		await expect(publishPost(IG_ID, TOKEN, 'feed', IMAGE_URL, null)).rejects.toThrow(
			'Instagram media container failed to process'
		);
	});

	it('throws a timeout error after max poll attempts', async () => {
		// 1 container creation + 12 IN_PROGRESS polls = 13 calls
		const responses = [
			{ id: 'c1' },
			...Array(12).fill({ status_code: 'IN_PROGRESS' })
		];
		mockFetchSequence(...responses);

		const publishPromise = publishPost(IG_ID, TOKEN, 'feed', IMAGE_URL, null);
		// Attach the assertion before advancing time so the rejection is handled
		// immediately and doesn't become an unhandled rejection.
		const assertion = expect(publishPromise).rejects.toThrow('timed out');
		await vi.advanceTimersByTimeAsync(30_000);
		await assertion;
	});
});

describe('publishPost — publish step failure', () => {
	it('throws with the API error when media_publish fails', async () => {
		mockFetchSequence(
			{ id: 'c1' },
			{ status_code: 'FINISHED' },
			{ error: { message: 'Post creation limit reached' } }
		);

		await expect(publishPost(IG_ID, TOKEN, 'feed', IMAGE_URL, null)).rejects.toThrow(
			'Post creation limit reached'
		);
	});

	it('throws a generic message when media_publish returns no id', async () => {
		mockFetchSequence(
			{ id: 'c1' },
			{ status_code: 'FINISHED' },
			{ something: 'wrong' }
		);

		await expect(publishPost(IG_ID, TOKEN, 'feed', IMAGE_URL, null)).rejects.toThrow(
			'Failed to publish post'
		);
	});
});
