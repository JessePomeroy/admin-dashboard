import { makeFunctionReference } from "convex/server";
import type { AdminAPI, AdminConfig } from "../../../src/lib/config";
export const config: Pick<AdminConfig, "siteUrl" | "galleryWorkerUrl"> & {
	api: Pick<
		AdminAPI,
		| "businessRecords"
		| "invoices"
		| "inquiryNotifications"
		| "recurringInvoices"
		| "deliveryUploads"
		| "galleryDelivery"
	>;
} = {
	siteUrl: "example.test",
	galleryWorkerUrl: "https://worker.example",
	api: {
		businessRecords: {
			list: makeFunctionReference("records:list"),
			get: makeFunctionReference("records:get"),
		},
		invoices: {
			create: "",
			update: "",
			remove: "",
			get: "",
			list: makeFunctionReference("invoices:list"),
			markSent: "",
			markPaid: "",
			getNextNumber: "",
		},
		inquiryNotifications: {
			status: makeFunctionReference("notice:status"),
			retry: makeFunctionReference("notice:retry"),
		},
		recurringInvoices: {
			get: makeFunctionReference("schedule:get"),
			activate: makeFunctionReference("schedule:activate"),
			changeState: makeFunctionReference("schedule:change"),
		},
		deliveryUploads: {
			begin: makeFunctionReference("uploads:begin"),
			list: makeFunctionReference("uploads:list"),
			markDeleting: makeFunctionReference("uploads:deleting"),
			finishDelete: makeFunctionReference("uploads:deleted"),
		},
		galleryDelivery: {
			create: "",
			get: "",
			update: "",
			remove: "",
			setPassword: "",
			addImage: makeFunctionReference("images:add"),
			removeImage: makeFunctionReference("images:remove"),
			reorderImages: "",
			getImages: "",
			listBySite: "",
		},
	},
};
export function getAdminConfig() {
	return config;
}
