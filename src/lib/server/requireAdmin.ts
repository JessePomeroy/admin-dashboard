import { error } from "@sveltejs/kit";
import { getServerConfig } from "../config.js";

/**
 * Run the host-provided request verifier.
 * The host decides whether identity, tenant membership, or creator role is
 * required for its route.
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
