import { createRawSnippet, mount } from "svelte";
import AdminLayout from "../../../src/lib/components/AdminLayout.svelte";
import { requests } from "./config";

const children = createRawSnippet(() => ({ render: () => `
	<section class="admin-page">
		<header class="page-header"><h1>dashboard</h1></header>
		<p>Local account-controls preview using a synthetic account.</p>
		<p>Google requests are simulated here; this preview cannot link an account.</p>
		<nav aria-label="Preview states" style="display:flex;flex-wrap:wrap;gap:24px;margin-top:28px">
			<a href="?state=unlinked">not connected</a>
			<a href="?state=linked">already connected</a>
			<a href="?state=read-error">connection-check error</a>
		</nav>
	</section>` }));
const target = document.getElementById("app");
if (!target) throw new Error("Missing preview target");
mount(AdminLayout, {
	target,
	props: { children, data: { adminSession: { status: "authorized", email: "owner@example.test", tier: "full", isCreator: false } } },
});
Object.assign(window, { googleLinkFixture: { requests } });
