import { untrack } from "svelte";

type Revision<Draft> = { revisionId: string; draft: Draft };
type DocumentState<Draft> = {
	draft?: Revision<Draft> | null;
	published?: Revision<Draft> | null;
	archivedAt?: number | null;
};
type SlugChange = { fromSlug: string; toSlug: string };

/** Owns the common draft/revision and publication sequence for blog documents. */
export function createBlogDocumentLifecycle<Draft>(options: {
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
	let saveState = $state<"loading" | "saved" | "dirty" | "saving" | "error">("loading");
	let saveError = $state("");
	let publishState = $state<"idle" | "publishing" | "error">("idle");
	let publishError = $state("");
	let lifecycleState = $state<"idle" | "working" | "error">("idle");
	let lifecycleError = $state("");
	let acknowledgeSlugChange = $state(false);
	let lastSavedJson = $state("");
	let editorState = $derived(options.state());
	let activeRevision = $derived(editorState?.draft ?? editorState?.published ?? null);
	let currentJson = $derived(options.serialize(options.draft(false)));

	$effect(() => {
		if (!activeRevision || initializedRevisionId === activeRevision.revisionId) return;
		if (staleRevisionId === activeRevision.revisionId) return;
		staleRevisionId = null;
		options.setDraft(options.copy(activeRevision.draft));
		initializedRevisionId = activeRevision.revisionId;
		lastSavedJson = options.serialize(options.draft(false));
		saveState = "saved";
		acknowledgeSlugChange = false;
		options.onInitialize();
	});

	$effect(() => {
		const nextState = currentJson === lastSavedJson ? "saved" : "dirty";
		const state = untrack(() => saveState);
		if (state === "loading" || state === "saving" || state === "error") return;
		saveState = nextState;
	});

	async function saveDraft() {
		if (!editorState || editorState.archivedAt || (saveState !== "dirty" && saveState !== "error")) return;
		const draft = options.draft(false);
		saveState = "saving";
		saveError = "";
		try {
			const result = await options.actions.save(draft, editorState.draft?.revisionId);
			lastSavedJson = options.serialize(draft);
			staleRevisionId = activeRevision?.revisionId ?? null;
			initializedRevisionId = result.revisionId;
			saveState = "saved";
		} catch (error) {
			saveState = "error";
			saveError = error instanceof Error ? error.message : "Could not save this draft.";
		}
	}

	async function publishDraft() {
		if (!editorState || editorState.archivedAt || publicationBusy()) return;
		const draft = options.draft(true);
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
			let revisionId = editorState.draft?.revisionId;
			if (options.serialize(draft) !== lastSavedJson || !revisionId) {
				const saved = await options.actions.save(draft, editorState.draft?.revisionId);
				revisionId = saved.revisionId;
				lastSavedJson = options.serialize(draft);
			}
			await options.actions.publish(revisionId, slugChange);
			publishState = "idle";
			acknowledgeSlugChange = false;
		} catch (error) {
			publishState = "error";
			publishError = error instanceof Error ? error.message : "Could not publish this draft.";
		}
	}

	async function discardDraft() {
		if (!editorState?.draft || editorState.archivedAt) return;
		saveError = "";
		try {
			await options.actions.discard(editorState.draft.revisionId);
			if (editorState.published) {
				const draft = options.copy(editorState.published.draft);
				options.setDraft(draft);
				lastSavedJson = options.serialize(draft);
			}
		} catch (error) {
			saveState = "error";
			saveError = error instanceof Error ? error.message : "Could not discard this draft.";
		}
	}

	async function runLifecycle(action: "unpublish" | "archive" | "restore") {
		if (!editorState || (action === "unpublish" && (!editorState.published || editorState.archivedAt || publicationBusy()))
			|| (action === "archive" && editorState.archivedAt)
			|| (action === "restore" && !editorState.archivedAt)) return;
		if (action === "archive" && saveState === "dirty") {
			lifecycleState = "error";
			lifecycleError = "Save or discard draft changes before archiving.";
			return;
		}
		lifecycleState = "working";
		lifecycleError = "";
		try {
			await options.actions[action]();
			lifecycleState = "idle";
		} catch (error) {
			lifecycleState = "error";
			lifecycleError = error instanceof Error ? error.message : `Could not ${action} this ${options.label}.`;
		}
	}

	function publicationBusy() {
		return saveState === "saving" || publishState === "publishing" || lifecycleState === "working";
	}

	return {
		get initializedRevisionId() { return initializedRevisionId; },
		get saveState() { return saveState; },
		get saveError() { return saveError; },
		get canSave() { return saveState === "dirty" || saveState === "error"; },
		get publishState() { return publishState; },
		get publishError() { return publishError; },
		get lifecycleState() { return lifecycleState; },
		get lifecycleError() { return lifecycleError; },
		get publicationBusy() { return publicationBusy(); },
		get publicationHasChanges() { return currentJson !== lastSavedJson || Boolean(editorState?.draft && editorState.draft.revisionId !== editorState.published?.revisionId); },
		get acknowledgeSlugChange() { return acknowledgeSlugChange; },
		set acknowledgeSlugChange(value: boolean) { acknowledgeSlugChange = value; },
		saveDraft,
		publishDraft,
		discardDraft,
		unpublishDocument: () => runLifecycle("unpublish"),
		archiveDocument: () => runLifecycle("archive"),
		restoreDocument: () => runLifecycle("restore"),
	};
}
