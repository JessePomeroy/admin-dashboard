import { get } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const environment = vi.hoisted(() => ({ browser: true }));
vi.mock("$app/environment", () => environment);

beforeEach(() => {
	vi.resetModules();
	environment.browser = true;
	localStorage.clear();
	document.documentElement.className = "host-class";
	vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	document.documentElement.className = "";
});

describe("shared theme store", () => {
	it.each([
		["light", true, false],
		["dark", false, true],
		[null, true, true],
		[null, false, false],
		["invalid", true, true],
		["invalid", false, false],
		["DARK", true, true],
		["", true, true],
	])("initializes stored %s with system dark %s to %s", async (stored, systemDark, expected) => {
		if (stored !== null) localStorage.setItem("theme", stored);
		vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: systemDark })));
		const { isDark } = await import("../src/lib/theme");
		expect(get(isDark)).toBe(expected);
		expect(document.documentElement.classList.contains("dark")).toBe(expected);
		expect(document.documentElement.classList.contains("host-class")).toBe(true);
		expect(localStorage.getItem("theme")).toBe(expected ? "dark" : "light");
	});

	it("keeps all public setters, DOM and persistence synchronized without a layout subscriber", async () => {
		const { isDark } = await import("../src/lib/theme");
		const seen: boolean[] = [];
		const unsubscribe = isDark.subscribe((value) => seen.push(value));
		isDark.setDark();
		expect(document.documentElement.classList.contains("dark")).toBe(true);
		expect(localStorage.getItem("theme")).toBe("dark");
		isDark.setLight();
		expect(document.documentElement.classList.contains("dark")).toBe(false);
		expect(localStorage.getItem("theme")).toBe("light");
		unsubscribe();
		isDark.set(true);
		expect(get(isDark)).toBe(true);
		expect(document.documentElement.classList.contains("dark")).toBe(true);
		expect(localStorage.getItem("theme")).toBe("dark");
		expect(seen).toEqual([false, true, false]);
	});

	it("falls back to the system if reading storage is denied", async () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Denied"); });
		vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
		const { isDark } = await import("../src/lib/theme");
		expect(get(isDark)).toBe(true);
		isDark.setLight();
		expect(document.documentElement.classList.contains("dark")).toBe(false);
	});

	it("keeps DOM and reactive state working if writes fail", async () => {
		localStorage.setItem("theme", "dark");
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota exceeded"); });
		const { isDark } = await import("../src/lib/theme");
		expect(get(isDark)).toBe(true);
		isDark.setLight();
		expect(get(isDark)).toBe(false);
		expect(document.documentElement.classList.contains("dark")).toBe(false);
		isDark.setDark();
		expect(document.documentElement.classList.contains("dark")).toBe(true);
	});

	it("handles denied access to the localStorage property itself", async () => {
		vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new Error("SecurityError"); });
		const { isDark } = await import("../src/lib/theme");
		isDark.setDark();
		expect(get(isDark)).toBe(true);
		expect(document.documentElement.classList.contains("dark")).toBe(true);
	});

	it("supports SSR imports and setters without accessing browser globals", async () => {
		environment.browser = false;
		vi.stubGlobal("window", undefined);
		vi.stubGlobal("document", undefined);
		vi.stubGlobal("localStorage", undefined);
		const { isDark } = await import("../src/lib/theme");
		expect(get(isDark)).toBe(true);
		isDark.setLight();
		expect(get(isDark)).toBe(false);
	});
});
