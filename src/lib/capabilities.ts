import type { BoardProjectTypeGroup } from "./config";
import { type Feature, type Tier, hasFeature } from "./features";

export const DEFAULT_CREATOR_BOARD_PROJECT_TYPE_GROUPS: BoardProjectTypeGroup[] = [
	{
		label: "photography",
		values: ["wedding", "portrait", "family", "commercial", "event"],
	},
	{ label: "web", values: ["website", "redesign", "maintenance", "other"] },
];

export interface AdminCapabilityInput {
	tier: Tier;
	isCreator: boolean;
	boardProjectTypes?: BoardProjectTypeGroup[];
}

export interface AdminCapabilities {
	tier: Tier;
	isCreator: boolean;
	boardProjectTypeGroups: BoardProjectTypeGroup[];
	hasFeature: (feature: Feature) => boolean;
	canInitializeBoardType: (projectType: string) => boolean;
}

function configuredBoardGroups(
	input: AdminCapabilityInput,
): BoardProjectTypeGroup[] {
	if (input.boardProjectTypes?.length) return input.boardProjectTypes;
	return input.isCreator ? DEFAULT_CREATOR_BOARD_PROJECT_TYPE_GROUPS : [];
}

export function getAdminCapabilities(
	input: AdminCapabilityInput,
): AdminCapabilities {
	const boardProjectTypeGroups = configuredBoardGroups(input);
	const boardProjectTypes = new Set(
		boardProjectTypeGroups.flatMap((group) => group.values),
	);

	return {
		tier: input.tier,
		isCreator: input.isCreator,
		boardProjectTypeGroups,
		hasFeature: (feature) =>
			hasFeature(input.tier, feature, { isCreator: input.isCreator }),
		canInitializeBoardType: (projectType) => boardProjectTypes.has(projectType),
	};
}
