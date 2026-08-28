import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Rgb = readonly [number, number, number];

const themeCss = readFileSync(new URL("../src/lib/theme.css", import.meta.url), "utf8");

function alpha(pattern: RegExp) {
	const match = themeCss.match(pattern);
	if (!match) throw new Error(`Missing reviewed theme token: ${pattern.source}`);
	return Number(match[1]);
}

const darkMutedAlpha = alpha(/--admin-text-muted:\s*rgba\(var\(--_light\),\s*([0-9.]+)\)/);
const darkSubtleAlpha = alpha(/--admin-text-subtle:\s*rgba\(var\(--_light\),\s*([0-9.]+)\)/);
const lightMutedAlpha = alpha(/--admin-text-muted:\s*rgba\(var\(--_dark\),\s*([0-9.]+)\)/);
const lightSubtleAlpha = alpha(/--admin-text-subtle:\s*rgba\(var\(--_dark\),\s*([0-9.]+)\)/);

function blend(foreground: Rgb, background: Rgb, opacity: number): Rgb {
	return foreground.map((channel, index) => (
		channel * opacity + background[index] * (1 - opacity)
	)) as unknown as Rgb;
}

function relativeLuminance([red, green, blue]: Rgb) {
	const [r, g, b] = [red, green, blue]
		.map((channel) => channel / 255)
		.map((channel) => channel <= 0.04045
			? channel / 12.92
			: ((channel + 0.055) / 1.055) ** 2.4);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: Rgb, background: Rgb) {
	const foregroundLuminance = relativeLuminance(foreground);
	const backgroundLuminance = relativeLuminance(background);
	return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
		/ (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

const hostPalettes = [
	{ name: "Angels Rest", dark: [30, 41, 59], light: [241, 245, 249] },
	{ name: "Reflecting Pool", dark: [26, 31, 46], light: [240, 244, 248] },
] as const;

describe.each(hostPalettes)("$name admin text contrast", ({ dark, light }) => {
	it("keeps muted and subtle normal text at WCAG AA contrast in both modes", () => {
		expect(contrast(blend(light, dark, darkMutedAlpha), dark)).toBeGreaterThanOrEqual(4.5);
		expect(contrast(blend(light, dark, darkSubtleAlpha), dark)).toBeGreaterThanOrEqual(4.5);
		expect(contrast(blend(dark, light, lightMutedAlpha), light)).toBeGreaterThanOrEqual(4.5);
		expect(contrast(blend(dark, light, lightSubtleAlpha), light)).toBeGreaterThanOrEqual(4.5);
	});
});
