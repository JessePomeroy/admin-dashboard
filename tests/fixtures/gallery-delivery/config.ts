import { makeFunctionReference } from "convex/server";
import type { AdminAPI } from "../../../src/lib/config";

const galleryDelivery = {
	listBySite: makeFunctionReference<"query">("galleries:listBySite"),
	listBySitePaginated: makeFunctionReference<"query">("galleries:listBySitePaginated"),
	get: makeFunctionReference<"query">("galleries:get"),
	getImages: makeFunctionReference<"query">("galleries:getImages"),
	create: makeFunctionReference<"mutation">("galleries:create"),
	setPassword: makeFunctionReference<"action">("galleryPassword:setPassword"),
	update: makeFunctionReference<"mutation">("galleries:update"),
	remove: makeFunctionReference<"mutation">("galleries:remove"),
	addImage: makeFunctionReference<"mutation">("galleries:addImage"),
	removeImage: makeFunctionReference<"mutation">("galleries:removeImage"),
	reorderImages: makeFunctionReference<"mutation">("galleries:reorderImages"),
} satisfies NonNullable<AdminAPI["galleryDelivery"]>;

export const galleryDeliveryFixtureConfig = {
	siteUrl: "example.test", siteName: "Fictional studio", fromEmail: "owner@example.invalid",
	galleryWorkerUrl: "https://worker.example", api: { galleryDelivery },
};
