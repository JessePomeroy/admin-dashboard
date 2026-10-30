import { makeFunctionReference } from "convex/server";
export function getAdminConfig() {
	return { siteUrl: "example.test", isCreator: false, mutationTransport: "websocket", api: {
		inquiries: {
			listPaginated: makeFunctionReference<"query">("inquiries:listPaginated"),
			listForClient: makeFunctionReference<"query">("inquiries:listForClient"),
			getWorkflow: makeFunctionReference<"query">("inquiries:getWorkflow"),
			clientOptions: makeFunctionReference<"query">("inquiries:clientOptions"),
			linkClient: makeFunctionReference<"mutation">("inquiries:linkClient"),
			updateFollowUp: makeFunctionReference<"mutation">("inquiries:updateFollowUp"),
			updateStatus: makeFunctionReference<"mutation">("inquiries:updateStatus"),
		},
		galleryDelivery: {
			listProofs: makeFunctionReference<"query">("galleries:listProofs"),
			getProofImages: makeFunctionReference<"query">("galleries:getProofImages"),
			reopenProof: makeFunctionReference<"mutation">("galleries:reopenProof"),
		},
	} };
}
