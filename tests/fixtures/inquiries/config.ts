import { makeFunctionReference } from "convex/server";
import type { AdminAPI, AdminConfig } from "../../../src/lib/config";

export const inquiryFixtureConfig: Pick<AdminConfig, "siteUrl"> & { api: Pick<AdminAPI, "inquiries"> } = {
	siteUrl: "example.test",
	api: { inquiries: {
		listPaginated: makeFunctionReference<"query">("inquiries:listPaginated"),
		updateStatus: makeFunctionReference<"mutation">("inquiries:updateStatus"),
		remove: makeFunctionReference<"mutation">("inquiries:remove"),
	} },
};

export function getAdminConfig() { return inquiryFixtureConfig; }
