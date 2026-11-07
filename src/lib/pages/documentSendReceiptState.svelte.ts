import { onDestroy } from "svelte";

export type DocumentSendStage = "pending" | "confirmed" | "failed" | "uncertain";

export type ReceiptOwner = Readonly<{ id: string; generation: number }>;

export type DocumentSendReceipt = Readonly<{
	id: string;
	generation: number;
	stage: DocumentSendStage;
	label?: string;
	attemptId?: string;
	message: string;
	opening: boolean;
	openError: string;
}>;

/** Mounted-page feedback only; the existing request tracker owns email attempts. */
export function createDocumentSendReceipts<T extends { _id: string; siteUrl: string }>(options: {
	siteUrl: string;
	read: (id: string) => Promise<T | null>;
	select: (record: T, openedReceipt: DocumentSendReceipt) => void;
}) {
	let items = $state.raw<DocumentSendReceipt[]>([]);
	let generation = 0;
	let readIntent = 0;
	let disposed = false;

	function matches(receipt: DocumentSendReceipt, owner: ReceiptOwner) {
		return receipt.id === owner.id && receipt.generation === owner.generation;
	}

	function update(owner: ReceiptOwner, change: (receipt: DocumentSendReceipt) => DocumentSendReceipt) {
		if (disposed || !items.some(receipt => matches(receipt, owner))) return false;
		items = items.map(receipt => matches(receipt, owner) ? change(receipt) : receipt);
		return true;
	}

	function invalidateOpen() {
		if (disposed) return;
		readIntent += 1;
		if (items.some(receipt => receipt.opening)) {
			items = items.map(receipt => receipt.opening ? { ...receipt, opening: false } : receipt);
		}
	}

	onDestroy(() => {
		disposed = true;
		readIntent += 1;
	});

	return {
		get items(): readonly DocumentSendReceipt[] {
			return items;
		},
		begin(id: string, label?: string): ReceiptOwner {
			const owner = { id, generation: ++generation };
			if (disposed) return owner;
			const existing = items.find(item => item.id === id);
			const receipt: DocumentSendReceipt = {
				...owner, stage: "pending", message: "email request in progress.",
				label: label ?? existing?.label,
				opening: false, openError: "",
			};
			// An acknowledgement adds feedback; it is not a new selection intent.
			items = existing
				? items.map(item => item.id === id ? receipt : item)
				: [...items, receipt];
			return owner;
		},
		settle(owner: ReceiptOwner, stage: Exclude<DocumentSendStage, "pending">, message: string) {
			return update(owner, receipt => ({ ...receipt, stage, message }));
		},
		bindAttempt(owner: ReceiptOwner, attemptId: string) {
			return update(owner, receipt => ({ ...receipt, attemptId }));
		},
		async open(id: string) {
			const receipt = items.find(item => item.id === id);
			if (disposed || !receipt || receipt.opening) return;
			invalidateOpen();
			const intent = readIntent;
			const current = () => !disposed && readIntent === intent
				&& items.some(item => matches(item, receipt));
			update(receipt, item => ({ ...item, opening: true, openError: "" }));
			try {
				const record = await options.read(id);
				if (!current()) return;
				if (!record || record._id !== id || record.siteUrl !== options.siteUrl) {
					update(receipt, item => ({ ...item, opening: false, openError: "could not open this saved record. try again." }));
					return;
				}
				update(receipt, item => ({ ...item, opening: false }));
				// Selection carries the action visible when this explicit read began.
				options.select(record, receipt);
			} catch {
				if (current()) {
					update(receipt, item => ({ ...item, opening: false, openError: "could not open this saved record. try again." }));
				}
			}
		},
		invalidateOpen,
		dismiss(id: string) {
			if (disposed || !items.some(item => item.id === id && item.stage !== "pending")) return;
			invalidateOpen();
			items = items.filter(item => item.id !== id);
		},
	};
}
