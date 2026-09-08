import { describe, expect, it } from "vitest";
import { appendDocumentPortalAccess, createAuthoredDocumentRenderer } from "../src/lib/server/authoredDocumentEmail";

const PROSE_OPEN = '<div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; line-height: 1.6;">';
const PORTAL_URL = "https://example.com/portal/token?a=1&b=2";
const INVOICE_ACTION = `<div style="box-sizing: border-box; max-width: 600px; margin: 0 auto; padding: 0 24px 24px; font-family: Arial, Helvetica, sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; margin: 24px 0 8px; table-layout: fixed;"><tr><td bgcolor="#3f352e" style="padding: 0; border-radius: 3px; mso-padding-alt: 14px 22px; text-align: center;"><a href="https://example.com/portal/token?a=1&amp;b=2" style="display: block; padding: 14px 22px; color: #ffffff; font-family: Arial, Helvetica, sans-serif; font-size: 15px; font-weight: 600; line-height: 1; text-decoration: none;">View and pay invoice</a></td></tr></table>
<p style="margin: 18px 0 6px; color: #756c64; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.55;">If the button does not open, copy this address into your browser:</p>
<p style="margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.55; overflow-wrap: anywhere; word-break: break-word;"><a href="https://example.com/portal/token?a=1&amp;b=2" style="color: #594a3f; text-decoration: underline;">https://example.com/portal/token?a=1&amp;b=2</a></p>
</div>`;

describe("authored document rendering", () => {
	it("preserves exact plain text while escaping its HTML and normalizing structural line breaks", () => {
		const render = createAuthoredDocumentRenderer({ values: { name: "O'Connor & Sons" } });
		expect(render({
			subject: " For {{ name }} ", body: "  Hello {{name}}\r\n\r\n2 < 3 & 5 > 4\rLast line  ",
		})).toEqual({
			subject: " For O'Connor & Sons ",
			message: {
				text: "Hello O'Connor & Sons\r\n\r\n2 < 3 & 5 > 4\rLast line",
				html: `${PROSE_OPEN}Hello O&#39;Connor &amp; Sons<br>\n&nbsp;<br>\n2 &lt; 3 &amp; 5 &gt; 4<br>\nLast line</div>`,
			},
		});
	});

	it("escapes scalar HTML variables once and inserts document fragments without escaping them", () => {
		const render = createAuthoredDocumentRenderer({
			values: { name: '<A & "B">', items: "overridden scalar" },
			fragments: { items: { html: "<ul><li>One &amp; two</li><li>Three</li></ul>", text: "1. One & two\n2. Three" } },
		});
		expect(render({ subject: "{{name}}: {{items}}", body: "<p>{{name}}</p>{{items}}" })).toEqual({
			subject: '<A & "B">: 1. One & two\n2. Three',
			message: {
				html: "<p>&lt;A &amp; &quot;B&quot;&gt;</p><ul><li>One &amp; two</li><li>Three</li></ul>",
				text: '<A & "B">\n• One & two\n• Three',
			},
		});
		expect(render({ subject: "Items", body: "Items:\n{{items}}" }).message).toEqual({
			text: "Items:\n1. One & two\n2. Three",
			html: `${PROSE_OPEN}Items:<br>\n1. One &amp; two<br>\n2. Three</div>`,
		});
	});

	it("snapshots all variable strings before the caller awaits template lookup", () => {
		const variables = {
			values: { name: "Original" },
			fragments: { items: { html: "<b>Original items</b>", text: "Original items" } },
		};
		const render = createAuthoredDocumentRenderer(variables);
		variables.values.name = "Changed";
		variables.fragments.items.html = "<b>Changed items</b>";
		variables.fragments.items.text = "Changed items";
		expect(render({ subject: "{{name}}", body: "<p>{{items}}</p>" })).toEqual({
			subject: "Original", message: { html: "<p><b>Original items</b></p>", text: "Original items" },
		});
	});

	it("preserves authored HTML while stripping hidden content and formatting readable text", () => {
		const html = '<html><head><title>Hidden</title><style>.hidden{}</style></head><body><!-- comment --><script>hidden()</script><noscript>hidden</noscript><template>hidden</template><h1>Invoice &mdash; Avery&rsquo;s</h1><table><tr><td>Total</td><td>$100</td></tr></table><img src="cid:receipt" alt="Receipt image"><img src="cid:blank"><p><a href="https://example.com/help"><b>Get help</b></a></p><p><a href="https://example.com">https://example.com</a></p></body></html>';
		const render = createAuthoredDocumentRenderer({ values: {} });
		expect(render({ subject: "Invoice", body: html })).toEqual({
			subject: "Invoice",
			message: {
				html,
				text: "Invoice — Avery’s\nTotal | $100\n\nReceipt image\nGet help (https://example.com/help)\nhttps://example.com",
			},
		});
	});

	it("decodes supported entities and preserves unknown or out-of-range entities", () => {
		const render = createAuthoredDocumentRenderer({ values: {} });
		expect(render({ subject: "Entities", body: "<p>&AMP; &apos; &bull; &copy; &hellip; &gt; &ldquo; &lsquo; &lt; &mdash; &ndash; &nbsp; &quot; &rdquo; &reg; &rsquo; &trade; &#65; &#x1F642; &#0; &#1114112; &unknown;</p>" }).message.text)
			.toBe("& ' • © … > “ ‘ < — –   \" ” ® ’ ™ A 🙂 &#0; &#1114112; &unknown;");
	});

	it("leaves unresolved placeholders for the handler's existing rejection and inserts replacement strings literally", () => {
		const render = createAuthoredDocumentRenderer({ values: { amount: "$& $1 $$", nested: "{{unknown}}" } });
		expect(render({ subject: "{{toString}} {{ amount }}", body: "{{nested}} {{amount}}" })).toEqual({
			subject: "{{toString}} $& $1 $$",
			message: { text: "{{unknown}} $& $1 $$", html: `${PROSE_OPEN}{{unknown}} $&amp; $1 $$</div>` },
		});
	});

	it.each([
		["<p>Invoice</p>", `<p>Invoice</p>\n${INVOICE_ACTION}`],
		["<html><p>Invoice</p></html>", `<html><p>Invoice</p>${INVOICE_ACTION}\n</html>`],
		["<HTML><BODY><p>Invoice</p></BODY></HTML>", `<HTML><BODY><p>Invoice</p>${INVOICE_ACTION}\n</BODY></HTML>`],
	])("appends the exact portal action at the existing document location: %s", (html, expected) => {
		const message = { html, text: "Invoice \n\n" };
		expect(appendDocumentPortalAccess(message, "invoice", PORTAL_URL)).toEqual({
			html: expected, text: `Invoice\n\nView and pay invoice:\n${PORTAL_URL}`,
		});
		expect(message).toEqual({ html, text: "Invoice \n\n" });
	});

	it.each([
		["invoice", "View and pay invoice"],
		["quote", "Review your quote"],
		["contract", "Review and sign contract"],
	] as const)("retains the %s action even when authored HTML already contains a hidden portal URL", (type, label) => {
		const message = { html: `<p>Review</p><!-- ${PORTAL_URL} -->`, text: "Review" };
		const result = appendDocumentPortalAccess(message, type, PORTAL_URL);
		expect(result.text).toBe(`Review\n\n${label}:\n${PORTAL_URL}`);
		expect(result.html).toBe(`${message.html}\n${INVOICE_ACTION.replace("View and pay invoice", label)}`);
	});
});
