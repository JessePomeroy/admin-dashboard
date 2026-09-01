import { describe, expect, it } from "vitest";
import { formatDate } from "../src/lib/utils";

describe("formatDate", () => {
	it("keeps a calendar-only date on the authored day in western time zones", () => {
		const original = process.env.TZ;
		process.env.TZ = "America/Detroit";
		try {
			expect(formatDate("2026-10-01")).toBe("Oct 1, 2026");
		} finally {
			if (original === undefined) delete process.env.TZ;
			else process.env.TZ = original;
		}
	});
});
