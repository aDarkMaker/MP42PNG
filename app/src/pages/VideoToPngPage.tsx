import { useState, useRef, useEffect } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { VideoConfig, ConversionStep } from '../types';
import { Button } from '../components/Button';
import { VideoConverter } from '../utils/converter';
import selectFileIcon from '../assets/select-file.svg';
import '../styles/VideoToPngPage.css';

export function VideoToPngPage() {
	const [currentStep, setCurrentStep] = useState<ConversionStep>('select');
	const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
	const [videoPath, setVideoPath] = useState<string | null>(null);
	const [videoPreviewUrl, setVideoPreviewUrl] = useState<string>('');
	const [config, setConfig] = useState<VideoConfig>({
		fps: 1,
		outputName: '',
	});
	const [progress, setProgress] = useState(0);
	const [totalFrames, setTotalFrames] = useState<number | null>(null);
	const [videoDuration, setVideoDuration] = useState<number>(0);
	const [outputPath, setOutputPath] = useState<string | null>(null);
	const [tempDir, setTempDir] = useState<string | null>(null);
	const [previewFrames, setPreviewPaths] = useState<string[]>([]);
	const [isExporting, setIsExporting] = useState(false);
	const [exportProgress, setExportProgress] = useState(0);
	const [showSuccess, setShowSuccess] = useState(false);
	const videoRef = useRef<HTMLVideoElement>(null);

	const formatDuration = (seconds: number): string => {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	};

	const calculateFrames = async (input: File | string, fps: number) => {
		try {
			const videoInfo = await VideoConverter.getVideoInfo(input);
			setVideoDuration(videoInfo.duration);
			const frames = VideoConverter.calculateFrameCount(videoInfo.duration, fps);
			setTotalFrames(frames);
		} catch (error) {
			console.error('计算帧数失败:', error);
			setTotalFrames(null);
		}
	};

	const handleDrop = async (event: React.DragEvent) => {
		event.preventDefault();
		const file = event.dataTransfer.files[0];
		if (file && file.type.startsWith('video/')) {
			setSelectedVideo(file);
			const url = URL.createObjectURL(file);
			setVideoPreviewUrl(url);
			setConfig({
				...config,
				outputName: file.name.replace(/\.[^/.]+$/, '') + '_frames.zip',
			});
			setCurrentStep('config');
			await calculateFrames(file, config.fps);
		}
	};

	const handleDragOver = (event: React.DragEvent) => {
		event.preventDefault();
	};

	const handleStartConversion = async () => {
		if (!selectedVideo && !videoPath) return;
		
		localStorage.setItem('last_output_name', config.outputName.endsWith('.zip') ? config.outputName : `${config.outputName}.zip`);

		setCurrentStep('converting');
		setProgress(0);
		
		try {
			const result = await VideoConverter.convert(
				selectedVideo || videoPath!,
				config,
				(progress) => {
					setProgress(progress.percentage);
				}
			);
			
			console.log('转换结果:', result);
			setTempDir(result.tempDir);
			setPreviewPaths(result.framePaths);
			setTotalFrames(result.framePaths.length);
			setCurrentStep('preview');
		} catch (error) {
			console.error('转换失败:', error);
			alert(`转换失败: ${error}`);
			setCurrentStep('config');
		}
	};

	const handleExport = async () => {
		if (!tempDir) {
			alert('没有可导出的文件');
			return;
		}
		
		setIsExporting(true);
		setExportProgress(0);
		
		const autoSaveEnabled = localStorage.getItem('auto_save_enabled') === 'true';
		const defaultPath = localStorage.getItem('default_download_path');
		
		let success = false;
		if (autoSaveEnabled && defaultPath) {
			success = await VideoConverter.exportZip(tempDir, (progress) => {
				setExportProgress(progress);
			}, defaultPath);
		} else {
			success = await VideoConverter.exportZip(tempDir, (progress) => {
				setExportProgress(progress);
			});
		}
		
		setIsExporting(false);
		
		if (success) {
			setTimeout(() => {
				setShowSuccess(true);
				setTempDir(null);
				setPreviewPaths([]);
			}, 600);
		}
	};

	const handleFinish = () => {
		const section = document.querySelector('.section');
		if (section) {
			section.classList.add('fadeOut');
		}
		
		setTimeout(() => {
			setShowSuccess(false);
			setCurrentStep('select');
			setSelectedVideo(null);
			setVideoPath(null);
			setVideoPreviewUrl('');
			setTotalFrames(null);
			setVideoDuration(0);
			setOutputPath(null);
		}, 400);
	};

	const handleCancelPreview = async () => {
		if (tempDir) {
			await VideoConverter.cleanup(tempDir);
		}
		setTempDir(null);
		setPreviewPaths([]);
		setCurrentStep('select');
		setSelectedVideo(null);
		setVideoPath(null);
	};

	useEffect(() => {
		if ((selectedVideo || videoPath) && config.fps > 0) {
			calculateFrames(selectedVideo || videoPath!, config.fps);
		}
	}, [config.fps]);

	useEffect(() => {
		let unlisten: (() => void) | undefined;
		
		const setupListener = async () => {
			const { listen } = await import('@tauri-apps/api/event');
			const { getCurrentWebview } = await import('@tauri-apps/api/webview');
			
			unlisten = await listen<{ paths: string[] }>('tauri://drag-drop', async (event) => {
				const path = event.payload.paths[0];
				if (path && (path.endsWith('.mp4') || path.endsWith('.mov') || path.endsWith('.avi') || path.endsWith('.mkv'))) {
					setVideoPath(path);
					setSelectedVideo(null);
					
					setVideoPreviewUrl(convertFileSrc(path));
					
					const fileName = path.split(/[/\\]/).pop() || '';
					setConfig({
						...config,
						outputName: fileName.replace(/\.[^/.]+$/, '') + '_frames.zip',
					});
					
					setCurrentStep('config');
					await calculateFrames(path, config.fps);
				}
			});
		};

		setupListener();
		return () => {
			if (unlisten) unlisten();
		};
	}, []);

	const handleSelectFile = async () => {
		const path = await VideoConverter.selectVideo();
		if (path) {
			setVideoPath(path);
			setSelectedVideo(null);
			setVideoPreviewUrl(convertFileSrc(path));
			
			const fileName = path.split(/[/\\]/).pop() || '';
			setConfig({
				...config,
				outputName: fileName.replace(/\.[^/.]+$/, '') + '_frames.zip',
			});
			setCurrentStep('config');
			await calculateFrames(path, config.fps);
		}
	};

	return (
		<div className="page">
			<div className="header">
				<h2 className="title">手书抽帧</h2>
			</div>

			{currentStep === 'select' && (
				<div
					onDrop={handleDrop}
					onDragOver={handleDragOver}
					className="dropZone"
					onClick={handleSelectFile}
				>
					<h3 className="dropTitle">拖拽视频文件到此处</h3>
					<p className="dropSubtitle">或点击选择文件</p>
				</div>
			)}

			{currentStep === 'config' && (selectedVideo || videoPath) && (
				<div className="section">
					<div className="card">
						<h3 className="cardTitle">
							<img src={selectFileIcon} alt="视频" className="cardIcon" />
							<span className="videoName">
								{(selectedVideo?.name || videoPath?.split(/[/\\]/).pop() || '').replace(/\.[^/.]+$/, '')}
							</span>
						</h3>
						<div className="videoPreview">
							<video 
								ref={videoRef}
								src={videoPreviewUrl} 
								controls 
								className="video"
								onLoadedMetadata={(e) => {
									const video = e.currentTarget;
									const duration = video.duration;
									setVideoDuration(duration);
									const frames = VideoConverter.calculateFrameCount(duration, config.fps);
									setTotalFrames(frames);
								}}
							/>
						</div>
					</div>

					<div className="card">
						<h3 className="cardTitle">提取配置</h3>
						<div className="form">
							<div className="formGroup">
								<label className="formLabel">
									FPS
								</label>
								<input
									type="number"
									min="1"
									step="1"
									value={config.fps || ''}
									onChange={(e) => {
										const val = e.target.value;
										setConfig({ ...config, fps: val === '' ? 0 : parseInt(val, 10) });
									}}
									onBlur={() => {
										if (!config.fps || config.fps <= 0) {
											setConfig({ ...config, fps: 1 });
										}
									}}
									className="formInput"
								/>
							</div>
							<div className="formGroup">
								<label className="formLabel">保存为</label>
								<input
									type="text"
									value={config.outputName}
									onChange={(e) => setConfig({ ...config, outputName: e.target.value })}
									className="formInput"
								/>
							</div>
						</div>
					</div>

					<div className="actions">
						<Button
							variant="secondary"
							onClick={() => {
								setCurrentStep('select');
								setSelectedVideo(null);
								setVideoPreviewUrl('');
								setTotalFrames(null);
								setVideoDuration(0);
								setOutputPath(null);
							}}
						>
							重新选择
						</Button>
						<Button className="buttonFull" onClick={handleStartConversion}>
							开始转换
						</Button>
					</div>
				</div>
			)}

			{currentStep === 'converting' && (
				<div className="converting">
					<div>
						<div className="spinner"></div>
						<h3 className="convertingTitle">正在为您处理……</h3>
					</div>
					<div className="progressContainer">
						<div className="progressBar">
							<div className="progressFill" style={{ width: `${progress}%` }}></div>
						</div>
						<p className="progressText">{progress}%</p>
					</div>
				</div>
			)}

			{currentStep === 'preview' && (
				<div className="section">
					<div className="card">
						<h3 className="cardTitle">{showSuccess ? '导出成功' : '预览分帧'}</h3>
						
						{showSuccess ? (
							<div className="successContent">
								<div className="successIcon">✓</div>
								<p className="description">
									文件已成功打包并保存到您的电脑上！
								</p>
							</div>
						) : (
							<>
								<p className="description">
									{totalFrames !== null 
										? `你还有 ${totalFrames} 张图要产哦……` 
										: '转换完成！'}
								</p>

								<div className="previewGrid">
									<div className="previewList">
										{previewFrames.map((path, i) => (
											<div key={i} className="previewItem">
												<img src={convertFileSrc(path)} alt={`Frame ${i}`} className="previewImg" />
											</div>
										))}
									</div>
								</div>
							</>
						)}
					</div>

					<div className="actions">
						{showSuccess ? (
							<Button className="buttonFull" onClick={handleFinish}>
								完成
							</Button>
						) : (
							<>
								<Button
									variant="secondary"
									onClick={handleCancelPreview}
									disabled={isExporting}
								>
									重新选择
								</Button>
								<Button 
									className="buttonFull" 
									onClick={handleExport}
									disabled={isExporting}
								>
									{isExporting ? `正在打包 ${exportProgress}%` : '开始导出'}
								</Button>
							</>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
