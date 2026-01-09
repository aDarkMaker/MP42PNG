import { invoke } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';
import { mkdir, writeFile, copyFile } from '@tauri-apps/plugin-fs';
import { open, save } from '@tauri-apps/plugin-dialog';
import type { VideoConfig, ConversionProgress } from '../types';

interface ConversionConfig {
	input_path: string;
	output_name: string;
	fps: number;
}

interface ConversionResult {
	success: boolean;
	temp_dir: string | null;
	frame_paths: string[] | null;
	total_frames: number | null;
	error: string | null;
}

export interface ProcessedVideo {
	tempDir: string;
	framePaths: string[];
}

interface VideoInfo {
	duration: number;
	fps: number;
	total_frames: number;
}

export class VideoConverter {
	static async getVideoInfo(videoInput: File | string): Promise<VideoInfo> {
		if (typeof videoInput === 'string') {
			try {
				return await invoke<VideoInfo>('get_video_info', { videoPath: videoInput });
			} catch (error) {
				throw new Error(`获取视频信息失败: ${error}`);
			}
		}

		try {
			return new Promise((resolve, reject) => {
				const video = document.createElement('video');
				video.preload = 'metadata';
				video.src = URL.createObjectURL(videoInput);
				
				video.onloadedmetadata = () => {
					URL.revokeObjectURL(video.src);
					const duration = video.duration;
					const estimatedFps = 5;
					const totalFrames = Math.floor(duration * estimatedFps);
					
					resolve({
						duration,
						fps: estimatedFps,
						total_frames: totalFrames,
					});
				};
				
				video.onerror = () => {
					URL.revokeObjectURL(video.src);
					reject(new Error('无法加载视频文件'));
				};
			});
		} catch (error) {
			throw new Error(`获取视频信息失败: ${error}`);
		}
	}

	static calculateFrameCount(duration: number, targetFps: number): number {
		return Math.floor(duration * targetFps);
	}

	static async convert(
		videoInput: File | string,
		config: VideoConfig,
		onProgress?: (progress: ConversionProgress) => void
	): Promise<ProcessedVideo> {
		try {
			const { listen } = await import('@tauri-apps/api/event');
			const videoInfo = await this.getVideoInfo(videoInput);
			const totalFrames = this.calculateFrameCount(videoInfo.duration, config.fps);
			
			let videoPath: string;
			if (typeof videoInput === 'string') {
				videoPath = videoInput;
			} else {
				videoPath = await this.saveVideoToTemp(videoInput);
			}
			
			const conversionConfig: ConversionConfig = {
				input_path: videoPath,
				output_name: config.outputName,
				fps: config.fps,
			};

			let unlisten: (() => void) | undefined;
			if (onProgress) {
				unlisten = await listen<number>('conversion-progress', (event) => {
					onProgress({
						current: Math.floor((event.payload / 100) * totalFrames),
						total: totalFrames,
						percentage: event.payload,
					});
				});
			}

			try {
				const result = await invoke<ConversionResult>('convert_video', { config: conversionConfig });

				if (!result.success) {
					throw new Error(result.error || '转换失败');
				}

				onProgress?.({
					current: totalFrames,
					total: totalFrames,
					percentage: 100,
				});

				return {
					tempDir: result.temp_dir || '',
					framePaths: result.frame_paths || []
				};
			} finally {
				if (unlisten) unlisten();
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			
			if (errorMessage.includes('undefined (reading \'invoke\')') || errorMessage.includes('window.__TAURI__')) {
				throw new Error('请在 Tauri 窗口中运行此应用，并确保后端已启动。');
			}
			
			throw new Error(`转换失败: ${errorMessage}`);
		}
	}

	private static async saveVideoToTemp(videoFile: File): Promise<string> {
		try {
			const appData = await appDataDir();
			const videoDir = await join(appData, 'videos');
			
			try {
				await mkdir(videoDir, { recursive: true });
			} catch (e) {
			}
			
			const videoPath = await join(videoDir, videoFile.name);
			const arrayBuffer = await videoFile.arrayBuffer();
			const bytes = new Uint8Array(arrayBuffer);
			
			await writeFile(videoPath, bytes);
			return videoPath;
		} catch (error) {
			return videoFile.name;
		}
	}

	static async selectVideo(): Promise<string | null> {
		try {
			const selected = await open({
				filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'avi', 'mkv'] }],
				multiple: false,
			});
			return typeof selected === 'string' ? selected : null;
		} catch (error) {
			return null;
		}
	}

	static async exportZip(tempDir: string, onProgress?: (percentage: number) => void, forcedPath?: string): Promise<boolean> {
		try {
			const { listen } = await import('@tauri-apps/api/event');
			const { join } = await import('@tauri-apps/api/path');
			
			let destination: string | null = null;

			if (forcedPath) {
				// 获取当前配置的文件名
				const savedOutputName = localStorage.getItem('last_output_name') || 'frames.zip';
				destination = await join(forcedPath, savedOutputName);
			} else {
				destination = await save({
					filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
					defaultPath: 'frames.zip',
				});
			}
			
			if (destination) {
				let unlisten: (() => void) | undefined;
				if (onProgress) {
					unlisten = await listen<number>('export-progress', (event) => {
						onProgress(event.payload);
					});
				}

				try {
					await invoke('export_to_zip', { 
						tempDir, 
						targetZipPath: destination 
					});
					return true;
				} finally {
					if (unlisten) unlisten();
				}
			}
			return false;
		} catch (error) {
			console.error('Export failed:', error);
			return false;
		}
	}

	static async cleanup(tempDir: string): Promise<void> {
		try {
			await invoke('cleanup_temp', { tempDir });
		} catch (e) {
			console.error('Cleanup failed:', e);
		}
	}
}
