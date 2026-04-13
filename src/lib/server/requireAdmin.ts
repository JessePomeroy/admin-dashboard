import { error } from "@sveltejs/kit";
import { getServerConfig } from "../config";

/**
 * Verify the request is from an authenticated admin.
 * Uses the `verifyAdmin` callback from AdminServerConfig if provided.
 * Throws 401 if verification fails.
 */
export async function requireAdmin(request: Request): Promise<void> {
	const config = getServerConfig();
	if (!config.verifyAdmin) return;

	try {
		const ok = await config.verifyAdmin(request);
		if (!ok) throw error(401, "Unauthorized");
	} catch (err) {
		if (err && typeof err === "object" && "status" in err) throw err;
		throw error(401, "Unauthorized");
	}
}
