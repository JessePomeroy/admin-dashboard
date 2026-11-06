<script lang="ts">
import GmailQueuePage from "../../../src/lib/pages/GmailQueuePage.svelte";
import AdminLayout from "../../../src/lib/components/AdminLayout.svelte";
import InquiryDetailModal from "../../../src/lib/pages/inquiries/InquiryDetailModal.svelte";
import ClientDetailModal from "../../../src/lib/pages/crm/ClientDetailModal.svelte";
import type { Client } from "../../../src/lib/types";
const queue = new URL(location.href).searchParams.get("view") === "queue";
let show=$state<"inquiry"|"client"|null>(queue ? null : "inquiry");
const inquiry={_id:"inquiry1",name:"Alex Example",email:"guest@example.test",subject:"Portrait session",message:"Hello, I would like to arrange a session.",status:"read" as const,submittedAt:new Date().toISOString()};
const client={_id:"client1",_creationTime:Date.now(),siteUrl:"example.test",name:"Alex Example",email:"guest@example.test",category:"photography",status:"lead"} as Client;
</script>
<AdminLayout data={{adminSession:{status:"authorized",email:"owner@example.test",tier:"full",isCreator:false}}}>
{#if queue}<GmailQueuePage />{:else}<section class="admin-page"><header class="page-header"><h1>inquiries</h1></header><p>Synthetic local data. Google consent, mailbox transport and delivery are simulated.</p><button onclick={()=>show="inquiry"}>open inquiry</button><button onclick={()=>show="client"}>open client</button></section>{/if}
{#if show==="inquiry"}<InquiryDetailModal {inquiry} onclose={()=>show=null} onupdatestatus={()=>{}} />{/if}
{#if show==="client"}<ClientDetailModal {client} clientTags={[]} clientActivity={[]} availableTags={[]} loadingTags={false} loadingActivity={false} saving={false} onclose={()=>show=null} onsave={async()=>{}} ondelete={()=>{}} onstatuschange={()=>{}} ontagassign={()=>{}} ontagremove={()=>{}} />{/if}
</AdminLayout>
