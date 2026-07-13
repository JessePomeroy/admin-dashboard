import { error } from "@sveltejs/kit";
import { getServerConfig } from "../config.js";

/**
 * Resolve the host-provided request verifier and fail closed when a JavaScript
 * or casted consumer omits the required runtime configuration.
 */
export function getRequiredAdminVerifier() {
	const verifier = getServerConfig().verifyAdmin;
	if (typeof verifier !== "function") {
		throw error(500, "Admin authorization verifier not configured");
	}
	return verifier;
}

/**
 * Run the host-provided request verifier.
 * The host decides whether identity, tenant membership, or creator role is
 * required for its route.
 * Missing runtime configuration throws 500. False or unexpected failures throw
 * 401, while intentional host HTTP errors preserve their status.
 */
export async function requireAdmin(request: Request): Promise<void> {
	const verifyAdmin = getRequiredAdminVerifier();

	try {
		const ok = await verifyAdmin(request);
		if (!ok) throw error(401, "Unauthorized");
	} catch (err) {
		if (err && typeof err === "object" && "status" in err) throw err;
		throw error(401, "Unauthorized");
	}
}
