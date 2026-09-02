const ref = (name: string) => ({ name });

export const refs = {
	blogList: ref("blog:listForEditor"),
	blogState: ref("blog:getEditorState"),
	blogCreate: ref("blog:createDraft"),
	postList: ref("post:listForEditor"),
	postState: ref("post:getEditorState"),
	postCreate: ref("post:createDraft"),
	postSave: ref("post:saveDraft"),
	postPublish: ref("post:publish"),
	postUnpublish: ref("post:unpublish"),
	postDiscard: ref("post:discardDraft"),
	postArchive: ref("post:archive"),
	postRestore: ref("post:restore"),
};

export function getAdminConfig() {
	return {
		siteUrl: "https://site.example",
		siteName: "Angels Rest",
		fromEmail: "studio@example.com",
		isCreator: true,
		api: {
			blogContent: {
				listForEditor: refs.blogList,
				getEditorState: refs.blogState,
				createDraft: refs.blogCreate,
			},
			postContent: {
				listForEditor: refs.postList,
				getEditorState: refs.postState,
				createDraft: refs.postCreate,
				saveDraft: refs.postSave,
				publish: refs.postPublish,
				unpublish: refs.postUnpublish,
				discardDraft: refs.postDiscard,
				archive: refs.postArchive,
				restore: refs.postRestore,
			},
		},
		editor: { blog: { baseHref: "/admin/editor/blog" } },
	};
}
