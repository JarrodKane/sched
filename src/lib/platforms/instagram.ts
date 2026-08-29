const BASE = 'https://graph.instagram.com';

export type PostType = 'feed' | 'story';

export interface PublishResult {
	igPostId: string;
}

async function waitForContainerReady(
	containerId: string,
	accessToken: string,
	maxAttempts = 12,
	delayMs = 2000
): Promise<void> {
	for (let i = 0; i < maxAttempts; i++) {
		const res = await fetch(
			`${BASE}/${containerId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`
		);
		const data = (await res.json()) as {
			status_code?: string;
			error?: { message: string };
		};
		if (data.status_code === 'FINISHED') return;
		if (data.status_code === 'ERROR')
			throw new Error('Instagram media container failed to process');
		// IN_PROGRESS or unknown — wait and retry
		await new Promise((r) => setTimeout(r, delayMs));
	}
	throw new Error('Instagram media container timed out (still processing after ~24s)');
}

export async function publishPost(
	igBusinessId: string,
	accessToken: string,
	type: PostType,
	imageUrl: string,
	caption?: string | null
): Promise<PublishResult> {
	const containerParams: Record<string, string> = {
		image_url: imageUrl,
		access_token: accessToken
	};

	if (type === 'story') {
		containerParams.media_type = 'STORIES';
	} else if (caption) {
		containerParams.caption = caption;
	}

	const containerRes = await fetch(`${BASE}/${igBusinessId}/media`, {
		method: 'POST',
		body: new URLSearchParams(containerParams)
	});
	const containerData = (await containerRes.json()) as {
		id?: string;
		error?: { message: string };
	};
	if (!containerData.id)
		throw new Error(containerData.error?.message ?? 'Failed to create media container');

	// Wait for Instagram to finish processing the image before publishing
	await waitForContainerReady(containerData.id, accessToken);

	const publishRes = await fetch(`${BASE}/${igBusinessId}/media_publish`, {
		method: 'POST',
		body: new URLSearchParams({
			creation_id: containerData.id,
			access_token: accessToken
		})
	});
	const publishData = (await publishRes.json()) as {
		id?: string;
		error?: { message: string };
	};
	if (!publishData.id)
		throw new Error(publishData.error?.message ?? 'Failed to publish post');

	return { igPostId: publishData.id };
}
