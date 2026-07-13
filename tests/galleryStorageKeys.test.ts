import { describe, expect, it } from "vitest";
import {
	canonicalGallerySiteUrl,
	isGalleryKeyForSite,
	isGalleryOriginalKeyForSession,
	isGalleryOriginalKeyForSite,
	isGalleryStorageSegment,
	parseGalleryStorageKey,
} from "../src/lib/server/galleryStorageKeys";

describe("gallery storage keys", () => {
	it("parses the Worker contract from the right for bare and URL-shaped sites", () => {
		expect(parseGalleryStorageKey("tenant.example/gallery-1/original/photo.jpg")).toEqual({
			siteUrl: "tenant.example",
			galleryId: "gallery-1",
			kind: "original",
			filename: "photo.jpg",
		});
		expect(parseGalleryStorageKey("https://tenant.example/gallery-1/thumb/photo.jpg")).toEqual({
			siteUrl: "https://tenant.example",
			galleryId: "gallery-1",
			kind: "thumb",
			filename: "photo.jpg",
		});
	});

	it.each(["original", "preview", "thumb"])("accepts the %s object kind", (kind) => {
		expect(parseGalleryStorageKey(`tenant.example/gallery-1/${kind}/photo.jpg`)?.kind)
			.toBe(kind);
	});

	it.each([
		"tenant.example/gallery-1/photo.jpg",
		"tenant.example/gallery-1/other/photo.jpg",
		"tenant.example/gallery-1/original/",
		"tenant.example/gallery-1/original/.",
		"tenant.example/gallery-1/original/..",
		"tenant.example/gallery-1/original/photo\\name.jpg",
	])("rejects malformed Worker keys: %s", (key) => {
		expect(parseGalleryStorageKey(key)).toBeNull();
	});

	it("distinguishes an exact site from a nested prefix", () => {
		const key = "tenant.example/sub/gallery-1/original/photo.jpg";
		expect(parseGalleryStorageKey(key)?.siteUrl).toBe("tenant.example/sub");
		expect(isGalleryKeyForSite(key, "tenant.example")).toBe(false);
	});

	it("canonicalizes trailing slashes without changing other site identity", () => {
		expect(canonicalGallerySiteUrl("https://Tenant.example///"))
			.toBe("https://Tenant.example");
		expect(isGalleryKeyForSite(
			"tenant.example/gallery-1/original/photo.jpg",
			"tenant.example/",
		)).toBe(true);
		expect(isGalleryKeyForSite(
			"tenant.example/gallery-1/original/photo.jpg",
			"TENANT.example",
		)).toBe(false);
	});

	it.each([
		["gallery-1", true],
		["", false],
		[".", false],
		["..", false],
		["gallery/child", false],
		["gallery\\child", false],
	])("validates one opaque gallery ID segment: %s", (galleryId, expected) => {
		expect(isGalleryStorageSegment(galleryId)).toBe(expected);
	});

	it("requires originals for original-only operations", () => {
		expect(isGalleryOriginalKeyForSite(
			"tenant.example/gallery-1/original/photo.jpg",
			"tenant.example",
		)).toBe(true);
		expect(isGalleryOriginalKeyForSite(
			"tenant.example/gallery-1/preview/photo.jpg",
			"tenant.example",
		)).toBe(false);
	});

	it("binds upload-session keys to the exact site, gallery, and original kind", () => {
		const session = { siteUrl: "tenant.example/", galleryId: "gallery-1" };
		expect(isGalleryOriginalKeyForSession(
			"tenant.example/gallery-1/original/photo.jpg",
			session,
		)).toBe(true);
		expect(isGalleryOriginalKeyForSession(
			"tenant.example/gallery-2/original/photo.jpg",
			session,
		)).toBe(false);
		expect(isGalleryOriginalKeyForSession(
			"tenant.example/sub/gallery-1/original/photo.jpg",
			session,
		)).toBe(false);
		expect(isGalleryOriginalKeyForSession(
			"tenant.example/gallery-1/thumb/photo.jpg",
			session,
		)).toBe(false);
	});
});
