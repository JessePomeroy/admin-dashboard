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

// Email template types — loose UI-facing shape used by send modals and EmailPreview.
// The Convex document has additional fields (siteUrl, _creationTime, branded _id)
// but consumers only need this subset.
export interface EmailTemplate {
	_id: string;
	name: string;
	category: string;
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

/**
 * UI-facing inquiry shape. Unlike the Convex `Inquiry` above, this represents
 * the data as it flows from the page `load` function into the inquiries page
 * components — typically sourced from a Sanity-backed feed where string fields
 * may be null, and the timestamp comes through as `submittedAt: string` rather
 * than `_creationTime: number`. Keep in sync with InquiryTable/Modal props.
 */
export interface InquiryUI {
	_id: string;
	name: string | null;
	email: string | null;
	phone?: string;
	subject: string | null;
	message: string | null;
	status: InquiryStatus;
	submittedAt: string;
}

// Portal types
export interface PortalToken extends ConvexDocument<"portalTokens"> {
	token: string;
	siteUrl: string;
	type: "invoice" | "quote" | "contract" | "gallery";
	documentId: string;
	clientId: GenericId<"photographyClients">;
	expiresAt?: number;
	used: boolean;
}

// Gallery delivery types
export interface Gallery extends ConvexDocument<"galleries"> {
	siteUrl: string;
	clientId: GenericId<"photographyClients">;
	name: string;
	slug: string;
	status: GalleryStatus;
	coverImageKey?: string;
	imageCount: number;
	totalSizeBytes: number;
	passwordProtected: boolean;
	expiresAt?: number;
	downloadEnabled: boolean;
	favoritesEnabled: boolean;
}
export type GalleryId = GenericId<"galleries">;
export type GalleryStatus = "draft" | "uploading" | "published" | "archived";

export interface GalleryImage extends ConvexDocument<"galleryImages"> {
	siteUrl: string;
	galleryId: GenericId<"galleries">;
	r2Key: string;
	filename: string;
	sizeBytes: number;
	width: number;
	height: number;
	order: number;
	isFavorite: boolean;
	downloadCount: number;
}
export type GalleryImageId = GenericId<"galleryImages">;

export interface GalleryDownload extends ConvexDocument<"galleryDownloads"> {
	siteUrl: string;
	galleryId: GenericId<"galleries">;
	imageId?: GenericId<"galleryImages">;
	downloadedAt: number;
	ipHash: string;
	type: "single" | "zip" | "favorites";
}
