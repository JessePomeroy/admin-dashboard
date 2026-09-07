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

	if (browser) {
		let stored: string | null = null;
		try {
			stored = localStorage.getItem(STORAGE_KEY);
		} catch {
			// Storage access may be denied even before getItem can be called.
		}
		initial = stored === "light" || stored === "dark"
			? stored === "dark"
			: window.matchMedia("(prefers-color-scheme: dark)").matches;
	}

	const store = writable(initial);

	// One owner keeps public and admin UI in sync, even without a mounted layout.
	if (browser) {
		store.subscribe((val) => {
			document.documentElement.classList.toggle("dark", val);
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
