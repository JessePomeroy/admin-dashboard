const focusableSelector =
	'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Owner = { node: HTMLElement; opener: Element | null };
const documents = new WeakMap<Document, {
	owners: Owner[];
	overflow: string;
	opener: Element | null;
}>();

function focus(element: Element | null | undefined) {
	if (element instanceof HTMLElement && element.isConnected) {
		element.focus({ preventScroll: true });
		return element.ownerDocument.activeElement === element;
	}
	return false;
}

// Mounted overlays share keyboard/scroll ownership, not inertness or layering:
// the existing global toast controls must remain visible and usable.
export function modalLifecycle(node: HTMLElement, onClose: () => void) {
	const document = node.ownerDocument;
	const owner = { node, opener: document.activeElement };
	const state = documents.get(document) ?? {
		owners: [], overflow: document.body.style.overflow, opener: owner.opener,
	};
	state.owners.push(owner);
	documents.set(document, state);
	document.body.style.overflow = "hidden";
	focus(node.querySelector(focusableSelector));

	function handleKeydown(event: KeyboardEvent) {
		if (state.owners.at(-1) !== owner || event.defaultPrevented) return;
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			onClose();
			return;
		}
		if (event.key !== "Tab") return;
		const active = document.activeElement;
		// Do not reclaim intentional focus on the global toast's dismiss button.
		if (active !== document.body && !node.contains(active)) return;
		const controls = node.querySelectorAll<HTMLElement>(focusableSelector);
		const first = controls[0];
		const last = controls[controls.length - 1];
		if (!first) return;
		const lostControl = active === document.body || active === node || active?.matches(":disabled");
		if (lostControl || (event.shiftKey ? active === first : active === last)) {
			event.preventDefault();
			(event.shiftKey ? last : first).focus();
		}
	}
	document.addEventListener("keydown", handleKeydown);

	return {
		update(nextOnClose: () => void) { onClose = nextOnClose; },
		destroy() {
			const wasCurrent = state.owners.at(-1) === owner;
			state.owners.splice(state.owners.indexOf(owner), 1);
			document.removeEventListener("keydown", handleKeydown);
			if (!state.owners.length) {
				document.body.style.overflow = state.overflow;
				documents.delete(document);
			}
			if (wasCurrent && !focus(owner.opener)) {
				const remaining = state.owners.at(-1);
				focus(remaining ? remaining.node.querySelector(focusableSelector) : state.opener);
			}
		},
	};
}
