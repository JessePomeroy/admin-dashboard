import { getContext, setContext } from "svelte";

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
	user: { email: string; name?: string; image?: string };
}

export interface AdminAuthClient {
	signIn: {
		email: (opts: {
			email: string;
			password: string;
		}) => Promise<{ error?: { message: string } }>;
		social: (opts: {
			provider: "google";
			callbackURL?: string;
		}) => Promise<void>;
	};
	signUp: {
		email: (opts: {
			email: string;
			password: string;
			name: string;
		}) => Promise<{ error?: { message: string } }>;
	};
	signOut: () => Promise<void>;
	changePassword: (opts: {
		currentPassword: string;
		newPassword: string;
	}) => Promise<{ error?: { message: string } }>;
	useSession: () => {
		data: AdminAuthSession | null;
		isPending: boolean;
	};
}

export interface AdminConfig {
	siteUrl: string;
	siteName: string;
	fromEmail: string;
	isCreator: boolean;
	sanityStudioUrl?: string;
	api: any;
	authClient?: AdminAuthClient;
	theme?: {
		dark?: AdminTheme;
		light?: AdminTheme;
	};
}

export interface AdminServerConfig extends AdminConfig {
	convexUrl: string;
	resendApiKey: string;
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
