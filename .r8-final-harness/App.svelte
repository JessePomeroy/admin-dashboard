<script lang="ts">
	import AdminLayout from "../src/lib/components/AdminLayout.svelte";

	const data = {
		adminSession: { status: "authorized", email: "creator@example.com", tier: "pro", isCreator: true },
	};
</script>

<AdminLayout {data}>
	<div class="settings-page">
		<header class="settings-header workbench-heading editor-workbench-header">
			<div><h1>editor overview</h1><p>manage the public site from one focused workspace.</p></div>
		</header>
		<section><h2>recent work</h2><p>Choose a section from the editor navigation.</p></section>
	</div>
</AdminLayout>

<style>
	:global(*) { box-sizing: border-box; }
	:global(html, body, #app) { margin: 0; min-height: 100%; }
	.settings-page { min-height: 100vh; padding: 0 32px 72px; }
	.settings-header { display: flex; justify-content: space-between; }
	h1, h2, p { margin: 0; }
	h1 { color: var(--admin-heading); font: 500 1.5rem/1.1 var(--admin-font-display); }
	p { margin-top: 8px; color: var(--admin-text-muted); }
	section { max-width: 680px; padding-top: 40px; }
	@media (max-width: 640px) { .settings-page { padding: 72px 18px; } }
</style>
