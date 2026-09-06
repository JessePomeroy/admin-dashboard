import { describe, expect, it } from "vitest";
import {
	validateEmail,
	trimString,
	requireString,
	validatePositiveNumber,
	validateFilename,
} from "../src/lib/server/validation";

describe("server input validation", () => {
	it("accepts valid email shapes and rejects missing or malformed parts", () => {
		for (const email of ["test@example.com", "user.name@domain.co", "a@b.c"])
			expect(validateEmail(email), email).toBe(true);
		for (const email of ["", "not-an-email", "@domain.com", "user@", "user @domain.com"])
			expect(validateEmail(email), email).toBe(false);
	});

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

	it("requires a nonempty string after trimming and caps its length", () => {
		expect(requireString("  hello  ", "name")).toBe("hello");
		expect(requireString("hello world", "name", 5)).toBe("hello");
		for (const value of ["", "   ", null, undefined, 123])
			expect(() => requireString(value, "name")).toThrow("name is required");
	});

	it("accepts nonnegative numeric input and rejects negatives and NaN", () => {
		for (const [value, expected] of [
			[5, 5],
			[0, 0],
			["10", 10],
		] as const)
			expect(validatePositiveNumber(value, "price")).toBe(expected);
		for (const value of [-1, "abc", NaN])
			expect(() => validatePositiveNumber(value, "price")).toThrow(
				"price must be a positive number",
			);
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
