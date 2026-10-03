import type { Client } from "../../types";

export type ClientCreatePayload = Pick<Client,
	"name" | "category" | "email" | "phone" | "type" | "source" | "notes" | "siteUrl_client"
>;

export type ClientEditPayload = ClientCreatePayload & Pick<Client, "status">;
