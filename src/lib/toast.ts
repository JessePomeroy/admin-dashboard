type ToastType = "error" | "success" | "warning" | "info";

export interface Toast {
	id: number;
	message: string;
	type: ToastType;
}

let nextId = 0;
let toasts: Toast[] = [];
let listeners: Array<() => void> = [];

function notify() {
	for (const fn of listeners) fn();
}

export function addToast(message: string, type: ToastType = "error") {
	const id = nextId++;
	toasts = [...toasts, { id, message, type }];
	notify();

	setTimeout(() => {
		removeToast(id);
	}, 5000);
}

export function removeToast(id: number) {
	toasts = toasts.filter((t) => t.id !== id);
	notify();
}

export function getToasts(): Toast[] {
	return toasts;
}

export function subscribe(fn: () => void): () => void {
	listeners.push(fn);
	return () => {
		listeners = listeners.filter((l) => l !== fn);
	};
}
