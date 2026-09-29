<script lang="ts">
let {
	step,
	fromSlug,
	toSlug,
	checked = $bindable(false),
}: {
	step: string;
	fromSlug: string;
	toSlug: string;
	checked?: boolean;
} = $props();
</script>

<section aria-labelledby="slug-change-heading">
	<div class="section-heading">
		<span>{step}</span>
		<div>
			<h2 id="slug-change-heading">public URL change</h2>
			<p>Publishing will retain the old URL and point it at the new slug.</p>
		</div>
	</div>
	<label class="check">
		<input type="checkbox" bind:checked />
		<span>I understand this changes the public URL from /{fromSlug} to /{toSlug}.</span>
	</label>
</section>

<style>
.check { display: flex; align-items: flex-start; gap: 10px; color: var(--admin-text); }
.check input { width: auto; margin-top: 5px; }
</style>
