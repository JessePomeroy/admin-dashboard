import { browser } from "$app/environment";
import { onMount, untrack } from "svelte";

type SaveState = "loading" | "saved" | "dirty" | "saving" | "offline" | "syncing" | "error" | "conflict";

/** Owns one device draft and serializes its revision-changing operations. */
export function createSingletonDraft<T>(options: {
	copy: (payload: T | undefined) => T;
	serialize: (payload: T) => string;
	storageKey: string;
	conflictMessage: string;
	enabled?: () => boolean;
	save: (payload: T, revisionId: string | undefined) => Promise<{ revisionId: string }>;
}) {
	let form = $state<T>(options.copy(undefined));
	let state = $state<SaveState>("loading");
	let error = $state("");
	let revisionId = $state<string | undefined>();
	let initialized = $state(false);
	let serverDraft = options.copy(undefined);
	let serverRevisionId: string | undefined;
	let savedJson = "";
	let failedJson = "";
	let online = browser ? navigator.onLine : true;
	let disposed = false;
	let exclusive = false;
	let flight: Promise<boolean> | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const enabled = () => initialized && !disposed && (options.enabled?.() ?? true);
	const pending = () => state !== "saved" && state !== "loading";

	function clearTimer() {
		if (timer) clearTimeout(timer);
		timer = undefined;
	}

	function localStorageOperation(operation: (storage: Storage) => void) {
		if (!browser) return;
		try {
			operation(localStorage);
		} catch {
			error = "This browser could not preserve the draft on this device.";
		}
	}

	function clearLocalDraft() {
		localStorageOperation((storage) => storage.removeItem(options.storageKey));
	}

	function persist() {
		localStorageOperation((storage) => storage.setItem(options.storageKey, JSON.stringify({
			schemaVersion: 1,
			baseRevisionId: revisionId ?? null,
			payload: options.copy(form),
		})));
	}

	function reset(payload: T, nextRevisionId?: string) {
		clearTimer();
		form = options.copy(payload);
		serverDraft = options.copy(payload);
		revisionId = serverRevisionId = nextRevisionId;
		savedJson = options.serialize(form);
		failedJson = "";
		state = "saved";
		error = "";
		initialized = true;
	}

	function schedule(json = options.serialize(form)) {
		clearTimer();
		if (!enabled() || state === "conflict") return;
		if (exclusive || flight) {
			if (json !== savedJson) persist();
			return;
		}
		if (state === "error" && json === failedJson) {
			persist();
			return;
		}
		if (json === savedJson) {
			state = "saved";
			clearLocalDraft();
			return;
		}
		persist();
		state = online ? "dirty" : "offline";
		if (online) timer = setTimeout(() => void saveNow(), 900);
	}

	async function flush() {
		while (enabled() && !exclusive && state !== "conflict") {
			const snapshot = options.copy(form);
			const snapshotJson = options.serialize(snapshot);
			if (snapshotJson === savedJson) {
				state = "saved";
				clearLocalDraft();
				return true;
			}
			if (!online) {
				state = "offline";
				persist();
				return false;
			}
			state = state === "offline" ? "syncing" : "saving";
			error = "";
			try {
				const result = await options.save(snapshot, revisionId);
				if (disposed) return false;
				revisionId = serverRevisionId = result.revisionId;
				serverDraft = snapshot;
				savedJson = snapshotJson;
				failedJson = "";
				if (options.serialize(form) === savedJson) clearLocalDraft(); else persist();
			} catch (cause) {
				if (disposed) return false;
				error = cause instanceof Error ? cause.message : "Could not save";
				state = error.toLowerCase().includes("conflict") ? "conflict" : "error";
				failedJson = snapshotJson;
				persist();
				return false;
			}
		}
		return false;
	}

	async function saveNow(): Promise<boolean> {
		clearTimer();
		if (exclusive || disposed) return false;
		if (flight) return flight;
		flight = flush();
		try {
			return await flight;
		} finally {
			flight = undefined;
			// A failed snapshot stays suppressed until it changes or the user retries.
			if (!disposed && !exclusive && state !== "conflict") schedule();
		}
	}

	$effect(() => {
		const json = options.serialize(form);
		const ready = initialized && (options.enabled?.() ?? true);
		if (ready) untrack(() => schedule(json));
	});

	onMount(() => {
		online = navigator.onLine;
		const handleOnline = () => { online = true; if (pending()) void saveNow(); };
		const handleOffline = () => { online = false; schedule(); };
		const warnBeforeUnload = (event: BeforeUnloadEvent) => {
			if (!pending()) return;
			event.preventDefault();
			event.returnValue = "";
		};
		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);
		window.addEventListener("beforeunload", warnBeforeUnload);
		return () => {
			if (enabled() && pending()) persist();
			disposed = true;
			clearTimer();
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
			window.removeEventListener("beforeunload", warnBeforeUnload);
		};
	});

	return {
		get form() { return form; },
		get state() { return state; },
		get error() { return error; },
		set error(value: string) { error = value; },
		get revisionId() { return revisionId; },
		get initialized() { return initialized; },
		get hasPendingWork() { return pending(); },
		saveNow,
		initialize(payload: T, nextRevisionId?: string, restore = true) {
			reset(payload, nextRevisionId);
			if (!restore) return;
			localStorageOperation((storage) => {
				const value = storage.getItem(options.storageKey);
				if (!value) return;
				try {
					const local: { schemaVersion?: unknown; baseRevisionId?: unknown; payload?: T } = JSON.parse(value);
					if (!local || local.schemaVersion !== 1) return;
					if (local.baseRevisionId !== null && typeof local.baseRevisionId !== "string") throw new Error("Invalid draft revision");
					if (!local.payload || typeof local.payload !== "object" || Array.isArray(local.payload)) throw new Error("Invalid draft payload");
					form = options.copy(local.payload);
					if ((local.baseRevisionId ?? undefined) !== revisionId) {
						revisionId = local.baseRevisionId ?? undefined;
						state = "conflict";
						error = options.conflictMessage;
						return;
					}
					state = options.serialize(form) === savedJson ? "saved" : online ? "dirty" : "offline";
				} catch {
					storage.removeItem(options.storageKey);
				}
			});
		},
		observeServer(payload: T, nextRevisionId?: string) {
			// Mutation results arrive before query echoes; only conflicts adopt remote changes.
			if (state !== "conflict" || nextRevisionId === serverRevisionId) return;
			serverDraft = options.copy(payload);
			serverRevisionId = nextRevisionId;
		},
		reloadServer() {
			if (exclusive || flight || disposed) return;
			reset(serverDraft, serverRevisionId);
			clearLocalDraft();
		},
		async publish(operation: (id: string) => Promise<unknown>): Promise<T | null> {
			if (!(await saveNow()) || !revisionId || exclusive || disposed) return null;
			exclusive = true;
			clearTimer();
			const snapshot = options.copy(serverDraft);
			state = "saving";
			try {
				await operation(revisionId);
				if (disposed) return null;
				revisionId = serverRevisionId = undefined;
				error = "";
				return snapshot;
			} catch (cause) {
				error = cause instanceof Error ? cause.message : "Could not publish";
				state = "error";
				failedJson = options.serialize(form);
				return null;
			} finally {
				exclusive = false;
				schedule();
			}
		},
		async discard(published: T, operation: (id: string) => Promise<unknown>) {
			if (exclusive || disposed) return false;
			exclusive = true;
			clearTimer();
			try {
				await flight;
				if (disposed) return false;
				if (revisionId) await operation(revisionId);
				if (disposed) return false;
				reset(published);
				clearLocalDraft();
				return true;
			} catch (cause) {
				error = cause instanceof Error ? cause.message : "Could not discard";
				state = "error";
				failedJson = options.serialize(form);
				return false;
			} finally {
				exclusive = false;
				schedule();
			}
		},
	};
}
