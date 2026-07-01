import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("package server subpath Node import", () => {
	it("loads server helpers from the packaged ESM server subpath", () => {
		execFileSync("pnpm", ["build"], {
			cwd: process.cwd(),
			stdio: "pipe",
		});

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

		expect(output).toBe(new Array(24).fill("function").join(","));
	}, 30_000);
});
