import { cubicOut } from "svelte/easing";
import { fade, fly } from "svelte/transition";

function matches(node: HTMLElement, query: string) {
	return node.ownerDocument.defaultView?.matchMedia?.(query).matches ?? false;
}

function motionDuration(node: HTMLElement) {
	return matches(node, "(max-width: 768px)") && !matches(node, "(prefers-reduced-motion: reduce)")
		? 240
		: 0;
}

export function sheetTransition(node: HTMLElement) {
	const offset = Number.parseFloat(node.style.getPropertyValue("--admin-sheet-offset")) || 0;
	return fly(node, {
		y: Math.max(0, node.getBoundingClientRect().height - offset),
		opacity: 1,
		duration: motionDuration(node),
		easing: cubicOut,
	});
}

export function sheetBackdropTransition(node: HTMLElement) {
	return fade(node, { duration: motionDuration(node) });
}

/** The handle owns dragging; ordinary form/content gestures keep native scrolling. */
export function dragSheet(handle: HTMLElement, onclose: () => void) {
	const panel = handle.closest<HTMLElement>(".modal-content");
	if (!panel) return;
	const sheet = panel;
	const restingTransform = sheet.style.transform;
	let pointer: number | null = null;
	let startY = 0;
	let offset = 0;
	let settling: Animation | undefined;

	function resetPosition() {
		sheet.style.transform = restingTransform;
		sheet.style.removeProperty("--admin-sheet-offset");
		offset = 0;
	}

	function settle() {
		const transform = sheet.style.transform;
		resetPosition();
		if (!motionDuration(sheet) || !sheet.animate) return;
		settling = sheet.animate([{ transform }, { transform: restingTransform || "none" }], {
			duration: 160,
			easing: "cubic-bezier(0.22, 1, 0.36, 1)",
		});
		const animation = settling;
		animation.onfinish = () => {
			if (settling === animation) settling = undefined;
		};
	}

	function releasePointer() {
		const id = pointer;
		pointer = null;
		if (id !== null && handle.hasPointerCapture(id)) handle.releasePointerCapture(id);
	}

	function down(event: PointerEvent) {
		if (
			event.button !== 0 ||
			!event.isPrimary ||
			pointer !== null ||
			!matches(handle, "(max-width: 768px)")
		)
			return;
		// Do not fight the opening/closing transition or interrupt a snap-back.
		if (sheet.getAnimations().some((animation) => animation.playState === "running")) return;
		pointer = event.pointerId;
		startY = event.clientY;
		offset = 0;
		handle.setPointerCapture(pointer);
	}

	function move(event: PointerEvent) {
		if (event.pointerId !== pointer) return;
		event.preventDefault();
		offset = Math.max(0, event.clientY - startY);
		sheet.style.setProperty("--admin-sheet-offset", String(offset));
		sheet.style.transform = `translateY(${offset}px)`;
	}

	function up(event: PointerEvent) {
		if (event.pointerId !== pointer) return;
		move(event);
		releasePointer();
		const threshold = Math.min(96, Math.max(48, sheet.getBoundingClientRect().height * 0.2));
		if (offset >= threshold) onclose();
		else settle();
	}

	function cancel(event: PointerEvent) {
		if (event.pointerId !== pointer) return;
		releasePointer();
		settle();
	}

	handle.addEventListener("pointerdown", down);
	handle.addEventListener("pointermove", move);
	handle.addEventListener("pointerup", up);
	handle.addEventListener("pointercancel", cancel);
	handle.addEventListener("lostpointercapture", cancel);
	return {
		update(next: () => void) {
			onclose = next;
		},
		destroy() {
			handle.removeEventListener("pointerdown", down);
			handle.removeEventListener("pointermove", move);
			handle.removeEventListener("pointerup", up);
			handle.removeEventListener("pointercancel", cancel);
			handle.removeEventListener("lostpointercapture", cancel);
			releasePointer();
			settling?.cancel();
			resetPosition();
		},
	};
}
