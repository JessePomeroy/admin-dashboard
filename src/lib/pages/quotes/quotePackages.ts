import type { QuotePackage } from "../../types";
import { dollarsToCents } from "../../utils";

export type EditableQuotePackage = {
	name: string;
	description: string;
	price: number;
	included: string[];
};

export function normalizeEditableQuotePackages(
	packages: readonly EditableQuotePackage[],
): QuotePackage[] {
	return packages.map((pkg) => ({
		name: pkg.name,
		description: pkg.description || undefined,
		price: dollarsToCents(pkg.price),
		included: pkg.included.length > 0 ? [...pkg.included] : undefined,
	}));
}

export function toEditableQuotePackages(
	packages: readonly QuotePackage[],
): EditableQuotePackage[] {
	return packages.map((pkg) => ({
		name: pkg.name || "",
		description: pkg.description || "",
		price: pkg.price / 100,
		included: [...(pkg.included || [])],
	}));
}
