/**
 * Backend API Client & URL Configuration for Nirikshan
 * 
 * Configures communication with the FastAPI/YOLO backend service.
 * Supports configurable NEXT_PUBLIC_BACKEND_URL for local development and cloud production.
 */

export function getBackendUrl(): string {
	if (process.env.NEXT_PUBLIC_BACKEND_URL) {
		return process.env.NEXT_PUBLIC_BACKEND_URL.replace(/\/+$/, '');
	}
	return 'http://localhost:8000';
}

export function getBackendWsUrl(): string {
	const backendUrl = getBackendUrl();
	// Replace http:// with ws:// and https:// with wss://
	return backendUrl.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://');
}

export function getCctvStreamUrl(rtspUrl: string): string {
	const backendUrl = getBackendUrl();
	return `${backendUrl}/api/cctv/stream?rtsp_url=${encodeURIComponent(rtspUrl)}`;
}

export async function testCctvConnection(rtspUrl: string): Promise<{
	success: boolean;
	status: 'online' | 'offline';
	message: string;
	resolution?: string;
	fps?: number;
}> {
	try {
		const backendUrl = getBackendUrl();
		const response = await fetch(
			`${backendUrl}/api/cctv/test-connection?rtsp_url=${encodeURIComponent(rtspUrl)}`,
			{ cache: 'no-store' }
		);
		if (!response.ok) {
			return {
				success: false,
				status: 'offline',
				message: `Server returned status ${response.status}`,
			};
		}
		return await response.json();
	} catch (error) {
		return {
			success: false,
			status: 'offline',
			message: (error as Error).message || 'Failed to reach Nirikshan streaming service',
		};
	}
}

export async function fetchAccidentClips(): Promise<{
	clips: Array<{
		filename: string;
		size_bytes: number;
		size_mb: number;
		url: string;
	}>;
	count: number;
}> {
	try {
		const backendUrl = getBackendUrl();
		const response = await fetch(`${backendUrl}/api/accident-clips`, {
			cache: 'no-store',
		});
		if (!response.ok) {
			throw new Error(`Failed to fetch clips: ${response.status}`);
		}
		return await response.json();
	} catch (error) {
		console.error('Error fetching accident clips:', error);
		return { clips: [], count: 0 };
	}
}

export async function detectSampleClip(filename: string): Promise<{
	status: string;
	result: string;
	accident_detected: boolean;
	filename: string;
	message: string;
}> {
	const backendUrl = getBackendUrl();
	const formData = new FormData();
	formData.append('filename', filename);

	const response = await fetch(`${backendUrl}/api/detect/sample-clip`, {
		method: 'POST',
		body: formData,
	});

	if (!response.ok) {
		const err = await response.text();
		throw new Error(`Detection request failed: ${err}`);
	}

	return await response.json();
}

export async function detectUploadedVideo(file: File): Promise<{
	status: string;
	result: string;
	accident_detected: boolean;
	filename: string;
	message: string;
}> {
	const backendUrl = getBackendUrl();
	const formData = new FormData();
	formData.append('file', file);

	const response = await fetch(`${backendUrl}/detect/video`, {
		method: 'POST',
		body: formData,
	});

	if (!response.ok) {
		const err = await response.text();
		throw new Error(`Video detection upload failed: ${err}`);
	}

	return await response.json();
}
