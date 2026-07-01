import { error, json } from "@sveltejs/kit";
import { getServerConfig } from "../../config.js";
import { toId } from "../../utils.js";
import { getAuthenticatedConvex } from "../convexClient.js";
import { handleServerError } from "../handleError.js";
import { requireAdmin } from "../requireAdmin.js";

export function createPortalTokenHandler() {
	return async ({ request }: { request: Request }) => {
		await requireAdmin(request);

		const config = getServerConfig();
		const { api } = config;
		const siteUrl = config.siteUrl;
		const convex = await getAuthenticatedConvex(request);

		const data = await request.json();

		if (!data.type || !data.documentId || !data.clientId) {
			throw error(400, "type, documentId, and clientId are required");
		}

		const validTypes = ["invoice", "quote", "contract", "gallery"];
		if (!validTypes.includes(data.type)) {
			throw error(400, "Invalid type");
		}

		try {
			const token = await convex.mutation(api.portal.createToken, {
				siteUrl,
				type: data.type,
				documentId: data.documentId,
				clientId: toId(data.clientId),
				expiresAt: data.expiresAt,
			});
			return json({ success: true, token });
		} catch (err) {
			handleServerError(err, "Failed to create portal token");
		}
	};
}
