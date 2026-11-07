import { mount } from "svelte";
import Harness from "../../InquiriesHarness.svelte";
import { queryClient } from "../../controlledQueryClient";
import "../../../src/lib/theme.css";

const queryName = "inquiries:listPaginated";
const longTokens = new URLSearchParams(location.search).get("case") === "long-tokens";
const longInquiry = {
	_id: "inquiry-long-tokens", _creationTime: Date.UTC(2026, 9, 1),
	siteUrl: "example.test", name: "Long-token inquiry", status: "new",
	email: `${"s".repeat(64)}@${"d".repeat(63)}.example.test`,
	subject: "EveningPortraitSessionAtTheOldStationWithFamilyAndFriendsAndAdditionalLocations".repeat(3).slice(0, 180),
	message: `Please review this fictional location reference.\nhttps://location.example.test/${"0123456789abcdef".repeat(20)}\nI would like to discuss available dates.`,
};
let rows = longTokens ? [longInquiry] : Array.from({ length: 206 }, (_, index) => ({
	_id: `inquiry-${index}`, _creationTime: Date.UTC(2026, 9, 1) - index * 3600000,
	siteUrl: "example.test", name: index === 205 ? "Oldest unanswered" : `Synthetic inquiry ${index + 1}`,
	email: "person@example.test", subject: "Photography inquiry", message: "Synthetic inquiry for browser verification.",
	status: index === 205 ? "new" : "replied",
}));
const queries = queryClient((name, args) => {
	if (name === "inquiries:remove") rows = rows.filter((row) => row._id !== args.id);
	else if (name === "inquiries:updateStatus" && ["new", "read", "replied"].includes(String(args.status))) {
		rows = rows.map((row) => row._id === args.id ? { ...row, status: String(args.status) } : row);
	} else throw new Error("Unexpected synthetic mutation");
	respond();
});
function respond() {
	const subscription = queries.latest(queryName);
	const filtered = rows.filter((row) => !subscription.args.status || row.status === subscription.args.status);
	const start = Number(subscription.args.paginationOpts?.cursor ?? 0);
	const end = start + 25;
	queries.emit(subscription, { page: filtered.slice(start, end), isDone: end >= filtered.length, continueCursor: String(end) });
}
const target = document.getElementById("app");
if (!target) throw new Error("Missing inquiry fixture target");
target.dataset.admin = "";
target.style.cssText = "font-family:var(--admin-font-body);background:var(--admin-bg);min-height:100vh";
mount(Harness, { target, props: { client: queries.client } });
Object.assign(window, { inquiryFixture: {
	respond,
	fail() { queries.emit(queries.latest(queryName), new Error("Synthetic connection failure")); },
	get request() { return queries.latest(queryName).args; },
	get expectedLongInquiry() { return longInquiry; },
} });
