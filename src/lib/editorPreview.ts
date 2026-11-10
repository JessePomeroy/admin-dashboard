export function resolveEditorPreviewUrl(value: unknown, currentOrigin: string) {
	if (typeof value !== "string" || !value) {
		throw new Error("The preview endpoint returned an invalid URL.");
	}
	const origin = new URL(currentOrigin).origin;
	const url = new URL(value, `${origin}/`);
	if (url.origin !== origin) {
		throw new Error("The preview endpoint returned an unsafe URL.");
	}
	return url.toString();
}

export async function openEditorDraftPreview(
	endpoint: string,
	windowName: string,
	draft: { error: string; readonly revisionId?: string; saveNow(): Promise<boolean> },
	setPreviewing: (value: boolean) => void,
) {
	// Open during the click, before autosave yields and loses the user gesture.
	const previewWindow = window.open("about:blank", windowName);
	if (!previewWindow) {
		draft.error = "Allow pop-ups for this site to open the draft preview.";
		return;
	}
	previewWindow.opener = null;
	setPreviewing(true);
	draft.error = "";
	try {
		if (!(await draft.saveNow()) || !draft.revisionId) {
			previewWindow.close();
			return;
		}
		const response = await fetch(endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ draftRevisionId: draft.revisionId }),
		});
		const result: unknown = await response.json().catch(() => null);
		if (!response.ok) {
			throw new Error(
				result && typeof result === "object" && "error" in result && typeof result.error === "string"
					? result.error
					: "Could not create the draft preview.",
			);
		}
		previewWindow.location.href = resolveEditorPreviewUrl(
			result && typeof result === "object" && "previewUrl" in result ? result.previewUrl : undefined,
			window.location.origin,
		);
	} catch (error) {
		previewWindow.close();
		draft.error = error instanceof Error ? error.message : "Could not create the draft preview.";
	} finally {
		setPreviewing(false);
	}
}
