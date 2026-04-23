/**
 * Lightweight logger for client-side code.
 *
 * Forwards to `console.*` in development and no-ops in production so we don't
 * leak internal error details to end users' devtools. Consumers should also
 * surface user-visible feedback via `addToast()` — the logger exists purely
 * for developer-facing diagnostics.
 *
 * Uses SvelteKit's `$app/environment.dev` flag so the check is compatible
 * with the rest of the package (see `theme.ts`) and stays bundler-agnostic.
 */

import { dev } from "$app/environment";

export const logger = {
	error: (...args: unknown[]): void => {
		if (dev) console.error(...args);
	},
	warn: (...args: unknown[]): void => {
		if (dev) console.warn(...args);
	},
	info: (...args: unknown[]): void => {
		if (dev) console.info(...args);
	},
};
