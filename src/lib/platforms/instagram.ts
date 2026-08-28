const GRAPH_API_VERSION = 'v25.0';
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export async function publishPost(
	account: { igBusinessId: string; accessToken: string },
	post: { type: 'feed' | 'story'; mediaUrl: string; caption?: string | null }
): Promise<string> {
	// Step 1: create media container
	const createParams = new URLSearchParams({
		access_token: account.accessToken,
		image_url: post.mediaUrl
	});
	if (post.type === 'story') {
		createParams.set('media_type', 'STORIES');
	} else if (post.caption) {
		createParams.set('caption', post.caption);
	}

	const createRes = await fetch(`${BASE_URL}/${account.igBusinessId}/media`, {
		method: 'POST',
		body: createParams
	});
	const createData = (await createRes.json()) as { id?: string; error?: { message: string } };
	if (!createData.id) {
		throw new Error(createData.error?.message ?? 'Failed to create Instagram media container');
	}

	// Step 2: publish the container
	const publishParams = new URLSearchParams({
		creation_id: createData.id,
		access_token: account.accessToken
	});
	const publishRes = await fetch(`${BASE_URL}/${account.igBusinessId}/media_publish`, {
		method: 'POST',
		body: publishParams
	});
	const publishData = (await publishRes.json()) as { id?: string; error?: { message: string } };
	if (!publishData.id) {
		throw new Error(publishData.error?.message ?? 'Failed to publish Instagram media');
	}

	return publishData.id;
}
