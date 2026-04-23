/**
 * Theme Store
 *
 * A Svelte store that manages the light/dark theme state.
 * - Persists user preference to localStorage
 * - Falls back to system preference (prefers-color-scheme)
 * - Provides reactive state for components that need to respond to theme changes
 */

import { writable } from "svelte/store";
import { browser } from "$app/environment";

const STORAGE_KEY = "theme";

function createThemeStore() {
	// Default to dark mode
	let initial = true;

	// On client-side, check for saved preference or system preference
	if (browser) {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			// User has a saved preference
			initial = stored === "dark";
		} else {
			// Fall back to system preference
			initial = window.matchMedia("(prefers-color-scheme: dark)").matches;
		}
	}

	const store = writable(initial);

	// Persist every change to localStorage so user preference survives reload
	if (browser) {
		store.subscribe((val) => {
			try {
				localStorage.setItem(STORAGE_KEY, val ? "dark" : "light");
			} catch {
				// Private browsing / quota errors — non-fatal
			}
		});
	}

	return {
		subscribe: store.subscribe,
		setDark: () => store.set(true),
		setLight: () => store.set(false),
		set: store.set,
	};
}

// Export the store - true = dark mode, false = light mode
export const isDark = createThemeStore();
