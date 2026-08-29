const BASE = 'https://graph.instagram.com';

export type PostType = 'feed' | 'story';

export interface PublishResult {
	igPostId: string;
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
