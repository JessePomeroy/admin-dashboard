<script lang="ts">
import { getAdminConfig } from "../config";
import "../theme.css";

const config = getAdminConfig();
const authClient = config.authClient!;

let email = $state("");
let password = $state("");
let error = $state("");
let loading = $state(false);

async function handleEmailAuth(e: Event) {
	e.preventDefault();
	error = "";
	loading = true;

	try {
		const result = await authClient.signIn.email({ email, password });
		if (result?.error) {
			error = result.error.message;
		}
	} catch (err: any) {
		error = err?.message || "Something went wrong";
	} finally {
		loading = false;
	}
}

async function handleGoogle() {
	error = "";
	try {
		await authClient.signIn.social({
			provider: "google",
			callbackURL: "/admin",
		});
	} catch (err: any) {
		error = err?.message || "Google sign-in failed";
	}
}
</script>

<div class="login-page" data-admin>
	<div class="login-container">
		<h1 class="login-brand">{config.siteName}</h1>
		<p class="login-subtitle">sign in to your admin panel</p>

		{#if error}
			<div class="login-error">{error}</div>
		{/if}

		<form onsubmit={handleEmailAuth} class="login-form">
			<label class="login-label">
				<span>email</span>
				<input
					type="email"
					bind:value={email}
					required
					placeholder="you@example.com"
					class="login-input"
				/>
			</label>

			<label class="login-label">
				<span>password</span>
				<input
					type="password"
					bind:value={password}
					required
					minlength="8"
					placeholder="at least 8 characters"
					class="login-input"
				/>
			</label>

			<button type="submit" class="login-button" disabled={loading}>
				{loading ? "..." : "sign in"}
			</button>
		</form>

		<div class="login-divider">
			<span>or</span>
		</div>

		<button class="google-button" onclick={handleGoogle}>
			<svg viewBox="0 0 24 24" width="18" height="18">
				<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
				<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
				<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
				<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
			</svg>
			<span>sign in with google</span>
		</button>

	</div>
</div>

<style>
	.login-page {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--admin-bg);
		padding: 24px;
	}

	.login-container {
		width: 100%;
		max-width: 360px;
	}

	.login-brand {
		font-family: "Chillax", sans-serif;
		font-size: 1.6rem;
		font-weight: 500;
		color: var(--admin-heading);
		letter-spacing: 0.01em;
		margin: 0 0 6px;
		text-transform: lowercase;
	}

	.login-subtitle {
		color: var(--admin-text-muted);
		font-size: 0.88rem;
		margin: 0 0 28px;
	}

	.login-error {
		background: rgba(220, 38, 38, 0.1);
		border: 1px solid rgba(220, 38, 38, 0.2);
		color: rgb(248, 113, 113);
		padding: 10px 14px;
		border-radius: 6px;
		font-size: 0.84rem;
		margin-bottom: 20px;
	}

	.login-form {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.login-label {
		display: flex;
		flex-direction: column;
		gap: 5px;
		font-size: 0.82rem;
		color: var(--admin-text-muted);
	}

	.login-input {
		background: var(--admin-surface);
		border: 1px solid var(--admin-border);
		border-radius: 6px;
		padding: 10px 12px;
		font-size: 0.9rem;
		color: var(--admin-heading);
		font-family: "Synonym", system-ui, sans-serif;
		outline: none;
		transition: border-color 0.15s;
	}

	.login-input::placeholder {
		color: var(--admin-text-subtle);
	}

	.login-input:focus {
		border-color: var(--admin-accent);
	}

	.login-button {
		background: var(--admin-accent);
		color: var(--admin-bg);
		border: none;
		border-radius: 6px;
		padding: 11px 16px;
		font-size: 0.88rem;
		font-family: "Synonym", system-ui, sans-serif;
		font-weight: 500;
		cursor: pointer;
		transition: opacity 0.15s;
		margin-top: 4px;
	}

	.login-button:hover {
		opacity: 0.9;
	}

	.login-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.login-divider {
		display: flex;
		align-items: center;
		gap: 16px;
		margin: 24px 0;
		color: var(--admin-text-subtle);
		font-size: 0.8rem;
	}

	.login-divider::before,
	.login-divider::after {
		content: "";
		flex: 1;
		height: 1px;
		background: var(--admin-border);
	}

	.google-button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		width: 100%;
		background: var(--admin-surface);
		border: 1px solid var(--admin-border);
		border-radius: 6px;
		padding: 11px 16px;
		font-size: 0.88rem;
		font-family: "Synonym", system-ui, sans-serif;
		color: var(--admin-text);
		cursor: pointer;
		transition: border-color 0.15s, color 0.15s;
	}

	.google-button:hover {
		border-color: var(--admin-border-strong);
		color: var(--admin-heading);
	}

</style>
