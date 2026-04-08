import { ConvexHttpClient } from "convex/browser";
import { getServerConfig } from "../config";

let _client: ConvexHttpClient | null = null;

export function getConvex(): ConvexHttpClient {
	if (!_client) {
		_client = new ConvexHttpClient(getServerConfig().convexUrl || "");
	}
	return _client;
}
