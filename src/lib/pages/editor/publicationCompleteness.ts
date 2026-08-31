const publicationCompleteness = [
	[["Product title is required before publishing", "Product slug is required before publishing"], "Add the missing product name or URL name"],
	[["An available product needs an enabled variant before publishing", "Every enabled variant needs a retail price before publishing"], "Enable a variant and set every enabled variant's retail price"],
	[["Every enabled print variant needs a material and size before publishing", "Every enabled print variant needs a supported material and size pair"], "Choose a supported material and size for every enabled print variant"],
	[["A print needs one verified print source before publishing"], "Add the product artwork"],
	[["A non-empty print set is required before publishing"], "Add at least one artwork image to the print set"],
	[["A digital download needs a verified paid file before publishing"], "Add the customer download ZIP"],
	[[...(["print", "print_set", "postcard", "tapestry", "digital_download", "merchandise"] as const).map((kind) => `Catalog ${kind} needs required display media before publishing`), "Catalog display media needs alternative text before publishing"], "Add the required display media and alternative text"],
] as const;

export function publicationCompletenessMessage(
	error: unknown,
	destination: "Convex CMS" | "Shop" = "Convex CMS",
) {
	if (!(error instanceof Error)) return null;
	const subject = destination === "Shop" ? "The Shop" : "Convex CMS";
	const destinationPhrase = destination === "Shop" ? "the Shop" : "Convex CMS";
	for (const line of error.message.split(/\r?\n/)) {
		const detail = line.trim()
			.replace(/^(?:\[CONVEX [^\]]+\]\s*)?(?:\[Request ID: [^\]]+\]\s*)?Server Error\s*/, "")
			.replace(/^Uncaught Error:\s*/, "");
		const match = publicationCompleteness.find(([details]) => (details as readonly string[]).includes(detail));
		if (match) {
			return `${subject} did not publish this draft. ${match[1]}, then save the draft and publish to ${destinationPhrase} again.`;
		}
	}
	return null;
}
