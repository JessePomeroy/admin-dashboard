import type { HomepageQuoteDraftPayload } from "./config";

export type HomepageQuoteFieldErrors = Partial<
	Record<"text" | "attribution", string>
>;

export function emptyHomepageQuoteDraft(): HomepageQuoteDraftPayload {
	return { text: "", attribution: "" };
}

export function copyHomepageQuoteDraft(
	payload: HomepageQuoteDraftPayload | undefined,
): HomepageQuoteDraftPayload {
	return {
		text: payload?.text ?? "",
		attribution: payload?.attribution ?? "",
	};
}

export function serializeHomepageQuoteDraft(
	payload: HomepageQuoteDraftPayload,
) {
	return JSON.stringify(copyHomepageQuoteDraft(payload));
}

export function validateHomepageQuoteForPublish(
	payload: HomepageQuoteDraftPayload,
): HomepageQuoteFieldErrors {
	const errors: HomepageQuoteFieldErrors = {};
	if (!payload.text?.trim()) errors.text = "Quote text is required";
	if (!payload.attribution?.trim()) {
		errors.attribution = "Attribution is required";
	}
	if ((payload.text?.length ?? 0) > 2_000) {
		errors.text = "Quote text must be 2000 characters or fewer";
	}
	if ((payload.attribution?.length ?? 0) > 160) {
		errors.attribution = "Attribution must be 160 characters or fewer";
	}
	return errors;
}

export function hasHomepageQuoteErrors(errors: HomepageQuoteFieldErrors) {
	return Object.keys(errors).length > 0;
}

export function resolveHomepageQuotePreviewUrl(value: unknown, currentOrigin: string) {
	if (typeof value !== "string" || !value) {
		throw new Error("The preview endpoint returned an invalid URL.");
	}
	const origin = new URL(currentOrigin).origin;
	const url = new URL(value, `${origin}/`);
	if (url.origin !== origin) {
		throw new Error("The preview endpoint returned an unsafe URL.");
	}
	return url.toString();
}
