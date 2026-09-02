const refs = {
	listForEditor: { name: "posts:listForEditor" },
	createDraft: { name: "posts:createDraft" },
};

export function getAdminConfig() {
	return {
		siteUrl: "https://angelsrest.online",
		siteName: "angel's rest",
		fromEmail: "studio@angelsrest.online",
		isCreator: true,
		api: { postContent: refs },
		editor: { blog: { baseHref: "/admin/editor/blog" } },
	};
}
