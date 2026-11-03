<script lang="ts">
import { messageParts } from "./reading";
let { text }: { text: string } = $props();
const parts = $derived(messageParts(text));
let full = $state(false);
</script>
{#if full}<p class="message-text">{text}</p>
{:else}{#each parts as part, i (i)}
 {#if part.kind === "body"}<p class="message-text">{part.text}</p>
 {:else}<details><summary>{part.kind === "quoted" ? "quoted history" : "signature"} · expand</summary><p class="message-text">{part.text}</p></details>{/if}
{/each}{/if}
{#if parts.some(part => part.kind !== "body")}<button type="button" onclick={() => full = !full}>{full ? "collapse quoted history and signature" : "show full message"}</button>{/if}
<style>
.message-text { white-space: pre-wrap; text-transform: none; overflow-wrap: anywhere; max-width: 72ch; font-size: .88rem; line-height: 1.6; margin: 10px 0; }
details { margin-block: 10px; border-left: 2px solid var(--admin-border); padding-left: 12px; }
summary, button { color: var(--admin-text-muted); font-size: .8rem; cursor: pointer; }
summary { padding-block: 12px; }
button { min-height: 44px; padding: 8px; background: transparent; border: 1px solid var(--admin-border); font-family: inherit; }
summary:focus-visible, button:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 3px; }
@media (max-width: 600px) { .message-text { font-size: 1rem; } }
</style>
