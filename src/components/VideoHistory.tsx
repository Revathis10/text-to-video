import React from 'react';
import { Download, Film, Play, Clock, Sparkles } from 'lucide-react';
import { GeneratedVideo } from '../types/video';

interface VideoHistoryProps {
  videos: GeneratedVideo[];
  currentVideoId?: string;
  onSelectVideo: (video: GeneratedVideo) => void;
}

export const VideoHistory: React.FC<VideoHistoryProps> = ({
  videos,
  currentVideoId,
  onSelectVideo,
}) => {
  if (videos.length === 0) {
    return null;
  }

  const cleanFilename = (title: string, mime: string) => {
    const ext = mime.includes('mp4') ? 'mp4' : 'webm';
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return `${slug || 'ai-video'}.${ext}`;
  };

  return (
    <div id="video-history-gallery" className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Film className="w-4 h-4 text-sky-400" />
          <span>Generation History ({videos.length})</span>
        </h3>
        <span className="text-xs text-neutral-400">
          Saved in active session
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {videos.map((vid) => {
          const isSelected = vid.id === currentVideoId;
          const filename = cleanFilename(vid.title, vid.mimeType);

          return (
            <div
              key={vid.id}
              id={`history-item-${vid.id}`}
              className={`group relative bg-neutral-950 border rounded-xl p-3 flex flex-col justify-between transition-all ${
                isSelected
                  ? 'border-sky-500 shadow-md shadow-sky-500/10'
                  : 'border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-white truncate max-w-[140px]">
                    {vid.title}
                  </span>
                  <span className="text-[11px] text-neutral-500 font-mono">
                    {vid.createdAt}
                  </span>
                </div>

                <p className="text-xs text-neutral-400 line-clamp-2 mt-1">
                  "{vid.prompt}"
                </p>

                <div className="flex items-center gap-2 mt-3 text-[11px] font-mono text-neutral-400">
                  <span className="px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-800">
                    {vid.resolution}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-800">
                    {vid.duration}s
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-800">
                    {vid.fileSizeFormatted}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-neutral-800/80">
                <button
                  id={`select-history-${vid.id}`}
                  type="button"
                  onClick={() => onSelectVideo(vid)}
                  className="flex-1 py-1.5 px-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-neutral-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Preview</span>
                </button>

                <a
                  id={`history-download-${vid.id}`}
                  href={vid.downloadUrl}
                  download={filename}
                  className="py-1.5 px-3 rounded-lg bg-sky-500/20 hover:bg-sky-500 text-sky-300 hover:text-white border border-sky-500/30 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                  title="Direct Download"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Save</span>
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
