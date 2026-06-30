import { describe, expect, it } from "vitest";
import {
	validateEmail,
	trimString,
	requireString,
	validatePositiveNumber,
	validateFilename,
} from "../src/lib/server/validation";

describe("validateEmail", () => {
	it("accepts valid emails", () => {
		expect(validateEmail("test@example.com")).toBe(true);
		expect(validateEmail("user.name@domain.co")).toBe(true);
		expect(validateEmail("a@b.c")).toBe(true);
	});

	it("rejects invalid emails", () => {
		expect(validateEmail("")).toBe(false);
		expect(validateEmail("not-an-email")).toBe(false);
		expect(validateEmail("@domain.com")).toBe(false);
		expect(validateEmail("user@")).toBe(false);
		expect(validateEmail("user @domain.com")).toBe(false);
	});
});

describe("trimString", () => {
	it("trims and truncates a string", () => {
		expect(trimString("  hello  ", 10)).toBe("hello");
		expect(trimString("hello world", 5)).toBe("hello");
	});

	it("returns undefined for null/undefined", () => {
		expect(trimString(null, 10)).toBeUndefined();
		expect(trimString(undefined, 10)).toBeUndefined();
	});

	it("handles empty string", () => {
		expect(trimString("", 10)).toBe("");
		expect(trimString("   ", 10)).toBe("");
	});
});

describe("requireString", () => {
	it("returns trimmed string for valid input", () => {
		expect(requireString("  hello  ", "name")).toBe("hello");
	});

	it("truncates to maxLength", () => {
		expect(requireString("hello world", "name", 5)).toBe("hello");
	});

	it("throws for empty string", () => {
		expect(() => requireString("", "name")).toThrow("name is required");
	});

	it("throws for whitespace-only string", () => {
		expect(() => requireString("   ", "name")).toThrow("name is required");
	});

	it("throws for non-string values", () => {
		expect(() => requireString(null, "name")).toThrow("name is required");
		expect(() => requireString(undefined, "name")).toThrow("name is required");
		expect(() => requireString(123, "name")).toThrow("name is required");
	});
});

describe("validatePositiveNumber", () => {
	it("accepts positive numbers", () => {
		expect(validatePositiveNumber(5, "price")).toBe(5);
		expect(validatePositiveNumber(0, "price")).toBe(0);
		expect(validatePositiveNumber("10", "price")).toBe(10);
	});

	it("throws for negative numbers", () => {
		expect(() => validatePositiveNumber(-1, "price")).toThrow(
			"price must be a positive number",
		);
	});

	it("throws for NaN values", () => {
		expect(() => validatePositiveNumber("abc", "price")).toThrow(
			"price must be a positive number",
		);
		expect(() => validatePositiveNumber(NaN, "price")).toThrow(
			"price must be a positive number",
		);
	});
});

describe("validateFilename", () => {
	it("allows browser image, tiff, and camera raw extensions", () => {
		expect(validateFilename("portrait.jpg")).toBe("portrait.jpg");
		expect(validateFilename("scan.tiff")).toBe("scan.tiff");
		expect(validateFilename("fuji.RAF")).toBe("fuji.RAF");
		expect(validateFilename("sony.arw")).toBe("sony.arw");
		expect(validateFilename("canon.cr3")).toBe("canon.cr3");
		expect(validateFilename("archive.dng")).toBe("archive.dng");
	});

	it("rejects unsupported or unsafe filenames", () => {
		expect(() => validateFilename("script.svg")).toThrow("File type not allowed");
		expect(() => validateFilename("../portrait.raf")).toThrow(
			"Filename contains invalid characters",
		);
	});
});
