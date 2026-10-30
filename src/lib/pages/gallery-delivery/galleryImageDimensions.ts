export function readGalleryImageDimensions(file: File): Promise<{ width: number; height: number }> {
	return new Promise((resolve) => {
		const url = URL.createObjectURL(file);
		const image = new Image();
		image.onload = () => {
			resolve({ width: image.naturalWidth, height: image.naturalHeight });
			URL.revokeObjectURL(url);
		};
		image.onerror = () => {
			resolve({ width: 0, height: 0 });
			URL.revokeObjectURL(url);
		};
		image.src = url;
	});
}
