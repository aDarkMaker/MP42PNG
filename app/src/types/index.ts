export interface VideoConfig {
	fps: number;
	outputName: string;
}

export type ConversionStep = 'select' | 'config' | 'converting' | 'preview' | 'done';

export interface ConversionProgress {
	current: number;
	total: number;
	percentage: number;
}

export interface FrameInfo {
	index: number;
	path: string;
	thumbnail?: string;
}

export interface ConversionResult {
	frames: FrameInfo[];
	totalFrames: number;
	outputPath: string;
}
