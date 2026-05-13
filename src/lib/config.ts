import { getContext, setContext } from "svelte";

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
		update: FnRef;
		remove: FnRef;
		get: FnRef;
		addImage: FnRef;
		removeImage: FnRef;
		reorderImages: FnRef;
		getImages: FnRef;
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
		allThreads: FnRef;
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

export interface AdminTheme {
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
	 *   the HTTP client. Use this when the browser Convex WebSocket is
	 *   intentionally unauthenticated (e.g. to avoid the WebSocket-pause
	 *   bug in `@mmailaender/convex-better-auth-svelte` on SvelteKit nav).
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

export interface AdminServerConfig extends AdminConfig {
	convexUrl: string;
	resendApiKey: string;
	galleryAdminSecret?: string;
	/**
	 * Verify that a request comes from an authenticated admin.
	 * Called by all server handlers before processing. Throw or return
	 * false to reject the request with 401. If not provided, handlers
	 * skip the check (consumer is responsible for route-level auth).
	 */
	verifyAdmin?: (request: Request) => Promise<boolean>;
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
