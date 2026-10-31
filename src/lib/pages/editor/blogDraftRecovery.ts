import type { BlogSupportingDraft, PostDraft, RichTextDocument } from "../../blogEditor";

function record(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function strings(value: Record<string, unknown>, keys: string[]) {
	return keys.every((key) => value[key] === undefined || typeof value[key] === "string");
}
function image(value: unknown) {
	return (
		record(value) &&
		typeof value.key === "string" &&
		typeof value.assetId === "string" &&
		strings(value, ["altText", "caption"])
	);
}
function richText(value: unknown): value is RichTextDocument {
	if (!record(value) || value.version !== 1 || !Array.isArray(value.blocks)) return false;
	const spans = (items: unknown) =>
		Array.isArray(items) &&
		items.every(
			(span) =>
				record(span) &&
				span.type === "text" &&
				typeof span.key === "string" &&
				typeof span.text === "string" &&
				Array.isArray(span.marks) &&
				span.marks.every(
					(mark) =>
						record(mark) &&
						(mark.type === "strong" ||
							mark.type === "emphasis" ||
							(mark.type === "link" &&
								typeof mark.key === "string" &&
								typeof mark.href === "string")),
				),
		);
	return value.blocks.every(
		(block) =>
			record(block) &&
			typeof block.key === "string" &&
			(block.type === "list"
				? ["bullet", "number"].includes(String(block.style)) &&
					Array.isArray(block.items) &&
					block.items.every(
						(item) => record(item) && typeof item.key === "string" && spans(item.children),
					)
				: ["paragraph", "heading", "quote"].includes(String(block.type)) &&
					spans(block.children) &&
					(block.type !== "heading" || [2, 3, 4].includes(Number(block.level)))),
	);
}
function post(value: unknown): value is PostDraft {
	if (
		!record(value) ||
		value.kind !== "post" ||
		!strings(value, [
			"title",
			"slug",
			"summary",
			"seoTitle",
			"seoDescription",
			"brief",
			"approach",
			"outcome",
			"credits",
			"authorDocumentId",
		])
	)
		return false;
	if (
		value.format !== undefined &&
		!["essay", "projectStory", "technicalNote"].includes(String(value.format))
	)
		return false;
	if (
		value.presentation !== undefined &&
		!["standard", "behindTheScenes", "caseStudy", "clientStory", "technical"].includes(
			String(value.presentation),
		)
	)
		return false;
	if (
		(value.summarySource !== undefined && value.summarySource !== "body") ||
		(value.authorSource !== undefined && value.authorSource !== "siteSettings")
	)
		return false;
	if (
		value.displayPublishedAt !== undefined &&
		(typeof value.displayPublishedAt !== "number" || !Number.isFinite(value.displayPublishedAt))
	)
		return false;
	const technical = (items: unknown) =>
		Array.isArray(items) &&
		items.every(
			(item) => record(item) && typeof item.key === "string" && strings(item, ["label", "details"]),
		);
	return (
		technical(value.equipment) &&
		technical(value.materials) &&
		Array.isArray(value.categories) &&
		value.categories.every(
			(item) => record(item) && typeof item.key === "string" && typeof item.documentId === "string",
		) &&
		(value.mainImage === undefined || image(value.mainImage)) &&
		record(value.body) &&
		value.body.version === 1 &&
		Array.isArray(value.body.blocks) &&
		value.body.blocks.every(record)
	);
}
function supporting(value: unknown): value is BlogSupportingDraft {
	return (
		record(value) &&
		((value.kind === "category" && strings(value, ["title", "slug", "description"])) ||
			(value.kind === "author" &&
				strings(value, ["name", "slug"]) &&
				(value.portrait === undefined || image(value.portrait)) &&
				(value.bio === undefined || richText(value.bio))))
	);
}

export function parsePostRecovery(value: unknown) {
	return post(value) ? value : null;
}
export function parseSupportingRecovery(value: unknown) {
	return supporting(value) ? value : null;
}
