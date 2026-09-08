<script lang="ts">
import AdminModal from "../src/lib/components/AdminModal.svelte";
import Toast from "../src/lib/components/Toast.svelte";
import PortfolioMediaPicker from "../src/lib/pages/editor/PortfolioMediaPicker.svelte";
import { addToast } from "../src/lib/toast";

let adminOpen = $state(false);
let pickerOpen = $state(false);
let secondOpen = $state(false);
let loading = $state(false);
let closeResult = $state("");
let closeAdmin = $state(() => { closeResult = "initial"; adminOpen = false; });
export function replaceCloseCallback() {
	closeAdmin = () => { closeResult = "updated"; adminOpen = false; };
}
export function setLoading(value: boolean) { loading = value; }
export function removeAdmin() { adminOpen = false; }
export function removePicker() { pickerOpen = false; }
const pagination = $derived({
	pageNumber: 1, hasPrevious: false, hasNext: true, loading, error: false,
	next() { loading = true; }, previous() {}, retry() {},
});
</script>

<button type="button" onclick={() => (adminOpen = true)}>open admin</button>
<button type="button" onclick={() => (pickerOpen = true)}>open picker</button>
<output>{closeResult}</output>
<Toast />
{#if adminOpen}
	<AdminModal title="fixture admin" onclose={closeAdmin}>
		<button type="button" onclick={() => (pickerOpen = true)}>open nested picker</button>
		<button type="button" onclick={() => (secondOpen = true)}>open second admin</button>
		<button type="button" onclick={() => addToast("The save needs attention.")}>show save error</button>
		<input aria-label="Consumes Escape" onkeydown={(event) => { if (event.key === "Escape") event.preventDefault(); }} />
		<section tabindex="-1" aria-label="Recovery panel">recovery content</section>
		<button type="button">last admin control</button>
		{#if pickerOpen}
			<PortfolioMediaPicker assets={[]} selectedAssetIds={new Set()} mediaBaseUrl="https://media.example.test" {pagination} onChoose={() => {}} onClose={() => (pickerOpen = false)} />
		{/if}
	</AdminModal>
{:else if pickerOpen}
	<PortfolioMediaPicker assets={[]} selectedAssetIds={new Set()} mediaBaseUrl="https://media.example.test" {pagination} onChoose={() => {}} onClose={() => (pickerOpen = false)} />
{/if}
{#if secondOpen}
	<AdminModal title="second admin" onclose={() => (secondOpen = false)}>
		<button type="button">last second control</button>
	</AdminModal>
{/if}
