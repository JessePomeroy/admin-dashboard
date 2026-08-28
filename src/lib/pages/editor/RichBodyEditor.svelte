<script lang="ts">
import { baseKeymap, setBlockType, toggleMark } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { inputRules, wrappingInputRule } from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import { Fragment, Slice, type Node as ProseMirrorNode } from "prosemirror-model";
import { liftListItem, splitListItem, wrapInList } from "prosemirror-schema-list";
import { EditorState, NodeSelection, type Command, type Plugin } from "prosemirror-state";
import { EditorView, type NodeView } from "prosemirror-view";
import { onMount } from "svelte";
import type { PostRichTextDocument } from "../../blogEditor";
import {
	blogRichTextFromProseMirror,
	blogRichTextSchema,
	blogRichTextToProseMirror,
	createBlogRichTextKeyFactory,
	inspectBlogRichTextDocument,
	isSafeBlogRichTextUrl,
	type BlogRichTextDocument,
} from "../../blogRichTextModel";
import {
	portfolioMediaUrl,
	type PortfolioMediaAsset,
} from "../../portfolioEditor";
import PortfolioMediaPicker from "./PortfolioMediaPicker.svelte";

let {
	document,
	disabled = false,
	labelledBy,
	describedBy,
	mediaAssets = [],
	addableMediaAssets = [],
	mediaBaseUrl,
	onDocumentChange,
}: {
	document: PostRichTextDocument;
	disabled?: boolean;
	labelledBy: string;
	describedBy?: string;
	mediaAssets?: PortfolioMediaAsset[];
	addableMediaAssets?: PortfolioMediaAsset[];
	mediaBaseUrl?: string;
	onDocumentChange: (nextDocument: BlogRichTextDocument) => void;
} = $props();

let editorElement = $state<HTMLDivElement>();
let view = $state.raw<EditorView | null>(null);
let inspection = $derived(inspectBlogRichTextDocument(document));
let pickerOpen = $state(false);
let linkPanelOpen = $state(false);
let linkHref = $state("");
let linkError = $state("");
let activeBlock = $state("paragraph");
let strongActive = $state(false);
let emphasisActive = $state(false);
let linkActive = $state(false);
let canUndo = $state(false);
let canRedo = $state(false);
let editorError = $state("");
let editorPlugins: Plugin[] = [];
let synchronizedDocumentJson = "";

function documentJson(value: PostRichTextDocument) {
	return JSON.stringify(value);
}

function editorDocument(source: BlogRichTextDocument) {
	const proseMirror = blogRichTextToProseMirror(source);
	return proseMirror.childCount > 0
		? proseMirror
		: blogRichTextSchema.nodes.doc.create(null, blogRichTextSchema.nodes.paragraph.create({
			key: nextKey("block"),
		}));
}

function editorState(source: BlogRichTextDocument) {
	nextKey = createBlogRichTextKeyFactory(source);
	return EditorState.create({
		schema: blogRichTextSchema,
		doc: editorDocument(source),
		plugins: editorPlugins,
	});
}

$effect(() => {
	mediaAssets;
	addableMediaAssets;
	mediaBaseUrl;
	const currentDisabled = disabled;
	const currentInspection = inspection;
	const currentDocumentJson = documentJson(document);
	if (!view) return;
	if (currentDisabled) {
		linkPanelOpen = false;
		pickerOpen = false;
	}
	if (currentInspection.editable && currentDocumentJson !== synchronizedDocumentJson) {
		view.updateState(editorState(currentInspection.document));
		synchronizedDocumentJson = currentDocumentJson;
		editorError = "";
		updateToolbar();
	}
	view.setProps({
		editable: () => !currentDisabled,
		nodeViews: {
			image: (node, editorView, getPos) => imageNodeView(node, editorView, getPos),
		},
	});
});

function markIsActive(markName: "strong" | "emphasis" | "link") {
	if (!view) return false;
	const markType = blogRichTextSchema.marks[markName];
	const { from, to, empty } = view.state.selection;
	if (empty) return Boolean(markType.isInSet(view.state.storedMarks ?? view.state.selection.$from.marks()));
	return view.state.doc.rangeHasMark(from, to, markType);
}

function updateToolbar() {
	if (!view) return;
	strongActive = markIsActive("strong");
	emphasisActive = markIsActive("emphasis");
	linkActive = markIsActive("link");
	canUndo = undo(view.state);
	canRedo = redo(view.state);
	const selectionStart = view.state.selection.$from;
	for (let depth = selectionStart.depth; depth > 0; depth -= 1) {
		const name = selectionStart.node(depth).type.name;
		if (name === "bullet_list" || name === "ordered_list") {
			activeBlock = name;
			return;
		}
	}
	for (let depth = selectionStart.depth; depth > 0; depth -= 1) {
		const name = selectionStart.node(depth).type.name;
		if (name === "paragraph" || name === "heading" || name === "blockquote") {
			activeBlock = name === "heading" ? `heading-${String(selectionStart.node(depth).attrs.level)}` : name;
			return;
		}
	}
}

function run(command: Command) {
	if (!view || disabled) return false;
	const changed = command(view.state, view.dispatch, view);
	if (changed) view.focus();
	updateToolbar();
	return changed;
}

function setBlock(kind: string) {
	if (kind === "bullet_list" || kind === "ordered_list") {
		if (activeBlock === kind) {
			run(liftListItem(blogRichTextSchema.nodes.list_item));
			return;
		}
		if (activeBlock === "bullet_list" || activeBlock === "ordered_list") {
			changeListStyle(kind);
			return;
		}
		run(wrapInList(blogRichTextSchema.nodes[kind], { key: nextKey("list") }));
		return;
	}
	if (activeBlock === "bullet_list" || activeBlock === "ordered_list") {
		if (!run(liftListItem(blogRichTextSchema.nodes.list_item))) return;
	}
	const type = kind.startsWith("heading-")
		? blogRichTextSchema.nodes.heading
		: kind === "blockquote"
			? blogRichTextSchema.nodes.blockquote
			: blogRichTextSchema.nodes.paragraph;
	const attrs = kind.startsWith("heading-")
		? { key: currentBlockKey(), level: Number(kind.slice(-1)) }
		: { key: currentBlockKey() };
	run(setBlockType(type, attrs));
}

function changeListStyle(kind: "bullet_list" | "ordered_list") {
	if (!view || disabled) return;
	const selectionStart = view.state.selection.$from;
	for (let depth = selectionStart.depth; depth > 0; depth -= 1) {
		const node = selectionStart.node(depth);
		if (node.type !== blogRichTextSchema.nodes.bullet_list
			&& node.type !== blogRichTextSchema.nodes.ordered_list) continue;
		const position = selectionStart.before(depth);
		view.dispatch(view.state.tr.setNodeMarkup(
			position,
			blogRichTextSchema.nodes[kind],
			{ key: node.attrs.key },
		));
		view.focus();
		return;
	}
}

function currentBlockKey() {
	if (!view) return nextKey("block");
	const selectionStart = view.state.selection.$from;
	for (let depth = selectionStart.depth; depth > 0; depth -= 1) {
		const key = selectionStart.node(depth).attrs.key;
		if (typeof key === "string") return key;
	}
	return nextKey("block");
}

function openLinkPanel() {
	if (!view || disabled) return;
	const existing = selectedLinkRange()?.mark
		?? (view.state.storedMarks ?? view.state.selection.$from.marks())
			.find((mark) => mark.type === blogRichTextSchema.marks.link);
	linkHref = existing?.attrs.href ?? "";
	linkError = "";
	linkPanelOpen = true;
}

function applyLink() {
	if (!view || disabled) return;
	const href = linkHref.trim();
	if (href && !isSafeBlogRichTextUrl(href)) {
		linkError = "Use an http, https, mailto, tel, site path, or #anchor link.";
		return;
	}
	const selectedRange = selectedLinkRange();
	const { empty } = view.state.selection;
	if (empty && !selectedRange) {
		if (!href) {
			linkPanelOpen = false;
			return;
		}
		linkError = "Select the text that should become a link.";
		return;
	}
	const from = selectedRange?.from ?? view.state.selection.from;
	const to = selectedRange?.to ?? view.state.selection.to;
	let transaction = view.state.tr.removeMark(from, to, blogRichTextSchema.marks.link);
	if (href) {
		transaction = transaction.addMark(
			from,
			to,
			blogRichTextSchema.marks.link.create({
				key: selectedRange?.mark.attrs.key ?? nextKey("link"),
				href,
			}),
		);
	}
	view.dispatch(transaction.scrollIntoView());
	linkPanelOpen = false;
	view.focus();
}

function selectedLinkRange() {
	if (!view || !view.state.selection.empty) return null;
	const selectionStart = view.state.selection.$from;
	const parent = selectionStart.parent;
	const parentStart = selectionStart.start();
	const offset = selectionStart.parentOffset;
	const children: Array<{ node: ProseMirrorNode; from: number; to: number }> = [];
	parent.forEach((node, childOffset) => {
		children.push({ node, from: parentStart + childOffset, to: parentStart + childOffset + node.nodeSize });
	});
	let index = children.findIndex(({ node, from, to }) =>
		node.isText
		&& offset + parentStart >= from
		&& offset + parentStart <= to
		&& Boolean(blogRichTextSchema.marks.link.isInSet(node.marks))
	);
	if (index < 0) return null;
	const mark = blogRichTextSchema.marks.link.isInSet(children[index].node.marks);
	if (!mark) return null;
	let from = children[index].from;
	let to = children[index].to;
	while (index > 0) {
		const previous = blogRichTextSchema.marks.link.isInSet(children[index - 1].node.marks);
		if (!previous?.eq(mark)) break;
		index -= 1;
		from = children[index].from;
	}
	while (index + 1 < children.length) {
		const next = blogRichTextSchema.marks.link.isInSet(children[index + 1].node.marks);
		if (!next?.eq(mark)) break;
		index += 1;
		to = children[index].to;
	}
	return { from, to, mark };
}

function pastePlainText(view: EditorView, event: ClipboardEvent) {
	if (disabled) return true;
	const text = event.clipboardData?.getData("text/plain");
	if (text === undefined) return false;
	event.preventDefault();
	const paragraphs = text.replaceAll("\r\n", "\n").split(/\n{2,}/);
	if (paragraphs.length === 1) {
		view.dispatch(view.state.tr.insertText(paragraphs[0].replaceAll("\n", " ")).scrollIntoView());
		return true;
	}
	const nodes = paragraphs.map((paragraph) => blogRichTextSchema.nodes.paragraph.create(
		{ key: nextKey("block") },
		paragraph ? blogRichTextSchema.text(paragraph.replaceAll("\n", " ")) : undefined,
	));
	view.dispatch(view.state.tr.replaceSelection(new Slice(Fragment.from(nodes), 0, 0)).scrollIntoView());
	return true;
}

function addImage(asset: PortfolioMediaAsset) {
	if (!view || disabled) return;
	const image = blogRichTextSchema.nodes.image.create({
		key: nextKey("image"),
		assetId: asset._id,
		altText: "",
		caption: null,
	});
	const selectionStart = view.state.selection.$from;
	const insertAt = selectionStart.depth > 0 ? selectionStart.after(1) : view.state.selection.to;
	const transaction = view.state.tr.insert(insertAt, image);
	view.dispatch(transaction.setSelection(NodeSelection.create(transaction.doc, insertAt)).scrollIntoView());
	pickerOpen = false;
	view.focus();
}

function imageNodeView(node: ProseMirrorNode, editorView: EditorView, getPos: () => number | undefined): NodeView {
	const dom = globalThis.document.createElement("figure");
	dom.className = "rich-image";
	const preview = globalThis.document.createElement("div");
	preview.className = "rich-image-preview";
	const asset = mediaAssets.find((candidate) => candidate._id === node.attrs.assetId);
	if (asset && mediaBaseUrl) {
		const image = globalThis.document.createElement("img");
		image.src = portfolioMediaUrl(mediaBaseUrl, asset.derivatives.card.key);
		image.alt = "";
		preview.append(image);
	} else {
		preview.textContent = "linked image";
	}
	const fields = globalThis.document.createElement("div");
	fields.className = "rich-image-fields";
	const alt = globalThis.document.createElement("input");
	alt.value = node.attrs.altText ?? "";
	alt.placeholder = "alt text";
	alt.setAttribute("aria-label", "Image alt text");
	alt.maxLength = 500;
	alt.disabled = disabled;
	const caption = globalThis.document.createElement("input");
	caption.value = node.attrs.caption ?? "";
	caption.placeholder = "caption (optional)";
	caption.setAttribute("aria-label", "Image caption");
	caption.maxLength = 2_000;
	caption.disabled = disabled;
	fields.append(alt, caption);
	const actions = globalThis.document.createElement("div");
	actions.className = "rich-image-actions";
	for (const [label, direction] of [["move up", -1], ["move down", 1], ["remove", 0]] as const) {
		const button = globalThis.document.createElement("button");
		button.type = "button";
		button.textContent = label;
		button.disabled = disabled;
		button.addEventListener("click", () => moveOrRemoveImage(editorView, getPos, direction));
		actions.append(button);
	}
	dom.append(preview, fields, actions);
	const updateNode = () => {
		if (disabled) return;
		const position = getPos();
		if (position === undefined) return;
		const current = editorView.state.doc.nodeAt(position);
		if (!current) return;
		editorView.dispatch(editorView.state.tr.setNodeMarkup(position, undefined, {
			...current.attrs,
			altText: alt.value,
			caption: caption.value || null,
		}));
	};
	alt.addEventListener("change", updateNode);
	caption.addEventListener("change", updateNode);
	return {
		dom,
		stopEvent: (event) => event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement,
		update: (next) => {
			if (next.type !== blogRichTextSchema.nodes.image) return false;
			alt.value = next.attrs.altText ?? "";
			caption.value = next.attrs.caption ?? "";
			alt.disabled = disabled;
			caption.disabled = disabled;
			for (const button of actions.querySelectorAll("button")) button.disabled = disabled;
			return true;
		},
	};
}

function moveOrRemoveImage(editorView: EditorView, getPos: () => number | undefined, direction: -1 | 0 | 1) {
	if (disabled) return;
	const position = getPos();
	if (position === undefined) return;
	const node = editorView.state.doc.nodeAt(position);
	if (!node) return;
	if (direction === 0) {
		editorView.dispatch(editorView.state.tr.delete(position, position + node.nodeSize));
		return;
	}
	const resolved = editorView.state.doc.resolve(position);
	const sibling = direction < 0 ? resolved.nodeBefore : editorView.state.doc.nodeAt(position + node.nodeSize);
	if (!sibling) return;
	const target = direction < 0 ? position - sibling.nodeSize : position + sibling.nodeSize;
	const transaction = editorView.state.tr.delete(position, position + node.nodeSize).insert(target, node);
	editorView.dispatch(transaction.setSelection(NodeSelection.create(transaction.doc, target)).scrollIntoView());
}

let nextKey = (_prefix: string) => "uninitialized";

onMount(() => {
	if (!inspection.editable || !editorElement) return;
	editorPlugins = [
		history(),
		inputRules({ rules: [
			wrappingInputRule(/^\s*([-+*])\s$/, blogRichTextSchema.nodes.bullet_list, () => ({ key: nextKey("list") })),
			wrappingInputRule(/^(\d+)\.\s$/, blogRichTextSchema.nodes.ordered_list, () => ({ key: nextKey("list") })),
		] }),
		keymap({
			"Mod-z": undo,
			"Mod-y": redo,
			"Mod-Shift-z": redo,
			"Mod-b": toggleMark(blogRichTextSchema.marks.strong),
			"Mod-i": toggleMark(blogRichTextSchema.marks.emphasis),
			"Mod-k": () => {
				openLinkPanel();
				return true;
			},
			Enter: (state, dispatch, editorView) => splitListItem(
				blogRichTextSchema.nodes.list_item,
				{ key: nextKey("item") },
			)(state, dispatch, editorView),
		}),
		keymap(baseKeymap),
	];
	synchronizedDocumentJson = documentJson(inspection.document);
	view = new EditorView(editorElement, {
		state: editorState(inspection.document),
		editable: () => !disabled,
		dispatchTransaction: (transaction) => {
			if (!view) return;
			const previousState = view.state;
			const candidateState = previousState.apply(transaction);
			if (!transaction.docChanged) {
				view.updateState(candidateState);
				updateToolbar();
				return;
			}
			let nextDocument: BlogRichTextDocument;
			try {
				nextDocument = blogRichTextFromProseMirror(candidateState.doc, nextKey);
			} catch (error) {
				view.updateState(candidateState);
				view.updateState(previousState);
				editorError = error instanceof Error ? error.message : "This edit could not be represented safely.";
				updateToolbar();
				return;
			}
			view.updateState(candidateState);
			synchronizedDocumentJson = documentJson(nextDocument);
			editorError = "";
			onDocumentChange(nextDocument);
			updateToolbar();
		},
		handlePaste: pastePlainText,
		nodeViews: {
			image: (node, editorView, getPos) => imageNodeView(node, editorView, getPos),
		},
		attributes: {
			class: "rich-editor-surface",
			role: "textbox",
			"aria-multiline": "true",
			"aria-labelledby": labelledBy,
			...(describedBy ? { "aria-describedby": describedBy } : {}),
		},
	});
	updateToolbar();
	return () => {
		view?.destroy();
		view = null;
	};
});
</script>

{#if !inspection.editable}
	<div class="unsupported" role="alert">
		<strong>Rich body editing is unavailable for this document.</strong>
		<p>{inspection.reason} It will remain unchanged when other Post fields are saved.</p>
	</div>
{:else}
	<div class:disabled class="rich-body-editor">
		<div class="toolbar" role="toolbar" aria-label="Body formatting">
			<select aria-label="Text style" value={activeBlock} disabled={disabled} onchange={(event) => setBlock(event.currentTarget.value)}>
				<option value="paragraph">paragraph</option>
				<option value="heading-2">heading 2</option>
				<option value="heading-3">heading 3</option>
				<option value="heading-4">heading 4</option>
				<option value="blockquote">quote</option>
				<option value="bullet_list">bullet list</option>
				<option value="ordered_list">numbered list</option>
			</select>
			<button type="button" class:active={strongActive} aria-pressed={strongActive} disabled={disabled} onclick={() => run(toggleMark(blogRichTextSchema.marks.strong))}><strong>B</strong><span class="sr-only">bold</span></button>
			<button type="button" class:active={emphasisActive} aria-pressed={emphasisActive} disabled={disabled} onclick={() => run(toggleMark(blogRichTextSchema.marks.emphasis))}><em>I</em><span class="sr-only">italic</span></button>
			<button type="button" class:active={linkActive} aria-pressed={linkActive} disabled={disabled} onclick={openLinkPanel}>link</button>
			<span class="toolbar-spacer"></span>
			<button type="button" disabled={disabled || !canUndo} onclick={() => run(undo)}>undo</button>
			<button type="button" disabled={disabled || !canRedo} onclick={() => run(redo)}>redo</button>
			{#if addableMediaAssets.length > 0 && mediaBaseUrl}
				<button type="button" disabled={disabled} onclick={() => (pickerOpen = true)}>add image</button>
			{/if}
		</div>
		{#if linkPanelOpen}
			<div class="link-panel">
				<label>link destination <input bind:value={linkHref} maxlength="2048" placeholder="https://… or /page" {disabled} /></label>
				<button type="button" onclick={applyLink} {disabled}>{linkHref.trim() ? "apply link" : "remove link"}</button>
				<button type="button" onclick={() => (linkPanelOpen = false)} {disabled}>cancel</button>
				{#if linkError}<p role="alert">{linkError}</p>{/if}
			</div>
		{/if}
		<div class="editor-frame" bind:this={editorElement}></div>
		{#if editorError}<p class="editor-error" role="alert">{editorError}</p>{/if}
		<p class="editor-help">Use the toolbar or ⌘/Ctrl-B, ⌘/Ctrl-I, ⌘/Ctrl-K, and undo/redo shortcuts. Pasted content is inserted as plain text.</p>
	</div>
{/if}

{#if pickerOpen && mediaBaseUrl && !disabled}
	<PortfolioMediaPicker
		assets={addableMediaAssets}
		selectedAssetIds={new Set(inspection.editable
			? inspection.document.blocks.filter((block) => block.type === "image").map((block) => block.assetId)
			: [])}
		{mediaBaseUrl}
		onChoose={addImage}
		onClose={() => (pickerOpen = false)}
	/>
{/if}

<style>
	.rich-body-editor { border: 1px solid var(--admin-border-strong); border-radius: 8px; background: var(--admin-surface); overflow: clip; }
	.toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; padding: 8px; border-bottom: 1px solid var(--admin-border); background: var(--admin-surface-raised); }
	.toolbar button, .toolbar select, .link-panel button, .link-panel input { min-height: 38px; border: 1px solid var(--admin-border-strong); border-radius: 5px; padding: 7px 10px; background: var(--admin-surface); color: var(--admin-text); font: inherit; font-size: .74rem; }
	.toolbar button { cursor: pointer; }
	.toolbar button.active { border-color: var(--admin-accent); background: color-mix(in srgb, var(--admin-accent) 14%, var(--admin-surface)); color: var(--admin-heading); }
	.toolbar button:disabled { opacity: .45; cursor: default; }
	.toolbar button:focus-visible, .toolbar select:focus-visible, .link-panel input:focus-visible, .link-panel button:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 2px; }
	.toolbar-spacer { flex: 1; }
	.link-panel { display: flex; align-items: end; flex-wrap: wrap; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--admin-border); background: var(--admin-bg); }
	.link-panel label { flex: 1 1 280px; color: var(--admin-text-muted); font-size: .7rem; }
	.link-panel input { display: block; width: 100%; margin-top: 4px; }
	.link-panel p { flex-basis: 100%; margin: 0; color: var(--admin-error); font-size: .72rem; }
	.editor-frame { min-height: 360px; }
	.editor-frame :global(.rich-editor-surface) { min-height: 360px; padding: clamp(18px, 4vw, 42px); color: var(--admin-text); line-height: 1.75; outline: none; }
	.editor-frame :global(.rich-editor-surface:focus-visible) { box-shadow: inset 0 0 0 2px var(--admin-accent); }
	.editor-frame :global(.rich-editor-surface p), .editor-frame :global(.rich-editor-surface blockquote), .editor-frame :global(.rich-editor-surface ul), .editor-frame :global(.rich-editor-surface ol) { max-width: 72ch; margin: 0 0 1em; }
	.editor-frame :global(.rich-editor-surface h2), .editor-frame :global(.rich-editor-surface h3), .editor-frame :global(.rich-editor-surface h4) { max-width: 34ch; margin: 1.5em 0 .6em; color: var(--admin-heading); font-weight: 500; line-height: 1.2; }
	.editor-frame :global(.rich-editor-surface h2) { font-size: 1.6rem; }
	.editor-frame :global(.rich-editor-surface h3) { font-size: 1.3rem; }
	.editor-frame :global(.rich-editor-surface h4) { font-size: 1.05rem; }
	.editor-frame :global(.rich-editor-surface blockquote) { border-left: 3px solid var(--admin-accent); padding-left: 18px; color: var(--admin-text-muted); }
	.editor-frame :global(.rich-editor-surface a) { color: var(--admin-accent); text-decoration: underline; }
	.editor-frame :global(.rich-image) { display: grid; grid-template-columns: minmax(120px, 220px) 1fr; gap: 14px; max-width: 760px; margin: 22px 0; border: 1px solid var(--admin-border); border-radius: 7px; padding: 12px; background: var(--admin-surface-raised); }
	.editor-frame :global(.rich-image-preview) { display: grid; place-items: center; min-height: 120px; border-radius: 5px; overflow: hidden; background: var(--admin-bg); color: var(--admin-text-subtle); font-size: .7rem; }
	.editor-frame :global(.rich-image-preview img) { width: 100%; height: 100%; object-fit: cover; }
	.editor-frame :global(.rich-image-fields) { display: grid; align-content: start; gap: 8px; }
	.editor-frame :global(.rich-image-fields input) { min-height: 38px; border: 1px solid var(--admin-border-strong); border-radius: 5px; padding: 7px 9px; background: var(--admin-surface); color: var(--admin-text); font: inherit; }
	.editor-frame :global(.rich-image-actions) { grid-column: 1 / -1; display: flex; gap: 6px; }
	.editor-frame :global(.rich-image-actions button) { min-height: 36px; border: 1px solid var(--admin-border-strong); border-radius: 5px; padding: 6px 9px; background: transparent; color: var(--admin-text); font: inherit; font-size: .7rem; cursor: pointer; }
	.editor-help { margin: 0; padding: 9px 12px; border-top: 1px solid var(--admin-border); color: var(--admin-text-subtle); font-size: .68rem; }
	.editor-error { margin: 0; padding: 10px 12px; color: var(--admin-error); font-size: .74rem; }
	.unsupported { border: 1px solid var(--admin-warning); border-radius: 7px; padding: 14px; background: color-mix(in srgb, var(--admin-warning) 7%, var(--admin-surface)); }
	.unsupported strong { color: var(--admin-heading); }
	.unsupported p { margin: 5px 0 0; color: var(--admin-text-muted); }
	.disabled { opacity: .8; }
	.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
	@media (max-width: 640px) {
		.toolbar button, .toolbar select { min-height: 44px; }
		.editor-frame :global(.rich-editor-surface) { min-height: 300px; padding: 20px 16px; }
		.editor-frame :global(.rich-image) { grid-template-columns: 1fr; }
	}
</style>
