<script lang="ts">
import type { Feature } from "../features";

interface Props {
	feature: Feature;
	/** @deprecated Self-service checkout is retired; retained for source compatibility. */
	platformUrl?: string;
	/** @deprecated Self-service checkout is retired; retained for source compatibility. */
	siteUrl?: string;
	/** @deprecated Self-service checkout is retired; retained for source compatibility. */
	clientEmail?: string;
}

let { feature }: Props = $props();

const featureLabels: Record<Feature, string> = {
	dashboard: "dashboard",
	editor: "site editor",
	orders: "orders",
	inquiries: "inquiries",
	galleries: "galleries",
	galleryDelivery: "gallery delivery",
	crm: "client management",
	board: "project board",
	invoicing: "invoicing",
	quotes: "quotes",
	contracts: "contracts",
	emails: "email templates",
	messages: "messaging",
};
</script>

<div class="upgrade-banner">
	<div class="upgrade-content">
		<svg class="upgrade-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<path d="M12 2L2 7l10 5 10-5-10-5z" />
			<path d="M2 17l10 5 10-5" />
			<path d="M2 12l10 5 10-5" />
		</svg>
		<h3 class="upgrade-title">{featureLabels[feature]} access</h3>
		<p class="upgrade-description">
			access to this feature is managed by the platform. contact your platform administrator for
			details.
		</p>
	</div>
</div>

<style>
	.upgrade-banner {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 60vh;
		padding: 48px 24px;
	}

	.upgrade-content {
		text-align: center;
		max-width: 400px;
	}

	.upgrade-icon {
		width: 40px;
		height: 40px;
		color: var(--admin-accent);
		margin-bottom: 20px;
		opacity: 0.7;
	}

	.upgrade-title {
		font-family: "Chillax", sans-serif;
		font-size: 1.3rem;
		font-weight: 500;
		color: var(--admin-heading);
		margin: 0 0 10px;
	}

	.upgrade-description {
		font-size: 0.88rem;
		color: var(--admin-text-muted);
		line-height: 1.6;
		margin: 0;
	}
</style>
