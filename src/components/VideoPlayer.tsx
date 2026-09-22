import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, RotateCcw } from 'lucide-react';
import { GeneratedVideo } from '../types/video';

interface VideoPlayerProps {
  video: GeneratedVideo;
  autoPlay?: boolean;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ video, autoPlay = true }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(video.duration || 0);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(true);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    el.currentTime = 0;
    if (autoPlay) {
      el.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  }, [video.videoUrl, autoPlay]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(console.warn);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      if (videoRef.current.duration && !isNaN(videoRef.current.duration)) {
        setDuration(videoRef.current.duration);
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const seekTime = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = seekTime;
      setCurrentTime(seekTime);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    videoRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVol = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.volume = nextVol;
      videoRef.current.muted = nextVol === 0;
      setVolume(nextVol);
      setIsMuted(nextVol === 0);
    }
  };

  const handleFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      }
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Determine aspect ratio class
  const getAspectClass = () => {
    if (video.aspectRatio === '9:16') return 'aspect-[9/16] max-h-[580px]';
    if (video.aspectRatio === '1:1') return 'aspect-square max-h-[520px]';
    return 'aspect-video max-h-[520px]';
  };

  return (
    <div id={`video-player-${video.id}`} className="relative group w-full bg-neutral-950 rounded-2xl overflow-hidden border border-neutral-800 shadow-2xl flex flex-col items-center justify-center">
      <div className={`w-full flex items-center justify-center bg-black ${getAspectClass()}`}>
        <video
          ref={videoRef}
          src={video.videoUrl}
          playsInline
          loop={isLooping}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setIsPlaying(false)}
          onClick={togglePlay}
          className="w-full h-full object-contain cursor-pointer"
        />

        {/* Big play button overlay when paused */}
        {!isPlaying && (
          <button
            id="center-play-button"
            type="button"
            onClick={togglePlay}
            className="absolute z-10 w-16 h-16 rounded-full bg-sky-500/90 hover:bg-sky-400 text-white flex items-center justify-center shadow-lg backdrop-blur-sm transition-transform hover:scale-110 active:scale-95 cursor-pointer"
            aria-label="Play video"
          >
            <Play className="w-8 h-8 fill-current ml-1" />
          </button>
        )}
      </div>

      {/* Control Bar */}
      <div className="w-full bg-neutral-900/95 backdrop-blur-md border-t border-neutral-800 px-4 py-3 flex flex-col gap-2">
        {/* Timeline Scrubber */}
        <div className="flex items-center gap-3 w-full">
          <span className="text-xs font-mono text-neutral-400 min-w-[36px]">
            {formatTime(currentTime)}
          </span>
          <input
            id="video-timeline-scrubber"
            type="range"
            min={0}
            max={duration || 1}
            step={0.05}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-sky-400 focus:outline-none"
          />
          <span className="text-xs font-mono text-neutral-400 min-w-[36px] text-right">
            {formatTime(duration)}
          </span>
        </div>

        {/* Buttons Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              id="player-toggle-play-btn"
              type="button"
              onClick={togglePlay}
              className="p-2 rounded-lg text-neutral-200 hover:text-white hover:bg-neutral-800 transition-colors"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
            </button>

            <button
              id="player-replay-btn"
              type="button"
              onClick={() => {
                if (videoRef.current) {
                  videoRef.current.currentTime = 0;
                  videoRef.current.play();
                  setIsPlaying(true);
                }
              }}
              className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
              title="Restart Video"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Volume Control */}
            <div className="flex items-center gap-1.5 ml-2 group/vol">
              <button
                id="player-mute-btn"
                type="button"
                onClick={toggleMute}
                className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                id="player-volume-slider"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-sky-400"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="player-loop-toggle"
              type="button"
              onClick={() => setIsLooping(!isLooping)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                isLooping ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Loop
            </button>

            <button
              id="player-fullscreen-btn"
              type="button"
              onClick={handleFullscreen}
              className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
              title="Fullscreen"
            >
              <Maximize className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
