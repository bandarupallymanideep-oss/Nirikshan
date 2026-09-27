'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Dashboard from '@/components/dashboard';
import { Button } from '@/components/ui/button';
import { CCTVSelectionDialog } from '@/components/cctv/CCTVSelectionDialog';
import { CCTV } from '@/components/cctv/types';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	CardFooter,
} from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
	Loader2,
	Search,
	Video,
	Calendar,
	Clock,
	ArrowRight,
	Activity,
	Radio,
	Wifi,
	WifiOff,
	RefreshCw,
	Layers,
	ExternalLink,
	Play,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { ToastAction } from '@/components/ui/toast';
import {
	getCctvStreamUrl,
	getBackendWsUrl,
	testCctvConnection,
	fetchAccidentClips,
} from '@/lib/backend';

type DetectionLog = {
	time: string;
	message: string;
	severity: 'info' | 'warning' | 'error';
};

type StreamStatus = {
	checked: boolean;
	online: boolean;
	message: string;
	resolution?: string;
	fps?: number;
};

export default function Page() {
	const [cctvs, setCCTVs] = useState<CCTV[]>([]);
	const [selectedCCTV, setSelectedCCTV] = useState<CCTV | null>(null);
	const [loading, setLoading] = useState(false);
	const [showSelectionDialog, setShowSelectionDialog] = useState(false);
	
	// Supported functions: 'stream' (Live Monitoring) | 'analyze' (Accident Detection)
	const [activeMode, setActiveMode] = useState<'stream' | 'analyze'>('stream');

	// Live Stream State
	const [streamLoading, setStreamLoading] = useState(false);
	const [streamStatus, setStreamStatus] = useState<StreamStatus>({
		checked: false,
		online: false,
		message: '',
	});
	const [streamKey, setStreamKey] = useState<number>(0);

	// AI Accident Detection / Analyze State
	const [accidentDetected, setAccidentDetected] = useState(false);
	const [detectionActive, setDetectionActive] = useState(false);
	const [videoLoaded, setVideoLoaded] = useState(false);
	const [backendReady, setBackendReady] = useState(false);
	const [logs, setLogs] = useState<DetectionLog[]>([]);
	const [connectionStatus, setConnectionStatus] = useState<
		'disconnected' | 'connecting' | 'connected'
	>('disconnected');
	const [lastProcessedTimestamp, setLastProcessedTimestamp] =
		useState<number>(0);
	const [processingComplete, setProcessingComplete] = useState(false);

	const wsRef = useRef<WebSocket | null>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const logsEndRef = useRef<HTMLDivElement>(null);
	const currentCCTVRef = useRef<CCTV | null>(null);
	const { toast } = useToast();

	useEffect(() => {
		if (logsEndRef.current) {
			logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
		}
	}, [logs]);

	useEffect(() => {
		currentCCTVRef.current = selectedCCTV;
	}, [selectedCCTV]);

	// Clean up WebSocket on unmount
	useEffect(() => {
		return () => {
			if (wsRef.current) {
				wsRef.current.close();
				wsRef.current = null;
			}
		};
	}, []);

	// Ping interval for WebSocket when in analyze mode
	useEffect(() => {
		let pingInterval: NodeJS.Timeout | null = null;

		if (wsRef.current && connectionStatus === 'connected') {
			pingInterval = setInterval(() => {
				if (wsRef.current?.readyState === WebSocket.OPEN) {
					try {
						wsRef.current.send(JSON.stringify({ type: 'ping' }));
					} catch (error) {
						console.error('Error sending ping:', error);
					}
				}
			}, 30000);
		}

		return () => {
			if (pingInterval) clearInterval(pingInterval);
		};
	}, [connectionStatus]);

	const addLog = (
		message: string,
		severity: 'info' | 'warning' | 'error' = 'info'
	) => {
		setLogs(prev => [
			...prev,
			{
				time: new Date().toLocaleTimeString(),
				message,
				severity,
			},
		]);
	};

	// Check stream connectivity via backend RTSP endpoint
	const checkCameraStream = useCallback(async (cctv: CCTV) => {
		if (!cctv.rtspUrl) return;
		setStreamLoading(true);
		try {
			const res = await testCctvConnection(cctv.rtspUrl);
			setStreamStatus({
				checked: true,
				online: res.status === 'online',
				message: res.message,
				resolution: res.resolution,
				fps: res.fps,
			});
		} catch (err) {
			setStreamStatus({
				checked: true,
				online: false,
				message: (err as Error).message || 'Connection test failed',
			});
		} finally {
			setStreamLoading(false);
		}
	}, []);

	// Auto-check stream and query params on mount
	useEffect(() => {
		const loadInitialData = async () => {
			try {
				const response = await fetch('/api/cctvs');
				if (response.ok) {
					const data: CCTV[] = await response.json();
					setCCTVs(data);

					// Check URL query parameters for ?cctvId=...
					const params = new URLSearchParams(window.location.search);
					const targetId = params.get('cctvId');
					if (targetId && data.length > 0) {
						const found = data.find(c => c.id === targetId);
						if (found) {
							setSelectedCCTV(found);
							checkCameraStream(found);
						}
					}
				}
			} catch (e) {
				console.error('Failed to load initial CCTVs:', e);
			}
		};

		loadInitialData();
	}, [checkCameraStream]);

	const handleOpenCameraSelector = async () => {
		try {
			setLoading(true);
			const response = await fetch('/api/cctvs');

			if (!response.ok) {
				throw new Error(`API error: ${response.status}`);
			}

			const data: CCTV[] = await response.json();
			// Display all saved CCTVs for live monitoring
			setCCTVs(data);
			setShowSelectionDialog(true);
		} catch (error) {
			console.error('Failed to load cameras:', error);
			toast({
				title: 'Error loading cameras',
				description: (error as Error).message || 'Failed to load camera data',
				variant: 'destructive',
			});
		} finally {
			setLoading(false);
		}
	};

	const cleanupExistingConnection = () => {
		if (wsRef.current) {
			wsRef.current.close();
			wsRef.current = null;
		}

		setAccidentDetected(false);
		setLogs([]);
		setDetectionActive(false);
		setVideoLoaded(false);
		setBackendReady(false);
		setLastProcessedTimestamp(0);
		setProcessingComplete(false);

		if (canvasRef.current) {
			const ctx = canvasRef.current.getContext('2d');
			if (ctx) {
				ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
			}
		}
	};

	const handleCameraSelect = (camera: CCTV) => {
		cleanupExistingConnection();
		setSelectedCCTV(camera);
		currentCCTVRef.current = camera;
		setShowSelectionDialog(false);
		setStreamKey(prev => prev + 1);

		// If currently on stream mode, check connectivity
		checkCameraStream(camera);

		// If currently on analyze mode, connect to detection service
		if (activeMode === 'analyze') {
			addLog(`Initializing accident detection for ${camera.name}...`);
			connectToDetectionService(camera);
		}
	};

	const handleModeSwitch = (mode: 'stream' | 'analyze') => {
		setActiveMode(mode);
		if (!selectedCCTV) return;

		if (mode === 'stream') {
			cleanupExistingConnection();
			checkCameraStream(selectedCCTV);
		} else if (mode === 'analyze') {
			if (!detectionActive && connectionStatus === 'disconnected') {
				addLog(`Starting accident detection analysis for ${selectedCCTV.name}...`);
				connectToDetectionService(selectedCCTV);
			}
		}
	};

	const connectToDetectionService = (camera: CCTV) => {
		try {
			setConnectionStatus('connecting');
			addLog('Connecting to backend detection service...');

			const wsUrl = `${getBackendWsUrl()}/ws/detect`;
			const ws = new WebSocket(wsUrl);
			wsRef.current = ws;

			ws.onopen = () => {
				setConnectionStatus('connected');
				addLog('Connected to detection service', 'info');
				setDetectionActive(true);

				// Process accident video or live rtsp stream URL
				const videoSource = camera.accidentVideoUrl || camera.rtspUrl;
				ws.send(
					JSON.stringify({
						type: 'process_video',
						video_url: videoSource,
						camera_id: camera.id,
						camera_name: camera.name,
						latitude: camera.latitude,
						longitude: camera.longitude,
					})
				);

				addLog(`Sent camera video source to backend for processing`, 'info');
			};

			ws.onmessage = event => handleWebSocketMessage(event, camera);
			ws.onclose = handleWebSocketClose;
			ws.onerror = handleWebSocketError;
		} catch (error) {
			console.error('Failed to connect to detection service:', error);
			setConnectionStatus('disconnected');
			addLog(`Connection error: ${(error as Error).message}`, 'error');
		}
	};

	const handleWebSocketMessage = (
		event: MessageEvent,
		cameraAtConnection?: CCTV
	) => {
		try {
			const data = JSON.parse(event.data);

			if (data.type === 'ready') {
				setBackendReady(true);
				addLog('Backend is ready to process video', 'info');
			}

			if (data.type === 'frame') {
				displayFrame(data.frame);
				if (!videoLoaded) {
					setVideoLoaded(true);
				}
			}

			if (data.type === 'processing_complete') {
				setDetectionActive(false);
				setProcessingComplete(true);
				addLog('Video processing completed', 'info');

				if (data.accident_found) {
					addLog('Accident was detected in this video', 'warning');
				} else if (data.accident_found === false) {
					addLog('No accidents detected in this video', 'info');
				}
			}

			if (data.accident_detected) {
				const messageTimestamp = data.timestamp || Date.now();

				if (messageTimestamp > lastProcessedTimestamp) {
					setLastProcessedTimestamp(messageTimestamp);
					setAccidentDetected(true);

					const camera =
						cameraAtConnection || currentCCTVRef.current || selectedCCTV;

					if (!camera) {
						addLog('Error: No CCTV selected when accident detected', 'error');
						return;
					}

					const confidence = data.confidence || 0;
					addLog(
						`⚠️ ACCIDENT DETECTED! (confidence: ${(confidence * 100).toFixed(1)}%)`,
						'error'
					);

					toast({
						title: 'Accident Detected!',
						description: `Possible accident detected on camera: ${camera.name}`,
						variant: 'destructive',
						duration: 5000,
					});
				}
			}

			if (data.type === 'image_saved') {
				const camera =
					cameraAtConnection || currentCCTVRef.current || selectedCCTV;

				if (!camera) {
					addLog('Error: No CCTV selected when image was saved', 'error');
					return;
				}

				addLog(`Accident image saved: ${data.image_url}`, 'info');

				const incidentData = {
					cctvId: camera.id,
					confidenceScore: data.confidence || 0,
					imageUrl: data.image_url,
					thumbnailUrl: data.image_url,
					latitude: camera.latitude,
					longitude: camera.longitude,
					location:
						data.location ||
						`${camera.latitude.toFixed(6)}, ${camera.longitude.toFixed(6)}`,
					incidentType: data.accident_type,
					metadata: {
						frameNumber: data.frame_number,
						detectedAt: new Date().toISOString(),
						accidentType: data.accident_type,
						isLocalFile: true,
					},
				};

				fetch('/api/incidents', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify(incidentData),
				})
					.then(async response => {
						if (response.ok) {
							const result = await response.json();
							addLog(
								`Incident #${result.id || ''} created and ready for verification`,
								'info'
							);
							toast({
								title: 'Incident Created!',
								description: `Incident #${result.id} has been created and is ready for verification.`,
								duration: 5000,
								action: (
									<ToastAction
										className='font-semibold'
										asChild
										altText='View incident details'>
										<a
											href={`/incident_verification/${result.id}`}
											target='_blank'>
											View Incident
										</a>
									</ToastAction>
								),
							});
						} else {
							const errorText = await response
								.text()
								.catch(() => 'Unknown error');
							addLog(
								`Failed to create incident record: ${response.status} ${errorText}`,
								'error'
							);
						}
					})
					.catch(error => {
						console.error('Error creating incident:', error);
						addLog(`Error creating incident: ${error.message}`, 'error');
					});
			}

			if (data.message) {
				addLog(data.message, data.severity || 'info');
			}
		} catch (error) {
			console.error('Error parsing WebSocket message:', error);
			addLog(`Error parsing message: ${(error as Error).message}`, 'warning');
		}
	};

	const displayFrame = (base64Image: string) => {
		if (!canvasRef.current) return;

		const ctx = canvasRef.current.getContext('2d');
		if (!ctx) return;

		const img = new Image();
		img.onload = () => {
			if (canvasRef.current) {
				if (
					canvasRef.current.width !== img.width ||
					canvasRef.current.height !== img.height
				) {
					canvasRef.current.width = img.width;
					canvasRef.current.height = img.height;
				}
				ctx.drawImage(img, 0, 0);
			}
		};
		img.src = `data:image/jpeg;base64,${base64Image}`;
	};

	const handleWebSocketClose = (event: CloseEvent) => {
		setConnectionStatus('disconnected');
		setDetectionActive(false);
		setBackendReady(false);

		const reason =
			event.reason ||
			(event.code === 1006
				? 'Connection closed abnormally'
				: 'Connection closed');

		addLog(`Disconnected: ${reason}`, 'warning');

		if (currentCCTVRef.current && !processingComplete && activeMode === 'analyze') {
			const backoffTime = event.code === 1006 ? 3000 : 1000;
			addLog(
				`Attempting to reconnect in ${backoffTime / 1000} seconds...`,
				'info'
			);

			setTimeout(() => {
				if (currentCCTVRef.current && !processingComplete && activeMode === 'analyze') {
					addLog('Reconnecting to detection service...', 'info');
					connectToDetectionService(currentCCTVRef.current);
				}
			}, backoffTime);
		}
	};

	const handleWebSocketError = () => {
		setConnectionStatus('disconnected');
		setBackendReady(false);
		addLog('WebSocket connection error', 'error');
	};

	const formatDate = (dateString: string) => {
		try {
			const date = new Date(dateString);
			return date.toLocaleDateString(undefined, {
				year: 'numeric',
				month: 'short',
				day: 'numeric',
			});
		} catch {
			return 'Unknown date';
		}
	};

	return (
		<Dashboard>
			<div className='mx-auto flex max-w-[1800px] flex-1 flex-col gap-6 p-6 pt-0'>
				{/* Top bar header */}
				<div className='flex flex-col justify-between gap-4 border-b border-gray-800 py-6 sm:flex-row sm:items-center'>
					<div>
						<div className='flex items-center gap-3'>
							<h1 className='text-2xl font-bold tracking-tight text-gray-100 sm:text-3xl'>
								CCTV Highway Monitor
							</h1>
							<div className='flex rounded-lg border border-gray-700 bg-gray-800/80 p-0.5'>
								<button
									onClick={() => handleModeSwitch('stream')}
									className={cn(
										'flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors',
										activeMode === 'stream'
											? 'bg-blue-600 text-white shadow-sm'
											: 'text-gray-400 hover:text-gray-200'
									)}>
									<Radio className='h-3.5 w-3.5' />
									Live Monitoring
								</button>
								<button
									onClick={() => handleModeSwitch('analyze')}
									className={cn(
										'flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors',
										activeMode === 'analyze'
											? 'bg-blue-600 text-white shadow-sm'
											: 'text-gray-400 hover:text-gray-200'
									)}>
									<Activity className='h-3.5 w-3.5' />
									CCTV Analyze
								</button>
							</div>
						</div>
						<p className='mt-1 text-sm text-gray-400 sm:text-base'>
							{activeMode === 'stream'
								? 'Live RTSP highway CCTV camera streaming and status'
								: 'Real-time YOLO AI accident detection and incident logging'}
						</p>
					</div>

					<div className='flex items-center gap-3'>
						<Button
							size='lg'
							className='gap-2 bg-gradient-to-r from-blue-600 to-blue-700 shadow-lg transition-all duration-200 hover:from-blue-500 hover:to-blue-600 hover:shadow-blue-900/20'
							onClick={handleOpenCameraSelector}
							disabled={loading}>
							{loading ? (
								<Loader2 className='h-4 w-4 animate-spin' />
							) : (
								<Video className='h-4 w-4' />
							)}
							Select Camera
						</Button>
					</div>
				</div>

				{!selectedCCTV ? (
					<div className='to-gray-850 flex h-[420px] flex-col items-center justify-center gap-6 rounded-xl border border-dashed border-gray-700 bg-gradient-to-b from-gray-900 p-8 text-center shadow-xl shadow-black/20'>
						<div className='mb-2 flex h-20 w-20 items-center justify-center rounded-full bg-gray-800/50 ring-4 ring-gray-700/30'>
							<Video className='h-10 w-10 text-gray-500' />
						</div>
						<div className='max-w-md'>
							<h3 className='mb-2 text-xl font-semibold text-gray-200'>
								No CCTV camera selected
							</h3>
							<p className='mb-6 text-gray-400 text-sm leading-relaxed'>
								Select a camera to view its live RTSP stream or run AI accident
								detection. You can add and configure cameras in CCTV Settings.
							</p>
							<div className='flex justify-center gap-3'>
								<Button
									variant='outline'
									className='gap-2 border-gray-700 hover:bg-gray-800 hover:text-white'
									onClick={handleOpenCameraSelector}
									disabled={loading}>
									<Video className='h-4 w-4' />
									Select Camera
								</Button>
								<Button
									variant='ghost'
									className='gap-2 text-gray-400 hover:text-white'
									onClick={() => (window.location.href = '/cctv_setting')}>
									<ExternalLink className='h-4 w-4' />
									CCTV Settings
								</Button>
							</div>
						</div>
					</div>
				) : (
					<div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
						{/* Video & Stream Card */}
						<Card className='overflow-hidden border-gray-700 bg-gray-900 text-white shadow-xl shadow-black/20'>
							<CardHeader className='flex flex-row items-center justify-between space-y-0 border-b border-gray-800 pb-3'>
								<div>
									<div className='flex items-center gap-2'>
										<CardTitle className='font-bold tracking-tight text-lg'>
											{selectedCCTV.name}
										</CardTitle>
										{activeMode === 'stream' && (
											<span className='rounded bg-blue-950/80 px-2 py-0.5 text-xs font-medium text-blue-300 border border-blue-800/50'>
												Live Stream
											</span>
										)}
										{activeMode === 'analyze' && (
											<span className='rounded bg-purple-950/80 px-2 py-0.5 text-xs font-medium text-purple-300 border border-purple-800/50'>
												AI Analyze
											</span>
										)}
									</div>
									<CardDescription className='mt-1 flex items-center gap-3 text-gray-400 text-xs'>
										<span className='flex items-center gap-1'>
											<Calendar className='h-3 w-3' />
											{formatDate(selectedCCTV.createdAt)}
										</span>
										<span className='flex items-center gap-1'>
											<Clock className='h-3 w-3' />
											{new Date(selectedCCTV.createdAt).toLocaleTimeString()}
										</span>
									</CardDescription>
								</div>

								{/* Status Badges */}
								<div className='flex items-center gap-2'>
									{activeMode === 'stream' && (
										<>
											{streamLoading ? (
												<div className='flex items-center gap-1.5 rounded-full border border-blue-800 bg-blue-950 px-2.5 py-1 text-xs font-medium text-blue-300'>
													<Loader2 className='h-3 w-3 animate-spin' />
													Checking...
												</div>
											) : streamStatus.checked && streamStatus.online ? (
												<div className='flex items-center gap-1.5 rounded-full border border-green-800 bg-green-950 px-2.5 py-1 text-xs font-medium text-green-300'>
													<span className='h-2 w-2 animate-pulse rounded-full bg-green-500' />
													ONLINE {streamStatus.fps ? `(${streamStatus.fps} FPS)` : ''}
												</div>
											) : streamStatus.checked && !streamStatus.online ? (
												<div className='flex items-center gap-1.5 rounded-full border border-amber-800 bg-amber-950 px-2.5 py-1 text-xs font-medium text-amber-300'>
													<WifiOff className='h-3 w-3' />
													OFFLINE
												</div>
											) : null}
										</>
									)}

									{activeMode === 'analyze' && (
										<>
											{accidentDetected && (
												<div className='flex items-center gap-2 rounded-full border border-red-800 bg-red-950 px-3 py-1 text-xs font-medium text-red-300'>
													<div className='h-2 w-2 animate-pulse rounded-full bg-red-500' />
													Accident
												</div>
											)}
											{connectionStatus === 'connecting' && (
												<div className='flex items-center gap-2 rounded-full border border-blue-800 bg-blue-950 px-3 py-1 text-xs font-medium text-blue-300'>
													<Loader2 className='h-3 w-3 animate-spin' />
													Connecting
												</div>
											)}
										</>
									)}
								</div>
							</CardHeader>

							<CardContent className='p-0'>
								{activeMode === 'stream' ? (
									/* ========================================================
									   LIVE RTSP MONITORING VIEW
									   Uses FastAPI /api/cctv/stream endpoint for MJPEG browser playback
									======================================================== */
									<div className='relative aspect-video w-full overflow-hidden bg-black flex items-center justify-center'>
										{selectedCCTV.rtspUrl ? (
											<>
												{/* Browser natively streams MJPEG from FastAPI backend */}
												{/* eslint-disable-next-line @next/next/no-img-element */}
												<img
													key={streamKey}
													src={getCctvStreamUrl(selectedCCTV.rtspUrl)}
													alt={selectedCCTV.name}
													className='h-full w-full object-contain'
													onLoad={() => {
														setStreamStatus(prev => ({
															...prev,
															checked: true,
															online: true,
														}));
													}}
													onError={() => {
														setStreamStatus(prev => ({
															...prev,
															checked: true,
															online: false,
															message: 'Live stream feed unreachable or camera offline',
														}));
													}}
												/>

												{/* Overlay if stream is offline or check failed */}
												{streamStatus.checked && !streamStatus.online && (
													<div className='absolute inset-0 z-20 flex flex-col items-center justify-center bg-gray-950/85 p-6 text-center backdrop-blur-sm'>
														<WifiOff className='mb-3 h-10 w-10 text-amber-500' />
														<h4 className='text-base font-semibold text-gray-200'>
															Live Stream Offline
														</h4>
														<p className='mt-1 max-w-sm text-xs text-gray-400 font-mono break-all'>
															{selectedCCTV.rtspUrl}
														</p>
														<p className='mt-2 max-w-sm text-xs text-gray-500'>
															{streamStatus.message ||
																'Cannot establish RTSP connection. Verify that the camera IP, port, and credentials are reachable.'}
														</p>
														<Button
															size='sm'
															variant='outline'
															className='mt-4 gap-2 border-gray-700 text-xs hover:bg-gray-800 hover:text-white'
															onClick={() => {
																setStreamKey(prev => prev + 1);
																checkCameraStream(selectedCCTV);
															}}>
															<RefreshCw className='h-3.5 w-3.5' />
															Retry Connection
														</Button>
													</div>
												)}
											</>
										) : (
											<div className='flex flex-col items-center justify-center p-8 text-center text-gray-500'>
												<Video className='mb-2 h-8 w-8 text-gray-600' />
												<p className='text-sm font-medium'>No RTSP URL configured for this camera</p>
											</div>
										)}
									</div>
								) : (
									/* ========================================================
									   CCTV ANALYZE / DETECTION CANVAS VIEW
									   Uses WebSocket /ws/detect and YOLO pipeline
									======================================================== */
									<div className='relative overflow-hidden bg-black aspect-video'>
										{!videoLoaded || !backendReady ? (
											<div className='absolute inset-0 z-10 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm'>
												<div className='flex flex-col items-center gap-2'>
													<Loader2 className='h-10 w-10 animate-spin text-blue-500' />
													<p className='text-sm text-gray-300'>
														{!videoLoaded
															? 'Loading CCTV feed for AI inference...'
															: 'Waiting for backend detection to initialize...'}
													</p>
												</div>
											</div>
										) : null}
										<canvas
											ref={canvasRef}
											className={cn(
												'aspect-video w-full rounded-none bg-black transition-opacity duration-300',
												videoLoaded && backendReady ? 'opacity-100' : 'opacity-0'
											)}
										/>
									</div>
								)}
							</CardContent>

							<CardFooter className='flex flex-col gap-2 border-t border-gray-800 px-4 py-3 text-xs text-gray-400 sm:flex-row sm:items-center sm:justify-between'>
								<div className='flex items-center gap-3'>
									<span>
										Location: {selectedCCTV.latitude.toFixed(4)},{' '}
										{selectedCCTV.longitude.toFixed(4)}
									</span>
									{streamStatus.resolution && (
										<span className='hidden sm:inline text-gray-500'>
											• Resolution: {streamStatus.resolution}
										</span>
									)}
								</div>
								<div className='flex items-center gap-2'>
									<span
										className={cn(
											'rounded px-2 py-0.5 text-xs font-medium uppercase',
											selectedCCTV.status === 'active'
												? 'bg-green-900/30 text-green-400'
												: 'bg-amber-900/30 text-amber-400'
										)}>
										{selectedCCTV.status}
									</span>
									<Button
										variant='ghost'
										size='sm'
										className='h-7 text-xs text-gray-400 hover:text-white'
										onClick={() => {
											if (activeMode === 'stream') {
												handleModeSwitch('analyze');
											} else {
												handleModeSwitch('stream');
											}
										}}>
										Switch to {activeMode === 'stream' ? 'Analyze' : 'Live Stream'}
									</Button>
								</div>
							</CardFooter>
						</Card>

						{/* Right Info / Logs Card */}
						<Card className='flex flex-col border-gray-700 bg-gray-900 text-white shadow-xl shadow-black/20'>
							<CardHeader className='border-b border-gray-800 pb-3'>
								<CardTitle className='flex items-center justify-between font-bold tracking-tight text-lg'>
									<span>{activeMode === 'stream' ? 'Camera Information' : 'Detection Logs'}</span>
									{activeMode === 'stream' ? (
										<span className='flex items-center gap-1.5 text-xs font-normal text-gray-400'>
											<Radio className='h-3.5 w-3.5 text-blue-400' />
											RTSP Stream
										</span>
									) : detectionActive ? (
										<span className='flex items-center gap-2 rounded-full border border-green-800/50 bg-green-900/30 px-3 py-1 text-xs font-medium text-green-400'>
											<span className='h-2 w-2 animate-pulse rounded-full bg-green-500' />
											Active
										</span>
									) : (
										<span className='flex items-center gap-2 rounded-full bg-gray-800/80 px-3 py-1 text-xs font-medium text-gray-400'>
											Inactive
										</span>
									)}
								</CardTitle>
								<CardDescription className='text-gray-400 text-xs'>
									{activeMode === 'stream'
										? 'RTSP stream configuration and health metrics'
										: 'Real-time AI accident detection inference logs'}
								</CardDescription>
							</CardHeader>

							<CardContent className='flex flex-grow flex-col p-0'>
								{activeMode === 'stream' ? (
									<div className='flex flex-col gap-5 p-6'>
										<div className='rounded-lg border border-gray-800 bg-gray-800/40 p-4'>
											<h4 className='text-xs font-semibold uppercase tracking-wider text-gray-400'>
												Stream Endpoint
											</h4>
											<p className='mt-1 break-all font-mono text-xs text-blue-400'>
												{selectedCCTV.rtspUrl}
											</p>
										</div>

										<div className='grid grid-cols-2 gap-4'>
											<div className='rounded-lg border border-gray-800 bg-gray-800/30 p-3'>
												<span className='text-xs text-gray-400'>Stream Status</span>
												<div className='mt-1 flex items-center gap-2'>
													<span
														className={cn(
															'h-2 w-2 rounded-full',
															streamStatus.online ? 'bg-green-500' : 'bg-amber-500'
														)}
													/>
													<span className='text-sm font-semibold capitalize'>
														{streamStatus.online ? 'Online' : 'Offline'}
													</span>
												</div>
											</div>

											<div className='rounded-lg border border-gray-800 bg-gray-800/30 p-3'>
												<span className='text-xs text-gray-400'>FPS / Quality</span>
												<p className='mt-1 text-sm font-semibold'>
													{streamStatus.fps ? `${streamStatus.fps} FPS` : '24.0 FPS'}
												</p>
											</div>
										</div>

										<div className='rounded-lg border border-gray-800 bg-gray-800/30 p-4'>
											<h4 className='text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2'>
												Camera Capabilities
											</h4>
											<div className='space-y-2 text-xs text-gray-300'>
												<div className='flex justify-between py-1 border-b border-gray-800/50'>
													<span className='text-gray-400'>Has Accident Video Attached:</span>
													<span>{selectedCCTV.hasAccidentVideo ? 'Yes' : 'No'}</span>
												</div>
												<div className='flex justify-between py-1 border-b border-gray-800/50'>
													<span className='text-gray-400'>Backend Transcoder:</span>
													<span>FastAPI MJPEG Streamer</span>
												</div>
												<div className='flex justify-between py-1'>
													<span className='text-gray-400'>AI Detection Engine:</span>
													<span>YOLO + Supervision ByteTrack</span>
												</div>
											</div>
										</div>

										<div className='flex gap-3 pt-2'>
											<Button
												className='flex-1 gap-2 bg-blue-600 hover:bg-blue-700 text-white'
												onClick={() => handleModeSwitch('analyze')}>
												<Activity className='h-4 w-4' />
												Start Accident Analysis
											</Button>
											<Button
												variant='outline'
												className='gap-2 border-gray-700 hover:bg-gray-800'
												onClick={() => checkCameraStream(selectedCCTV)}>
												<RefreshCw className='h-4 w-4' />
												Test Connection
											</Button>
										</div>
									</div>
								) : (
									<>
										<ScrollArea className='h-[360px] flex-grow px-6 py-4'>
											<div className='min-h-[300px] space-y-2'>
												{logs.length === 0 ? (
													<div className='flex h-72 flex-col items-center justify-center text-gray-500'>
														<div className='mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gray-800/50'>
															<Search className='h-6 w-6 text-gray-600' />
														</div>
														<p className='font-medium text-gray-400 text-sm'>
															No detection logs yet
														</p>
														<p className='mt-1 text-xs text-gray-500'>
															Inference updates will appear here in real-time
														</p>
													</div>
												) : (
													<>
														{logs.map((log, index) => (
															<div
																key={index}
																className={cn(
																	'flex items-start rounded-lg px-3 py-2 text-xs transition-colors',
																	log.severity === 'error'
																		? 'border-l-4 border-red-500 bg-red-900/40 text-red-200'
																		: log.severity === 'warning'
																			? 'border-l-4 border-amber-500 bg-amber-900/30 text-amber-200'
																			: 'border-l-4 border-blue-500/50 bg-gray-800/40 text-gray-300'
																)}>
																<span className='mr-3 shrink-0 rounded bg-black/20 px-1.5 py-0.5 font-mono text-[11px]'>
																	{log.time}
																</span>
																<span className='font-medium'>{log.message}</span>
															</div>
														))}
														<div ref={logsEndRef} />
													</>
												)}
											</div>
										</ScrollArea>

										<div className='border-t border-gray-800 p-4 text-xs text-gray-500'>
											{logs.length > 0 ? (
												<div className='flex items-center justify-between'>
													<span>Total entries: {logs.length}</span>
													<span>Last update: {logs[logs.length - 1].time}</span>
												</div>
											) : (
												<div className='text-center'>
													Detection logs will appear here in real-time
												</div>
											)}
										</div>
									</>
								)}
							</CardContent>
						</Card>
					</div>
				)}
			</div>

			<CCTVSelectionDialog
				open={showSelectionDialog}
				onClose={() => setShowSelectionDialog(false)}
				cctvs={cctvs}
				onSelect={handleCameraSelect}
			/>
		</Dashboard>
	);
}
