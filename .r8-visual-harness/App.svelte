<script lang="ts">
	import BlogWorkbench from "../src/lib/pages/editor/BlogWorkbench.svelte";

	const state = new URLSearchParams(location.search).get("state") ?? "selected";
	const selectedDocumentId = ["collection", "loading", "error", "empty", "mutation-error"].includes(state)
		? undefined
		: state === "published"
			? "post-published"
			: "post-changed";
	const documentTitle = state === "published" ? "Winter Light" : "Field Notes from the North Shore";
	const documentStatus = state === "published" ? "post / published" : "post / draft changes";
	const saveLabel = state === "saving"
		? "saving…"
		: state === "dirty"
			? "unsaved changes"
			: "saved";
	const alert = state === "validation"
		? "Add a title before saving this draft."
		: state === "editor-error"
			? "Could not save this draft. Your edits are still here."
			: "";
</script>

<div data-admin class="acceptance-shell">
	<aside class="host-rail" aria-label="Admin areas">
		<strong>ar</strong>
		<span>⌂</span>
		<span>✦</span>
		<span>▦</span>
		<span class="active">✎</span>
	</aside>
	<aside class="editor-nav" aria-label="Editor sections">
		<p>editor</p>
		<a href="/">overview</a>
		<a class="active" href="/">blog</a>
		<a href="/">portfolio</a>
		<a href="/">products</a>
		<a href="/">pages</a>
		<a href="/">site settings</a>
	</aside>
	<main>
		<BlogWorkbench {selectedDocumentId} selectedKind={selectedDocumentId ? "post" : undefined}>
			<div class="settings-page">
				<header class="settings-header">
					<div>
						<p class="document-kicker">{documentStatus}</p>
						<h1>{documentTitle}</h1>
						<p class="description">Shape the story, metadata, and publication state in one focused document.</p>
					</div>
					<div class="actions">
						<span class="save-state">{saveLabel}</span>
						<button type="button" disabled={state === "saving"}>save draft</button>
						<button type="button" class="primary">publish</button>
					</div>
				</header>
				{#if alert}<p class="alert" role="alert">{alert}</p>{/if}
				<section>
					<div class="section-heading"><span>01</span><div><h2>story details</h2><p>Public title, URL, and short introduction.</p></div></div>
					<div class="field-grid">
						<label>title<input value={state === "validation" ? "" : documentTitle} /></label>
						<label>URL<input value="field-notes" /></label>
					</div>
					<label>introduction<textarea rows="4">A study of weather, distance, and the quiet geometry of the lake.</textarea></label>
				</section>
				<section>
					<div class="section-heading"><span>02</span><div><h2>body</h2><p>Plain body editing is intentionally retained for the next R8 slice.</p></div></div>
					<textarea class="body-editor" rows="10">Morning arrived without ceremony. The horizon held a narrow band of silver while the shore stayed blue and still.</textarea>
				</section>
			</div>
		</BlogWorkbench>
	</main>
</div>

<style>
	:global(*) { box-sizing: border-box; }
	:global(html, body, #app) { margin: 0; min-height: 100%; }
	:global(body) { background: #10151d; font-family: var(--admin-font-body); }
	.acceptance-shell {
		display: grid;
		grid-template-columns: 72px 220px minmax(0, 1fr);
		min-height: 100vh;
		background: var(--admin-bg);
		color: var(--admin-text);
	}
	.host-rail, .editor-nav { border-right: 1px solid var(--admin-border); background: var(--admin-surface); }
	.host-rail { display: flex; align-items: center; flex-direction: column; gap: 28px; padding: 22px 0; }
	.host-rail strong { color: var(--admin-heading); font-family: var(--admin-font-display); font-size: 1.1rem; }
	.host-rail span { color: var(--admin-text-subtle); font-size: 1rem; }
	.host-rail span.active { color: var(--admin-heading); }
	.editor-nav { display: flex; flex-direction: column; gap: 4px; padding: 28px 18px; }
	.editor-nav p { margin: 0 0 18px 10px; color: var(--admin-text-subtle); font-size: .65rem; letter-spacing: .16em; text-transform: uppercase; }
	.editor-nav a { padding: 10px 12px; border-radius: 7px; color: var(--admin-text-muted); font-size: .78rem; text-decoration: none; }
	.editor-nav a.active { background: var(--admin-active); color: var(--admin-heading); }
	main { min-width: 0; }
	.document-kicker { margin: 0 0 8px; color: var(--admin-text-subtle); font-size: .65rem; letter-spacing: .12em; text-transform: uppercase; }
	.section-heading p { margin: 6px 0 0; color: var(--admin-text-subtle); font-size: .76rem; }
	.field-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; }
	label { display: grid; gap: 7px; color: var(--admin-text-muted); font-size: .72rem; }
	input, textarea { width: 100%; border: 1px solid var(--admin-border-strong); border-radius: 6px; padding: 10px; background: var(--admin-bg); color: var(--admin-heading); font: inherit; }
	.settings-page label + label, .settings-page .field-grid + label { margin-top: 16px; }
	.body-editor { line-height: 1.6; resize: vertical; }
	@media (min-width: 641px) and (max-width: 1179px) {
		.acceptance-shell { grid-template-columns: 72px 200px minmax(0, 1fr); }
	}
	@media (max-width: 640px) {
		.acceptance-shell { display: block; padding-top: 54px; }
		.host-rail { position: fixed; inset: 0 0 auto; z-index: 30; height: 54px; flex-direction: row; justify-content: space-around; padding: 0 14px; border-right: 0; border-bottom: 1px solid var(--admin-border); }
		.editor-nav { display: none; }
		.settings-page { padding: 28px 18px 72px; }
		.settings-page .settings-header { align-items: stretch; flex-direction: column; }
		.settings-page .actions { justify-content: flex-start; }
		.field-grid { grid-template-columns: 1fr; }
	}
</style>
