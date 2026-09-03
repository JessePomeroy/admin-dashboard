import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("package exports", () => {
	it("keeps browser and server surfaces separate and type-checks a consumer", () => {
		execFileSync("corepack", ["pnpm", "build"], {
			cwd: process.cwd(),
			stdio: "pipe",
		});
		execFileSync("corepack", [
			"pnpm",
			"exec",
			"tsc",
			"--project",
			"tests/fixtures/tsconfig.packageServerConsumer.json",
		], {
			cwd: process.cwd(),
			stdio: "pipe",
		});

		const browserEntry = readFileSync("dist/index.js", "utf8");
		expect(browserEntry).not.toContain("./server/");

		const output = execFileSync(
			process.execPath,
			[
				"--input-type=module",
				"-e",
				[
					"import {",
					"createAdminAuthValidator,",
					"createAdminMutationHandler,",
					"createAdminTokenHandler,",
					"createCatalogPrivateEditorUploadCompleteHandler,",
					"createCatalogPrivateEditorUploadPrepareHandler,",
					"createCmsMediaDeleteHandler,",
					"createContractSendHandler,",
					"createGalleryDeleteHandler,",
					"createGalleryPresignHandler,",
					"createGalleryProcessHandler,",
					"createGalleryUploadHandler,",
					"createGalleryUploadSessionHandler,",
					"createInvoiceSendHandler,",
					"createPortalTokenHandler,",
					"createQuoteSendHandler,",
					"cookiesFromRequest,",
					"getAuthenticatedConvex,",
					"getConvex,",
					"getResend,",
					"getServerConfig,",
					"parseRequestCookieHeader,",
					"replaceTemplateVariables,",
					"resolveConvexFunction,",
					"sendEmail,",
					"setServerConfig,",
					"trimString,",
					"validateFilename",
					"} from '@jessepomeroy/admin/server';",
					"const exports = [",
					"createAdminAuthValidator,",
					"createAdminMutationHandler,",
					"createAdminTokenHandler,",
					"createCatalogPrivateEditorUploadCompleteHandler,",
					"createCatalogPrivateEditorUploadPrepareHandler,",
					"createCmsMediaDeleteHandler,",
					"createContractSendHandler,",
					"createGalleryDeleteHandler,",
					"createGalleryPresignHandler,",
					"createGalleryProcessHandler,",
					"createGalleryUploadHandler,",
					"createGalleryUploadSessionHandler,",
					"createInvoiceSendHandler,",
					"createPortalTokenHandler,",
					"createQuoteSendHandler,",
					"cookiesFromRequest,",
					"getAuthenticatedConvex,",
					"getConvex,",
					"getResend,",
					"getServerConfig,",
					"parseRequestCookieHeader,",
					"replaceTemplateVariables,",
					"resolveConvexFunction,",
					"sendEmail,",
					"setServerConfig,",
					"trimString,",
					"validateFilename",
					"];",
					"process.stdout.write(exports.map((value) => typeof value).join(','));",
				].join(" "),
			],
			{
				cwd: process.cwd(),
				encoding: "utf8",
			},
		);

		expect(output).toBe(new Array(27).fill("function").join(","));
	}, 60_000);
});
