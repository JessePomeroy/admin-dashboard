import { describe, expect, it } from "vitest";
import { type Feature, getFullFeatures, hasFeature } from "../src/lib/features";

const basic: Feature[] = ["dashboard", "editor", "orders", "inquiries", "galleries"];
const full: Feature[] = [
	"galleryDelivery",
	"crm",
	"board",
	"invoicing",
	"quotes",
	"contracts",
	"emails",
	"messages",
];
const features = [...basic, ...full];

describe("feature policy", () => {
	it.each([
		["basic", undefined, basic],
		["full", undefined, features.filter((feature) => feature !== "messages")],
		["full", false, features.filter((feature) => feature !== "messages")],
		["full", true, features],
	] as const)("selects the exact features for %s tier, creator=%s", (tier, isCreator, expected) => {
		expect(features.filter((feature) => isCreator === undefined
			? hasFeature(tier, feature)
			: hasFeature(tier, feature, { isCreator }))).toEqual(expected);
	});

	it("lists exactly the full-tier upsell features", () => {
		expect(getFullFeatures()).toEqual(full);
	});
});
