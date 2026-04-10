import type { ClientStatus } from "./types";

export const CLIENT_STATUSES: readonly ClientStatus[] = [
	"lead",
	"booked",
	"in-progress",
	"completed",
	"archived",
];
