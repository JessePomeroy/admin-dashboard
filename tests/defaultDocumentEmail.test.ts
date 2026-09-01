import { describe, expect, it } from "vitest";
import {
	type DocumentEmailInput,
	renderDocumentEmail,
} from "../src/lib/server/defaultDocumentEmail";

const brand = {
	siteName: "Angel's Rest",
	homeUrl: "https://angelsrest.online",
};

const invoiceInput = {
	kind: "invoice" as const,
	brand,
	clientName: "Avery Harper",
	invoiceNumber: "INV-1042",
	dueDate: "2026-09-18",
	changeNote: "The print quantity was updated.",
	items: [
		{
			description: "Editorial portrait session",
			quantity: 1,
			unitPriceCents: 48_000,
		},
		{
			description: "Archival print — 11×14",
			quantity: 2,
			unitPriceCents: 7_500,
		},
	],
	taxPercent: 6,
	portalUrl: "https://angelsrest.online/portal/invoice-token",
};

describe("defaultDocumentEmail", () => {
	it("renders an invoice from raw cents and dates as matching HTML and plain text", () => {
		const { html, text } = renderDocumentEmail(invoiceInput);

		expect(html.startsWith('<!doctype html>\n<html lang="en">')).toBe(true);
		expect(html.match(/<h1\b/g)).toHaveLength(1);
		expect(html).toContain("Your invoice is ready.");
		expect(html).toContain("Sep 18, 2026");
		expect(html).toContain("$630.00");
		expect(html).toContain("Tax (6%)");
		expect(html).toContain("$37.80");
		expect(html).toContain("$667.80");
		expect(html).toContain(">View and pay invoice</a>");
		expect(html).toContain("copy this address into your browser");
		expect(
			html.match(/https:\/\/angelsrest\.online\/portal\/invoice-token/g),
		).toHaveLength(3);

		expect(text).toContain("YOUR INVOICE IS READY");
		expect(text).toContain("Invoice: INV-1042");
		expect(text).toContain("Due date: Sep 18, 2026");
		expect(text).toContain("1 × Editorial portrait session — $480.00");
		expect(text).toContain("2 × Archival print — 11×14 — $150.00");
		expect(text).toContain("Tax (6%): $37.80");
		expect(text).toContain("Total: $667.80");
		expect(text).toContain(
			"View and pay invoice:\nhttps://angelsrest.online/portal/invoice-token",
		);
		expect(text).not.toMatch(/<\/?[a-z][^>]*>/i);
	});

	it("renders quote packages with a review action and visible fallback URL", () => {
		const { html, text } = renderDocumentEmail({
			kind: "quote",
			brand,
			clientName: "Morgan Lee",
			quoteNumber: "Q-204",
			validUntil: "2026-10-01",
			packages: [
				{
					name: "Quiet ceremony",
					description: "Four hours of documentary coverage",
					priceCents: 320_000,
					included: ["Planning call", "Online gallery"],
				},
			],
			portalUrl: "https://angelsrest.online/portal/quote-token?from=email&v=1",
		});

		expect(html.match(/<h1\b/g)).toHaveLength(1);
		expect(html).toContain("Your quote is ready.");
		expect(html).toContain("Quiet ceremony");
		expect(html).toContain("Planning call · Online gallery");
		expect(html).toContain("$3,200.00");
		expect(html).toContain("Oct 1, 2026");
		expect(html).toContain(">Review your quote</a>");
		expect(html).toContain(
			'href="https://angelsrest.online/portal/quote-token?from=email&amp;v=1"',
		);
		expect(text).toContain("REVIEW YOUR QUOTE");
		expect(text).toContain("Quiet ceremony — $3,200.00");
		expect(text).toContain("Includes: Planning call · Online gallery");
		expect(text).toContain(
			"Review your quote:\nhttps://angelsrest.online/portal/quote-token?from=email&v=1",
		);
	});

	it("renders contract facts with a signing action and visible fallback URL", () => {
		const { html, text } = renderDocumentEmail({
			kind: "contract",
			brand,
			clientName: "Riley Chen",
			title: "Lakeshore elopement agreement",
			eventDate: "2026-11-07",
			eventLocation: "Sleeping Bear Dunes, Michigan",
			totalPriceCents: 465_000,
			depositAmountCents: 140_000,
			portalUrl: "https://angelsrest.online/portal/contract-token",
		});

		expect(html.match(/<h1\b/g)).toHaveLength(1);
		expect(html).toContain("Your contract is ready.");
		expect(html).toContain("Lakeshore elopement agreement");
		expect(html).toContain("Nov 7, 2026");
		expect(html).toContain("Sleeping Bear Dunes, Michigan");
		expect(html).toContain("$4,650.00");
		expect(html).toContain("$1,400.00");
		expect(html).toContain(">Review and sign contract</a>");
		expect(text).toContain("REVIEW AND SIGN YOUR CONTRACT");
		expect(text).toContain(
			"Review and sign contract:\nhttps://angelsrest.online/portal/contract-token",
		);
	});

	it("keeps the accepted responsive, dark-mode, and Outlook-safe email frame", () => {
		for (const input of allDocumentFamilies()) {
			const { html } = renderDocumentEmail(input);

			expect(html).toContain(
				'<meta name="viewport" content="width=device-width, initial-scale=1">',
			);
			expect(html).toContain('<meta name="color-scheme" content="light dark">');
			expect(html).toContain("@media only screen and (max-width: 640px)");
			expect(html).toContain(
				".action-table, .action-table tbody, .action-table tr, .button-cell, .button-link",
			);
			expect(html).toContain("@media (prefers-color-scheme: dark)");
			expect(html).toContain('width="600"');
			expect(html).toContain("max-width: 600px");
			expect(html).toContain("mso-padding-alt: 14px 22px");
			expect(html).toContain('role="presentation"');
			expect(html.match(/<h1\b/g)).toHaveLength(1);
			expect(html).not.toMatch(/<(?:img|script|link)\b/i);
			expect(html).not.toMatch(/@import|url\s*\(/i);
		}
	});

	it("escapes every dynamic HTML value while keeping raw plain text readable", () => {
		const input: DocumentEmailInput = {
			kind: "quote",
			brand: {
				siteName: `Studio <em>One</em> & "Two"`,
				homeUrl: "https://studio.example",
			},
			clientName: `<script>alert("client")</script>`,
			quoteNumber: `Q"><img src=x onerror=alert(1)>`,
			changeNote: `<svg onload=alert("note")>`,
			validUntil: "2026-10-01",
			packages: [
				{
					name: `<a href="bad">Package</a>`,
					description: `Portraits & "prints"`,
					priceCents: 12_500,
					included: [`<iframe src="bad">`, "Album & print"],
				},
			],
			portalUrl: `https://studio.example/portal/token?next="><script>alert(1)</script>`,
		};
		const { html, text } = renderDocumentEmail(input);

		expect(html).not.toMatch(
			/<script>|<img\b|<svg\b|<em>|<iframe\b|<a href="bad"/i,
		);
		expect(html).toContain(
			"Studio &lt;em&gt;One&lt;/em&gt; &amp; &quot;Two&quot;",
		);
		expect(html).toContain(
			"&lt;script&gt;alert(&quot;client&quot;)&lt;/script&gt;",
		);
		expect(html).toContain("Q&quot;&gt;&lt;img src=x onerror=alert(1)&gt;");
		expect(html).toContain("&lt;svg onload=alert(&quot;note&quot;)&gt;");
		expect(html).toContain("&lt;a href=&quot;bad&quot;&gt;Package&lt;/a&gt;");
		expect(html).toContain("Portraits &amp; &quot;prints&quot;");
		expect(html).toContain("&lt;iframe src=&quot;bad&quot;&gt;");
		expect(html).toContain(
			'href="https://studio.example/portal/token?next=&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"',
		);
		expect(text).toContain(`<script>alert("client")</script>`);
		expect(text).toContain(`<a href="bad">Package</a>`);
	});

	it("rejects non-web, credential-bearing, and whitespace-bearing URLs", () => {
		for (const invalidUrl of [
			"javascript:alert(1)",
			"https://user:password@example.com",
			"https://example.com/line\nbreak",
		]) {
			expect(() =>
				renderDocumentEmail({
					...invoiceInput,
					portalUrl: invalidUrl,
				}),
			).toThrow("absolute http(s) URL");
			expect(() =>
				renderDocumentEmail({
					...invoiceInput,
					brand: { ...brand, homeUrl: invalidUrl },
				}),
			).toThrow("absolute http(s) URL");
		}
	});

	it("contains long unbroken and CJK values without exceeding the clipping budget", () => {
		const unbroken = "x".repeat(500);
		const cjk = "界".repeat(250);
		const { html, text } = renderDocumentEmail({
			...invoiceInput,
			clientName: unbroken,
			invoiceNumber: `INV-${cjk}`,
			items: Array.from({ length: 40 }, (_, index) => ({
				description: `${index + 1} · ${cjk}`,
				quantity: 20,
				unitPriceCents: 99_999,
			})),
		});

		expect(html).toContain("table-layout: fixed");
		expect(html).toContain("overflow-wrap: anywhere");
		expect(html).toContain("word-break: break-word");
		expect(html).toContain(unbroken);
		expect(html).toContain("40 ·");
		expect(text).toContain("40 ·");
		expect(Buffer.byteLength(html, "utf8")).toBeLessThanOrEqual(90 * 1024);
	});
});

function allDocumentFamilies(): readonly DocumentEmailInput[] {
	return [
		invoiceInput,
		{
			kind: "quote",
			brand,
			quoteNumber: "Q-1",
			packages: [],
			portalUrl: "https://angelsrest.online/portal/q",
		},
		{
			kind: "contract",
			brand,
			title: "Portrait agreement",
			portalUrl: "https://angelsrest.online/portal/c",
		},
	];
}
