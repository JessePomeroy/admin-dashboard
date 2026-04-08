import { error, json } from "@sveltejs/kit";
import { getServerConfig } from "../../config";
import { getConvex } from "../convexClient";

export function createPortalTokenHandler() {
	return async ({ request }: { request: Request }) => {
		const config = getServerConfig();
		const { api } = config;
		const siteUrl = config.siteUrl;
		const convex = getConvex();

		const data = await request.json();

		if (!data.type || !data.documentId || !data.clientId) {
			throw error(400, "type, documentId, and clientId are required");
		}

		const validTypes = ["invoice", "quote", "contract"];
		if (!validTypes.includes(data.type)) {
			throw error(400, "Invalid type");
		}

		try {
			const token = await convex.mutation(api.portal.createToken, {
				siteUrl,
				type: data.type,
				documentId: data.documentId,
				clientId: data.clientId as any,
				expiresAt: data.expiresAt,
			});
			return json({ success: true, token });
		} catch (err) {
			console.error("Failed to create portal token:", err);
			throw error(500, "Failed to create portal token");
		}
	};
}
