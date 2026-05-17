export const FEATURES = {
	// Basic tier — included for all
	dashboard: "basic",
	orders: "basic",
	inquiries: "basic",
	galleries: "basic",

	// Full tier — requires CRM subscription
	galleryDelivery: "full",
	crm: "full",
	board: "full",
	invoicing: "full",
	quotes: "full",
	contracts: "full",
	emails: "full",
	messages: "full",
} as const;

export type Feature = keyof typeof FEATURES;
export type Tier = "basic" | "full";
export type FeatureContext = {
	isCreator?: boolean;
};

const TIER_RANK: Record<Tier, number> = {
	basic: 0,
	full: 1,
};

const CREATOR_ONLY_FEATURES = new Set<Feature>(["messages"]);

export function isCreatorOnlyFeature(feature: Feature): boolean {
	return CREATOR_ONLY_FEATURES.has(feature);
}

export function hasFeature(
	tier: Tier,
	feature: Feature,
	context: FeatureContext = {},
): boolean {
	const required = FEATURES[feature];
	const tierAllowsFeature = TIER_RANK[tier] >= TIER_RANK[required];
	if (!tierAllowsFeature) return false;
	if (isCreatorOnlyFeature(feature) && context.isCreator === false) {
		return false;
	}
	return true;
}

export function getFullFeatures(): Feature[] {
	return Object.entries(FEATURES)
		.filter(([, tier]) => tier === "full")
		.map(([feature]) => feature as Feature);
}
