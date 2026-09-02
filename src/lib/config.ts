import { getContext, setContext } from "svelte";
import type {
	CatalogProductMarginCalculator,
	CatalogProductVariantOptionResolver,
} from "./catalogProductEditor";

/**
 * Convex FunctionReference placeholder. Convex's `FunctionReference` type is
 * heavily generic (`FunctionReference<"query", "public", { ... }, { ... }>`),
 * making it impractical to type each field precisely. At runtime, these are
 * opaque references resolved by the Convex client — the package never calls
 * them directly, only passes them through to `useQuery()` or
 * `convex.mutation()`.
 *
 * Consumers pass their generated `api` object (which IS properly typed in
 * their project) so type safety is enforced at the consumer boundary, not here.
 */
// biome-ignore lint/suspicious/noExplicitAny: see above
type FnRef = any;

/**
 * Minimal nanostore atom shape. Better Auth's `useSession()` returns an atom
 * with a `.subscribe()` method, but we don't want to depend on the nanostores
 * package directly. This captures just what the admin package needs.
 */
export interface NanostoreAtom<T> {
	subscribe(cb: (value: T) => void): () => void;
}

export interface AdminAPI {
	activityLog: {
		getClientActivity: FnRef;
	};
	adminAuth?: {
		checkAdminAccess: FnRef;
	};
	contracts: {
		create: FnRef;
		update: FnRef;
		remove: FnRef;
		get: FnRef;
		list: FnRef;
		markSent: FnRef;
		markSigned: FnRef;
		listTemplates: FnRef;
		createTemplate: FnRef;
		updateTemplate: FnRef;
		removeTemplate: FnRef;
	};
	siteEditor?: {
		getSiteSettingsEditorState: FnRef;
		saveSiteSettingsDraft: FnRef;
		/** Optional while a host stages private settings before connecting a public provider. */
		publishSiteSettings?: FnRef;
		discardSiteSettingsDraft: FnRef;
		getHomepageQuoteEditorState: FnRef;
		saveHomepageQuoteDraft: FnRef;
		publishHomepageQuote: FnRef;
		discardHomepageQuoteDraft: FnRef;
		getContactPageEditorState: FnRef;
		saveContactPageDraft: FnRef;
		/** Optional while a host stages private Contact drafts before connecting a public provider. */
		publishContactPage?: FnRef;
		discardContactPageDraft: FnRef;
		getAboutPageEditorState?: FnRef;
		saveAboutPageDraft?: FnRef;
		publishAboutPage?: FnRef;
		discardAboutPageDraft?: FnRef;
		getModelingPageEditorState?: FnRef;
		saveModelingPageDraft?: FnRef;
		publishModelingPage?: FnRef;
		discardModelingPageDraft?: FnRef;
		listMediaAssets?: FnRef;
		getPlacedMediaAssets?: FnRef;
	};
	portfolioEditor?: {
		listForEditor: FnRef;
		getEditorState: FnRef;
		saveDraft: FnRef;
		/** Optional while a host stages private drafts before connecting a public provider. */
		publish?: FnRef;
		/** Reversibly include or exclude a published gallery from public reads. */
		setVisibility?: FnRef;
		/** Permanently remove a gallery and its revisions while preserving shared media. */
		remove?: FnRef;
		reorder: FnRef;
		listMediaAssets: FnRef;
		getPlacedMediaAssets: FnRef;
		registerReadyWebAsset: FnRef;
		/** Optional until a host mounts the permanent CMS media deletion route. */
		requestDeletion?: FnRef;
	};
	blogContent?: {
		listForEditor: FnRef;
		getEditorState: FnRef;
		createDraft: FnRef;
		saveDraft: FnRef;
		publish: FnRef;
		discardDraft: FnRef;
		unpublish: FnRef;
		archive: FnRef;
		restore: FnRef;
	};
	postContent?: {
		listForEditor: FnRef;
		getEditorState: FnRef;
		createDraft: FnRef;
		saveDraft: FnRef;
		publish: FnRef;
		discardDraft: FnRef;
		unpublish: FnRef;
		archive: FnRef;
		restore: FnRef;
	};
	/** Private catalog draft operations. Public catalog reads and V1 publication stay host-owned. */
	catalogProducts?: {
		listForEditor: FnRef;
		getEditorState: FnRef;
		createDraft: FnRef;
		saveDraft: FnRef;
		discardDraft: FnRef;
	};
	/** Private V2 catalog graph operations for multi-kind product read-back and staged editing. */
	catalogProductGraphs?: {
		listForEditor: FnRef;
		getEditorState: FnRef;
		createDraft: FnRef;
		saveDraft: FnRef;
		discardDraft: FnRef;
		/** Optional verified private-asset selection capability; both refs are required. */
		listDraftPrivateAssetCandidates?: FnRef;
		replaceDraftPrivateAsset?: FnRef;
		/** Optional per-product Convex CMS publication capability; both refs are required. */
		publishDraft?: FnRef;
		unpublish?: FnRef;
	};
	/** Tenant-scoped CMS media reads shared by editor modules. */
	mediaAssets?: {
		listForEditor?: FnRef;
		getManyForEditor: FnRef;
		registerReadyWebAsset?: FnRef;
	};
	crm: {
		createClient: FnRef;
		updateClient: FnRef;
		deleteClient: FnRef;
		listClients: FnRef;
		getStats: FnRef;
	};
	emailLog: {
		create: FnRef;
	};
	/** Durable, tenant-scoped delivery journal for invoice, quote, and contract emails. */
	documentEmailAttempts?: {
		get: FnRef;
		getRecovery: FnRef;
		getOpenRecoveryByDocument: FnRef;
		prepare: FnRef;
		claim: FnRef;
		complete: FnRef;
		fail: FnRef;
		resolve: FnRef;
	};
	emailTemplates: {
		create: FnRef;
		update: FnRef;
		remove: FnRef;
		get: FnRef;
		getByCategory: FnRef;
		list: FnRef;
	};
	galleryDelivery?: {
		create: FnRef;
		setPassword: FnRef;
		update: FnRef;
		remove: FnRef;
		get: FnRef;
		addImage: FnRef;
		removeImage: FnRef;
		reorderImages: FnRef;
		getImages: FnRef;
		listImageStorageKeys?: FnRef;
		listBySite: FnRef;
	};
	inquiries: {
		updateStatus: FnRef;
	};
	invoices: {
		create: FnRef;
		update: FnRef;
		remove: FnRef;
		get: FnRef;
		list: FnRef;
		markSent: FnRef;
		markPaid: FnRef;
		getNextNumber: FnRef;
	};
	kanban: {
		initializeBoard: FnRef;
		moveCard: FnRef;
		addColumn: FnRef;
		renameColumn: FnRef;
		deleteColumn: FnRef;
		listBoardConfigs: FnRef;
	};
	messages: {
		send: FnRef;
		markRead: FnRef;
		list: FnRef;
		listPaginated: FnRef;
		allThreads: FnRef;
		allThreadsPaginated: FnRef;
	};
	notifications?: {
		getUnreadFlags: FnRef;
		markSeen: FnRef;
	};
	orders: {
		list: FnRef;
		updateStatus: FnRef;
		getStats: FnRef;
	};
	platform: {
		createClient: FnRef;
		updateClient: FnRef;
		updateSubscription: FnRef;
		listAll: FnRef;
	};
	portal: {
		createToken: FnRef;
	};
	quotes: {
		create: FnRef;
		update: FnRef;
		remove: FnRef;
		get: FnRef;
		list: FnRef;
		markSent: FnRef;
		markAccepted: FnRef;
		markDeclined: FnRef;
		convertToInvoice: FnRef;
		getNextNumber: FnRef;
		listPresets: FnRef;
		createPreset: FnRef;
		updatePreset: FnRef;
		removePreset: FnRef;
	};
	tags: {
		createTag: FnRef;
		deleteTag: FnRef;
		assignTag: FnRef;
		removeTag: FnRef;
		listTags: FnRef;
		getClientTags: FnRef;
	};
}

export interface SiteSettingsSocialLink {
	platform: string;
	url: string;
}

export interface SiteSettingsDraftPayload {
	artistName?: string;
	siteTitle?: string;
	tagline?: string;
	socialLinks?: SiteSettingsSocialLink[];
	seoDescription?: string;
}

export interface SiteSettingsRevisionState {
	revisionId: string;
	schemaVersion: 1;
	payload: SiteSettingsDraftPayload;
	source: "admin" | "sanityImport" | "restore";
	createdAt: number;
}

export interface SiteSettingsEditorState {
	documentId: string;
	draft: SiteSettingsRevisionState | null;
	published: SiteSettingsRevisionState | null;
	updatedAt: number;
	publishedAt: number | null;
}

export interface HomepageQuoteDraftPayload {
	text?: string;
	attribution?: string;
}

export interface HomepageQuoteRevisionState {
	revisionId: string;
	schemaVersion: 1;
	payload: HomepageQuoteDraftPayload;
	source: "admin" | "sanityImport" | "restore";
	createdAt: number;
}

export interface HomepageQuoteEditorState {
	documentId: string;
	draft: HomepageQuoteRevisionState | null;
	published: HomepageQuoteRevisionState | null;
	updatedAt: number;
	publishedAt: number | null;
}

export interface ContactPageDraftPayload {
	heading?: string;
	intro?: string;
	email?: string;
	phone?: string;
	availability?: string;
	responseTime?: string;
	confirmationMessage?: string;
	bookingEnabled?: boolean;
	bookingUrl?: string;
	bookingLabel?: string;
	bookingIntro?: string;
	inquiryChoices?: string[];
}

export interface ContactPageRevisionState {
	revisionId: string;
	schemaVersion: 1;
	payload: ContactPageDraftPayload;
	source: "admin" | "sanityImport" | "restore";
	createdAt: number;
}

export interface ContactPageEditorState {
	documentId: string;
	draft: ContactPageRevisionState | null;
	published: ContactPageRevisionState | null;
	updatedAt: number;
	publishedAt: number | null;
}

export interface AboutPortraitDraft {
	key: string;
	assetId: string;
	altText?: string;
}

export interface AboutSectionDraft {
	key: string;
	title?: string;
	items: string[];
}

export interface AboutHighlightDraft {
	key: string;
	label?: string;
	value?: string;
}

export interface AboutPageDraftPayload {
	heading?: string;
	displayName?: string;
	role?: string;
	introduction?: string;
	biography?: string;
	portraits?: AboutPortraitDraft[];
	sections?: AboutSectionDraft[];
	highlights?: AboutHighlightDraft[];
	seoDescription?: string;
}

export interface AboutPageRevisionState {
	revisionId: string;
	schemaVersion: 1;
	payload: AboutPageDraftPayload;
	source: "admin" | "sanityImport" | "restore";
	createdAt: number;
}

export interface AboutPageEditorState {
	documentId: string;
	draft: AboutPageRevisionState | null;
	published: AboutPageRevisionState | null;
	updatedAt: number;
	publishedAt: number | null;
}

export interface ModelingImageDraft {
	key: string;
	assetId: string;
	altText?: string;
}

export interface ModelingGalleryDraft {
	key: string;
	title?: string;
	slug?: string;
	description?: string;
	isVisible: boolean;
	images?: ModelingImageDraft[];
}

export interface ModelingPageDraftPayload {
	heading?: string;
	intro?: string;
	galleries?: ModelingGalleryDraft[];
	seoDescription?: string;
}

export interface ModelingPageRevisionState {
	revisionId: string;
	schemaVersion: 1;
	payload: ModelingPageDraftPayload;
	source: "admin" | "sanityImport" | "restore";
	createdAt: number;
}

export interface ModelingPageEditorState {
	documentId: string;
	draft: ModelingPageRevisionState | null;
	published: ModelingPageRevisionState | null;
	updatedAt: number;
	publishedAt: number | null;
}

export interface AdminEditorConfig {
	siteSettings?: {
		/** Public URL used by the optional Preview action. */
		previewHref?: string;
	};
	/** Enables a site-specific Quote slot without exposing the Homepage editor. */
	homepageQuote?: {
		/** Current host-owned quote used to initialize the first unpublished draft. */
		initialPayload: HomepageQuoteDraftPayload;
		/** Shared workspace route; defaults to `/admin/editor/pages/homepage-quote`. */
		baseHref?: string;
		/** Same-origin host endpoint that issues a short-lived real-Homepage draft preview. */
		previewEndpoint?: string;
	};
	/** Enables the client-managed Contact & Booking content surface. */
	contactPage?: {
		/** Current host-owned content used to initialize the first unpublished draft. */
		initialPayload: ContactPageDraftPayload;
		/** Shared workspace route; defaults to `/admin/editor/pages/contact`. */
		baseHref?: string;
		/** Same-origin endpoint for the later real-page draft preview. */
		previewEndpoint?: string;
	};
	/** Enables an About content surface while the public site retains layout ownership. */
	aboutPage?: {
		/** Current host-owned text used to initialize the first unpublished draft. */
		initialPayload: AboutPageDraftPayload;
		/** Public origin for immutable CMS image derivatives, without a trailing slash. */
		mediaBaseUrl: string;
		/** Shared workspace route; defaults to `/admin/editor/pages/about`. */
		baseHref?: string;
		/** Same-origin host endpoint that issues and completes CMS media uploads. */
		uploadEndpoint?: string;
		/** Same-origin endpoint for the later real-page draft preview. */
		previewEndpoint?: string;
	};
	/** Enables ordered Modeling categories while the public site retains layout ownership. */
	modelingPage?: {
		/** Current host-owned copy and category names used for the first draft. */
		initialPayload: ModelingPageDraftPayload;
		/** Public origin for immutable CMS image derivatives, without a trailing slash. */
		mediaBaseUrl: string;
		/** Shared workspace route; defaults to `/admin/editor/pages/modeling`. */
		baseHref?: string;
		/** Same-origin host endpoint that issues and completes CMS media uploads. */
		uploadEndpoint?: string;
		/** Same-origin endpoint for the later real-page draft preview. */
		previewEndpoint?: string;
	};
	/** Enables public Portfolio authoring; private client galleries stay separate. */
	portfolio?: {
		/** Public origin for immutable CMS image derivatives, without a trailing slash. */
		mediaBaseUrl: string;
		/** Shared workspace route; defaults to `/admin/editor/portfolio`. */
		baseHref?: string;
		/** Same-origin host endpoint that issues and completes CMS media uploads. */
		uploadEndpoint?: string;
		/** Same-origin host endpoint that issues short-lived real-site draft previews. */
		previewEndpoint?: string;
	};
	/** Enables Blog authoring for Authors, Categories, and Posts. */
	blog?: {
		/** Shared workspace route; defaults to `/admin/editor/blog`. */
		baseHref?: string;
		/** Public origin for immutable CMS image derivatives, without a trailing slash. */
		mediaBaseUrl?: string;
	};
	/** Enables private product-draft authoring and catalog read-back. */
	products?: {
		/** Shared workspace route; defaults to `/admin/editor/products`. */
		baseHref?: string;
		/** Public origin for immutable CMS image derivatives, without a trailing slash. */
		mediaBaseUrl?: string;
		/** Same-origin host endpoint that issues and completes CMS media uploads. */
		uploadEndpoint?: string;
		/** Explicitly enables verified private-asset replacement when both API refs are configured. */
		privateAssetReplacementEnabled?: boolean;
		/** Explicitly enables per-product Convex CMS publication when both API refs are configured. */
		publicationEnabled?: boolean;
		/** States that this host's public Shop reads the published Convex catalog directly. */
		publicShopEnabled?: boolean;
		/** Optional purpose-specific private upload routes; both rooted queryless paths are required. */
		privateAssetUpload?: {
			prepareEndpoint: string;
			completeEndpoint: string;
		};
		/** Product kinds exposed by this host's private draft editor. */
		enabledKinds?: readonly (
			| "print"
			| "print_set"
			| "postcard"
			| "merchandise"
			| "tapestry"
			| "digital_download"
		)[];
		/** Pure, client-safe host calculator. It must return a summary for every print input. */
		marginCalculator?: CatalogProductMarginCalculator;
		/** Pure, client-safe host catalog for labelled materials and compatible print sizes. */
		variantOptionResolver?: CatalogProductVariantOptionResolver;
	};
}

export interface AdminTheme {
	"admin-font-body"?: string;
	"admin-font-display"?: string;
	"admin-font-mono"?: string;
	"admin-bg"?: string;
	"admin-surface"?: string;
	"admin-surface-raised"?: string;
	"admin-border"?: string;
	"admin-border-strong"?: string;
	"admin-heading"?: string;
	"admin-text"?: string;
	"admin-text-muted"?: string;
	"admin-text-subtle"?: string;
	"admin-accent"?: string;
	"admin-accent-hover"?: string;
	"admin-active"?: string;
	"status-slate"?: string;
	"status-amber"?: string;
	"status-lavender"?: string;
	"status-peach"?: string;
	"status-sage"?: string;
	"status-rose"?: string;
}

export interface BoardProjectTypeGroup {
	label: string;
	values: string[];
}

export interface AdminAuthSession {
	user: { email: string; name?: string; image?: string | null };
}

/** Shape of the value emitted by a session store's subscribe callback. */
export interface SessionStoreValue {
	data: AdminAuthSession | null;
	isPending: boolean;
}

/**
 * Loose session store shape — compatible with nanostores Atom (subscribe only)
 * and plain-object fallbacks (data/isPending directly on the return).
 */
export interface SessionStore {
	subscribe?: (cb: (value: SessionStoreValue) => void) => () => void;
	data?: AdminAuthSession | null;
	isPending?: boolean;
}

export interface AdminAuthClient {
	signIn: {
		email: (opts: {
			email: string;
			password: string;
			callbackURL?: string;
		}) => Promise<{ error?: { message?: string } | null }>;
		social: (opts: {
			provider: "google";
			callbackURL?: string;
		}) => Promise<{ error?: { message?: string } | null }>;
	};
	signUp: {
		email: (opts: {
			email: string;
			password: string;
			name: string;
		}) => Promise<{ error?: { message?: string } | null }>;
	};
	signOut: () => Promise<unknown>;
	changePassword: (opts: {
		currentPassword: string;
		newPassword: string;
	}) => Promise<{ error?: { message?: string } | null }>;
	useSession: () => SessionStore;
}

export interface AdminConfig {
	siteUrl: string;
	siteName: string;
	fromEmail: string;
	isCreator: boolean;
	sanityStudioUrl?: string;
	api: AdminAPI;
	/** Enables the expanding Site editor workspace and its declared modules. */
	editor?: AdminEditorConfig;
	authClient?: AdminAuthClient;
	/**
	 * Route to load after a successful auth flow.
	 *
	 * Email/password sign-in sets the Better Auth cookie without a full-page
	 * navigation. Apps that validate admin access in SvelteKit server loaders
	 * need one navigation after sign-in so those loaders can re-read the
	 * cookie and initialize authenticated Convex state. OAuth providers also
	 * use this as their callback target.
	 *
	 * Default: `"/admin"`.
	 */
	authCallbackURL?: string;
	galleryWorkerUrl?: string;
	/**
	 * Project types shown on the board page. Defaults to photography + web
	 * presets for the creator dashboard; client tenants should pass only the
	 * business-specific project types they actually sell.
	 */
	boardProjectTypes?: BoardProjectTypeGroup[];
	theme?: {
		dark?: AdminTheme;
		light?: AdminTheme;
	};
	/**
	 * How mutations are sent to Convex.
	 *
	 * - `"websocket"` (default): calls `client.mutation(...)` directly over
	 *   the Convex WebSocket. Requires the WebSocket to be authenticated
	 *   (e.g. via `createSvelteAuthClient`).
	 * - `"http"`: routes each mutation through a SvelteKit `+server.ts`
	 *   endpoint that holds the Better Auth cookie and calls Convex via
	 *   a fresh HTTP client. This keeps mutation auth independent of the
	 *   browser WebSocket lifecycle; queries may still use an authenticated
	 *   socket.
	 *
	 * Default: `"websocket"`.
	 */
	mutationTransport?: "websocket" | "http";
	/**
	 * Endpoint path for the HTTP mutation proxy. Only consulted when
	 * `mutationTransport === "http"`. The endpoint must accept
	 * `POST { name: string, args: unknown }` and return
	 * `{ result } | { error }`.
	 *
	 * Default: `"/api/admin/mutation"`.
	 */
	mutationEndpoint?: string;
}

export interface CatalogPrivateEditorUploadConfig {
	/** Exact HTTPS `.convex.site` origin that owns the durable upload journal. */
	convexJournalOrigin: string;
	/**
	 * Per-host bearer accepted only by the Convex editor-upload journal.
	 * Must be purpose-unique.
	 */
	hostJournalSecret: string;
	/** Exact, queryless production CMS Worker origin; no alternate host is accepted at runtime. */
	workerOrigin: "https://cms-media-worker.thinkingofview.workers.dev";
	/**
	 * Bearer accepted only by the Worker's storage-completion route.
	 * Must differ from the journal bearer.
	 */
	storageCallerSecret: string;
	/** Exact browser origin admitted by the production upload contract. */
	browserOrigin: string;
}

export interface AdminServerConfig extends AdminConfig {
	convexUrl: string;
	resendApiKey: string;
	galleryAdminSecret?: string;
	/** Server-only base URL for the isolated public CMS media Worker. */
	cmsMediaWorkerUrl?: string;
	/** Server-only bearer scoped to this config's exact siteUrl. */
	cmsMediaTenantSecret?: string;
	/**
	 * Server-only Convex HTTP Actions origin (the deployment's `.convex.site`
	 * URL), used to complete a CMS media deletion after storage cleanup.
	 */
	cmsMediaConvexSiteUrl?: string;
	/** Server-only, per-host bearer for the Convex deletion completion action. */
	cmsMediaDeletionCompletionSecret?: string;
	/** Server-only, purpose-separated catalog private-editor upload bridge. */
	catalogPrivateEditorUpload?: CatalogPrivateEditorUploadConfig;
	/**
	 * Verify that a request comes from an authorized admin for the host-owned
	 * tenant or creator scope. Every shared side-effect handler requires this
	 * before external work. A scoped upload-session grant may replace a repeated
	 * call after this verifier authorized issuance. Throw or return false to
	 * reject the request.
	 */
	verifyAdmin: (request: Request) => Promise<boolean>;
	/**
	 * Extract a Convex auth token from the incoming request.
	 * Called by server handlers before making Convex mutations that
	 * require authentication. If not provided, the Convex HTTP client
	 * runs unauthenticated.
	 */
	getConvexToken?: (request: Request) => Promise<string | null>;
}

const CONFIG_KEY = Symbol("admin-config");

/** Set admin config in Svelte context (call in layout) */
export function setAdminConfig(config: AdminConfig) {
	setContext(CONFIG_KEY, config);
}

/** Get admin config from Svelte context (call in components) */
export function getAdminConfig(): AdminConfig {
	return getContext<AdminConfig>(CONFIG_KEY);
}

// Module-level config for server code (+server.ts handlers)
let _serverConfig: AdminServerConfig | null = null;

/** Set admin config for server-side code (call in +server.ts files) */
export function setServerConfig(config: AdminServerConfig) {
	_serverConfig = config;
}

/** Get admin config in server-side code */
export function getServerConfig(): AdminServerConfig {
	if (!_serverConfig)
		throw new Error(
			"Admin server config not initialized. Call setServerConfig() first.",
		);
	return _serverConfig;
}
