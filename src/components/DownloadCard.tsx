import React, { useState } from 'react';
import { Download, Copy, Check, ExternalLink, Film, Sparkles } from 'lucide-react';
import { GeneratedVideo } from '../types/video';

interface DownloadCardProps {
  video: GeneratedVideo;
  onNewPrompt: () => void;
}

export const DownloadCard: React.FC<DownloadCardProps> = ({ video, onNewPrompt }) => {
  const [copied, setCopied] = useState<boolean>(false);

  const cleanFilename = (title: string, mime: string) => {
    const ext = mime.includes('mp4') ? 'mp4' : 'webm';
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return `${slug || 'ai-video'}-${Date.now()}.${ext}`;
  };

  const filename = cleanFilename(video.title, video.mimeType);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(video.downloadUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div id="output-download-card" className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Sparkles className="w-3 h-3" /> Ready for Export
            </span>
            <span className="text-xs text-neutral-400 font-mono">
              {video.createdAt}
            </span>
          </div>
          <h3 className="text-lg font-bold text-white mt-1">
            {video.title}
          </h3>
          <p className="text-sm text-neutral-400 line-clamp-1 max-w-xl mt-0.5">
            "{video.prompt}"
          </p>
        </div>

        {/* Primary Direct Download Action */}
        <div className="flex items-center gap-3">
          <a
            id="primary-download-video-btn"
            href={video.downloadUrl}
            download={filename}
            className="inline-flex items-center justify-center gap-2.5 px-6 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 active:bg-sky-600 text-white font-semibold text-sm shadow-lg shadow-sky-500/20 transition-all hover:shadow-sky-500/30 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Download Video</span>
          </a>
        </div>
      </div>

      {/* Output Specs Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-neutral-950/70 border border-neutral-800/80 rounded-xl p-3">
          <span className="text-xs text-neutral-500 uppercase tracking-wider block font-medium">Format</span>
          <span className="text-sm font-semibold text-neutral-200 mt-0.5 block font-mono">
            {video.mimeType.includes('mp4') ? 'MP4 (H.264)' : 'WebM (VP9/VP8)'}
          </span>
        </div>

        <div className="bg-neutral-950/70 border border-neutral-800/80 rounded-xl p-3">
          <span className="text-xs text-neutral-500 uppercase tracking-wider block font-medium">File Size</span>
          <span className="text-sm font-semibold text-neutral-200 mt-0.5 block font-mono">
            {video.fileSizeFormatted}
          </span>
        </div>

        <div className="bg-neutral-950/70 border border-neutral-800/80 rounded-xl p-3">
          <span className="text-xs text-neutral-500 uppercase tracking-wider block font-medium">Resolution</span>
          <span className="text-sm font-semibold text-neutral-200 mt-0.5 block font-mono">
            {video.resolution} ({video.aspectRatio})
          </span>
        </div>

        <div className="bg-neutral-950/70 border border-neutral-800/80 rounded-xl p-3">
          <span className="text-xs text-neutral-500 uppercase tracking-wider block font-medium">Duration</span>
          <span className="text-sm font-semibold text-neutral-200 mt-0.5 block font-mono">
            {video.duration.toFixed(1)}s
          </span>
        </div>
      </div>

      {/* Direct Link Section */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <label className="text-xs font-semibold text-neutral-400 block mb-1">
            Direct Download URL
          </label>
          <div className="text-xs font-mono text-neutral-300 truncate bg-neutral-900 px-3 py-2 rounded-lg border border-neutral-800/80">
            {video.downloadUrl}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            id="copy-direct-link-btn"
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Link Copied' : 'Copy Link'}</span>
          </button>

          <a
            id="open-in-new-tab-link"
            href={video.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open in Tab</span>
          </a>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <span className="text-xs text-neutral-500 flex items-center gap-1.5">
          <Film className="w-3.5 h-3.5" /> Direct video stream saved locally in session
        </span>

        <button
          id="create-another-video-btn"
          type="button"
          onClick={onNewPrompt}
          className="text-xs font-semibold text-sky-400 hover:text-sky-300 underline underline-offset-4 cursor-pointer"
        >
          Create another video →
        </button>
      </div>
    </div>
  );
};
