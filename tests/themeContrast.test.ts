import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Rgb = readonly [number, number, number];

const themeCss = readFileSync(new URL("../src/lib/theme.css", import.meta.url), "utf8");
const blogWorkbench = readFileSync(
	new URL("../src/lib/pages/editor/BlogWorkbench.svelte", import.meta.url),
	"utf8",
);

function alpha(pattern: RegExp, source = themeCss) {
	const match = source.match(pattern);
	if (!match) throw new Error(`Missing reviewed theme token: ${pattern.source}`);
	return Number(match[1]);
}

const darkMutedAlpha = alpha(/--admin-text-muted:\s*rgba\(var\(--_light\),\s*([0-9.]+)\)/);
const darkSubtleAlpha = alpha(/--admin-text-subtle:\s*rgba\(var\(--_light\),\s*([0-9.]+)\)/);
const darkStrongAccentMix = alpha(/--admin-accent-strong:\s*color-mix\(in srgb, var\(--admin-accent\)\s*([0-9.]+)%,/)
	/ 100;
const lightMutedAlpha = alpha(/--admin-text-muted:\s*rgba\(var\(--_dark\),\s*([0-9.]+)\)/);
const lightSubtleAlpha = alpha(/--admin-text-subtle:\s*rgba\(var\(--_dark\),\s*([0-9.]+)\)/);
const lightThemeCss = themeCss.slice(themeCss.indexOf("html:not(.dark)"));
const lightStrongAccentMix = alpha(/--admin-accent-strong:\s*color-mix\(in srgb, var\(--admin-accent\)\s*([0-9.]+)%,/, lightThemeCss)
	/ 100;

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
	{ name: "Angels Rest", dark: [30, 41, 59], light: [241, 245, 249], accent: [129, 140, 248] },
	{ name: "Reflecting Pool", dark: [26, 31, 46], light: [240, 244, 248], accent: undefined },
] as const;

describe.each(hostPalettes)("$name admin text contrast", ({ dark, light, accent }) => {
	it("keeps muted and subtle normal text at WCAG AA contrast in both modes", () => {
		expect(contrast(blend(light, dark, darkMutedAlpha), dark)).toBeGreaterThanOrEqual(4.5);
		expect(contrast(blend(light, dark, darkSubtleAlpha), dark)).toBeGreaterThanOrEqual(4.5);
		expect(contrast(blend(dark, light, lightMutedAlpha), light)).toBeGreaterThanOrEqual(4.5);
		expect(contrast(blend(dark, light, lightSubtleAlpha), light)).toBeGreaterThanOrEqual(4.5);
	});

	it("keeps Blog accent text, controls, and focus indicators perceivable in both modes", () => {
		const darkAccent = accent ?? blend(light, dark, 0.85);
		const darkStrongAccent = blend(darkAccent, light, darkStrongAccentMix);
		const darkCollectionSurface = blend(light, dark, 0.03);
		const darkSelectedRow = blend(light, darkCollectionSurface, 0.06);
		const lightAccent = accent ?? blend(dark, light, 0.75);
		const lightStrongAccent = blend(lightAccent, dark, lightStrongAccentMix);

		expect(contrast(darkStrongAccent, darkCollectionSurface)).toBeGreaterThanOrEqual(4.5);
		expect(contrast(darkStrongAccent, darkSelectedRow)).toBeGreaterThanOrEqual(4.5);
		expect(contrast(lightStrongAccent, light)).toBeGreaterThanOrEqual(4.5);
		expect(contrast(darkStrongAccent, dark)).toBeGreaterThanOrEqual(3);
		expect(contrast(lightStrongAccent, light)).toBeGreaterThanOrEqual(3);
	});
});

it("uses the strong accent for Blog normal text, primary control, and focus indicators", () => {
	expect(blogWorkbench).toMatch(/\.new-post\s*\{[\s\S]*background:\s*var\(--admin-accent-strong\)/);
	expect(blogWorkbench).toMatch(/\.post-list small\s*\{[\s\S]*color:\s*var\(--admin-accent-strong\)/);
	expect(blogWorkbench).toMatch(/:focus-visible[\s\S]*outline:\s*2px solid var\(--admin-accent-strong\)/);
});
