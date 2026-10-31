import { mount, tick, unmount } from "svelte";
import { afterEach, expect, it, vi } from "vitest";
import { queryClient } from "./controlledQueryClient";
import Harness from "./WorkflowWinsHarness.svelte";

vi.mock("../src/lib/config", async () => import("./fixtures/workflow-wins/config"));
let component: ReturnType<typeof mount> | undefined;
afterEach(async () => {
	if (component) await unmount(component);
	document.body.replaceChildren();
	vi.unstubAllGlobals();
});
const button = (name: string) => {
	const button = [...document.querySelectorAll("button")].find(
		(node) => node.textContent?.trim() === name,
	);
	if (!button) throw new Error(`Missing button ${name}`);
	return button;
};
async function setup() {
	const mutation = vi.fn(() => true);
	const query = vi.fn((name: string, args: Record<string, unknown>) =>
		name === "records:get"
			? { _id: "older-record", invoiceNumber: "INV-OLD" }
			: {
					page: [
						{
							_id: (args.paginationOpts as { cursor: string | null }).cursor ? "old" : "new",
							invoiceNumber: "Synthetic",
						},
					],
					isDone: Boolean((args.paginationOpts as { cursor: string | null }).cursor),
					continueCursor: "end",
				},
	);
	const queries = queryClient(mutation, query);
	component = mount(Harness, { target: document.body, props: { client: queries.client } });
	await tick();
	queries.emit(queries.latest("notice:status"), {
		state: "uncertain",
		attempts: 5,
		canRetry: true,
	});
	queries.emit(queries.latest("schedule:get"), null);
	queries.emit(queries.latest("uploads:list"), { page: [], isDone: true, continueCursor: "" });
	queries.emit(queries.latest("records:list"), {
		page: [{ _id: "new", invoiceNumber: "INV-NEW" }],
		isDone: false,
		continueCursor: "older",
	});
	await tick();
	return { queries, mutation, query };
}
it("pages on the server, resets the cursor on search, opens an exact older id, and exports through the final cursor", async () => {
	const { queries, query } = await setup();
	button("next").click();
	await tick();
	expect(queries.latest("records:list").args.paginationOpts?.cursor).toBe("older");
	const input = document.querySelector("input")!;
	input.value = "older";
	input.dispatchEvent(new Event("input", { bubbles: true }));
	await tick();
	expect(queries.latest("records:list").args.paginationOpts?.cursor).toBeNull();
	button("open older invoice").click();
	await vi.waitFor(() =>
		expect(document.querySelector('[aria-label="Opened record"]')?.textContent).toBe("INV-OLD"),
	);
	button("export matching records").click();
	await vi.waitFor(() =>
		expect(document.querySelector('[aria-label="Exported count"]')?.textContent).toBe("2"),
	);
	expect(query.mock.calls.filter(([name]) => name === "records:list")).toHaveLength(2);
});
it("routes notification retry and schedule activation through the authenticated mutation client", async () => {
	const { mutation } = await setup();
	button("retry owner notification").click();
	await tick();
	expect(mutation).toHaveBeenCalledWith("notice:retry", { inquiryId: "inquiry-1" });
	button("start draft schedule").click();
	await tick();
	expect(mutation).toHaveBeenCalledWith(
		"schedule:activate",
		expect.objectContaining({ invoiceId: "invoice-1", siteUrl: "example.test" }),
	);
});
it("verifies stored original size before idempotent recovery registration", async () => {
	const { queries, mutation } = await setup();
	const fetcher = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) =>
		String(url).endsWith("upload-session")
			? Response.json({ uploadSessionToken: "session", expiresAt: Date.now() + 600_000 })
			: Response.json({ sizeBytes: 123 }),
	);
	vi.stubGlobal("fetch", fetcher);
	// The storage port captures fetch at construction, so mount again with this inert transport.
	await unmount(component!);
	component = undefined;
	const state = await setup();
	state.queries.emit(state.queries.latest("uploads:list"), {
		page: [
			{
				_id: "upload-1",
				r2Key: "example.test/gallery-1/original/synthetic.jpg",
				filename: "synthetic.jpg",
				sizeBytes: 123,
				width: 10,
				height: 10,
				state: "pending",
			},
		],
		isDone: true,
		continueCursor: "",
	});
	await tick();
	button("recover stored file").click();
	await vi.waitFor(() =>
		expect(state.mutation).toHaveBeenCalledWith(
			"images:add",
			expect.objectContaining({
				r2Key: "example.test/gallery-1/original/synthetic.jpg",
				sizeBytes: 123,
				width: 10,
				height: 10,
			}),
		),
	);
	expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body)).expectedSizeBytes).toBe(123);
});

it("does not return a partial export when a later page fails", async () => {
	const { query } = await setup();
	query
		.mockImplementationOnce(() => ({
			page: [{ _id: "new", invoiceNumber: "Synthetic" }],
			isDone: false,
			continueCursor: "next",
		}))
		.mockImplementationOnce(() => {
			throw new Error("Unavailable");
		});
	button("export matching records").click();
	await vi.waitFor(() =>
		expect(document.querySelector('[aria-label="Exported count"]')?.textContent).toBe("failed"),
	);
	expect(document.body.textContent).toContain("Unavailable");
});

it("leaves the checkpoint recoverable instead of registering after leaving during processing",async()=>{
 let complete!: (response:Response)=>void;
 const processing=new Promise<Response>(resolve=>{complete=resolve;});
 const fetcher=vi.fn(async(url:RequestInfo|URL,_init?:RequestInit)=>String(url).endsWith("upload-session") ? Response.json({uploadSessionToken:"session",expiresAt:Date.now()+600_000}) : processing);
 vi.stubGlobal("fetch",fetcher);
 const state=await setup();
 state.queries.emit(state.queries.latest("uploads:list"),{page:[{_id:"upload-1",r2Key:"example.test/gallery-1/original/synthetic.jpg",filename:"synthetic.jpg",sizeBytes:123,width:10,height:10,state:"pending"}],isDone:true,continueCursor:""});await tick();
 button("recover stored file").click();await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
 await unmount(component!);component=undefined;complete(Response.json({sizeBytes:123}));await processing;await tick();
 expect(state.mutation.mock.calls.filter(([name])=>name==="images:add")).toHaveLength(0);
});
