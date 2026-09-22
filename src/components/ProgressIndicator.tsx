import React from 'react';
import { Loader2, X, Sparkles } from 'lucide-react';
import { GenerationProgress } from '../types/video';

interface ProgressIndicatorProps {
  progress: GenerationProgress;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onCancel: () => void;
  aspectRatio: string;
}

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  progress,
  canvasRef,
  onCancel,
  aspectRatio,
}) => {
  const getAspectClass = () => {
    if (aspectRatio === '9:16') return 'aspect-[9/16] max-h-[440px]';
    if (aspectRatio === '1:1') return 'aspect-square max-h-[380px]';
    return 'aspect-video max-h-[380px]';
  };

  return (
    <div id="generation-progress-card" className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">
              Real-Time AI Processing
            </h3>
            <p className="text-xs text-neutral-400">
              {progress.statusText}
            </p>
          </div>
        </div>

        <button
          id="cancel-generation-btn"
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-300 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
          <span>Cancel</span>
        </button>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs font-mono">
          <span className="text-neutral-400">
            {progress.phase === 'analyzing'
              ? 'Analyzing prompt...'
              : progress.phase === 'encoding'
              ? 'Encoding stream...'
              : `Rendering frames (${progress.currentFrame || 0}/${progress.totalFrames || 0})`}
          </span>
          <span className="text-sky-400 font-bold">{progress.percent}%</span>
        </div>
        <div className="w-full h-2.5 bg-neutral-950 rounded-full overflow-hidden border border-neutral-800">
          <div
            className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-150 rounded-full"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      </div>

      {/* Real-time Render Preview Viewport */}
      <div className="w-full flex flex-col items-center justify-center bg-black/80 rounded-xl border border-neutral-800 p-2 relative overflow-hidden">
        <div className={`w-full flex items-center justify-center ${getAspectClass()} relative`}>
          <canvas
            ref={canvasRef}
            width={640}
            height={360}
            className="w-full h-full object-contain rounded-lg"
          />
          <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-black/70 backdrop-blur-sm border border-white/10 text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>LIVE RENDER STREAM</span>
          </div>
        </div>
      </div>

      <p className="text-xs text-neutral-500 text-center flex items-center justify-center gap-1.5">
        <Sparkles className="w-3 h-3 text-sky-400" />
        Processing directly in real-time. Direct download link will be prepared automatically.
      </p>
    </div>
  );
};
