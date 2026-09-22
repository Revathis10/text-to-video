export type AspectRatio = '16:9' | '9:16' | '1:1';
export type VideoStyle = 'cinematic' | 'cyberpunk' | 'nature' | 'space' | 'synthwave' | 'minimal';
export type CameraMotion = 'drift-zoom' | 'orbit' | 'hyperlapse' | 'ambient-shimmer' | 'dramatic-tilt';
export type EngineMode = 'realtime-motion' | 'veo-neural';

export interface VideoConfig {
  prompt: string;
  enhancedPrompt?: string;
  aspectRatio: AspectRatio;
  style: VideoStyle;
  cameraMotion: CameraMotion;
  duration: number; // in seconds, e.g. 4, 6, 8
  fps: number; // 30 or 60
  includeAudio: boolean;
  includeCaptions: boolean;
  engine: EngineMode;
  resolution: '720p' | '1080p';
}

export interface StoryboardData {
  title: string;
  theme: VideoStyle;
  cameraMotion: CameraMotion;
  palette: {
    bgTop: string;
    bgBottom: string;
    primary: string;
    secondary: string;
    accent: string;
    glow: string;
  };
  visualElements: string[];
  captions: string[];
  particleCount: number;
  particleSpeed: number;
  audioMood: 'ambient-drone' | 'synth-pulse' | 'space-ethereal' | 'calm-nature';
  cameraSpeed: number;
}

export interface GeneratedVideo {
  id: string;
  prompt: string;
  title: string;
  videoUrl: string;
  downloadUrl: string;
  blob?: Blob;
  mimeType: string;
  fileSizeFormatted: string;
  aspectRatio: AspectRatio;
  duration: number;
  resolution: string;
  style: VideoStyle;
  engine: EngineMode;
  createdAt: string;
}

export interface GenerationProgress {
  phase: 'idle' | 'analyzing' | 'synthesizing' | 'encoding' | 'completed' | 'failed';
  percent: number;
  statusText: string;
  currentFrame?: number;
  totalFrames?: number;
}
