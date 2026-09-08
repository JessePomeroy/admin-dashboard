import { makeFunctionReference } from "convex/server";
import type { AdminAPI, AdminConfig } from "../../../src/lib/config";

type BlogFixtureConfig = Pick<AdminConfig, "siteUrl" | "siteName" | "fromEmail" | "isCreator" | "editor">
	& { api: Pick<AdminAPI, "blogContent" | "postContent" | "mediaAssets"> };

export const blogFixtureConfig: BlogFixtureConfig = {
	siteUrl: "example.test",
	siteName: "blog fixture",
	fromEmail: "test@example.test",
	isCreator: true,
	api: {
		blogContent: {
			listForEditor: makeFunctionReference<"query">("blog:list"),
			getEditorState: makeFunctionReference<"query">("blog:state"),
			createDraft: makeFunctionReference<"mutation">("blog:create"),
			saveDraft: makeFunctionReference<"mutation">("blog:save"),
			publish: makeFunctionReference<"mutation">("blog:publish"),
			discardDraft: makeFunctionReference<"mutation">("blog:discard"),
			unpublish: makeFunctionReference<"mutation">("blog:unpublish"),
			archive: makeFunctionReference<"mutation">("blog:archive"),
			restore: makeFunctionReference<"mutation">("blog:restore"),
		},
		postContent: {
			listForEditor: makeFunctionReference<"query">("post:list"),
			getEditorState: makeFunctionReference<"query">("post:state"),
			createDraft: makeFunctionReference<"mutation">("post:create"),
			saveDraft: makeFunctionReference<"mutation">("post:save"),
			publish: makeFunctionReference<"mutation">("post:publish"),
			discardDraft: makeFunctionReference<"mutation">("post:discard"),
			unpublish: makeFunctionReference<"mutation">("post:unpublish"),
			archive: makeFunctionReference<"mutation">("post:archive"),
			restore: makeFunctionReference<"mutation">("post:restore"),
		},
		mediaAssets: {
			listForEditor: makeFunctionReference<"query">("media:list"),
			getManyForEditor: makeFunctionReference<"query">("media:placed"),
		},
	},
	editor: { blog: { mediaBaseUrl: "https://media.example.test" } },
};

export function getAdminConfig() { return blogFixtureConfig; }
