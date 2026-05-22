export type HighlightPart = {
	text: string;
	isVariable: boolean;
};

const VARIABLE_SPLIT_PATTERN = /(\{\{[^}]+\}\})/g;
const VARIABLE_PART_PATTERN = /^\{\{[^}]+\}\}$/;

export function getVariableHighlightParts(text: string): HighlightPart[] {
	return text
		.split(VARIABLE_SPLIT_PATTERN)
		.filter(Boolean)
		.map((part) => ({
			text: part,
			isVariable: VARIABLE_PART_PATTERN.test(part),
		}));
}
