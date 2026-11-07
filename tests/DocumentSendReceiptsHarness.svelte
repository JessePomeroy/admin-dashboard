<script lang="ts">
import DocumentSendReceipts from "../src/lib/pages/DocumentSendReceipts.svelte";
import { createDocumentSendReceipts, type DocumentSendReceipt } from "../src/lib/pages/documentSendReceiptState.svelte";

type Record = { _id: string; siteUrl: string; title: string };
let { read, select }: { read: (id: string) => Promise<Record | null>; select: (record: Record, openedReceipt: DocumentSendReceipt) => void } = $props();
const receipts = createDocumentSendReceipts({ siteUrl: "example.test", read: id => read(id), select: (record, openedReceipt) => select(record, openedReceipt) });
export function state() { return receipts; }
</script>

<div data-admin>
	<DocumentSendReceipts documentLabel="invoice" items={receipts.items} onopen={id => void receipts.open(id)} ondismiss={id => receipts.dismiss(id)} />
</div>
