import { onMount, untrack } from "svelte";
import { protectDraftNavigation } from "./draftNavigation";

type Revision<Draft> = { revisionId: string; draft: Draft };
type DocumentState<Draft> = {
	draft?: Revision<Draft> | null;
	published?: Revision<Draft> | null;
	archivedAt?: number | null;
};
type SlugChange = { fromSlug: string; toSlug: string };

/** Owns the common draft/revision and publication sequence for blog documents. */
export function createBlogDocumentLifecycle<Draft>(options: {
	key: () => string;
	parseRecovery: (value: unknown) => Draft | null;
	emptyDraft: () => Draft;
	state: () => DocumentState<Draft> | undefined;
	draft: (publishing: boolean) => Draft;
	setDraft: (draft: Draft) => void;
	copy: (draft: Draft) => Draft;
	serialize: (draft: Draft) => string;
	validatePublish: (draft: Draft) => boolean;
	slugChange: () => SlugChange | null;
	onInitialize: () => void;
	label: string;
	actions: {
		save: (draft: Draft, expectedRevisionId?: string) => Promise<{ revisionId: string }>;
		publish: (revisionId: string, slugChange: SlugChange | null) => Promise<unknown>;
		discard: (revisionId: string) => Promise<unknown>;
		unpublish: () => Promise<unknown>;
		archive: () => Promise<unknown>;
		restore: () => Promise<unknown>;
	};
}) {
	let initializedRevisionId = $state<string | null>(null);
	let staleRevisionId = $state<string | null>(null);
	let saveState = $state<"loading" | "saved" | "dirty" | "saving" | "error" | "conflict">(
		"loading",
	);
	let saveError = $state("");
	let publishState = $state<"idle" | "publishing" | "error">("idle");
	let publishError = $state("");
	let lifecycleState = $state<"idle" | "working" | "error">("idle");
	let lifecycleError = $state("");
	let acknowledgeSlugChange = $state(false);
	let lastSavedJson = $state("");
	let expectedRevisionId: string | undefined;
	let activeKey = "";
	let recovered = $state(false);
	let storageError = $state("");
	let unreadableRecovery = false;
	let rawRecovery = "";
	let disposed = false;
	let editorState = $derived(options.state());
	let activeRevision = $derived(editorState?.draft ?? editorState?.published ?? null);
	let currentJson = $derived(options.serialize(options.draft(false)));
	const pending = () =>
		initializedRevisionId !== null &&
		(currentJson !== lastSavedJson || publicationBusy() || saveState === "conflict");
	protectDraftNavigation(pending);
	const storageKey = () => `admin:blog-draft:${activeKey}`;
	function persist() {
		if (
			!activeKey ||
			!initializedRevisionId ||
			unreadableRecovery
		)
			return;
		try {
			if (typeof sessionStorage === "undefined") return;
			if (currentJson === lastSavedJson && saveState !== "conflict")
				sessionStorage.removeItem(storageKey());
			else
				sessionStorage.setItem(
					storageKey(),
					JSON.stringify({
						version: 1,
						base: expectedRevisionId ?? null,
						draft: options.copy(options.draft(false)),
					}),
				);
		} catch {
			storageError =
				"This tab could not preserve a recovery copy. Keep the editor open or download your draft.";
		}
	}
	function loadServerDraft(restore = false) {
		options.setDraft(activeRevision ? options.copy(activeRevision.draft) : options.emptyDraft());
		initializedRevisionId = activeRevision?.revisionId ?? "empty";
		expectedRevisionId = editorState?.draft?.revisionId;
		lastSavedJson = options.serialize(options.draft(false));
		saveState = "saved";
		saveError = "";
		recovered = false;
		unreadableRecovery = false;
		rawRecovery = "";
		storageError = "";
		acknowledgeSlugChange = false;
		options.onInitialize();
		if (!restore) return;
		try {
			if (typeof sessionStorage === "undefined") return;
			const raw = sessionStorage.getItem(storageKey());
			if (!raw) return;
			rawRecovery = raw;
			if (raw.length > 2_000_000) throw new Error("Recovery copy is too large");
			const local: unknown = JSON.parse(raw);
			if (
				!local ||
				typeof local !== "object" ||
				!("version" in local) ||
				local.version !== 1 ||
				!("base" in local) ||
				!("draft" in local)
			)
				throw new Error("Invalid recovery copy");
			if (local.base !== null && typeof local.base !== "string")
				throw new Error("Invalid recovery copy");
			const draft = options.parseRecovery(local.draft);
			if (!draft) throw new Error("Invalid recovery copy");
			if (options.serialize(draft) === lastSavedJson) return;
			options.setDraft(options.copy(draft));
			recovered = true;
			if ((local.base ?? undefined) !== expectedRevisionId) {
				expectedRevisionId = local.base ?? undefined;
				saveState = "conflict";
			} else saveState = "dirty";
		} catch {
			unreadableRecovery = Boolean(rawRecovery);
			if (unreadableRecovery) saveState = "conflict";
			storageError = unreadableRecovery
				? "The saved recovery copy could not be read. Download it before choosing the server draft."
				: "This tab could not access recovery storage. Keep the editor open or download your draft.";
		}
	}
	onMount(() => () => {
		persist();
		disposed = true;
	});

	$effect(() => {
		const key = options.key();
		const revision = activeRevision;
		const busy = publicationBusy();
		if (!editorState) return;
		untrack(() => {
			if (activeKey !== key) {
				persist();
				activeKey = key;
				staleRevisionId = null;
				publishState = "idle";
				lifecycleState = "idle";
				loadServerDraft(true);
				return;
			}
			if (busy) return;
			if (
				initializedRevisionId === (revision?.revisionId ?? "empty") ||
				(revision && staleRevisionId === revision.revisionId)
			)
				return;
			if (currentJson !== lastSavedJson || saveState === "conflict") {
				saveState = "conflict";
				persist();
				return;
			}
			staleRevisionId = null;
			loadServerDraft();
		});
	});

	$effect(() => {
		const nextState = currentJson === lastSavedJson ? "saved" : "dirty";
		const state = untrack(() => saveState);
		if (state === "loading" || state === "saving" || state === "error" || state === "conflict")
			return;
		saveState = nextState;
	});
	$effect(() => {
		if (initializedRevisionId && currentJson) untrack(persist);
	});

	async function saveDraft() {
		if (
			!editorState ||
			editorState.archivedAt ||
			publicationBusy() ||
			(saveState !== "dirty" && saveState !== "error")
		)
			return;
		const key = activeKey;
		const draft = options.copy(options.draft(false));
		saveState = "saving";
		saveError = "";
		try {
			const result = await options.actions.save(draft, expectedRevisionId);
			if (disposed || options.key() !== key) return;
			lastSavedJson = options.serialize(draft);
			staleRevisionId = activeRevision?.revisionId ?? null;
			initializedRevisionId = result.revisionId;
			expectedRevisionId = result.revisionId;
			saveState = currentJson === lastSavedJson ? "saved" : "dirty";
			persist();
		} catch (error) {
			if (disposed || options.key() !== key) return;
			saveState = error instanceof Error && /conflict/i.test(error.message) ? "conflict" : "error";
			saveError = error instanceof Error ? error.message : "Could not save this draft.";
		}
	}

	async function publishDraft() {
		if (!editorState || editorState.archivedAt || publicationBusy() || saveState === "conflict")
			return;
		const key = activeKey;
		const draft = options.copy(options.draft(true));
		if (!options.validatePublish(draft)) return;
		const slugChange = options.slugChange();
		if (slugChange && !acknowledgeSlugChange) {
			publishError = "Confirm the public URL change before publishing.";
			publishState = "error";
			return;
		}
		publishState = "publishing";
		publishError = "";
		try {
			let revisionId = expectedRevisionId;
			if (options.serialize(draft) !== lastSavedJson || !revisionId) {
				const saved = await options.actions.save(draft, expectedRevisionId);
				if (disposed || options.key() !== key) return;
				revisionId = saved.revisionId;
				expectedRevisionId = revisionId;
				staleRevisionId = activeRevision?.revisionId ?? null;
				initializedRevisionId = revisionId;
				lastSavedJson = options.serialize(draft);
			}
			await options.actions.publish(revisionId, slugChange);
			if (disposed || options.key() !== key) return;
			publishState = "idle";
			acknowledgeSlugChange = false;
			persist();
		} catch (error) {
			if (disposed || options.key() !== key) return;
			publishState = "error";
			publishError = error instanceof Error ? error.message : "Could not publish this draft.";
		}
	}

	async function discardDraft() {
		if (
			!editorState?.draft ||
			editorState.archivedAt ||
			publicationBusy() ||
			saveState === "conflict"
		)
			return;
		const key = activeKey;
		const revisionId = editorState.draft.revisionId;
		const published = editorState.published;
		lifecycleState = "working";
		saveError = "";
		try {
			await options.actions.discard(revisionId);
			if (disposed || options.key() !== key) return;
			options.setDraft(published ? options.copy(published.draft) : options.emptyDraft());
			initializedRevisionId = published?.revisionId ?? "empty";
			staleRevisionId = revisionId;
			expectedRevisionId = undefined;
			lastSavedJson = options.serialize(options.draft(false));
			saveState = "saved";
			recovered = false;
			options.onInitialize();
			persist();
		} catch (error) {
			if (disposed || options.key() !== key) return;
			saveState = "error";
			saveError = error instanceof Error ? error.message : "Could not discard this draft.";
		} finally {
			if (!disposed && options.key() === key) lifecycleState = "idle";
		}
	}

	async function runLifecycle(action: "unpublish" | "archive" | "restore") {
		if (saveState === "conflict" || publicationBusy()) return;
		if (
			!editorState ||
			(action === "unpublish" &&
				(!editorState.published || editorState.archivedAt || publicationBusy())) ||
			(action === "archive" && editorState.archivedAt) ||
			(action === "restore" && !editorState.archivedAt)
		)
			return;
		if (action === "archive" && saveState === "dirty") {
			lifecycleState = "error";
			lifecycleError = "Save or discard draft changes before archiving.";
			return;
		}
		const key = activeKey;
		lifecycleState = "working";
		lifecycleError = "";
		try {
			await options.actions[action]();
			if (disposed || options.key() !== key) return;
			lifecycleState = "idle";
		} catch (error) {
			if (disposed || options.key() !== key) return;
			lifecycleState = "error";
			lifecycleError =
				error instanceof Error ? error.message : `Could not ${action} this ${options.label}.`;
		}
	}

	function publicationBusy() {
		return saveState === "saving" || publishState === "publishing" || lifecycleState === "working";
	}

	return {
		get conflict() {
			return saveState === "conflict";
		},
		get recovered() {
			return recovered;
		},
		get storageError() {
			return storageError;
		},
		reloadServerDraft() {
			if (
				publicationBusy() ||
				!globalThis.confirm(
					"Replace your local edits with the current server draft? Download a copy first if you want to keep them.",
				)
			)
				return;
			loadServerDraft();
			persist();
		},
		downloadDraft() {
			const url = URL.createObjectURL(
				new Blob(
					[
						unreadableRecovery
							? rawRecovery
							: JSON.stringify(options.copy(options.draft(false)), null, 2),
					],
					{
						type: "application/json",
					},
				),
			);
			const link = document.createElement("a");
			link.href = url;
			link.download = "editor-draft.json";
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 0);
		},
		get initializedRevisionId() {
			return initializedRevisionId;
		},
		get saveState() {
			return saveState;
		},
		get saveError() {
			return saveError;
		},
		get canSave() {
			return saveState === "dirty" || saveState === "error";
		},
		get publishState() {
			return publishState;
		},
		get publishError() {
			return publishError;
		},
		get lifecycleState() {
			return lifecycleState;
		},
		get lifecycleError() {
			return lifecycleError;
		},
		get publicationBusy() {
			return publicationBusy();
		},
		get publicationHasChanges() {
			return (
				currentJson !== lastSavedJson ||
				Boolean(
					editorState?.draft && editorState.draft.revisionId !== editorState.published?.revisionId,
				)
			);
		},
		get acknowledgeSlugChange() {
			return acknowledgeSlugChange;
		},
		set acknowledgeSlugChange(value: boolean) {
			acknowledgeSlugChange = value;
		},
		saveDraft,
		publishDraft,
		discardDraft,
		unpublishDocument: () => runLifecycle("unpublish"),
		archiveDocument: () => runLifecycle("archive"),
		restoreDocument: () => runLifecycle("restore"),
	};
}
