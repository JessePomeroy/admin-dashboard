import { describe, expect, it } from "vitest";
import {
	copyContactPageDraft,
	hasContactPageErrors,
	resolveContactPagePreviewUrl,
	serializeContactPageDraft,
	validateContactPageForPublish,
} from "../src/lib/contactPage";

const complete = {
	heading: "Get in touch",
	intro: "Tell me about your project.",
	email: "hello@example.com",
	confirmationMessage: "Message received.",
	bookingEnabled: true,
	bookingUrl: "https://cal.com/maggie/session",
	bookingLabel: "Book a session",
	bookingIntro: "Choose a time or send an inquiry.",
	inquiryChoices: ["Portrait", "Print inquiry"],
};

describe("Contact & Booking editor helpers", () => {
	it("deep-copies ordered inquiry choices and serializes fields stably", () => {
		const copied = copyContactPageDraft(complete);
		copied.inquiryChoices?.push("Commercial");
		expect(complete.inquiryChoices).toEqual(["Portrait", "Print inquiry"]);
		expect(serializeContactPageDraft({ ...complete })).toBe(
			serializeContactPageDraft({ bookingIntro: complete.bookingIntro, ...complete }),
		);
	});

	it("matches the server publication boundary for required fields and destinations", () => {
		expect(hasContactPageErrors(validateContactPageForPublish(complete))).toBe(false);
		expect(
			validateContactPageForPublish({
				...complete,
				email: "not-an-email",
				bookingUrl: "javascript:alert(1)",
				inquiryChoices: ["Print", "print"],
			}),
		).toMatchObject({
			email: expect.stringMatching(/valid/i),
			bookingUrl: expect.stringMatching(/http or https/i),
			inquiryChoices: expect.stringMatching(/unique/i),
		});
	});

	it("does not require a retained booking URL while external booking is disabled", () => {
		const errors = validateContactPageForPublish({
			...complete,
			bookingEnabled: false,
			bookingUrl: "not a URL",
		});
		expect(errors.bookingUrl).toBeUndefined();
	});

	it("accepts only same-origin Contact preview URLs", () => {
		expect(resolveContactPagePreviewUrl(
			"/preview/about",
			"https://tenant.example/admin/editor/pages/contact",
		)).toBe("https://tenant.example/preview/about");
		expect(() => resolveContactPagePreviewUrl(
			"https://attacker.example/collect",
			"https://tenant.example",
		)).toThrow(/unsafe/);
		expect(() => resolveContactPagePreviewUrl(null, "https://tenant.example")).toThrow(/invalid/);
	});
});
