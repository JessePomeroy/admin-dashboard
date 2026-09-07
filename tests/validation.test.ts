import { describe, expect, it } from "vitest";
import {
	trimString,
	validateFilename,
} from "../src/lib/server/validation";

describe("server input validation", () => {
	it("trims optional strings, bounds length, and preserves absent values", () => {
		for (const [value, length, expected] of [
			["  hello  ", 10, "hello"],
			["hello world", 5, "hello"],
			[null, 10, undefined],
			[undefined, 10, undefined],
			["", 10, ""],
			["   ", 10, ""],
		] as const)
			expect(trimString(value, length)).toBe(expected);
	});

	it("accepts image and camera extensions while rejecting unsupported types and traversal", () => {
		for (const filename of [
			"portrait.jpg",
			"scan.tiff",
			"fuji.RAF",
			"sony.arw",
			"canon.cr3",
			"archive.dng",
		])
			expect(validateFilename(filename)).toBe(filename);
		expect(() => validateFilename("script.svg")).toThrow("File type not allowed");
		expect(() => validateFilename("../portrait.raf")).toThrow(
			"Filename contains invalid characters",
		);
	});
});
