import { makeFunctionReference } from "convex/server";
import {
	createStandardAdminAPI,
	type StandardAdminApiSource,
} from "../../src/lib/clientIntegration";
import type { AdminAPI, AdminConfig } from "../../src/lib/config";

type LegacyCRMKeys =
	| "getClient"
	| "createClient"
	| "updateClient"
	| "deleteClient"
	| "listClients"
	| "listClientsWithTags"
	| "getStats";
type RequiredKeys<Value> = {
	[Key in keyof Value]-?: {} extends Pick<Value, Key> ? never : Key;
}[keyof Value];
type Equal<Left, Right> =
	[Left] extends [Right] ? ([Right] extends [Left] ? true : false) : false;

declare const legacySource: StandardAdminApiSource;
const legacyBindings = createStandardAdminAPI(legacySource);
const legacyConfig: AdminConfig = {
	siteUrl: "example.test",
	siteName: "example",
	fromEmail: "admin@example.test",
	isCreator: false,
	api: legacyBindings,
};

// Existing standard CRM bindings keep their complete required shape.
const sourceKeys: Equal<keyof StandardAdminApiSource["crm"], LegacyCRMKeys> = true;
const requiredSourceKeys: Equal<RequiredKeys<StandardAdminApiSource["crm"]>, LegacyCRMKeys> = true;
const bindingKeys: Equal<keyof typeof legacyBindings.crm, LegacyCRMKeys> = true;
const requiredBindingKeys: Equal<RequiredKeys<typeof legacyBindings.crm>, LegacyCRMKeys> = true;
const requiredHostKeys: Equal<RequiredKeys<AdminAPI["crm"]>, Exclude<LegacyCRMKeys, "getClient">> = true;

// A host adds the deployed reference explicitly; the standard factory does not.
const optedInConfig: AdminConfig = {
	...legacyConfig,
	api: {
		...legacyBindings,
		crm: {
			...legacyBindings.crm,
			scanClientsWithTags: makeFunctionReference<"query">("crm:scanClientsWithTags"),
		},
	},
};

void [sourceKeys, requiredSourceKeys, bindingKeys, requiredBindingKeys, requiredHostKeys, optedInConfig];
