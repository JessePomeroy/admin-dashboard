import { ConvexHttpClient } from "convex/browser";
import { getServerConfig } from "../config";

let _client: ConvexHttpClient | null = null;

export function getConvex(): ConvexHttpClient {
	if (!_client) {
		_client = new ConvexHttpClient(getServerConfig().convexUrl || "");
	}
	return _client;
}

/**
 * Get a Convex HTTP client, optionally authenticated via the
 * `getConvexToken` callback in AdminServerConfig.
 */
export async function getAuthenticatedConvex(request: Request): Promise<ConvexHttpClient> {
	const config = getServerConfig();
	const client = new ConvexHttpClient(config.convexUrl || "");
	if (config.getConvexToken) {
		const token = await config.getConvexToken(request);
		if (token) client.setAuth(token);
	}
	return client;
}
