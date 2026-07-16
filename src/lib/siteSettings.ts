import type { SiteSettingsDraftPayload } from "./config";

export type SiteSettingsFieldErrors = Partial<
	Record<
		| "artistName"
		| "siteTitle"
		| "tagline"
		| "seoDescription"
		| `socialLinks.${number}.platform`
		| `socialLinks.${number}.url`,
		string
	>
>;

export function emptySiteSettingsDraft(): SiteSettingsDraftPayload {
	return {
		artistName: "",
		siteTitle: "",
		tagline: "",
		socialLinks: [],
		seoDescription: "",
	};
}

export function copySiteSettingsDraft(
	payload: SiteSettingsDraftPayload | undefined,
): SiteSettingsDraftPayload {
	return {
		artistName: payload?.artistName ?? "",
		siteTitle: payload?.siteTitle ?? "",
		tagline: payload?.tagline ?? "",
		socialLinks: (payload?.socialLinks ?? []).map((link) => ({ ...link })),
		seoDescription: payload?.seoDescription ?? "",
	};
}

export function serializeSiteSettingsDraft(payload: SiteSettingsDraftPayload) {
	return JSON.stringify(copySiteSettingsDraft(payload));
}

function isPublicUrl(value: string) {
	try {
		const url = new URL(value);
		return url.protocol === "https:" || url.protocol === "http:";
	} catch {
		return false;
	}
}

export function validateSiteSettingsForPublish(
	payload: SiteSettingsDraftPayload,
): SiteSettingsFieldErrors {
	const errors: SiteSettingsFieldErrors = {};
	for (const [field, label] of [
		["artistName", "Artist name"],
		["siteTitle", "Site title"],
		["tagline", "Tagline"],
		["seoDescription", "SEO description"],
	] as const) {
		if (!payload[field]?.trim()) errors[field] = `${label} is required`;
	}

	(payload.socialLinks ?? []).forEach((link, index) => {
		if (!link.platform.trim()) {
			errors[`socialLinks.${index}.platform`] = "Platform is required";
		}
		if (!isPublicUrl(link.url.trim())) {
			errors[`socialLinks.${index}.url`] = "Enter a complete http or https URL";
		}
	});
	return errors;
}

export function hasSiteSettingsErrors(errors: SiteSettingsFieldErrors) {
	return Object.keys(errors).length > 0;
}
