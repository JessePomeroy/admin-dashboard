import { describe, expect, it } from "vitest";
import {
	cookiesFromRequest,
	parseRequestCookieHeader,
} from "../src/lib/server/adminHost";

describe("parseRequestCookieHeader", () => {
	it("parses request cookies into name/value entries", () => {
		expect(parseRequestCookieHeader("session=abc; theme=dark")).toEqual([
			{ name: "session", value: "abc" },
			{ name: "theme", value: "dark" },
		]);
	});

	it("keeps values after the first equals sign intact", () => {
		expect(parseRequestCookieHeader("token=header.payload=signature")).toEqual([
			{ name: "token", value: "header.payload=signature" },
		]);
	});

	it("decodes URI-encoded values when possible", () => {
		expect(parseRequestCookieHeader("name=maggie%20rose")).toEqual([
			{ name: "name", value: "maggie rose" },
		]);
	});

	it("uses the first duplicate cookie value to match SvelteKit request cookies", () => {
		expect(parseRequestCookieHeader("session=old; session=new")).toEqual([
			{ name: "session", value: "old" },
		]);
	});

	it("treats malformed cookie segments as empty-string values", () => {
		expect(parseRequestCookieHeader("session=abc; flag; =ignored")).toEqual([
			{ name: "session", value: "abc" },
			{ name: "flag", value: "" },
		]);
	});
});

describe("cookiesFromRequest", () => {
	it("returns a read-only SvelteKit-compatible cookie reader", () => {
		const cookies = cookiesFromRequest(
			new Request("https://example.com/admin", {
				headers: { cookie: "session=abc; theme=dark" },
			}),
		);

		expect(cookies.get("session")).toBe("abc");
		expect(cookies.get("missing")).toBeUndefined();
		expect(cookies.getAll()).toEqual([
			{ name: "session", value: "abc" },
			{ name: "theme", value: "dark" },
		]);
		expect(() => cookies.set("next", "value", { path: "/" })).toThrow(
			/read-only request cookies/,
		);
	});
});
