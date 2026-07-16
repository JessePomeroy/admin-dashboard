import type { ContactPageDraftPayload } from "./config";

export type ContactPageFieldErrors = Partial<
	Record<keyof ContactPageDraftPayload | "inquiryChoices", string>
>;

export function emptyContactPageDraft(): ContactPageDraftPayload {
	return { bookingEnabled: false, inquiryChoices: [] };
}

export function copyContactPageDraft(
	payload: ContactPageDraftPayload | undefined,
): ContactPageDraftPayload {
	return {
		...emptyContactPageDraft(),
		...payload,
		inquiryChoices: [...(payload?.inquiryChoices ?? [])],
	};
}

export function serializeContactPageDraft(payload: ContactPageDraftPayload) {
	return JSON.stringify({
		heading: payload.heading ?? null,
		intro: payload.intro ?? null,
		email: payload.email ?? null,
		phone: payload.phone ?? null,
		availability: payload.availability ?? null,
		responseTime: payload.responseTime ?? null,
		confirmationMessage: payload.confirmationMessage ?? null,
		bookingEnabled: payload.bookingEnabled ?? false,
		bookingUrl: payload.bookingUrl ?? null,
		bookingLabel: payload.bookingLabel ?? null,
		bookingIntro: payload.bookingIntro ?? null,
		inquiryChoices: payload.inquiryChoices ?? [],
	});
}

function required(value: string | undefined, label: string, maximum: number) {
	const normalized = value?.trim() ?? "";
	if (!normalized) return `${label} is required.`;
	if (normalized.length > maximum) return `${label} must be ${maximum} characters or fewer.`;
	return undefined;
}

export function validateContactPageForPublish(
	payload: ContactPageDraftPayload,
): ContactPageFieldErrors {
	const errors: ContactPageFieldErrors = {};
	errors.heading = required(payload.heading, "Contact heading", 120);
	errors.intro = required(payload.intro, "Contact introduction", 2_000);
	errors.email = required(payload.email, "Public contact email", 254);
	if (!errors.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email?.trim() ?? "")) {
		errors.email = "Enter a valid public contact email.";
	}
	if ((payload.phone?.length ?? 0) > 80) errors.phone = "Phone must be 80 characters or fewer.";
	if ((payload.availability?.length ?? 0) > 500) errors.availability = "Availability must be 500 characters or fewer.";
	if ((payload.responseTime?.length ?? 0) > 300) errors.responseTime = "Response time must be 300 characters or fewer.";
	errors.confirmationMessage = required(payload.confirmationMessage, "Confirmation message", 500);
	errors.bookingLabel = required(payload.bookingLabel, "Booking label", 120);
	errors.bookingIntro = required(payload.bookingIntro, "Booking introduction", 1_000);
	if (payload.bookingEnabled) {
		errors.bookingUrl = required(payload.bookingUrl, "Booking URL", 2_048);
		if (!errors.bookingUrl) {
			try {
				const url = new URL(payload.bookingUrl ?? "");
				if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
					errors.bookingUrl = "Enter a valid public http or https URL.";
				}
			} catch {
				errors.bookingUrl = "Enter a valid public http or https URL.";
			}
		}
	}
	const choices = payload.inquiryChoices ?? [];
	if (choices.length > 12) errors.inquiryChoices = "Use no more than 12 inquiry choices.";
	if (choices.some((choice) => !choice.trim() || choice.length > 120)) {
		errors.inquiryChoices = "Each inquiry choice must be 1–120 characters.";
	}
	if (new Set(choices.map((choice) => choice.trim().toLowerCase())).size !== choices.length) {
		errors.inquiryChoices = "Inquiry choices must be unique.";
	}
	return Object.fromEntries(Object.entries(errors).filter(([, value]) => value));
}

export function hasContactPageErrors(errors: ContactPageFieldErrors) {
	return Object.keys(errors).length > 0;
}

export function resolveContactPagePreviewUrl(value: unknown, currentOrigin: string) {
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
