/** Pure, dependency-free rendering for the default client document emails. */

export interface DocumentEmailBrand {
	siteName: string;
	homeUrl: string;
}

export interface InvoiceDocumentEmailItem {
	description: string;
	quantity: number;
	unitPriceCents: number;
}

export interface QuoteDocumentEmailPackage {
	name: string;
	description?: string;
	priceCents: number;
	included?: readonly string[];
}

interface DocumentEmailBase {
	brand: DocumentEmailBrand;
	clientName?: string;
	changeNote?: string;
	currency?: string;
}

export type DocumentEmailInput =
	| (DocumentEmailBase & {
			kind: "invoice";
			invoiceNumber: string;
			dueDate?: string;
			items: readonly InvoiceDocumentEmailItem[];
			taxPercent?: number;
			portalUrl: string;
	  })
	| (DocumentEmailBase & {
			kind: "quote";
			quoteNumber: string;
			validUntil?: string;
			packages: readonly QuoteDocumentEmailPackage[];
			portalUrl: string;
	  })
	| (DocumentEmailBase & {
			kind: "contract";
			title: string;
			eventDate?: string;
			eventLocation?: string;
			totalPriceCents?: number;
			depositAmountCents?: number;
			portalUrl: string;
	  });

export interface DocumentEmailOutput {
	html: string;
	text: string;
}

interface SummaryFact {
	label: string;
	value: string;
}

interface DocumentFrame {
	brand: DocumentEmailBrand;
	documentTitle: string;
	preheader: string;
	eyebrow: string;
	title: string;
	intro: string;
	summary: readonly SummaryFact[];
	bodyHtml: string;
	bodyText: string;
	textTitle: string;
	footer: string;
}

const HTML_ESCAPE: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

function escapeHtml(value: string): string {
	return value.replace(
		/[&<>"']/g,
		(character) => HTML_ESCAPE[character] ?? character,
	);
}

function escapedLines(value: string): string {
	return value.split(/\r?\n/).map(escapeHtml).join("<br>");
}

function safeHref(value: string): string {
	if (
		[...value].some(
			(character) =>
				character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
		)
	) {
		throw new Error("Document email links must use an absolute http(s) URL");
	}

	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		throw new Error("Document email links must use an absolute http(s) URL");
	}

	if (
		(parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
		parsed.username.length > 0 ||
		parsed.password.length > 0
	) {
		throw new Error("Document email links must use an absolute http(s) URL");
	}

	return escapeHtml(value);
}

function formatMoney(amountCents: number, currency = "USD"): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(amountCents / 100);
}

function formatQuantity(quantity: number): string {
	return new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(
		quantity,
	);
}

function formatPercent(percent: number): string {
	return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
		percent,
	);
}

function formatDate(value: string): string {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return value;

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(Date.UTC(year, month - 1, day));
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day
	) {
		return value;
	}

	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	}).format(date);
}

function actionBlock(label: string, url: string): string {
	const escapedUrl = safeHref(url);
	return `<table class="action-table" role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 26px 0 0;">
	<tr>
		<td class="button-cell" bgcolor="#3f352e" style="border-radius: 3px; mso-padding-alt: 14px 22px; text-align: center;">
			<a class="button-link" href="${escapedUrl}" style="display: inline-block; padding: 14px 22px; color: #ffffff; font-family: Arial, Helvetica, sans-serif; font-size: 15px; font-weight: 600; line-height: 1; text-decoration: none;">${escapeHtml(label)}</a>
		</td>
	</tr>
</table>
<p class="muted" style="margin: 22px 0 6px; color: #756c64; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.55;">If the button does not open, copy this address into your browser:</p>
<p style="margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.55; overflow-wrap: anywhere; word-break: break-word;"><a class="text-link" href="${escapedUrl}" style="color: #594a3f; text-decoration: underline;">${escapedUrl}</a></p>`;
}

function summaryTable(facts: readonly SummaryFact[]): string {
	return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top: 30px; border-top: 1px solid #ddd6cc; border-bottom: 1px solid #ddd6cc; table-layout: fixed;">
	<tr>
		${facts
			.map(
				(fact, index) => `<td class="summary-cell" valign="top" ${
					index > 0 ? 'align="right"' : ""
				} style="padding: 17px ${
					index > 0 ? "0 17px 12px" : "12px 17px 0"
				}; color: #756c64; font-family: Arial, Helvetica, sans-serif; font-size: 11px; letter-spacing: 0.06em; line-height: 1.45; text-transform: uppercase; overflow-wrap: anywhere; word-break: break-word;">
			${escapeHtml(fact.label)}<br><strong style="display: inline-block; padding-top: 4px; color: #2f2a26; font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; letter-spacing: 0; overflow-wrap: anywhere; word-break: break-word; text-transform: none;">${escapeHtml(fact.value)}</strong>
		</td>`,
			)
			.join("")}
	</tr>
</table>`;
}

function section(heading: string, content: string, compact = false): string {
	return `<tr>
	<td class="section" style="padding: ${compact ? "4px 48px 36px" : "34px 48px 40px"}; border-top: 1px solid #ddd6cc;">
		<h2 style="margin: 0; color: #2f2a26; font-family: Georgia, 'Times New Roman', serif; font-size: 24px; font-weight: 400; letter-spacing: -0.02em; line-height: 1.2;">${escapeHtml(heading)}</h2>
		${content}
	</td>
</tr>`;
}

function paragraph(value: string): string {
	return `<p style="margin: 13px 0 0; color: #5f5750; font-family: Arial, Helvetica, sans-serif; font-size: 15px; line-height: 1.65; overflow-wrap: anywhere; word-break: break-word;">${escapedLines(value)}</p>`;
}

function notice(value: string): string {
	return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top: 18px; table-layout: fixed;">
	<tr>
		<td class="notice-cell" bgcolor="#f2ede6" style="padding: 17px 18px; border-left: 3px solid #8b6f5b; color: #4f4741; font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.65; overflow-wrap: anywhere; word-break: break-word;">${escapedLines(value)}</td>
	</tr>
</table>`;
}

function detailTable(rows: readonly SummaryFact[]): string {
	return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top: 15px; table-layout: fixed;">
	${rows
		.map(
			(row) => `<tr>
		<td class="detail-label" valign="top" style="width: 132px; padding: 9px 16px 9px 0; border-bottom: 1px solid #e7e1d9; color: #756c64; font-family: Arial, Helvetica, sans-serif; font-size: 11px; letter-spacing: 0.05em; line-height: 1.5; text-transform: uppercase;">${escapeHtml(row.label)}</td>
		<td valign="top" style="padding: 9px 0; border-bottom: 1px solid #e7e1d9; color: #2f2a26; font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.55; overflow-wrap: anywhere; word-break: break-word;">${escapedLines(row.value)}</td>
	</tr>`,
		)
		.join("")}
</table>`;
}

function renderInvoice(
	input: Extract<DocumentEmailInput, { kind: "invoice" }>,
): DocumentFrame {
	const currency = input.currency ?? "USD";
	const itemFacts = input.items.map((item) => {
		const lineTotalCents = Math.round(item.quantity * item.unitPriceCents);
		return {
			description: item.description,
			quantity: formatQuantity(item.quantity),
			unitPrice: formatMoney(item.unitPriceCents, currency),
			lineTotal: formatMoney(lineTotalCents, currency),
			lineTotalCents,
		};
	});
	const subtotalCents = itemFacts.reduce(
		(sum, item) => sum + item.lineTotalCents,
		0,
	);
	const taxCents = input.taxPercent
		? Math.round(subtotalCents * (input.taxPercent / 100))
		: 0;
	const totalCents = subtotalCents + taxCents;
	const dueDate = input.dueDate ? formatDate(input.dueDate) : undefined;
	const taxPercent = input.taxPercent
		? formatPercent(input.taxPercent)
		: undefined;
	const itemsHtml =
		itemFacts.length === 0
			? paragraph("This invoice does not contain any line items.")
			: `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top: 8px; table-layout: fixed;">${itemFacts
					.map(
						(item) => `<tr>
		<td style="padding: 18px 0; border-bottom: 1px solid #ddd6cc;">
			<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="table-layout: fixed;">
				<tr>
					<td valign="top" style="padding: 0 16px 0 0; color: #2f2a26; font-family: Arial, Helvetica, sans-serif; font-size: 16px; font-weight: 600; line-height: 1.45; overflow-wrap: anywhere; word-break: break-word;">
						${escapeHtml(item.description)}
						<div style="padding-top: 4px; color: #756c64; font-size: 13px; font-weight: 400; line-height: 1.5;">${escapeHtml(item.quantity)} × ${escapeHtml(item.unitPrice)}</div>
					</td>
					<td valign="top" align="right" style="color: #2f2a26; font-family: Arial, Helvetica, sans-serif; font-size: 15px; font-variant-numeric: tabular-nums; line-height: 1.45; white-space: nowrap;">${escapeHtml(item.lineTotal)}</td>
				</tr>
			</table>
		</td>
	</tr>`,
					)
					.join("")}</table>`;
	const totals = [
		{ label: "Subtotal", value: formatMoney(subtotalCents, currency) },
		...(taxCents > 0 && taxPercent
			? [
					{
						label: `Tax (${taxPercent}%)`,
						value: formatMoney(taxCents, currency),
					},
				]
			: []),
		{ label: "Total", value: formatMoney(totalCents, currency) },
	];
	const summary = [
		{ label: "Invoice", value: input.invoiceNumber },
		...(dueDate ? [{ label: "Due date", value: dueDate }] : []),
		{ label: "Total", value: formatMoney(totalCents, currency) },
	];
	const changeNotice = input.changeNote ? notice(input.changeNote) : "";
	const itemsText =
		itemFacts.length === 0
			? "No line items"
			: itemFacts
					.map(
						(item) =>
							`${item.quantity} × ${item.description} — ${item.lineTotal}`,
					)
					.join("\n");
	const totalsText = totals
		.map((fact) => `${fact.label}: ${fact.value}`)
		.join("\n");

	return {
		brand: input.brand,
		documentTitle: `Invoice ${input.invoiceNumber}`,
		preheader: `${input.brand.siteName} prepared invoice ${input.invoiceNumber} for ${formatMoney(totalCents, currency)}.`,
		eyebrow: input.changeNote ? "Invoice updated" : "Invoice ready",
		title: "Your invoice is ready.",
		intro: input.changeNote
			? `Hi ${input.clientName ?? "there"}, ${input.brand.siteName} updated your invoice.`
			: `Hi ${input.clientName ?? "there"}, ${input.brand.siteName} prepared an invoice for you.`,
		summary,
		bodyHtml: `${
			changeNotice ? section("What changed", changeNotice, true) : ""
		}${section("Items and total", `${itemsHtml}${detailTable(totals)}`, true)}${section(
			"Payment",
			`${paragraph("Review the invoice details and use the secure client portal when you are ready to pay.")}${actionBlock("View and pay invoice", input.portalUrl)}`,
		)}`,
		bodyText: `${input.changeNote ? `Update: ${input.changeNote}\n\n` : ""}Invoice: ${input.invoiceNumber}${dueDate ? `\nDue date: ${dueDate}` : ""}\n\nITEMS\n${itemsText}\n\n${totalsText}\n\nView and pay invoice:\n${input.portalUrl}`,
		textTitle: "YOUR INVOICE IS READY",
		footer: `Questions about this invoice? Contact ${input.brand.siteName} before you continue.`,
	};
}

function renderQuote(
	input: Extract<DocumentEmailInput, { kind: "quote" }>,
): DocumentFrame {
	const currency = input.currency ?? "USD";
	const validUntil = input.validUntil
		? formatDate(input.validUntil)
		: undefined;
	const packagesHtml =
		input.packages.length === 0
			? paragraph("No packages are listed on this quote.")
			: `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top: 8px; table-layout: fixed;">${input.packages
					.map((pkg) => {
						const included = pkg.included?.join(" · ");
						return `<tr>
		<td style="padding: 18px 0; border-bottom: 1px solid #ddd6cc;">
			<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="table-layout: fixed;">
				<tr>
					<td valign="top" style="padding: 0 16px 0 0; color: #2f2a26; font-family: Arial, Helvetica, sans-serif; font-size: 16px; font-weight: 600; line-height: 1.45; overflow-wrap: anywhere; word-break: break-word;">
						${escapeHtml(pkg.name)}
						${pkg.description ? `<div style="padding-top: 5px; color: #5f5750; font-size: 14px; font-weight: 400; line-height: 1.55;">${escapedLines(pkg.description)}</div>` : ""}
						${included ? `<div style="padding-top: 7px; color: #756c64; font-size: 12px; font-weight: 400; line-height: 1.55;">${escapeHtml(included)}</div>` : ""}
					</td>
					<td valign="top" align="right" style="color: #2f2a26; font-family: Arial, Helvetica, sans-serif; font-size: 15px; font-variant-numeric: tabular-nums; line-height: 1.45; white-space: nowrap;">${escapeHtml(formatMoney(pkg.priceCents, currency))}</td>
				</tr>
			</table>
		</td>
	</tr>`;
					})
					.join("")}</table>`;
	const packagesText =
		input.packages.length === 0
			? "No packages listed"
			: input.packages
					.map((pkg) => {
						const details = [
							`${pkg.name} — ${formatMoney(pkg.priceCents, currency)}`,
							...(pkg.description ? [pkg.description] : []),
							...(pkg.included?.length
								? [`Includes: ${pkg.included.join(" · ")}`]
								: []),
						];
						return details.join("\n");
					})
					.join("\n\n");
	const summary = [
		{ label: "Quote", value: input.quoteNumber },
		...(validUntil ? [{ label: "Valid until", value: validUntil }] : []),
	];
	const changeNotice = input.changeNote ? notice(input.changeNote) : "";

	return {
		brand: input.brand,
		documentTitle: `Quote ${input.quoteNumber}`,
		preheader: `${input.brand.siteName} prepared quote ${input.quoteNumber} for your review.`,
		eyebrow: input.changeNote ? "Quote updated" : "Quote ready",
		title: "Your quote is ready.",
		intro: input.changeNote
			? `Hi ${input.clientName ?? "there"}, ${input.brand.siteName} updated your quote.`
			: `Hi ${input.clientName ?? "there"}, ${input.brand.siteName} prepared a quote for your review.`,
		summary,
		bodyHtml: `${
			changeNotice ? section("What changed", changeNotice, true) : ""
		}${section("Packages", packagesHtml, true)}${section(
			"Review your quote",
			`${paragraph("Open the secure client portal to compare the options and respond to the quote.")}${actionBlock("Review your quote", input.portalUrl)}`,
		)}`,
		bodyText: `${input.changeNote ? `Update: ${input.changeNote}\n\n` : ""}Quote: ${input.quoteNumber}${validUntil ? `\nValid until: ${validUntil}` : ""}\n\nPACKAGES\n${packagesText}\n\nReview your quote:\n${input.portalUrl}`,
		textTitle: "REVIEW YOUR QUOTE",
		footer: `Questions about this quote? Contact ${input.brand.siteName} before you respond.`,
	};
}

function renderContract(
	input: Extract<DocumentEmailInput, { kind: "contract" }>,
): DocumentFrame {
	const currency = input.currency ?? "USD";
	const eventDate = input.eventDate ? formatDate(input.eventDate) : undefined;
	const facts: SummaryFact[] = [
		{ label: "Contract", value: input.title },
		...(eventDate ? [{ label: "Event date", value: eventDate }] : []),
		...(input.eventLocation
			? [{ label: "Location", value: input.eventLocation }]
			: []),
		...(input.totalPriceCents !== undefined
			? [
					{
						label: "Total",
						value: formatMoney(input.totalPriceCents, currency),
					},
				]
			: []),
		...(input.depositAmountCents !== undefined
			? [
					{
						label: "Deposit",
						value: formatMoney(input.depositAmountCents, currency),
					},
				]
			: []),
	];
	const summary: SummaryFact[] = [
		{ label: "Contract", value: input.title },
		...(eventDate ? [{ label: "Event date", value: eventDate }] : []),
	];
	const changeNotice = input.changeNote ? notice(input.changeNote) : "";

	return {
		brand: input.brand,
		documentTitle: input.title,
		preheader: `${input.brand.siteName} prepared ${input.title} for your review and signature.`,
		eyebrow: input.changeNote ? "Contract updated" : "Contract ready",
		title: "Your contract is ready.",
		intro: input.changeNote
			? `Hi ${input.clientName ?? "there"}, ${input.brand.siteName} updated your contract.`
			: `Hi ${input.clientName ?? "there"}, ${input.brand.siteName} prepared a contract for your review.`,
		summary,
		bodyHtml: `${
			changeNotice ? section("What changed", changeNotice, true) : ""
		}${section("Agreement details", detailTable(facts), true)}${section(
			"Review and sign",
			`${paragraph("Open the secure client portal to review the complete agreement and add your signature.")}${actionBlock("Review and sign contract", input.portalUrl)}`,
		)}`,
		bodyText: `${input.changeNote ? `Update: ${input.changeNote}\n\n` : ""}${facts.map((fact) => `${fact.label}: ${fact.value}`).join("\n")}\n\nReview and sign contract:\n${input.portalUrl}`,
		textTitle: "REVIEW AND SIGN YOUR CONTRACT",
		footer: `Questions about this agreement? Contact ${input.brand.siteName} before signing.`,
	};
}

function renderFrame(input: DocumentFrame): DocumentEmailOutput {
	const siteName = escapeHtml(input.brand.siteName);
	const homeUrl = safeHref(input.brand.homeUrl);
	const html = `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<meta name="x-apple-disable-message-reformatting">
	<meta name="color-scheme" content="light dark">
	<meta name="supported-color-schemes" content="light dark">
	<title>${escapeHtml(input.documentTitle)} · ${siteName}</title>
	<style>
		@media only screen and (max-width: 640px) {
			.email-shell { width: 100% !important; }
			.section { padding-left: 24px !important; padding-right: 24px !important; }
			.hero-title { font-size: 34px !important; }
			.action-table, .action-table tbody, .action-table tr, .button-cell, .button-link { display: block !important; width: 100% !important; box-sizing: border-box !important; }
			.summary-cell { display: block !important; width: 100% !important; box-sizing: border-box !important; padding: 13px 0 !important; text-align: left !important; }
			.detail-label { width: 104px !important; }
		}
		@media (prefers-color-scheme: dark) {
			.email-page { background: #211d1a !important; }
			.email-shell { background: #302a26 !important; }
			.email-shell h1, .email-shell h2, .email-shell strong { color: #f3eee7 !important; }
			.email-shell p, .email-shell td { color: #d1c8bd !important; }
			.email-shell, .email-shell td { border-color: #514740 !important; }
			.email-shell .text-link { color: #ead9c8 !important; }
			.email-shell .button-cell { background: #d8c2ad !important; }
			.email-shell .button-link { color: #261f1a !important; }
			.email-shell .notice-cell { background: #403832 !important; color: #f0e8df !important; }
		}
	</style>
</head>
<body class="email-page" style="margin: 0; padding: 0; background: #f1eee8; -webkit-text-size-adjust: 100%;">
	<div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent; mso-hide: all;">${escapeHtml(input.preheader)}</div>
	<table class="email-page" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f1eee8" style="width: 100%; background: #f1eee8;">
		<tr>
			<td align="center" style="padding: 34px 14px 46px;">
				<!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
				<table class="email-shell" role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" bgcolor="#fbfaf7" style="width: 100%; max-width: 600px; table-layout: fixed; background: #fbfaf7; border: 1px solid #ddd6cc; overflow-wrap: anywhere; word-break: break-word;">
					<tr>
						<td class="section" style="padding: 30px 48px 26px; border-bottom: 1px solid #ddd6cc;">
							<a class="text-link" href="${homeUrl}" style="color: #40362f; font-family: Arial, Helvetica, sans-serif; font-size: 12px; font-weight: 600; letter-spacing: 0.14em; line-height: 1; text-decoration: none; text-transform: uppercase;">${siteName}</a>
						</td>
					</tr>
					<tr>
						<td class="section" style="padding: 40px 48px 38px;">
							<p style="margin: 0 0 14px; color: #756c64; font-family: Arial, Helvetica, sans-serif; font-size: 11px; font-weight: 600; letter-spacing: 0.13em; line-height: 1.4; text-transform: uppercase;">${escapeHtml(input.eyebrow)}</p>
							<h1 class="hero-title" style="margin: 0; max-width: 500px; color: #2f2a26; font-family: Georgia, 'Times New Roman', serif; font-size: 42px; font-weight: 400; letter-spacing: -0.035em; line-height: 1.08; overflow-wrap: anywhere; word-break: break-word;">${escapeHtml(input.title)}</h1>
							<p style="margin: 20px 0 0; max-width: 520px; color: #5f5750; font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.7; overflow-wrap: anywhere; word-break: break-word;">${escapeHtml(input.intro)}</p>
							${summaryTable(input.summary)}
						</td>
					</tr>
					${input.bodyHtml}
					<tr>
						<td class="section" style="padding: 30px 48px 36px; border-top: 1px solid #ddd6cc;">
							<p style="margin: 0; color: #5f5750; font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.65;">${escapeHtml(input.footer)}</p>
							<p class="muted" style="margin: 18px 0 0; color: #756c64; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; word-break: break-word;"><a class="text-link" href="${homeUrl}" style="color: #594a3f; text-decoration: underline;">${homeUrl}</a></p>
						</td>
					</tr>
				</table>
				<!--[if mso]></td></tr></table><![endif]-->
			</td>
		</tr>
	</table>
</body>
</html>`;
	const text = `${input.textTitle}\n\n${input.intro}\n\n${input.bodyText}\n\n${input.footer}\n\n${input.brand.siteName}\n${input.brand.homeUrl}`;

	return { html, text };
}

function assertNever(value: never): never {
	throw new Error(`Unsupported document email kind: ${String(value)}`);
}

export function renderDocumentEmail(
	input: DocumentEmailInput,
): DocumentEmailOutput {
	if (input.kind === "invoice") return renderFrame(renderInvoice(input));
	if (input.kind === "quote") return renderFrame(renderQuote(input));
	if (input.kind === "contract") return renderFrame(renderContract(input));
	return assertNever(input);
}
