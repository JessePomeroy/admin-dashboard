export async function goto(url: string) {
	document.documentElement.dataset.lastNavigation = url;
}
