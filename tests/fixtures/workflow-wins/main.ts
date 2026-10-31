import { mount, tick } from "svelte";
import Harness from "../../WorkflowWinsHarness.svelte";
import { queryClient } from "../../controlledQueryClient";
import "../../../src/lib/theme.css";
const rows = Array.from({ length: 201 }, (_, index) => ({
	_id: `invoice-${index}`,
	invoiceNumber: `INV-${String(index + 1).padStart(3, "0")}`,
}));
let notice = { state: "uncertain", attempts: 5, canRetry: true };
let schedule: { state: string; nextDueDate: string; interval: string } | null = null;
let uploads = [
	{
		_id: "upload-1",
		r2Key: "example.test/gallery-1/original/synthetic.jpg",
		filename: "synthetic-portrait-original.jpg",
		sizeBytes: 123,
		width: 10,
		height: 10,
		state: "pending",
	},
];
const queries = queryClient(
	(name, args) => {
		if (name === "notice:retry") notice = { state: "pending", attempts: 5, canRetry: false };
		else if (name === "schedule:activate")
			schedule = { state: "active", nextDueDate: String(args.firstDueDate), interval: "monthly" };
		else if (name === "schedule:change")
			schedule = { state: String(args.state), nextDueDate: "2026-12-31", interval: "monthly" };
		else if (name === "images:add" || name === "uploads:deleted") uploads = [];
		else if (name === "uploads:deleting") return null;
		else throw new Error("Unexpected synthetic mutation");
		queueMicrotask(respond);
		return "synthetic-result";
	},
	(name, args) => {
		if (name === "records:get") return { _id: "older-record", invoiceNumber: "INV-OLD" };
		if (name !== "records:list") throw new Error("Unexpected synthetic query");
		const cursor = Number((args.paginationOpts as { cursor: string | null }).cursor ?? 0),
			end = cursor + 50;
		return {
			page: rows.slice(cursor, end),
			isDone: end >= rows.length,
			continueCursor: String(end),
		};
	},
);
function respond() {
	for (const subscription of queries.subscriptions.filter((row) => row.active)) {
		if (subscription.name === "records:list") {
			const start = Number(subscription.args.paginationOpts?.cursor ?? 0),
				end = start + 2;
			queries.emit(subscription, {
				page: rows.slice(start, end),
				isDone: end >= rows.length,
				continueCursor: String(end),
			});
		} else if (subscription.name === "notice:status") queries.emit(subscription, notice);
		else if (subscription.name === "schedule:get") queries.emit(subscription, schedule);
		else if (subscription.name === "uploads:list")
			queries.emit(subscription, { page: uploads, isDone: true, continueCursor: "" });
	}
}
window.fetch = async (input, init) => {
	const path = String(input);
	if (path.endsWith("upload-session"))
		return Response.json({
			uploadSessionToken: "synthetic-session",
			expiresAt: Date.now() + 600_000,
		});
	if (path.endsWith("/process")) {
		const body = JSON.parse(String(init?.body));
		if (body.expectedSizeBytes !== 123) throw new Error("Checkpoint verification missing");
		return Response.json({ sizeBytes: 123 });
	}
	if (path.endsWith("/delete")) return Response.json({ success: true });
	throw new Error("Fixture cannot call external services");
};
const target = document.getElementById("app");
if (!target) throw new Error("Missing fixture target");
target.style.cssText =
	"font-family:var(--admin-font-body);background:var(--admin-bg);min-height:100vh";
mount(Harness, { target, props: { client: queries.client } });
await tick();
respond();
Object.assign(window, {
	workflowFixture: {
		respond,
		get request() {
			return queries.latest("records:list").args;
		},
	},
});
