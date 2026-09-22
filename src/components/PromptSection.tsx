import React, { useState } from 'react';
import { Sparkles, Wand2, Video, Sliders, Volume2, Layers, Compass, Loader2 } from 'lucide-react';
import { VideoConfig, AspectRatio, VideoStyle, CameraMotion, EngineMode } from '../types/video';

interface PromptSectionProps {
  config: VideoConfig;
  onChangeConfig: (updated: Partial<VideoConfig>) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  onEnhancePrompt: () => Promise<void>;
  isEnhancing: boolean;
}

const INSPIRATION_PROMPTS = [
  'Cyberpunk neon rain city with flying hovercrafts and reflective puddles',
  'Deep space cosmic nebula with a swirling accretion disk and starlight burst',
  'Serene dawn mist rising over alpine mountains with golden morning light',
  'Retro 80s synthwave horizon with glowing neon wireframe grid and magenta sun',
  'Cinematic anamorphic drone sweep across a volcanic ocean coastline',
  'Minimalist sacred geometric crystal prism refracting rainbow light waves',
];

export const PromptSection: React.FC<PromptSectionProps> = ({
  config,
  onChangeConfig,
  onGenerate,
  isGenerating,
  onEnhancePrompt,
  isEnhancing,
}) => {
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  const styleOptions: { id: VideoStyle; label: string; desc: string }[] = [
    { id: 'cinematic', label: 'Cinematic', desc: 'Anamorphic lens, volumetric light' },
    { id: 'cyberpunk', label: 'Cyberpunk', desc: 'Neon skyscrapers, rain reflections' },
    { id: 'space', label: 'Space & Nebula', desc: 'Cosmic clouds, planets, starfields' },
    { id: 'nature', label: 'Nature & Fog', desc: 'Mountain ridges, golden hour sun' },
    { id: 'synthwave', label: 'Synthwave', desc: 'Retro 80s wireframe grid & sun' },
    { id: 'minimal', label: 'Minimal Prism', desc: 'Sacred geometry, harmonic waves' },
  ];

  const motionOptions: { id: CameraMotion; label: string }[] = [
    { id: 'drift-zoom', label: 'Drift & Zoom In' },
    { id: 'orbit', label: '3D Orbital Arc' },
    { id: 'hyperlapse', label: 'Hyperlapse Velocity' },
    { id: 'ambient-shimmer', label: 'Ambient Shimmer' },
    { id: 'dramatic-tilt', label: 'Dramatic Sky Tilt' },
  ];

  return (
    <div id="prompt-configuration-card" className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-6">
      {/* Header with Engine Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Video className="w-5 h-5 text-sky-400" />
            <span>AI Text to Video</span>
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Turn descriptive concepts into high-definition downloadable video streams.
          </p>
        </div>

        {/* Engine Mode Pill Toggle */}
        <div className="inline-flex p-1 bg-neutral-950 border border-neutral-800 rounded-xl">
          <button
            id="engine-realtime-btn"
            type="button"
            onClick={() => onChangeConfig({ engine: 'realtime-motion' })}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              config.engine === 'realtime-motion'
                ? 'bg-sky-500 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Real-Time Engine (Instant)
          </button>
          <button
            id="engine-veo-btn"
            type="button"
            onClick={() => onChangeConfig({ engine: 'veo-neural' })}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              config.engine === 'veo-neural'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Google Veo 3.1 (Cloud)
          </button>
        </div>
      </div>

      {config.engine === 'veo-neural' && (
        <div className="px-3 py-2 rounded-lg bg-purple-950/30 border border-purple-800/40 text-[11px] text-purple-200 flex items-center justify-between gap-2">
          <span>
            Google Veo cloud generation requires an API key with billing enabled. Free-tier keys will auto-fallback to the Real-Time Engine.
          </span>
          <button
            type="button"
            onClick={() => onChangeConfig({ engine: 'realtime-motion' })}
            className="text-xs font-semibold text-purple-300 hover:text-white underline shrink-0 cursor-pointer"
          >
            Use Real-Time
          </button>
        </div>
      )}

      {/* Main Text Prompt Input */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="prompt-input" className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
            Video Description / Prompt
          </label>
          <button
            id="enhance-prompt-button"
            type="button"
            disabled={!config.prompt.trim() || isEnhancing || isGenerating}
            onClick={onEnhancePrompt}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-400 hover:text-sky-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isEnhancing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Polishing with Gemini...</span>
              </>
            ) : (
              <>
                <Wand2 className="w-3.5 h-3.5" />
                <span>Enhance with Gemini</span>
              </>
            )}
          </button>
        </div>

        <div className="relative">
          <textarea
            id="prompt-input"
            rows={3}
            value={config.prompt}
            onChange={(e) => onChangeConfig({ prompt: e.target.value })}
            placeholder="e.g. Glowing neon city at night with flying vehicles and rain reflections on asphalt..."
            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-sky-500/80 focus:ring-2 focus:ring-sky-500/20 transition-all resize-none"
            disabled={isGenerating}
          />
        </div>

        {/* Prompt Inspiration Tags */}
        <div className="pt-1">
          <span className="text-[11px] font-medium text-neutral-500 block mb-1.5">
            Quick inspirations:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {INSPIRATION_PROMPTS.map((sample, idx) => (
              <button
                key={idx}
                id={`sample-prompt-chip-${idx}`}
                type="button"
                onClick={() => onChangeConfig({ prompt: sample })}
                className="text-xs px-2.5 py-1 rounded-lg bg-neutral-950/80 hover:bg-neutral-800 border border-neutral-800/80 text-neutral-300 hover:text-white transition-colors text-left"
              >
                {sample.length > 40 ? sample.slice(0, 40) + '...' : sample}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Primary Configuration Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-neutral-800/80">
        {/* Aspect Ratio */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-neutral-400 block">
            Aspect Ratio
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {(['16:9', '9:16', '1:1'] as AspectRatio[]).map((ar) => (
              <button
                key={ar}
                id={`aspect-ratio-${ar.replace(':', '-')}`}
                type="button"
                onClick={() => onChangeConfig({ aspectRatio: ar })}
                className={`py-2 px-2 rounded-lg text-xs font-semibold border text-center transition-all ${
                  config.aspectRatio === ar
                    ? 'bg-sky-500/15 border-sky-500/50 text-sky-300'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {ar === '16:9' ? '16:9 Landscape' : ar === '9:16' ? '9:16 Portrait' : '1:1 Square'}
              </button>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-neutral-400 block">
            Duration
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {[4, 6, 8].map((d) => (
              <button
                key={d}
                id={`duration-${d}s`}
                type="button"
                onClick={() => onChangeConfig({ duration: d })}
                className={`py-2 px-2 rounded-lg text-xs font-semibold border text-center transition-all ${
                  config.duration === d
                    ? 'bg-sky-500/15 border-sky-500/50 text-sky-300'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {d}s
              </button>
            ))}
          </div>
        </div>

        {/* Resolution */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-neutral-400 block">
            Resolution
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {(['720p', '1080p'] as ('720p' | '1080p')[]).map((res) => (
              <button
                key={res}
                id={`resolution-${res}`}
                type="button"
                onClick={() => onChangeConfig({ resolution: res })}
                className={`py-2 px-2 rounded-lg text-xs font-semibold border text-center transition-all ${
                  config.resolution === res
                    ? 'bg-sky-500/15 border-sky-500/50 text-sky-300'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {res === '720p' ? '720p HD' : '1080p Full HD'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Style Presets Grid */}
      <div className="space-y-2 pt-2 border-t border-neutral-800/80">
        <label className="text-xs font-semibold text-neutral-400 block">
          Visual Style & Environment
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {styleOptions.map((opt) => (
            <button
              key={opt.id}
              id={`style-opt-${opt.id}`}
              type="button"
              onClick={() => onChangeConfig({ style: opt.id })}
              className={`p-2.5 rounded-xl border text-left transition-all ${
                config.style === opt.id
                  ? 'bg-sky-500/10 border-sky-500 text-white ring-1 ring-sky-500/30'
                  : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-neutral-700'
              }`}
            >
              <div className="text-xs font-bold">{opt.label}</div>
              <div className="text-[11px] text-neutral-500 line-clamp-1 mt-0.5">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Advanced Settings Toggle */}
      <div className="pt-1">
        <button
          id="toggle-advanced-settings"
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs font-medium text-neutral-400 hover:text-neutral-200 flex items-center gap-1.5"
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>{showAdvanced ? 'Hide advanced controls' : 'Advanced camera & audio controls'}</span>
        </button>

        {showAdvanced && (
          <div className="mt-3 p-4 bg-neutral-950 rounded-xl border border-neutral-800 space-y-4">
            {/* Camera Motion */}
            <div>
              <label className="text-xs font-semibold text-neutral-400 block mb-1.5 flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5" /> Camera Motion
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                {motionOptions.map((cam) => (
                  <button
                    key={cam.id}
                    id={`cam-motion-${cam.id}`}
                    type="button"
                    onClick={() => onChangeConfig({ cameraMotion: cam.id })}
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium border text-center transition-all ${
                      config.cameraMotion === cam.id
                        ? 'bg-sky-500/20 border-sky-500/60 text-sky-300'
                        : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {cam.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Audio and Caption Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <label className="flex items-center justify-between p-3 rounded-lg bg-neutral-900 border border-neutral-800 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-sky-400" />
                  <span className="text-xs font-semibold text-neutral-200">Cinematic Audio Track</span>
                </div>
                <input
                  id="toggle-audio-checkbox"
                  type="checkbox"
                  checked={config.includeAudio}
                  onChange={(e) => onChangeConfig({ includeAudio: e.target.checked })}
                  className="w-4 h-4 rounded text-sky-500 bg-neutral-950 border-neutral-700 focus:ring-sky-500"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-lg bg-neutral-900 border border-neutral-800 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-sky-400" />
                  <span className="text-xs font-semibold text-neutral-200">Kinetic Subtitles & Captions</span>
                </div>
                <input
                  id="toggle-captions-checkbox"
                  type="checkbox"
                  checked={config.includeCaptions}
                  onChange={(e) => onChangeConfig({ includeCaptions: e.target.checked })}
                  className="w-4 h-4 rounded text-sky-500 bg-neutral-950 border-neutral-700 focus:ring-sky-500"
                />
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Main Generate CTA */}
      <div className="pt-2">
        <button
          id="generate-video-submit-btn"
          type="button"
          disabled={!config.prompt.trim() || isGenerating}
          onClick={onGenerate}
          className="w-full py-4 rounded-xl bg-sky-500 hover:bg-sky-400 active:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-base shadow-lg shadow-sky-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Synthesizing Video...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              <span>Generate Video</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
