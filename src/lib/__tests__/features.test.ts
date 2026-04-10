import { describe, expect, it } from "vitest";
import { hasFeature, getFullFeatures } from "../features";

describe("hasFeature", () => {
	// Basic tier features
	it("basic tier unlocks dashboard", () => {
		expect(hasFeature("basic", "dashboard")).toBe(true);
	});

	it("basic tier unlocks orders", () => {
		expect(hasFeature("basic", "orders")).toBe(true);
	});

	it("basic tier unlocks inquiries", () => {
		expect(hasFeature("basic", "inquiries")).toBe(true);
	});

	it("basic tier unlocks galleries (read-only)", () => {
		expect(hasFeature("basic", "galleries")).toBe(true);
	});

	// Basic tier does NOT get full features
	it("basic tier does NOT unlock galleryDelivery", () => {
		expect(hasFeature("basic", "galleryDelivery")).toBe(false);
	});

	it("basic tier does NOT unlock crm", () => {
		expect(hasFeature("basic", "crm")).toBe(false);
	});

	it("basic tier does NOT unlock invoicing", () => {
		expect(hasFeature("basic", "invoicing")).toBe(false);
	});

	it("basic tier does NOT unlock quotes", () => {
		expect(hasFeature("basic", "quotes")).toBe(false);
	});

	it("basic tier does NOT unlock contracts", () => {
		expect(hasFeature("basic", "contracts")).toBe(false);
	});

	it("basic tier does NOT unlock emails", () => {
		expect(hasFeature("basic", "emails")).toBe(false);
	});

	it("basic tier does NOT unlock messages", () => {
		expect(hasFeature("basic", "messages")).toBe(false);
	});

	it("basic tier does NOT unlock board", () => {
		expect(hasFeature("basic", "board")).toBe(false);
	});

	// Full tier gets everything
	it("full tier unlocks all basic features", () => {
		expect(hasFeature("full", "dashboard")).toBe(true);
		expect(hasFeature("full", "orders")).toBe(true);
		expect(hasFeature("full", "inquiries")).toBe(true);
		expect(hasFeature("full", "galleries")).toBe(true);
	});

	it("full tier unlocks galleryDelivery", () => {
		expect(hasFeature("full", "galleryDelivery")).toBe(true);
	});

	it("full tier unlocks all CRM features", () => {
		expect(hasFeature("full", "crm")).toBe(true);
		expect(hasFeature("full", "board")).toBe(true);
		expect(hasFeature("full", "invoicing")).toBe(true);
		expect(hasFeature("full", "quotes")).toBe(true);
		expect(hasFeature("full", "contracts")).toBe(true);
		expect(hasFeature("full", "emails")).toBe(true);
		expect(hasFeature("full", "messages")).toBe(true);
	});
});

describe("getFullFeatures", () => {
	it("returns only full-tier features", () => {
		const fullFeatures = getFullFeatures();
		expect(fullFeatures).toContain("galleryDelivery");
		expect(fullFeatures).toContain("crm");
		expect(fullFeatures).toContain("board");
		expect(fullFeatures).toContain("invoicing");
		expect(fullFeatures).toContain("quotes");
		expect(fullFeatures).toContain("contracts");
		expect(fullFeatures).toContain("emails");
		expect(fullFeatures).toContain("messages");
	});

	it("does not include basic-tier features", () => {
		const fullFeatures = getFullFeatures();
		expect(fullFeatures).not.toContain("dashboard");
		expect(fullFeatures).not.toContain("orders");
		expect(fullFeatures).not.toContain("inquiries");
		expect(fullFeatures).not.toContain("galleries");
	});
});
