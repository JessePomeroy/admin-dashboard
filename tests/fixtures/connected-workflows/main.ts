import { mount } from "svelte";
import Harness from "./Harness.svelte";
import { queryClient } from "../../controlledQueryClient";
import "../../../src/lib/theme.css";

let inquiry = { _id: "inquiry-1", _creationTime: Date.UTC(2026, 9, 30), siteUrl: "example.test", name: "Example visitor", email: "visitor@example.test", subject: "Portrait session", message: "I would like to plan an evening portrait session. Could we discuss locations and available dates?", status: "new", clientId: "", followUpDate: "", followUpCompletedAt: 0, internalNotes: "" };
let proof = { _id: "proof-1", selectedCount: 2, submittedAt: Date.UTC(2026, 9, 30, 12), notes: "These are my final selections. Keep the evening colors.", reopenedAt: 0 };
const queries = queryClient((name, args) => {
	if (name === "inquiries:linkClient") { inquiry = { ...inquiry, clientId: "client-1", status: "read" }; }
	else if (name === "inquiries:updateFollowUp") inquiry = { ...inquiry, followUpDate: args.completed ? "" : String(args.date ?? ""), internalNotes: String(args.notes), followUpCompletedAt: args.completed ? Date.now() : 0 };
	else if (name === "inquiries:updateStatus") inquiry = { ...inquiry, status: String(args.status) };
	else if (name === "galleries:reopenProof") proof = { ...proof, reopenedAt: Date.now() };
	else throw new Error("Unexpected fixture mutation");
	queueMicrotask(respond);
	return "client-1";
}, (name) => {
	if (name === "inquiries:getWorkflow") return { inquiry, client: inquiry.clientId ? { _id: "client-1", name: "Example visitor" } : null };
	if (name === "inquiries:clientOptions") return { page: [{ _id: "returning-1", name: "Returning client", email: "returning@example.test" }], isDone: true, continueCursor: "" };
	throw new Error("Unexpected fixture query");
});
function respond() {
	for (const subscription of queries.subscriptions.filter((item) => item.active)) {
		const page = (subscription.name === "inquiries:listPaginated" || subscription.name === "inquiries:listForClient") ? [inquiry]
			: subscription.name === "galleries:listProofs" ? [proof]
			: subscription.name === "galleries:getProofImages" ? [{ _id: "selection-1", filename: "evening-portrait-at-the-old-station-001.jpg", editingNotes: "Keep the grain and the pink light." }, { _id: "selection-2", filename: "evening-portrait-002.jpg", editingNotes: "Please crop a little from the left." }] : null;
		if (page) queries.emit(subscription, { page, isDone: true, continueCursor: "" });
	}
}
const target = document.getElementById("app");
if (!target) throw new Error("Missing fixture target");
target.dataset.admin = "";
target.style.cssText = "font-family:var(--admin-font-body);color:var(--admin-text);background:var(--admin-bg);min-height:100vh";
mount(Harness, { target, props: { client: queries.client } });
Object.assign(window, { workflowFixture: { respond } });
