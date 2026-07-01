import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("package server subpath Node import", () => {
	it("loads cookie helpers from the packaged ESM server subpath", () => {
		execFileSync("pnpm", ["build"], {
			cwd: process.cwd(),
			stdio: "pipe",
		});

		const output = execFileSync(
			process.execPath,
			[
				"--input-type=module",
				"-e",
				"import { cookiesFromRequest } from '@jessepomeroy/admin/server'; process.stdout.write(typeof cookiesFromRequest);",
			],
			{
				cwd: process.cwd(),
				encoding: "utf8",
			},
		);

		expect(output).toBe("function");
	}, 30_000);
});
