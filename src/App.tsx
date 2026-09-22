import React, { useState, useRef, useEffect } from 'react';
import { Video, Film, Sparkles, AlertCircle, Info, RefreshCw, Layers } from 'lucide-react';
import { VideoConfig, GeneratedVideo, GenerationProgress } from './types/video';
import { VideoPlayer } from './components/VideoPlayer';
import { DownloadCard } from './components/DownloadCard';
import { PromptSection } from './components/PromptSection';
import { ProgressIndicator } from './components/ProgressIndicator';
import { VideoHistory } from './components/VideoHistory';
import { VideoRenderEngine } from './services/videoGenerator';
import {
  checkApiStatus,
  enhancePromptApi,
  generateStoryboardApi,
  startVeoGeneration,
  pollVeoStatus,
} from './services/apiClient';

export default function App() {
  const [config, setConfig] = useState<VideoConfig>({
    prompt: 'Cinematic cybernetic neon city in the rain with flying vehicles and reflective puddles',
    aspectRatio: '16:9',
    style: 'cyberpunk',
    cameraMotion: 'drift-zoom',
    duration: 6,
    fps: 30,
    includeAudio: true,
    includeCaptions: true,
    engine: 'realtime-motion',
    resolution: '720p',
  });

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isEnhancing, setIsEnhancing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [progress, setProgress] = useState<GenerationProgress>({
    phase: 'idle',
    percent: 0,
    statusText: 'Ready',
  });

  const [currentVideo, setCurrentVideo] = useState<GeneratedVideo | null>(null);
  const [history, setHistory] = useState<GeneratedVideo[]>([]);
  const [apiOnline, setApiOnline] = useState<boolean>(true);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderEngineRef = useRef<VideoRenderEngine | null>(null);

  // Check backend API connection on load
  useEffect(() => {
    checkApiStatus()
      .then((status) => {
        setApiOnline(true);
      })
      .catch(() => {
        setApiOnline(false);
      });
  }, []);

  const handleUpdateConfig = (updated: Partial<VideoConfig>) => {
    setConfig((prev) => ({ ...prev, ...updated }));
  };

  // Enhance user prompt with Gemini 3.8 Flash
  const handleEnhancePrompt = async () => {
    if (!config.prompt.trim() || isEnhancing) return;
    setIsEnhancing(true);
    setErrorMessage(null);
    try {
      const enhanced = await enhancePromptApi(config.prompt);
      setConfig((prev) => ({
        ...prev,
        prompt: enhanced,
        enhancedPrompt: enhanced,
      }));
    } catch (err: any) {
      console.warn('Enhance failed:', err);
    } finally {
      setIsEnhancing(false);
    }
  };

  // Cancel running generation
  const handleCancelGeneration = () => {
    if (renderEngineRef.current) {
      renderEngineRef.current.cancel();
    }
    setIsGenerating(false);
    setProgress({
      phase: 'idle',
      percent: 0,
      statusText: 'Generation cancelled',
    });
  };

  // Helper to sanitize error strings and remove raw JSON
  const cleanErrorString = (raw: any): string => {
    if (!raw) return 'An unexpected error occurred during generation.';
    let text = String(raw);
    if (text.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(text.trim());
        if (parsed.error?.message) {
          text = parsed.error.message;
        }
      } catch {}
    }
    if (
      text.includes('429') ||
      text.includes('RESOURCE_EXHAUSTED') ||
      text.toLowerCase().includes('quota') ||
      text.toLowerCase().includes('rate-limit')
    ) {
      return 'Google Veo 3.1 cloud video quota reached (429 RESOURCE_EXHAUSTED). Free tier API keys do not include cloud video generation credits. Click below to generate instantly using the Real-Time Engine.';
    }
    return text;
  };

  // Core execution: Real-Time Engine
  const runRealtimeGeneration = async (activeConfig: VideoConfig) => {
    setProgress({
      phase: 'analyzing',
      percent: 5,
      statusText: 'Analyzing prompt & choreographing visual cues with Gemini...',
    });

    // 1. Generate Scene Choreography / Storyboard
    const storyboard = await generateStoryboardApi(activeConfig);

    setProgress({
      phase: 'synthesizing',
      percent: 10,
      statusText: `Rendering scene: "${storyboard.title}"...`,
    });

    // 2. Initialize Real-Time Renderer
    const engine = new VideoRenderEngine();
    renderEngineRef.current = engine;

    const video = await engine.renderVideo(
      activeConfig,
      storyboard,
      (prog) => setProgress(prog),
      previewCanvasRef.current
    );

    setCurrentVideo(video);
    setHistory((prev) => [video, ...prev.filter((v) => v.id !== video.id)]);
  };

  // Immediate 1-click fallback trigger
  const handleGenerateRealTimeDirect = async () => {
    setErrorMessage(null);
    setFallbackNotice(null);
    const updated = { ...config, engine: 'realtime-motion' as const };
    setConfig(updated);
    setIsGenerating(true);

    try {
      await runRealtimeGeneration(updated);
    } catch (err: any) {
      console.error('Direct real-time generation failed:', err);
      setErrorMessage(cleanErrorString(err.message));
      setProgress({
        phase: 'failed',
        percent: 0,
        statusText: 'Generation failed',
      });
    } finally {
      setIsGenerating(false);
      renderEngineRef.current = null;
    }
  };

  // Main Generation Handler
  const handleGenerateVideo = async () => {
    if (!config.prompt.trim() || isGenerating) return;

    setErrorMessage(null);
    setFallbackNotice(null);
    setIsGenerating(true);

    try {
      if (config.engine === 'realtime-motion') {
        // --- REAL-TIME ENGINE ---
        await runRealtimeGeneration(config);
      } else {
        // --- GOOGLE VEO 3.1 NEURAL ENGINE ---
        setProgress({
          phase: 'analyzing',
          percent: 10,
          statusText: 'Sending request to Google Veo 3.1 neural video model...',
        });

        let operationName = '';
        try {
          operationName = await startVeoGeneration(config);
        } catch (veoStartErr: any) {
          const rawMsg = String(veoStartErr?.message || '');
          const isQuota =
            veoStartErr?.isQuota ||
            rawMsg.includes('429') ||
            rawMsg.includes('RESOURCE_EXHAUSTED') ||
            rawMsg.toLowerCase().includes('quota');

          if (isQuota) {
            console.warn('Veo quota reached. Gracefully auto-falling back to Real-Time Engine...');
            setFallbackNotice(
              'Veo 3.1 Cloud Quota Exceeded (Free API Key). Automatically synthesizing your video with the Instant Real-Time Engine so you get your video without waiting.'
            );
            const fallbackCfg = { ...config, engine: 'realtime-motion' as const };
            setConfig(fallbackCfg);
            await runRealtimeGeneration(fallbackCfg);
            return;
          }
          throw veoStartErr;
        }

        setProgress({
          phase: 'synthesizing',
          percent: 25,
          statusText: 'Veo model processing diffusion latents in Cloud Run...',
        });

        // Poll for completion
        let done = false;
        let attempts = 0;
        const maxAttempts = 60; // Up to ~3 minutes

        while (!done && attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 3500));
          attempts++;

          const status = await pollVeoStatus(operationName);
          if (status.error) {
            const isQuota =
              status.error.includes('429') ||
              status.error.includes('RESOURCE_EXHAUSTED') ||
              status.error.toLowerCase().includes('quota');

            if (isQuota) {
              setFallbackNotice(
                'Veo 3.1 cloud task hit quota limits. Automatically switching to Real-Time Engine...'
              );
              const fallbackCfg = { ...config, engine: 'realtime-motion' as const };
              setConfig(fallbackCfg);
              await runRealtimeGeneration(fallbackCfg);
              return;
            }
            throw new Error(status.error);
          }

          const currentPercent = Math.min(92, 25 + attempts * 2);
          setProgress({
            phase: 'synthesizing',
            percent: currentPercent,
            statusText: `Generating neural frames with Veo 3.1 (${attempts * 3.5}s elapsed)...`,
          });

          if (status.done) {
            done = true;
          }
        }

        if (!done) {
          throw new Error('Veo video generation timed out. Please try again.');
        }

        setProgress({
          phase: 'encoding',
          percent: 95,
          statusText: 'Retrieving completed video stream from Google storage...',
        });

        const downloadUrl = `/api/veo/download?operationName=${encodeURIComponent(operationName)}`;
        const videoRes = await fetch(downloadUrl);
        if (!videoRes.ok) {
          throw new Error('Failed to download completed video stream');
        }

        const blob = await videoRes.blob();
        const videoUrl = URL.createObjectURL(blob);

        const veoVideo: GeneratedVideo = {
          id: `veo-${Date.now()}`,
          prompt: config.prompt,
          title: 'Veo 3.1 Neural Video',
          videoUrl,
          downloadUrl: videoUrl,
          blob,
          mimeType: 'video/mp4',
          fileSizeFormatted: `${(blob.size / (1024 * 1024)).toFixed(1)} MB`,
          aspectRatio: config.aspectRatio,
          duration: config.duration,
          resolution: config.resolution === '1080p' ? '1920×1080' : '1280×720',
          style: config.style,
          engine: 'veo-neural',
          createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };

        setCurrentVideo(veoVideo);
        setHistory((prev) => [veoVideo, ...prev]);
      }
    } catch (err: any) {
      console.error('Generation failed:', err);
      const msg = cleanErrorString(err.message);
      setErrorMessage(msg);
      setProgress({
        phase: 'failed',
        percent: 0,
        statusText: 'Generation failed',
      });
    } finally {
      setIsGenerating(false);
      renderEngineRef.current = null;
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col selection:bg-sky-500/30 selection:text-sky-200">
      {/* Top Application Header */}
      <header id="main-app-header" className="w-full border-b border-neutral-800/80 bg-neutral-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-white tracking-tight flex items-center gap-2">
                <span>Text to Video Generator</span>
              </h1>
              <p className="text-[11px] text-neutral-400">
                Responsive AI Model with Direct Export
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-950 border border-neutral-800 text-xs text-neutral-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Gemini 3.8 & Veo Engine</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
        {/* Automatic Fallback Notification Banner */}
        {fallbackNotice && (
          <div id="app-fallback-banner" className="mb-6 p-4 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-200 text-sm flex items-start justify-between gap-3 shadow-lg">
            <div className="flex items-start gap-2.5">
              <Sparkles className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-300">Auto-Fallback Activated</p>
                <p className="text-xs text-amber-200/90 mt-0.5 leading-relaxed">{fallbackNotice}</p>
              </div>
            </div>
            <button
              id="dismiss-fallback-btn"
              type="button"
              onClick={() => setFallbackNotice(null)}
              className="text-xs text-amber-400 hover:text-amber-200 underline shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Error Notification Banner */}
        {errorMessage && (
          <div id="app-error-banner" className="mb-6 p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-sm flex items-start justify-between gap-3 shadow-lg">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="font-semibold text-red-300">Generation Notice</p>
                <p className="text-xs text-red-200/90 leading-relaxed">{errorMessage}</p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    id="error-switch-and-generate-btn"
                    type="button"
                    onClick={handleGenerateRealTimeDirect}
                    className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-semibold text-xs shadow-md shadow-sky-500/20 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>⚡ Generate with Real-Time Engine (Instant & Free)</span>
                  </button>
                </div>
              </div>
            </div>
            <button
              id="dismiss-error-btn"
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-xs text-red-400 hover:text-red-200 underline shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Configuration & Prompt Input (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            <PromptSection
              config={config}
              onChangeConfig={handleUpdateConfig}
              onGenerate={handleGenerateVideo}
              isGenerating={isGenerating}
              onEnhancePrompt={handleEnhancePrompt}
              isEnhancing={isEnhancing}
            />

            {/* Quick Engine Feature Guide */}
            <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-5 text-xs text-neutral-400 space-y-2.5">
              <div className="flex items-center gap-2 text-neutral-200 font-semibold">
                <Info className="w-4 h-4 text-sky-400" />
                <span>How Real-Time Processing Works</span>
              </div>
              <ul className="space-y-1.5 list-disc list-inside text-neutral-400 text-[11px] leading-relaxed">
                <li>
                  <strong className="text-neutral-300">Semantic Scene Direction:</strong> Analyzed by <code className="text-sky-300">gemini-3.8-flash</code> for lighting, color harmony, and kinetic motion paths.
                </li>
                <li>
                  <strong className="text-neutral-300">Procedural Kinematics:</strong> Live multi-layer shaders, particles, and 3D camera orbits rendered directly at 30/60fps.
                </li>
                <li>
                  <strong className="text-neutral-300">Direct Download:</strong> Output files are packaged into standard MP4/WebM containers ready for instant download.
                </li>
              </ul>
            </div>
          </div>

          {/* Right Column: Active Video Output & Player (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* 1. If currently generating: Show Live Progress Indicator */}
            {isGenerating && (
              <ProgressIndicator
                progress={progress}
                canvasRef={previewCanvasRef}
                onCancel={handleCancelGeneration}
                aspectRatio={config.aspectRatio}
              />
            )}

            {/* 2. If a video is available: Show Interactive Player & Download Card */}
            {!isGenerating && currentVideo && (
              <div className="space-y-6">
                <VideoPlayer video={currentVideo} />
                <DownloadCard
                  video={currentVideo}
                  onNewPrompt={() => {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                />
              </div>
            )}

            {/* 3. Empty State / Placeholder when no video has been generated yet */}
            {!isGenerating && !currentVideo && (
              <div id="video-empty-state" className="w-full bg-neutral-900/60 border border-neutral-800 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-neutral-950 border border-neutral-800 flex items-center justify-center text-neutral-500 mb-4 shadow-inner">
                  <Video className="w-8 h-8 text-sky-500/70" />
                </div>
                <h3 className="text-base font-bold text-white mb-1">
                  Ready to Generate Your Video
                </h3>
                <p className="text-xs text-neutral-400 max-w-sm mb-6 leading-relaxed">
                  Enter any creative prompt on the left, choose your preferred visual style and duration, and click Generate Video.
                </p>
                <button
                  id="empty-state-generate-btn"
                  type="button"
                  onClick={handleGenerateVideo}
                  className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-semibold text-xs shadow-md shadow-sky-500/20 transition-all cursor-pointer flex items-center gap-2"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generate Sample Video</span>
                </button>
              </div>
            )}

            {/* 4. Generation History Section */}
            {history.length > 0 && (
              <VideoHistory
                videos={history}
                currentVideoId={currentVideo?.id}
                onSelectVideo={(v) => {
                  setCurrentVideo(v);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-neutral-800/80 py-6 text-center text-xs text-neutral-500">
        <p>Text to Video AI • Real-Time Processing & Direct Video Export</p>
      </footer>
    </div>
  );
}
