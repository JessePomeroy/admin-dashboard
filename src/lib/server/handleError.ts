import { error } from "@sveltejs/kit";

/**
 * Unified error handler for server-side request handlers.
 * If the error is already a SvelteKit HttpError (has `status`), rethrow it.
 * Otherwise log the error and throw a generic 500.
 */
export function handleServerError(err: unknown, fallbackMessage: string): never {
	if (err && typeof err === "object" && "status" in err) throw err;
	console.error(fallbackMessage, err);
	throw error(500, fallbackMessage);
}
