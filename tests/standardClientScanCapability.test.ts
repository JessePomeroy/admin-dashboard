import { execFileSync } from "node:child_process";
import { anyApi, makeFunctionReference } from "convex/server";
import { describe, expect, it } from "vitest";
import {
	createStandardAdminAPI,
	type StandardAdminApiSource,
} from "../src/lib/clientIntegration";
import type { AdminAPI } from "../src/lib/config";

function legacySource() {
	// Convex's dynamic API supplies opaque refs without duplicating the full binding table.
	return {
		activityLog: anyApi.activityLog,
		adminAuth: anyApi.adminAuth,
		catalogPrivateAssets: anyApi.catalogPrivateAssets,
		catalogProductGraphs: anyApi.catalogProductGraphs,
		content: anyApi.content,
		contentExport: anyApi.contentExport,
		contracts: anyApi.contracts,
		crm: {
			getClient: makeFunctionReference<"query">("crm:getClient"),
			createClient: makeFunctionReference<"mutation">("crm:createClient"),
			updateClient: makeFunctionReference<"mutation">("crm:updateClient"),
			deleteClient: makeFunctionReference<"mutation">("crm:deleteClient"),
			listClients: makeFunctionReference<"query">("crm:listClients"),
			listClientsWithTags: makeFunctionReference<"query">("crm:listClientsWithTags"),
			getStats: makeFunctionReference<"query">("crm:getStats"),
		},
		emailLog: anyApi.emailLog,
		emailTemplates: anyApi.emailTemplates,
		galleries: anyApi.galleries,
		galleryPassword: anyApi.galleryPassword,
		inquiries: anyApi.inquiries,
		invoices: anyApi.invoices,
		kanban: anyApi.kanban,
		mediaAssets: anyApi.mediaAssets,
		messages: anyApi.messages,
		notifications: anyApi.notifications,
		orders: anyApi.orders,
		platform: anyApi.platform,
		portal: anyApi.portal,
		portfolioGalleries: anyApi.portfolioGalleries,
		quotes: anyApi.quotes,
		tags: anyApi.tags,
	} satisfies StandardAdminApiSource;
}

describe("optional CRM client scan capability", () => {
	it("type-checks legacy hosts and explicit scan opt-in without relaxing existing bindings", () => {
		execFileSync(process.execPath, [
			"node_modules/typescript/bin/tsc",
			"--noEmit",
			"--strict",
			"--skipLibCheck",
			"--target", "ESNext",
			"--module", "ESNext",
			"--moduleResolution", "bundler",
			"tests/fixtures/standardClientScanConsumer.ts",
		], { cwd: process.cwd(), stdio: "pipe" });
	});

	it("preserves legacy output and requires host opt-in even when generated API exports the scan", () => {
		const source = legacySource();
		const legacy = createStandardAdminAPI(source);
		expect(legacy.crm).toEqual(source.crm);
		expect(Object.hasOwn(legacy.crm, "scanClientsWithTags")).toBe(false);

		const scanClientsWithTags = makeFunctionReference<"query">("crm:scanClientsWithTags");
		const generatedSource = { ...source, crm: { ...source.crm, scanClientsWithTags } };
		const standard = createStandardAdminAPI(generatedSource);
		expect(standard.crm).toEqual(legacy.crm);
		expect(Object.hasOwn(standard.crm, "scanClientsWithTags")).toBe(false);

		const optedIn: AdminAPI = {
			...standard,
			crm: { ...standard.crm, scanClientsWithTags },
		};
		expect(optedIn.crm.scanClientsWithTags).toBe(scanClientsWithTags);
	});
});
