<script lang="ts">
import { createBusinessRecords } from "../src/lib/pages/businessRecords.svelte";
import RecordPagination from "../src/lib/pages/RecordPagination.svelte";
import InquiryNotification from "../src/lib/pages/inquiries/InquiryNotification.svelte";
import RecurringInvoiceSchedule from "../src/lib/pages/invoicing/RecurringInvoiceSchedule.svelte";
import GalleryUploadRecovery from "../src/lib/pages/gallery-delivery/GalleryUploadRecovery.svelte";
import type { Invoice } from "../src/lib/types";
import { toId } from "../src/lib/utils";
let search=$state("");let exported=$state("");let opened=$state("");
const records=createBusinessRecords<{_id:string;invoiceNumber:string}>({kind:"invoices",filters:()=>search ? {search}: {}});
const invoice:Invoice={_id:toId("invoice-1"),_creationTime:1,siteUrl:"example.test",invoiceNumber:"INV-001",clientId:toId("client-1"),clientName:"Synthetic Client",invoiceType:"recurring",status:"draft",items:[{description:"Synthetic service",quantity:1,unitPrice:2500}],recurring:{interval:"monthly"}};
async function exportAll(){const rows=await records.all();exported=rows ? String(rows.length) : "failed";}
</script>
<main>
 <h1>workflow recovery</h1>
 <section aria-label="Invoice records"><h2>invoices</h2><label>search invoices<input bind:value={search}/></label>
 {#if records.isLoading}<p role="status">loading records…</p>{/if}
 <ul>{#each records.data as row}<li>{row.invoiceNumber}</li>{/each}</ul>
 <RecordPagination {records} onexport={()=>void exportAll()} />
 <button onclick={async()=>{opened=(await records.open("older-record"))?.invoiceNumber ?? "missing";}}>open older invoice</button>
 <output aria-label="Exported count">{exported}</output><output aria-label="Opened record">{opened}</output>
 </section>
 <InquiryNotification id="inquiry-1" />
 <RecurringInvoiceSchedule {invoice} />
 <GalleryUploadRecovery galleryId="gallery-1" />
</main>
<style>
main{max-width:900px;margin:auto;padding:24px;color:var(--admin-text);font-family:Synonym,system-ui,sans-serif;}h1{font-size:1.5rem;}h2{font-size:1rem;font-weight:400;}label{display:grid;gap:6px;max-width:24rem;font-size:.85rem;}input,button{min-height:44px;max-width:100%;box-sizing:border-box;background:transparent;color:var(--admin-text);border:1px solid var(--admin-border-strong);font:inherit;padding:8px 12px;}section{margin-bottom:24px;}output{display:block;}
</style>
