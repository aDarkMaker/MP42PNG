import { useState, useRef, useEffect } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { VideoConfig, ConversionStep } from '../types';
import { Button } from '../components/Button';
import { VideoConverter } from '../utils/converter';
import selectFileIcon from '../assets/select-file.svg';
import folderIcon from '../assets/folder.svg';
import '../styles/VideoToPngPage.css';

export function VideoToPngPage() {
	const [currentStep, setCurrentStep] = useState<ConversionStep>('select');
	const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
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
	const fileInputRef = useRef<HTMLInputElement>(null);
	const videoRef = useRef<HTMLVideoElement>(null);

	const formatDuration = (seconds: number): string => {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	};

	const calculateFrames = async (file: File, fps: number) => {
		try {
			const videoInfo = await VideoConverter.getVideoInfo(file);
			setVideoDuration(videoInfo.duration);
			const frames = VideoConverter.calculateFrameCount(videoInfo.duration, fps);
			setTotalFrames(frames);
		} catch (error) {
			console.error('计算帧数失败:', error);
			setTotalFrames(null);
		}
	};

	const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (file && file.type.startsWith('video/')) {
			setSelectedVideo(file);
			const url = URL.createObjectURL(file);
			setVideoPreviewUrl(url);
			setConfig({
				...config,
				outputName: file.name.replace(/\.[^/.]+$/, '') + '_frames.zip',
			});
			setCurrentStep('config');
			// 计算帧数
			await calculateFrames(file, config.fps);
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
			// 计算帧数
			await calculateFrames(file, config.fps);
		}
	};

	const handleDragOver = (event: React.DragEvent) => {
		event.preventDefault();
	};

	const handleStartConversion = async () => {
		if (!selectedVideo) return;
		
		setCurrentStep('converting');
		setProgress(0);
		
		try {
			const result = await VideoConverter.convert(
				selectedVideo,
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
		
		const success = await VideoConverter.exportZip(tempDir, (progress) => {
			setExportProgress(progress);
		});
		
		setIsExporting(false);
		
		if (success) {
			// 稍微延迟一下弹出成功界面，让进度条 100% 的状态停留一会儿，体验更自然
			setTimeout(() => {
				setShowSuccess(true);
				setTempDir(null);
				setPreviewPaths([]);
			}, 600);
		}
	};

	const handleFinish = () => {
		// 先触发一个淡出状态（通过 CSS 类控制），再进行实际的界面切换
		const section = document.querySelector('.section');
		if (section) {
			section.classList.add('fadeOut');
		}
		
		setTimeout(() => {
			setShowSuccess(false);
			setCurrentStep('select');
			setSelectedVideo(null);
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
	};

	// 当 FPS 改变时重新计算帧数
	useEffect(() => {
		if (selectedVideo && config.fps > 0) {
			calculateFrames(selectedVideo, config.fps);
		}
	}, [config.fps]);

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
					onClick={() => fileInputRef.current?.click()}
				>
					<h3 className="dropTitle">拖拽视频文件到此处</h3>
					<p className="dropSubtitle">或点击选择文件</p>
					<input
						ref={fileInputRef}
						type="file"
						accept="video/mp4,video/quicktime,video/*"
						onChange={handleFileSelect}
						className="fileInput"
					/>
				</div>
			)}

			{currentStep === 'config' && selectedVideo && (
				<div className="section">
					<div className="card">
						<h3 className="cardTitle">
							<img src={selectFileIcon} alt="视频" className="cardIcon" />
							<span className="videoName">{selectedVideo.name.replace(/\.[^/.]+$/, '')}</span>
						</h3>
						<div className="videoPreview">
							<video 
								ref={videoRef}
								src={videoPreviewUrl} 
								controls 
								className="video"
								onLoadedMetadata={(e) => {
									const video = e.currentTarget;
									if (selectedVideo && config.fps > 0) {
										const duration = video.duration;
										setVideoDuration(duration);
										const frames = VideoConverter.calculateFrameCount(duration, config.fps);
										setTotalFrames(frames);
									}
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
									min="0.1"
									step="0.1"
									value={config.fps}
									onChange={(e) => setConfig({ ...config, fps: parseFloat(e.target.value) || 1 })}
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
