<script lang="ts">
	let { isOpen, email, password, onclose } = $props<{
		isOpen: boolean;
		email: string;
		password: string;
		onclose: () => void;
	}>();

	let copied = $state(false);
</script>

{#if isOpen}
	<div class="modal-overlay" role="dialog" tabindex="-1" aria-modal="true" aria-label="Client credentials">
		<div class="modal-content" role="presentation" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h2 class="modal-title">admin account created</h2>
			</div>
			<div class="credentials-body">
				<p class="credentials-note">save these credentials — the password won't be shown again.</p>
				<div class="credentials-fields">
					<div class="credential-row">
						<span class="credential-label">email</span>
						<code class="credential-value">{email}</code>
					</div>
					<div class="credential-row">
						<span class="credential-label">password</span>
						<code class="credential-value">{password}</code>
					</div>
				</div>
				<button
					class="btn-copy"
					onclick={() => {
						navigator.clipboard.writeText(`email: ${email}\npassword: ${password}`);
						copied = true;
					}}
				>
					{copied ? "copied" : "copy credentials"}
				</button>
			</div>
			<div class="modal-actions">
				<button class="btn-save" onclick={onclose}>done</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Modal */
	.modal-overlay {
		position: fixed;
		inset: 0;
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.4);
		backdrop-filter: blur(8px);
		padding: 1rem;
	}

	.modal-content {
		background: var(--admin-bg);
		border: 1px solid var(--admin-border);
		border-radius: 12px;
		width: 100%;
		max-width: 540px;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 24px 28px 20px;
	}

	.modal-title {
		font-family: "Chillax", sans-serif;
		font-size: 1.1rem;
		font-weight: 500;
		color: var(--admin-heading);
		margin: 0;
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		padding: 0 28px 24px;
	}

	.btn-save {
		padding: 7px 16px;
		border-radius: 6px;
		font-size: 0.82rem;
		font-family: "Synonym", system-ui, sans-serif;
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s, opacity 0.15s;
		border: 1px solid transparent;
		background: rgba(129, 140, 248, 0.15);
		border-color: rgba(129, 140, 248, 0.25);
		color: var(--admin-accent-hover);
		font-weight: 500;
	}

	.btn-save:hover {
		background: rgba(129, 140, 248, 0.22);
	}

	/* Credentials */
	.credentials-body {
		padding: 0 28px 24px;
	}

	.credentials-note {
		color: var(--admin-text-muted);
		font-size: 0.84rem;
		margin: 0 0 16px;
	}

	.credentials-fields {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-bottom: 16px;
	}

	.credential-row {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.credential-label {
		font-size: 0.82rem;
		color: var(--admin-text-muted);
		width: 70px;
		flex-shrink: 0;
	}

	.credential-value {
		font-size: 0.9rem;
		color: var(--admin-heading);
		background: var(--admin-surface);
		padding: 6px 10px;
		border-radius: 4px;
		border: 1px solid var(--admin-border);
		font-family: monospace;
		flex: 1;
	}

	.btn-copy {
		background: var(--admin-surface);
		border: 1px solid var(--admin-border);
		color: var(--admin-text);
		padding: 8px 16px;
		border-radius: 6px;
		font-size: 0.84rem;
		font-family: "Synonym", system-ui, sans-serif;
		cursor: pointer;
		transition: border-color 0.15s;
		width: 100%;
	}

	.btn-copy:hover {
		border-color: var(--admin-border-strong);
	}

	/* Responsive */
	@media (max-width: 768px) {
		.modal-content {
			max-width: 100%;
		}

		.modal-overlay {
			align-items: flex-end;
			padding: 0;
		}

		.modal-content {
			border-radius: 12px 12px 0 0;
		}

		.modal-header {
			padding: 20px 20px 16px;
		}
	}
</style>
