import { getContext, setContext } from "svelte";

// biome-ignore lint/suspicious/noExplicitAny: Convex FunctionReference is generic, simplified here
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
	adminAuth: {
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
	galleryDelivery: {
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
	subscribe?: (cb: (value: SessionStoreValue & Record<string, unknown>) => void) => () => void;
	data?: AdminAuthSession | null;
	isPending?: boolean;
}

export interface AdminAuthClient {
	signIn: {
		email: (opts: {
			email: string;
			password: string;
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
	galleryWorkerUrl?: string;
	theme?: {
		dark?: AdminTheme;
		light?: AdminTheme;
	};
}

export interface AdminServerConfig extends AdminConfig {
	convexUrl: string;
	resendApiKey: string;
	galleryAdminSecret?: string;
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
