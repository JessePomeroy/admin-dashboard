// @vitest-environment jsdom
import { mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import ConversationView from "../src/lib/pages/messages/ConversationView.svelte";
import ThreadList from "../src/lib/pages/messages/ThreadList.svelte";

const thread = {
	client: {
		_id: "client-1",
		name: "Test client",
		siteUrl: "client.example",
	},
	unreadCount: 500,
	unreadCountIsTruncated: true,
	latestMessage: {
		_id: "message-2",
		siteUrl: "client.example",
		sender: "client" as const,
		content: "latest",
		read: true,
		_creationTime: 2,
	},
};

describe("message pagination controls", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("loads another page of conversations on demand", () => {
		const onloadmore = vi.fn();
		const component = mount(ThreadList, {
			target: document.body,
			props: {
				threads: [thread],
				selectedClientId: null,
				mobileHidden: false,
				onselect: vi.fn(),
				canLoadMore: true,
				loadingMore: false,
				onloadmore,
			},
		});

		const button = document.querySelector<HTMLButtonElement>(".load-more");
		expect(button?.textContent).toContain("load more conversations");
		expect(document.querySelector(".unread-badge")?.textContent).toBe("500+");
		expect(document.querySelector(".unread-badge")?.getAttribute("aria-label")).toBe(
			"500 or more unread messages",
		);
		button?.click();
		expect(onloadmore).toHaveBeenCalledOnce();

		unmount(component);
	});

	it("loads earlier messages without replacing the rendered conversation", () => {
		const onloadearlier = vi.fn();
		const component = mount(ConversationView, {
			target: document.body,
			props: {
				thread,
				messages: [
					{
						_id: "message-1",
						siteUrl: "client.example",
						sender: "creator",
						content: "older loaded message",
						read: true,
						_creationTime: 1,
					},
					thread.latestMessage,
				],
				loading: false,
				canLoadEarlier: true,
				loadingEarlier: false,
				sending: false,
				mobileHidden: false,
				oninput: vi.fn(),
				onsend: vi.fn(),
				onback: vi.fn(),
				onloadearlier,
				inputValue: "",
			},
		});

		const button = document.querySelector<HTMLButtonElement>(".load-earlier");
		expect(document.body.textContent).toContain("older loaded message");
		expect(document.body.textContent).toContain("latest");
		button?.click();
		expect(onloadearlier).toHaveBeenCalledOnce();

		unmount(component);
	});
});
