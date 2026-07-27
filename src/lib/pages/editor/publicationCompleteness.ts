const publicationCompleteness = [
	[["Product title is required before publishing", "Product slug is required before publishing"], "Add the missing product name or URL name, save the draft, then publish to Convex CMS again."],
	[["An available product needs an enabled variant before publishing", "Every enabled variant needs a retail price before publishing"], "Enable a variant and set every enabled variant's retail price, then save the draft and publish to Convex CMS again."],
	[["Every enabled print variant needs a material and size before publishing", "Every enabled print variant needs a supported material and size pair"], "Choose a supported material and size for every enabled print variant, then save the draft and publish to Convex CMS again."],
	[["A print needs one verified print source before publishing", "A non-empty print set is required before publishing", "A digital download needs a verified paid file before publishing"], "Attach the required verified print source, print-set member, or paid file, then save the draft and publish to Convex CMS again."],
	[[...(["print", "print_set", "postcard", "tapestry", "digital_download", "merchandise"] as const).map((kind) => `Catalog ${kind} needs required display media before publishing`), "Catalog display media needs alternative text before publishing"], "Add the required display media and alternative text, then save the draft and publish to Convex CMS again."],
] as const;

export function publicationCompletenessMessage(error: unknown) {
	if (!(error instanceof Error)) return null;
	for (const line of error.message.split(/\r?\n/)) {
		const detail = line.trim()
			.replace(/^(?:\[CONVEX [^\]]+\]\s*)?(?:\[Request ID: [^\]]+\]\s*)?Server Error\s*/, "")
			.replace(/^Uncaught Error:\s*/, "");
		const match = publicationCompleteness.find(([details]) => (details as readonly string[]).includes(detail));
		if (match) return `Convex CMS did not publish this draft. ${match[1]}`;
	}
	return null;
}
