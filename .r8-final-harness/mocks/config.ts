const ref = (name: string) => ({ name });

export function getAdminConfig() {
	return {
		siteUrl: "angelsrest.online",
		siteName: "angel's rest",
		isCreator: true,
		api: {
			siteEditor: { get: ref("site:get") },
			portfolioEditor: { listForEditor: ref("portfolio:list") },
			blogContent: { list: ref("blog:list") },
			postContent: { list: ref("post:list") },
			catalogProductGraphs: { listForEditor: ref("catalog:list") },
		},
		editor: {
			siteSettings: {},
			homepageQuote: {},
			contactPage: {},
			aboutPage: {},
			portfolio: { mediaBaseUrl: "https://example.invalid", uploadEndpoint: "/upload" },
			blog: {},
			products: {
				enabledKinds: ["print", "print_set", "postcard", "merchandise", "tapestry", "digital_download"],
				mediaBaseUrl: "https://example.invalid",
				uploadEndpoint: "/upload",
			},
		},
	};
}
