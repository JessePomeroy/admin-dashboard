import type { GenericId } from "convex/values";

// Base document fields (every Convex document has these)
interface ConvexDocument<TableName extends string> {
	_id: GenericId<TableName>;
	_creationTime: number;
}

// Client types
export interface Client extends ConvexDocument<"photographyClients"> {
	siteUrl: string;
	name: string;
	email?: string;
	phone?: string;
	category: ClientCategory;
	type?: string;
	status: ClientStatus;
	source?: string;
	notes?: string;
	siteUrl_client?: string;
	boardColumnId?: string;
	boardPosition?: number;
}
export type ClientId = GenericId<"photographyClients">;
export type ClientCategory = "photography" | "web";
export type ClientStatus =
	| "lead"
	| "booked"
	| "in-progress"
	| "completed"
	| "archived";

// Invoice types
export interface Invoice extends ConvexDocument<"invoices"> {
	siteUrl: string;
	invoiceNumber: string;
	clientId: GenericId<"photographyClients">;
	clientName?: string;
	clientEmail?: string;
	invoiceType: InvoiceType;
	status: InvoiceStatus;
	items: InvoiceItem[];
	taxPercent?: number;
	notes?: string;
	dueDate?: string;
	sentAt?: number;
	paidAt?: number;
	recurring?: {
		interval: "weekly" | "monthly" | "quarterly" | "yearly";
		nextDueDate?: string;
		endDate?: string;
	};
	depositPercent?: number;
	totalProject?: number;
	paidAmount?: number;
	milestoneName?: string;
	milestoneIndex?: number;
	parentInvoiceId?: GenericId<"invoices">;
}
export type InvoiceId = GenericId<"invoices">;
export type InvoiceType =
	| "one-time"
	| "recurring"
	| "deposit"
	| "package"
	| "milestone";
export type InvoiceStatus =
	| "draft"
	| "sent"
	| "paid"
	| "partial"
	| "overdue"
	| "canceled";
export type InvoiceItem = {
	description: string;
	quantity: number;
	unitPrice: number;
};

// Quote types
export interface Quote extends ConvexDocument<"quotes"> {
	siteUrl: string;
	quoteNumber: string;
	clientId: GenericId<"photographyClients">;
	clientName?: string;
	clientEmail?: string;
	category?: ClientCategory;
	status: QuoteStatus;
	packages: QuotePackage[];
	validUntil?: string;
	notes?: string;
	sentAt?: number;
	acceptedAt?: number;
	convertedToInvoice?: GenericId<"invoices">;
}
export type QuoteId = GenericId<"quotes">;
export type QuoteStatus =
	| "draft"
	| "sent"
	| "accepted"
	| "declined"
	| "expired";
export type QuotePackage = {
	name: string;
	description?: string;
	price: number;
	included?: string[];
};

export interface QuotePreset extends ConvexDocument<"quotePresets"> {
	siteUrl: string;
	name: string;
	category?: ClientCategory;
	packages: QuotePackage[];
}

// Contract types
export interface Contract extends ConvexDocument<"contracts"> {
	siteUrl: string;
	title: string;
	clientId: GenericId<"photographyClients">;
	clientName?: string;
	clientEmail?: string;
	category?: ClientCategory;
	templateId?: GenericId<"contractTemplates">;
	status: ContractStatus;
	body: string;
	eventDate?: string;
	eventLocation?: string;
	totalPrice?: number;
	depositAmount?: number;
	sentAt?: number;
	signedAt?: number;
	signedByName?: string;
	signedByEmail?: string;
	signatureData?: string;
	signedIp?: string;
}
export type ContractId = GenericId<"contracts">;
export type ContractStatus = "draft" | "sent" | "signed" | "expired";

export interface ContractTemplate extends ConvexDocument<"contractTemplates"> {
	siteUrl: string;
	name: string;
	body: string;
	variables?: string[];
}

// Email template types
export interface EmailTemplate extends ConvexDocument<"emailTemplates"> {
	siteUrl: string;
	name: string;
	category: EmailCategory;
	subject: string;
	body: string;
	variables?: string[];
}
export type EmailCategory =
	| "inquiry-reply"
	| "booking-confirmation"
	| "reminder"
	| "gallery-delivery"
	| "follow-up"
	| "thank-you"
	| "custom";

// Order types
export interface Order extends ConvexDocument<"orders"> {
	siteUrl: string;
	orderNumber: string;
	stripeSessionId: string;
	stripePaymentIntentId?: string;
	customerEmail: string;
	customerName?: string;
	shippingAddress?: {
		line1: string;
		line2?: string;
		city: string;
		state: string;
		postalCode: string;
		country: string;
	};
	items: { productName: string; quantity: number; price: number }[];
	subtotal?: number;
	total: number;
	stripeFees?: number;
	couponCode?: string;
	discountAmount?: number;
	fulfillmentType: "lumaprints" | "self" | "digital";
	lumaprintsOrderNumber?: string;
	paperName?: string;
	paperSubcategoryId?: string;
	trackingNumber?: string;
	trackingUrl?: string;
	status: OrderStatus;
	notes?: string;
}
export type OrderId = GenericId<"orders">;
export type OrderStatus =
	| "new"
	| "printing"
	| "ready"
	| "shipped"
	| "delivered"
	| "refunded";

// Platform types
export interface PlatformClient extends ConvexDocument<"platformClients"> {
	name: string;
	email: string;
	siteUrl: string;
	sanityProjectId?: string;
	tier: "basic" | "full";
	subscriptionStatus: "active" | "canceled" | "past_due" | "none";
	stripeCustomerId?: string;
	stripeSubscriptionId?: string;
	adminEmails: string[];
	notes?: string;
}

export interface PlatformMessage extends ConvexDocument<"platformMessages"> {
	siteUrl: string;
	sender: "client" | "creator";
	content: string;
	read: boolean;
}

// CRM enhancement types
export interface ClientTag extends ConvexDocument<"clientTags"> {
	siteUrl: string;
	name: string;
	color?: string;
}

export interface TagAssignment extends ConvexDocument<"clientTagAssignments"> {
	siteUrl: string;
	clientId: GenericId<"photographyClients">;
	tagId: GenericId<"clientTags">;
}

export interface ActivityLogEntry extends ConvexDocument<"activityLog"> {
	siteUrl: string;
	clientId: GenericId<"photographyClients">;
	action: string;
	description: string;
	metadata?: string;
}

// Board types
export interface BoardConfig extends ConvexDocument<"boardConfigs"> {
	siteUrl: string;
	projectType: string;
	columns: { id: string; name: string; position: number }[];
}

// Inquiry types
export interface Inquiry extends ConvexDocument<"inquiries"> {
	siteUrl: string;
	name: string;
	email: string;
	phone?: string;
	subject?: string;
	message: string;
	status: InquiryStatus;
}
export type InquiryStatus = "new" | "read" | "replied";

// Portal types
export interface PortalToken extends ConvexDocument<"portalTokens"> {
	token: string;
	siteUrl: string;
	type: "invoice" | "quote" | "contract";
	documentId: string;
	clientId: GenericId<"photographyClients">;
	expiresAt?: number;
	used: boolean;
}
