import type {
	AboutHighlightDraft,
	AboutPageDraftPayload,
	AboutPortraitDraft,
	AboutSectionDraft,
} from "./config";
import type { PortfolioMediaAsset } from "./portfolioEditor";

export const ABOUT_PORTRAIT_MAX = 10;

export interface AboutPublishIssue {
	fieldId: string;
	message: string;
}

export function emptyAboutPageDraft(): AboutPageDraftPayload {
	return { portraits: [], sections: [], highlights: [] };
}

export function copyAboutPageDraft(
	payload: AboutPageDraftPayload | undefined,
): AboutPageDraftPayload {
	return {
		...emptyAboutPageDraft(),
		...payload,
		portraits: (payload?.portraits ?? []).map((portrait) => ({
			...portrait,
			focalPoint: portrait.focalPoint ? { ...portrait.focalPoint } : undefined,
		})),
		sections: (payload?.sections ?? []).map((section) => ({
			...section,
			items: [...section.items],
		})),
		highlights: (payload?.highlights ?? []).map((highlight) => ({ ...highlight })),
	};
}

export function serializeAboutPageDraft(payload: AboutPageDraftPayload) {
	return JSON.stringify({
		heading: payload.heading ?? null,
		displayName: payload.displayName ?? null,
		role: payload.role ?? null,
		introduction: payload.introduction ?? null,
		biography: payload.biography ?? null,
		portraits: payload.portraits ?? [],
		sections: payload.sections ?? [],
		highlights: payload.highlights ?? [],
		seoDescription: payload.seoDescription ?? null,
		seoImageAssetId: payload.seoImageAssetId ?? null,
	});
}

function key(prefix: string) {
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function newAboutPortrait(asset: PortfolioMediaAsset): AboutPortraitDraft {
	return {
		key: key("portrait"),
		assetId: asset._id,
		altText: "",
		decorative: false,
		focalPoint: { x: 0.5, y: 0.5 },
	};
}

export function newAboutSection(): AboutSectionDraft {
	return { key: key("section"), title: "", items: [""] };
}

export function newAboutHighlight(): AboutHighlightDraft {
	return { key: key("highlight"), label: "", value: "" };
}

export function moveAboutItem<T>(items: T[], index: number, direction: -1 | 1) {
	const target = index + direction;
	if (target < 0 || target >= items.length) return items;
	const next = [...items];
	[next[index], next[target]] = [next[target], next[index]];
	return next;
}

function required(
	issues: AboutPublishIssue[],
	fieldId: string,
	value: string | undefined,
	message: string,
) {
	if (!value?.trim()) issues.push({ fieldId, message });
}

export function validateAboutPageForPublish(payload: AboutPageDraftPayload) {
	const issues: AboutPublishIssue[] = [];
	required(issues, "about-heading", payload.heading, "Add the page heading.");
	required(issues, "about-display-name", payload.displayName, "Add the public display name.");
	required(issues, "about-seo-description", payload.seoDescription, "Add a search description.");
	const portraits = payload.portraits ?? [];
	if (portraits.length === 0) {
		issues.push({ fieldId: "about-portraits-heading", message: "Add at least one portrait." });
	}
	if (portraits.length > ABOUT_PORTRAIT_MAX) {
		issues.push({
			fieldId: "about-portraits-heading",
			message: `Use no more than ${ABOUT_PORTRAIT_MAX} portraits.`,
		});
	}
	for (const [index, portrait] of portraits.entries()) {
		if (!portrait.decorative && !portrait.altText?.trim()) {
			issues.push({
				fieldId: `about-portrait-${portrait.key}-alt`,
				message: `Portrait ${index + 1} needs alt text or must be marked Decorative.`,
			});
		}
	}
	const sections = payload.sections ?? [];
	for (const [index, section] of sections.entries()) {
		required(
			issues,
			`about-section-${section.key}-title`,
			section.title,
			`Section ${index + 1} needs a title.`,
		);
		for (const [itemIndex, item] of section.items.entries()) {
			required(
				issues,
				`about-section-${section.key}-item-${itemIndex}`,
				item,
				`Section ${index + 1}, item ${itemIndex + 1} cannot be empty.`,
			);
		}
	}
	for (const [index, highlight] of (payload.highlights ?? []).entries()) {
		required(
			issues,
			`about-highlight-${highlight.key}-label`,
			highlight.label,
			`Highlight ${index + 1} needs a label.`,
		);
		required(
			issues,
			`about-highlight-${highlight.key}-value`,
			highlight.value,
			`Highlight ${index + 1} needs a value.`,
		);
	}
	if (
		!payload.introduction?.trim()
		&& !payload.biography?.trim()
		&& sections.length === 0
	) {
		issues.push({
			fieldId: "about-introduction",
			message: "Add an introduction, biography, or structured section.",
		});
	}
	return issues;
}
