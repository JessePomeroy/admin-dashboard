import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BlogRichTextDocument } from "../src/lib/blogRichTextModel";
import RichBodyEditor from "../src/lib/pages/editor/RichBodyEditor.svelte";
import RichBodyEditorHarness from "./RichBodyEditorHarness.svelte";

const components: ReturnType<typeof mount>[] = [];

beforeEach(() => {
	const rect = new DOMRect(0, 0, 1, 1);
	window.scrollBy = vi.fn();
	Object.defineProperties(Range.prototype, {
		getClientRects: { configurable: true, value: () => [rect] },
		getBoundingClientRect: { configurable: true, value: () => rect },
	});
});

function sourceDocument(): BlogRichTextDocument {
	return {
		version: 1,
		blocks: [
			{
				type: "paragraph",
				key: "intro",
				children: [{ type: "text", key: "intro-text", text: "A quiet beginning.", marks: [] }],
			},
			{
				type: "image",
				key: "image",
				assetId: "asset-1",
				altText: "Original alt",
				caption: "Original caption",
			},
		],
	};
}

function readyMediaAsset(id: string) {
	return {
		_id: id,
		assetId: id,
		originalFilename: `${id}.jpg`,
		status: "ready" as const,
		source: { contentType: "image/jpeg", sizeBytes: 100, width: 1200, height: 800 },
		derivatives: {
			thumb: { key: `${id}/thumb.jpg`, width: 160, height: 107 },
			card: { key: `${id}/card.jpg`, width: 800, height: 533 },
		},
		createdAt: 1,
	};
}

async function selectEditorText(text: string) {
	const editor = document.querySelector<HTMLElement>('[role="textbox"]');
	if (!editor) throw new Error("Expected editor");
	const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
	let node: Node | null = walker.nextNode();
	while (node && !node.textContent?.includes(text)) node = walker.nextNode();
	if (!node?.textContent) throw new Error(`Could not find editor text: ${text}`);
	const start = node.textContent.indexOf(text);
	const range = document.createRange();
	range.setStart(node, start);
	range.setEnd(node, start + text.length);
	editor.focus();
	const selection = window.getSelection();
	selection?.removeAllRanges();
	selection?.addRange(range);
	document.dispatchEvent(new Event("selectionchange"));
	await new Promise((resolve) => setTimeout(resolve, 20));
	await tick();
}

afterEach(() => {
	for (const component of components.splice(0)) unmount(component);
	document.body.innerHTML = "";
});

describe("RichBodyEditor", () => {
	it("mounts and focuses without normalizing or emitting the document", async () => {
		const onDocumentChange = vi.fn();
		components.push(mount(RichBodyEditor, {
			target: document.body,
			props: {
				document: sourceDocument(),
				labelledBy: "body-heading",
				describedBy: "body-help",
				onDocumentChange,
			},
		}));
		await tick();

		const editor = document.querySelector<HTMLElement>('[role="textbox"]');
		expect(editor?.getAttribute("aria-labelledby")).toBe("body-heading");
		expect(editor?.getAttribute("aria-describedby")).toBe("body-help");
		editor?.focus();
		await tick();
		expect(onDocumentChange).not.toHaveBeenCalled();
		expect(document.querySelector(".rich-image input")?.getAttribute("aria-label")).toBe("Image alt text");
	});

	it("provides an editable starting block for an empty document without emitting on mount", async () => {
		const onDocumentChange = vi.fn();
		components.push(mount(RichBodyEditor, {
			target: document.body,
			props: {
				document: { version: 1, blocks: [] },
				labelledBy: "body-heading",
				onDocumentChange,
			},
		}));
		await tick();

		expect(document.querySelector('[role="textbox"] p')).toBeTruthy();
		expect(onDocumentChange).not.toHaveBeenCalled();
	});

	it("emits a validated schema-v1 document when image metadata changes", async () => {
		const onDocumentChange = vi.fn();
		components.push(mount(RichBodyEditor, {
			target: document.body,
			props: {
				document: sourceDocument(),
				labelledBy: "body-heading",
				onDocumentChange,
			},
		}));
		await tick();

		const alt = document.querySelector<HTMLInputElement>('input[aria-label="Image alt text"]');
		expect(alt).toBeTruthy();
		alt!.value = "Revised alt";
		alt!.dispatchEvent(new Event("change", { bubbles: true }));
		await tick();

		expect(onDocumentChange).toHaveBeenCalledTimes(1);
		expect(onDocumentChange.mock.calls[0][0]).toEqual({
			...sourceDocument(),
			blocks: [
				sourceDocument().blocks[0],
				{ ...sourceDocument().blocks[1], altText: "Revised alt" },
			],
		});
	});

	it("canonicalizes transient image text at the single body-image authority", async () => {
		const onDocumentChange = vi.fn();
		components.push(mount(RichBodyEditorHarness, {
			target: document.body,
			props: { document: sourceDocument(), onDocumentChange },
		}));
		await tick();

		let alt = document.querySelector<HTMLInputElement>('input[aria-label="Image alt text"]')!;
		alt.value = "  Revised factual alt  ";
		alt.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		expect(onDocumentChange).not.toHaveBeenCalled();
		expect(alt.value).toBe("  Revised factual alt  ");
		alt.dispatchEvent(new Event("change", { bubbles: true }));
		await tick();
		expect(onDocumentChange.mock.calls.at(-1)?.[0].blocks[1])
			.toMatchObject({ altText: "Revised factual alt" });

		alt = document.querySelector<HTMLInputElement>('input[aria-label="Image alt text"]')!;
		alt.value = "";
		alt.dispatchEvent(new Event("change", { bubbles: true }));
		await tick();
		const image = onDocumentChange.mock.calls.at(-1)?.[0].blocks[1] as Record<string, unknown>;
		expect(image).not.toHaveProperty("altText");
		expect(document.querySelector('[role="textbox"]')).toBeTruthy();
		expect(document.querySelector('.unsupported')).toBeNull();
	});

	it("fails closed for an unsupported document without mounting an editor", async () => {
		const onDocumentChange = vi.fn();
		components.push(mount(RichBodyEditor, {
			target: document.body,
			props: {
				document: { version: 2, blocks: [] } as never,
				labelledBy: "body-heading",
				onDocumentChange,
			},
		}));
		await tick();

		expect(document.querySelector('[role="alert"]')?.textContent).toContain("unavailable");
		expect(document.querySelector('[role="textbox"]')).toBeNull();
		expect(onDocumentChange).not.toHaveBeenCalled();
	});

	it("makes the editor and image controls inert for archived documents", async () => {
		components.push(mount(RichBodyEditor, {
			target: document.body,
			props: {
				document: sourceDocument(),
				disabled: true,
				labelledBy: "body-heading",
				onDocumentChange: vi.fn(),
			},
		}));
		await tick();

		expect(document.querySelector('[role="textbox"]')?.getAttribute("contenteditable")).toBe("false");
		expect([...document.querySelectorAll<HTMLButtonElement>("button")].every((button) => button.disabled)).toBe(true);
		expect([...document.querySelectorAll<HTMLInputElement>(".rich-image input")].every((input) => input.disabled)).toBe(true);
	});

	it("synchronizes an external body-image update before emitting a later editor change", async () => {
		const onDocumentChange = vi.fn();
		components.push(mount(RichBodyEditorHarness, {
			target: document.body,
			props: { document: sourceDocument(), onDocumentChange },
		}));
		await tick();

		document.querySelector<HTMLButtonElement>('[aria-label="Replace image alt externally"]')?.click();
		await tick();
		const [alt, caption] = document.querySelectorAll<HTMLInputElement>(".rich-image input");
		expect(alt.value).toBe("Externally revised alt");
		caption.value = "Revised after external update";
		caption.dispatchEvent(new Event("change", { bubbles: true }));
		await tick();

		const emitted = onDocumentChange.mock.calls.at(-1)?.[0] as BlogRichTextDocument;
		const image = emitted.blocks[1];
		expect(image).toMatchObject({
			type: "image",
			altText: "Externally revised alt",
			caption: "Revised after external update",
		});
	});

	it("rejects and visibly rolls back an edit that exceeds the shared contract", async () => {
		const onDocumentChange = vi.fn();
		components.push(mount(RichBodyEditor, {
			target: document.body,
			props: {
				document: sourceDocument(),
				labelledBy: "body-heading",
				onDocumentChange,
			},
		}));
		await tick();

		const alt = document.querySelector<HTMLInputElement>('input[aria-label="Image alt text"]');
		expect(alt).toBeTruthy();
		alt!.value = "x".repeat(501);
		alt!.dispatchEvent(new Event("change", { bubbles: true }));
		await tick();

		expect(onDocumentChange).not.toHaveBeenCalled();
		expect(document.querySelector<HTMLInputElement>('input[aria-label="Image alt text"]')?.value)
			.toBe("Original alt");
		expect(document.querySelector('[role="alert"]')?.textContent).toContain("unsupported or ambiguous");
	});

	it("closes transient mutation UI and refreshes image controls when disabled changes", async () => {
		components.push(mount(RichBodyEditorHarness, {
			target: document.body,
			props: { document: sourceDocument(), onDocumentChange: vi.fn() },
		}));
		await tick();

		Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
			.find((button) => button.textContent?.trim() === "link")?.click();
		await tick();
		expect(document.querySelector(".link-panel")).toBeTruthy();
		document.querySelector<HTMLButtonElement>('[aria-label="Toggle disabled"]')?.click();
		await tick();

		expect(document.querySelector(".link-panel")).toBeNull();
		expect(document.querySelector('[role="textbox"]')?.getAttribute("contenteditable")).toBe("false");
		expect([...document.querySelectorAll<HTMLInputElement>(".rich-image input")]
			.every((input) => input.disabled)).toBe(true);
	});

	it("changes an entire multi-item list style without fragmenting the list", async () => {
		const onDocumentChange = vi.fn();
		const documentWithList: BlogRichTextDocument = {
			version: 1,
			blocks: [{
				type: "list",
				key: "list",
				style: "bullet",
				items: [
					{ key: "one", children: [{ type: "text", key: "one-text", text: "one", marks: [] }] },
					{ key: "two", children: [{ type: "text", key: "two-text", text: "two", marks: [] }] },
				],
			}],
		};
		components.push(mount(RichBodyEditor, {
			target: document.body,
			props: { document: documentWithList, labelledBy: "body-heading", onDocumentChange },
		}));
		await tick();

		const style = document.querySelector<HTMLSelectElement>('select[aria-label="Text style"]');
		expect(style?.value).toBe("bullet_list");
		style!.value = "ordered_list";
		style!.dispatchEvent(new Event("change", { bubbles: true }));
		await tick();

		expect(onDocumentChange).toHaveBeenCalledTimes(1);
		expect(onDocumentChange.mock.calls[0][0]).toEqual({
			...documentWithList,
			blocks: [{ ...documentWithList.blocks[0], style: "number" }],
		});
	});

	it("supports image transaction undo and redo without losing document identity", async () => {
		const onDocumentChange = vi.fn();
		components.push(mount(RichBodyEditorHarness, {
			target: document.body,
			props: { document: sourceDocument(), onDocumentChange },
		}));
		await tick();

		const alt = document.querySelector<HTMLInputElement>('input[aria-label="Image alt text"]')!;
		alt.value = "History alt";
		alt.dispatchEvent(new Event("change", { bubbles: true }));
		await tick();
		Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
			.find((button) => button.textContent?.trim() === "undo")?.click();
		await tick();
		expect(onDocumentChange.mock.calls.at(-1)?.[0]).toEqual(sourceDocument());

		const redoButton = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
			.find((button) => button.textContent?.trim() === "redo");
		expect(redoButton?.disabled).toBe(false);
		redoButton?.click();
		await tick();
		expect(document.querySelector<HTMLInputElement>('input[aria-label="Image alt text"]')?.value)
			.toBe("History alt");
		expect(onDocumentChange).toHaveBeenCalledTimes(3);
		expect(onDocumentChange.mock.calls.at(-1)?.[0].blocks[1]).toMatchObject({ altText: "History alt" });
	});

	it("pastes only plain text through the editor transaction boundary", async () => {
		const onDocumentChange = vi.fn();
		components.push(mount(RichBodyEditorHarness, {
			target: document.body,
			props: { document: sourceDocument(), onDocumentChange },
		}));
		await tick();

		const editor = document.querySelector<HTMLElement>('[role="textbox"]')!;
		editor.focus();
		const paste = new Event("paste", { bubbles: true, cancelable: true });
		Object.defineProperty(paste, "clipboardData", {
			value: { getData: (type: string) => type === "text/plain" ? "Plain words\nfrom markup" : "<b>ignored</b>" },
		});
		editor.dispatchEvent(paste);
		await tick();

		const emitted = onDocumentChange.mock.calls.at(-1)?.[0] as BlogRichTextDocument;
		const paragraph = emitted.blocks[0];
		if (paragraph.type !== "paragraph") throw new Error("Expected paragraph");
		expect(paragraph.children.map((span) => span.text).join(""))
			.toContain("Plain words from markup");
		expect(paragraph.children.flatMap((span) => span.marks)).toEqual([]);
		expect(JSON.stringify(emitted)).not.toContain("<b>");
	});

	it("applies bold and safe-link transactions to the selected text", async () => {
		const onDocumentChange = vi.fn();
		components.push(mount(RichBodyEditorHarness, {
			target: document.body,
			props: { document: sourceDocument(), onDocumentChange },
		}));
		await tick();

		await selectEditorText("quiet");
		Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
			.find((button) => button.textContent?.includes("B"))?.click();
		await tick();
		let emitted = onDocumentChange.mock.calls.at(-1)?.[0] as BlogRichTextDocument;
		let paragraph = emitted.blocks[0];
		if (paragraph.type !== "paragraph") throw new Error("Expected paragraph");
		expect(paragraph.children.find((span) => span.text === "quiet")?.marks)
			.toContainEqual({ type: "strong" });

		await selectEditorText("quiet");
		Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
			.find((button) => button.textContent?.trim() === "link")?.click();
		await tick();
		const href = document.querySelector<HTMLInputElement>('.link-panel input');
		expect(href).toBeTruthy();
		href!.value = "/journal/quiet";
		href!.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		Array.from(document.querySelectorAll<HTMLButtonElement>(".link-panel button"))
			.find((button) => button.textContent?.trim() === "apply link")?.click();
		await tick();
		emitted = onDocumentChange.mock.calls.at(-1)?.[0] as BlogRichTextDocument;
		paragraph = emitted.blocks[0];
		if (paragraph.type !== "paragraph") throw new Error("Expected paragraph");
		expect(paragraph.children.find((span) => span.text === "quiet")?.marks)
			.toEqual(expect.arrayContaining([
				{ type: "strong" },
				expect.objectContaining({ type: "link", href: "/journal/quiet" }),
			]));

		await selectEditorText("quiet");
		Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
			.find((button) => button.textContent?.trim() === "link")?.click();
		await tick();
		const existingHref = document.querySelector<HTMLInputElement>('.link-panel input')!;
		existingHref.value = "";
		existingHref.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		Array.from(document.querySelectorAll<HTMLButtonElement>(".link-panel button"))
			.find((button) => button.textContent?.trim() === "remove link")?.click();
		await tick();
		emitted = onDocumentChange.mock.calls.at(-1)?.[0] as BlogRichTextDocument;
		paragraph = emitted.blocks[0];
		if (paragraph.type !== "paragraph") throw new Error("Expected paragraph");
		expect(paragraph.children.find((span) => span.text === "quiet")?.marks)
			.toEqual([{ type: "strong" }]);
	});

	it("adds, reorders, and removes ready existing media through document transactions", async () => {
		const onDocumentChange = vi.fn();
		components.push(mount(RichBodyEditorHarness, {
			target: document.body,
			props: {
				document: sourceDocument(),
				mediaAssets: [readyMediaAsset("asset-2")],
				addableMediaAssets: [readyMediaAsset("asset-2")],
				mediaBaseUrl: "https://media.example",
				onDocumentChange,
			},
		}));
		await tick();
		Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
			.find((button) => button.textContent?.trim() === "add image")?.click();
		await tick();
		Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
			.find((button) => button.textContent?.trim() === "add")?.click();
		await tick();

		let emitted = onDocumentChange.mock.calls.at(-1)?.[0] as BlogRichTextDocument;
		expect(emitted.blocks.filter((block) => block.type === "image")).toHaveLength(2);
		expect(emitted.blocks[1]).toMatchObject({ type: "image", assetId: "asset-2" });

		const firstMoveDown = document.querySelector<HTMLButtonElement>(".rich-image-actions button:nth-child(2)");
		firstMoveDown?.click();
		await tick();
		emitted = onDocumentChange.mock.calls.at(-1)?.[0] as BlogRichTextDocument;
		expect(emitted.blocks.slice(1).map((block) => block.type === "image" ? block.assetId : ""))
			.toEqual(["asset-1", "asset-2"]);

		const lastRemove = document.querySelectorAll<HTMLButtonElement>(".rich-image-actions button:nth-child(3)").item(1);
		lastRemove.click();
		await tick();
		emitted = onDocumentChange.mock.calls.at(-1)?.[0] as BlogRichTextDocument;
		expect(emitted.blocks.filter((block) => block.type === "image"))
			.toEqual([sourceDocument().blocks[1]]);
	});
});
