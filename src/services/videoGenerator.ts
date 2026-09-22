import { VideoConfig, StoryboardData, GeneratedVideo, GenerationProgress } from '../types/video';

// Utility to test supported MediaRecorder MIME types
export function getBestSupportedMimeType(): string {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];

  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return 'video/webm';
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

interface Particle {
  x: number;
  y: number;
  z: number;
  size: number;
  color: string;
  speed: number;
  alpha: number;
  orbitAngle?: number;
}

export class VideoRenderEngine {
  private abortRequested = false;

  public cancel() {
    this.abortRequested = true;
  }

  public async renderVideo(
    config: VideoConfig,
    storyboard: StoryboardData,
    onProgress: (prog: GenerationProgress) => void,
    previewCanvasRef?: HTMLCanvasElement | null
  ): Promise<GeneratedVideo> {
    this.abortRequested = false;

    // 1. Resolve dimensions based on aspect ratio & resolution
    const is1080p = config.resolution === '1080p';
    let width = 1280;
    let height = 720;

    if (config.aspectRatio === '16:9') {
      width = is1080p ? 1920 : 1280;
      height = is1080p ? 1080 : 720;
    } else if (config.aspectRatio === '9:16') {
      width = is1080p ? 1080 : 720;
      height = is1080p ? 1920 : 1280;
    } else if (config.aspectRatio === '1:1') {
      width = is1080p ? 1080 : 720;
      height = is1080p ? 1080 : 720;
    }

    // Prepare offscreen canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Could not initialize 2D rendering canvas context');

    // 2. Prepare Web Audio synthesizer if audio is requested
    let audioCtx: AudioContext | null = null;
    let audioDest: MediaStreamAudioDestinationNode | null = null;

    if (config.includeAudio) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          audioCtx = new AudioContextClass();
          if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
          }
          audioDest = audioCtx.createMediaStreamDestination();
          this.synthesizeAudioTrack(audioCtx, audioDest, storyboard.audioMood, config.duration, config.prompt);
        }
      } catch (err) {
        console.warn('Audio synthesis disabled or unsupported in this browser context', err);
      }
    }

    // 3. Setup MediaStream & MediaRecorder
    const fps = config.fps || 30;
    const canvasStream = canvas.captureStream(fps);

    if (audioDest && audioDest.stream.getAudioTracks().length > 0) {
      const audioTrack = audioDest.stream.getAudioTracks()[0];
      canvasStream.addTrack(audioTrack);
    }

    const mimeType = getBestSupportedMimeType();
    const recordedChunks: Blob[] = [];

    const recorder = new MediaRecorder(canvasStream, {
      mimeType,
      videoBitsPerSecond: is1080p ? 8000000 : 5000000,
    });

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    recorder.start(100); // chunk every 100ms

    // 4. Initialize Particle System & Scene State
    const totalFrames = Math.floor(config.duration * fps);
    const particles = this.initParticles(storyboard.particleCount || 200, width, height, storyboard.palette);

    onProgress({
      phase: 'synthesizing',
      percent: 5,
      statusText: `Rendering scene "${storyboard.title}" (${width}×${height} @ ${fps}fps)...`,
      currentFrame: 0,
      totalFrames,
    });

    // 5. Render Loop with Frame-by-Frame Timing
    const frameIntervalMs = 1000 / fps;
    const startTime = performance.now();

    for (let frame = 0; frame < totalFrames; frame++) {
      if (this.abortRequested) {
        recorder.stop();
        if (audioCtx) audioCtx.close().catch(() => {});
        throw new Error('Video generation was cancelled by the user.');
      }

      const progressRatio = frame / totalFrames;
      const sceneTime = frame / fps;

      // Render Frame on Offscreen Canvas
      this.drawSceneFrame(ctx, width, height, sceneTime, progressRatio, config, storyboard, particles);

      // Copy frame to preview canvas if provided
      if (previewCanvasRef) {
        const previewCtx = previewCanvasRef.getContext('2d');
        if (previewCtx) {
          previewCtx.drawImage(canvas, 0, 0, previewCanvasRef.width, previewCanvasRef.height);
        }
      }

      // Update Progress
      const percent = Math.min(95, Math.floor(10 + progressRatio * 85));
      if (frame % Math.max(1, Math.floor(fps / 4)) === 0 || frame === totalFrames - 1) {
        onProgress({
          phase: 'synthesizing',
          percent,
          statusText: `Rendering frame ${frame + 1} of ${totalFrames} (${percent}%)`,
          currentFrame: frame + 1,
          totalFrames,
        });
      }

      // Yield frame execution smoothly so the browser can breathe and captureStream picks it up
      await new Promise((resolve) => setTimeout(resolve, Math.max(2, frameIntervalMs * 0.4)));
    }

    onProgress({
      phase: 'encoding',
      percent: 97,
      statusText: 'Finalizing video stream and generating direct download link...',
      currentFrame: totalFrames,
      totalFrames,
    });

    // 6. Stop Recorder and Collect Blob
    const videoBlob = await new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        const finalBlob = new Blob(recordedChunks, { type: mimeType });
        resolve(finalBlob);
      };
      recorder.onerror = (e) => reject(e);
      try {
        recorder.stop();
      } catch (err) {
        reject(err);
      }
    });

    if (audioCtx) {
      audioCtx.close().catch(() => {});
    }

    const videoUrl = URL.createObjectURL(videoBlob);
    const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const cleanTitle = (storyboard.title || 'ai-video').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const filename = `${cleanTitle}-${Date.now()}.${extension}`;

    const generatedVideo: GeneratedVideo = {
      id: `vid-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      prompt: config.prompt,
      title: storyboard.title || 'AI Generated Video',
      videoUrl,
      downloadUrl: videoUrl,
      blob: videoBlob,
      mimeType,
      fileSizeFormatted: formatBytes(videoBlob.size),
      aspectRatio: config.aspectRatio,
      duration: config.duration,
      resolution: `${width}×${height}`,
      style: config.style,
      engine: config.engine,
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };

    onProgress({
      phase: 'completed',
      percent: 100,
      statusText: 'Video ready for immediate playback and download!',
      currentFrame: totalFrames,
      totalFrames,
    });

    return generatedVideo;
  }

  // Particle Initializer
  private initParticles(count: number, width: number, height: number, palette: StoryboardData['palette']): Particle[] {
    const colors = [palette.primary, palette.secondary, palette.accent, palette.glow, '#ffffff'];
    const particles: Particle[] = [];

    for (let i = 0; i < count; i++) {
      particles.push({
        x: (Math.random() - 0.5) * width * 1.5,
        y: (Math.random() - 0.5) * height * 1.5,
        z: Math.random() * 800 + 50,
        size: Math.random() * 3.5 + 1.2,
        color: colors[Math.floor(Math.random() * colors.length)],
        speed: Math.random() * 1.5 + 0.5,
        alpha: Math.random() * 0.8 + 0.2,
        orbitAngle: Math.random() * Math.PI * 2,
      });
    }
    return particles;
  }

  // Main Scene Drawing Pipeline
  private drawSceneFrame(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    time: number,
    progress: number,
    config: VideoConfig,
    storyboard: StoryboardData,
    particles: Particle[]
  ) {
    const { palette, theme, cameraMotion } = storyboard;

    ctx.save();

    // 1. Camera Transformation Matrix
    const centerX = width / 2;
    const centerY = height / 2;
    ctx.translate(centerX, centerY);

    let zoom = 1.0;
    let camRotate = 0;
    let camOffsetX = 0;
    let camOffsetY = 0;

    switch (cameraMotion) {
      case 'drift-zoom':
        zoom = 1.0 + progress * 0.25;
        camOffsetY = Math.sin(progress * Math.PI) * (height * 0.05);
        camRotate = Math.sin(progress * Math.PI * 2) * 0.02;
        break;
      case 'orbit':
        camRotate = (progress - 0.5) * 0.15;
        zoom = 1.08 + Math.sin(progress * Math.PI) * 0.12;
        camOffsetX = Math.cos(time * 0.8) * 30;
        break;
      case 'hyperlapse':
        zoom = 0.95 + progress * 0.45;
        camOffsetY = -progress * 40;
        break;
      case 'dramatic-tilt':
        camOffsetY = (0.5 - progress) * (height * 0.15);
        zoom = 1.05 + progress * 0.15;
        break;
      case 'ambient-shimmer':
      default:
        zoom = 1.02 + Math.sin(time * 1.2) * 0.04;
        camRotate = Math.sin(time * 0.8) * 0.01;
        break;
    }

    ctx.scale(zoom, zoom);
    ctx.rotate(camRotate);
    ctx.translate(-centerX + camOffsetX, -centerY + camOffsetY);

    // 1.5. Prompt Condition Active Subject Filter:
    // If the user specified an active subject (e.g. "horse running"), render a crystal-clear 2D scene
    // strictly adhering to the prompt condition with zero unnecessary background clutter.
    const subjectType = this.getActiveSubjectType(config.prompt);
    if (subjectType) {
      this.renderClean2DSubjectScene(ctx, width, height, time, progress, config, storyboard, subjectType);
      ctx.restore(); // Restore Camera Transform

      // Optional minimal typography overlay only if explicit captions are requested
      if (config.includeCaptions) {
        this.renderCaptions(ctx, width, height, time, progress, storyboard, config.prompt);
      }
      return;
    }

    // 2. Base Atmospheric Sky / Background Gradient (For abstract/ambient themes)
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, palette.bgTop || '#080c14');
    bgGrad.addColorStop(0.5, palette.glow ? `${palette.glow}22` : '#0f172a');
    bgGrad.addColorStop(1, palette.bgBottom || '#020408');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(-width * 0.3, -height * 0.3, width * 1.6, height * 1.6);

    // 3. Theme-Specific Generative Art Layer
    if (theme === 'space') {
      this.renderSpaceTheme(ctx, width, height, time, progress, palette);
    } else if (theme === 'cyberpunk') {
      this.renderCyberpunkTheme(ctx, width, height, time, progress, palette);
    } else if (theme === 'nature') {
      this.renderNatureTheme(ctx, width, height, time, progress, palette);
    } else if (theme === 'synthwave') {
      this.renderSynthwaveTheme(ctx, width, height, time, progress, palette);
    } else if (theme === 'minimal') {
      this.renderMinimalTheme(ctx, width, height, time, progress, palette);
    } else {
      this.renderCinematicTheme(ctx, width, height, time, progress, palette);
    }

    // 4. Particle Field (3D Depth Simulation)
    this.renderParticleField(ctx, width, height, time, progress, particles, palette);

    // 5. Cinematic Volumetric Lighting & Glow
    this.renderVolumetricLight(ctx, width, height, time, palette);

    ctx.restore(); // Restore Camera Transform

    // 6. Non-Transformed Overlay Layer: Vignette & Modern Letterbox (if 16:9 cinematic)
    this.renderVignette(ctx, width, height);

    // 7. Typography / Captions Overlay (if enabled)
    if (config.includeCaptions) {
      this.renderCaptions(ctx, width, height, time, progress, storyboard, config.prompt);
    }
  }

  // --- Theme Renderers ---

  private renderSpaceTheme(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    time: number,
    progress: number,
    palette: StoryboardData['palette']
  ) {
    const cx = width * 0.5;
    const cy = height * 0.45;

    // Swirling Nebula Cloud
    const nebulaGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, width * 0.65);
    nebulaGrad.addColorStop(0, `${palette.primary}66`);
    nebulaGrad.addColorStop(0.35, `${palette.secondary}44`);
    nebulaGrad.addColorStop(0.7, `${palette.accent}22`);
    nebulaGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = nebulaGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, width * 0.65, 0, Math.PI * 2);
    ctx.fill();

    // Planetary / Celestial Body
    const planetX = width * 0.68;
    const planetY = height * 0.42;
    const planetRadius = width * 0.16;

    // Atmospheric Eclipse Glow
    const coronaGrad = ctx.createRadialGradient(planetX, planetY, planetRadius * 0.9, planetX, planetY, planetRadius * 1.5);
    coronaGrad.addColorStop(0, `${palette.glow}dd`);
    coronaGrad.addColorStop(0.4, `${palette.primary}66`);
    coronaGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = coronaGrad;
    ctx.beginPath();
    ctx.arc(planetX, planetY, planetRadius * 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Planet sphere with shadow phase
    const planetGrad = ctx.createRadialGradient(
      planetX - planetRadius * 0.5,
      planetY - planetRadius * 0.5,
      10,
      planetX,
      planetY,
      planetRadius
    );
    planetGrad.addColorStop(0, palette.secondary);
    planetGrad.addColorStop(0.5, '#0f172a');
    planetGrad.addColorStop(1, '#020617');
    ctx.fillStyle = planetGrad;
    ctx.beginPath();
    ctx.arc(planetX, planetY, planetRadius, 0, Math.PI * 2);
    ctx.fill();

    // Planet Rings
    ctx.save();
    ctx.translate(planetX, planetY);
    ctx.rotate(0.35);
    ctx.scale(1, 0.28);
    ctx.strokeStyle = `${palette.glow}aa`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, planetRadius * 1.8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private renderCyberpunkTheme(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    time: number,
    progress: number,
    palette: StoryboardData['palette']
  ) {
    const horizonY = height * 0.62;

    // Neon Skyscraper Silhouettes
    const buildingCount = 14;
    const bWidth = width / (buildingCount - 2);

    for (let i = 0; i < buildingCount; i++) {
      const bx = (i - 1) * bWidth;
      const seed = Math.sin(i * 997.3);
      const bHeight = height * 0.25 + Math.abs(seed) * (height * 0.28);
      const by = horizonY - bHeight;

      // Building Body
      ctx.fillStyle = '#05070d';
      ctx.fillRect(bx, by, bWidth * 0.95, bHeight);

      // Building Outline Neon Trim
      ctx.strokeStyle = i % 2 === 0 ? `${palette.primary}66` : `${palette.accent}55`;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx, by, bWidth * 0.95, bHeight);

      // Illuminated Window Grid
      const rows = 12;
      const cols = 4;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const winSeed = Math.sin(i * 20 + r * 5 + c + Math.floor(time * 2));
          if (winSeed > 0.3) {
            ctx.fillStyle = winSeed > 0.8 ? palette.glow : palette.accent;
            ctx.fillRect(bx + 4 + c * 6, by + 10 + r * 14, 3, 5);
          }
        }
      }
    }

    // Ground Neon Grid with Perspective Speed Lines
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, horizonY, width, height - horizonY);
    ctx.clip();

    ctx.fillStyle = '#02040a';
    ctx.fillRect(0, horizonY, width, height - horizonY);

    // Vanishing perspective grid
    const gridSpeed = (time * 120) % 60;
    ctx.strokeStyle = `${palette.primary}88`;
    ctx.lineWidth = 1.5;

    // Horizontal grid lines
    for (let y = horizonY; y < height; y += 15) {
      const perspectiveDist = (y - horizonY) / (height - horizonY);
      const lineY = horizonY + Math.pow(perspectiveDist, 1.8) * (height - horizonY) + gridSpeed * perspectiveDist * 0.2;
      if (lineY <= height) {
        ctx.beginPath();
        ctx.moveTo(0, lineY);
        ctx.lineTo(width, lineY);
        ctx.stroke();
      }
    }

    // Converging lines to horizon center
    const vpX = width * 0.5;
    for (let x = -width * 0.5; x <= width * 1.5; x += width * 0.1) {
      ctx.beginPath();
      ctx.moveTo(vpX, horizonY);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    ctx.restore();

    // Rain streaks with neon ground reflections
    ctx.strokeStyle = `${palette.glow}44`;
    ctx.lineWidth = 1;
    const rainDrops = 60;
    for (let r = 0; r < rainDrops; r++) {
      const rx = (Math.sin(r * 43.1 + time * 2) * 0.5 + 0.5) * width;
      const ry = ((r * 23.7 + time * 800) % height);
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 2, ry + 16);
      ctx.stroke();
    }
  }

  private renderNatureTheme(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    time: number,
    progress: number,
    palette: StoryboardData['palette']
  ) {
    // Glowing Sunrise / Golden Hour Orb
    const sunX = width * 0.5;
    const sunY = height * 0.48;
    const sunRadius = width * 0.12;

    const sunGrad = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, sunRadius * 2);
    sunGrad.addColorStop(0, '#ffffff');
    sunGrad.addColorStop(0.3, palette.accent || '#ff9f43');
    sunGrad.addColorStop(0.7, `${palette.primary}44`);
    sunGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunRadius * 2, 0, Math.PI * 2);
    ctx.fill();

    // Mountain Ridge Layers with Parallax Fog
    const layers = [
      { y: height * 0.52, color: `${palette.bgTop}aa`, amp: 60, freq: 0.003, fog: 0.4 },
      { y: height * 0.65, color: `${palette.secondary}88`, amp: 90, freq: 0.004, fog: 0.25 },
      { y: height * 0.78, color: palette.bgBottom || '#020617', amp: 120, freq: 0.005, fog: 0 },
    ];

    layers.forEach((layer, idx) => {
      ctx.fillStyle = layer.color;
      ctx.beginPath();
      ctx.moveTo(0, height);
      ctx.lineTo(0, layer.y);

      for (let x = 0; x <= width; x += 15) {
        const my =
          layer.y +
          Math.sin(x * layer.freq + idx * 2) * layer.amp +
          Math.cos(x * layer.freq * 2.1) * (layer.amp * 0.4);
        ctx.lineTo(x, my);
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fill();

      // Atmospheric Fog Mist between ridges
      if (layer.fog > 0) {
        const mistGrad = ctx.createLinearGradient(0, layer.y - 20, 0, layer.y + 40);
        mistGrad.addColorStop(0, 'transparent');
        mistGrad.addColorStop(0.5, `${palette.glow}33`);
        mistGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = mistGrad;
        ctx.fillRect(0, layer.y - 30, width, 70);
      }
    });

    // Flying Birds / Wildlife silhouettes
    ctx.strokeStyle = '#ffffffaa';
    ctx.lineWidth = 1.8;
    for (let b = 0; b < 5; b++) {
      const bx = ((width * 0.2 + b * 45 + time * 60) % (width * 1.2)) - width * 0.1;
      const by = height * 0.35 + Math.sin(time * 3 + b) * 15 + b * 12;
      const wing = Math.sin(time * 12 + b) * 8;
      ctx.beginPath();
      ctx.moveTo(bx - 12, by + wing);
      ctx.quadraticCurveTo(bx - 6, by - 4, bx, by);
      ctx.quadraticCurveTo(bx + 6, by - 4, bx + 12, by + wing);
      ctx.stroke();
    }
  }

  private renderSynthwaveTheme(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    time: number,
    progress: number,
    palette: StoryboardData['palette']
  ) {
    const horizonY = height * 0.58;

    // Giant Retro Neon Sun
    const sunX = width * 0.5;
    const sunY = horizonY - 10;
    const sunR = width * 0.18;

    const sunGrad = ctx.createLinearGradient(sunX, sunY - sunR, sunX, sunY + sunR);
    sunGrad.addColorStop(0, '#fef08a');
    sunGrad.addColorStop(0.5, palette.accent || '#f43f5e');
    sunGrad.addColorStop(1, palette.secondary || '#8b5cf6');

    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, Math.PI, 0); // semi circle on top of horizon
    ctx.fill();

    // Horizontal Sun Blinds
    ctx.fillStyle = palette.bgTop || '#080c14';
    const lines = 8;
    for (let l = 1; l <= lines; l++) {
      const ly = sunY - sunR * (1 - l / lines);
      const lHeight = 2 + l * 1.5;
      ctx.fillRect(sunX - sunR * 1.1, ly, sunR * 2.2, lHeight);
    }

    // Grid Floor
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, horizonY, width, height - horizonY);
    ctx.clip();

    ctx.fillStyle = '#050314';
    ctx.fillRect(0, horizonY, width, height - horizonY);

    const vpX = width * 0.5;
    ctx.strokeStyle = palette.primary || '#00f0ff';
    ctx.lineWidth = 2;

    // Vertical Perspective Lines
    for (let x = -width; x <= width * 2; x += width * 0.08) {
      ctx.beginPath();
      ctx.moveTo(vpX, horizonY);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Horizontal Rolling Grid Lines
    const step = (time * 80) % 40;
    for (let y = horizonY; y < height; y += 20) {
      const normY = (y - horizonY) / (height - horizonY);
      const gridY = horizonY + Math.pow(normY, 2) * (height - horizonY) + step * normY;
      if (gridY <= height) {
        ctx.strokeStyle = `${palette.accent}aa`;
        ctx.beginPath();
        ctx.moveTo(0, gridY);
        ctx.lineTo(width, gridY);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private renderMinimalTheme(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    time: number,
    progress: number,
    palette: StoryboardData['palette']
  ) {
    const cx = width * 0.5;
    const cy = height * 0.5;

    // Concentric Harmonic Rings
    const ringCount = 8;
    for (let i = 1; i <= ringCount; i++) {
      const radius = (width * 0.06 * i + time * 20) % (width * 0.5);
      const alpha = 1.0 - radius / (width * 0.5);
      ctx.strokeStyle = `${palette.primary}${Math.floor(alpha * 200).toString(16).padStart(2, '0')}`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Rotating Geometric Prism
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(time * 0.5);
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 3;
    const size = width * 0.12;
    ctx.strokeRect(-size / 2, -size / 2, size, size);

    ctx.rotate(0.785);
    ctx.strokeStyle = palette.glow;
    ctx.strokeRect(-size * 0.7, -size * 0.7, size * 1.4, size * 1.4);
    ctx.restore();
  }

  private renderCinematicTheme(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    time: number,
    progress: number,
    palette: StoryboardData['palette']
  ) {
    const cx = width * 0.5;
    const cy = height * 0.45;

    // Horizon Golden Light Burst
    const burstGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, width * 0.75);
    burstGrad.addColorStop(0, `${palette.primary}cc`);
    burstGrad.addColorStop(0.3, `${palette.secondary}66`);
    burstGrad.addColorStop(0.7, `${palette.accent}22`);
    burstGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = burstGrad;
    ctx.fillRect(0, 0, width, height);

    // Anamorphic Lens Flare Line
    const flareY = cy + Math.sin(time * 0.8) * 20;
    const flareGrad = ctx.createLinearGradient(0, flareY, width, flareY);
    flareGrad.addColorStop(0, 'transparent');
    flareGrad.addColorStop(0.4, `${palette.glow}66`);
    flareGrad.addColorStop(0.5, '#ffffff');
    flareGrad.addColorStop(0.6, `${palette.glow}66`);
    flareGrad.addColorStop(1, 'transparent');

    ctx.fillStyle = flareGrad;
    ctx.fillRect(0, flareY - 3, width, 6);

    // Drifting Bokeh Circles
    for (let i = 0; i < 18; i++) {
      const bx = (Math.sin(i * 19.3 + time * 0.3) * 0.5 + 0.5) * width;
      const by = (Math.cos(i * 31.7 + time * 0.25) * 0.5 + 0.5) * height;
      const bRad = 15 + (i % 5) * 18;
      const bAlpha = 0.08 + (i % 3) * 0.05;

      ctx.fillStyle = `${palette.glow}${Math.floor(bAlpha * 255).toString(16).padStart(2, '0')}`;
      ctx.beginPath();
      ctx.arc(bx, by, bRad, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- Active Subject Detection & Procedural Choreographer ---

  public getActiveSubjectType(prompt: string): 'horse' | 'car' | 'bird' | 'runner' | null {
    const pLower = (prompt || '').toLowerCase();
    if (
      pLower.includes('horse') ||
      pLower.includes('stallion') ||
      pLower.includes('gallop') ||
      pLower.includes('mustang') ||
      pLower.includes('equine') ||
      pLower.includes('mare') ||
      pLower.includes('colt') ||
      pLower.includes('pony')
    ) {
      return 'horse';
    }
    if (
      pLower.includes('car') ||
      pLower.includes('vehicle') ||
      pLower.includes('drive') ||
      pLower.includes('racing') ||
      pLower.includes('sports car') ||
      pLower.includes('automobile')
    ) {
      return 'car';
    }
    if (
      pLower.includes('bird') ||
      pLower.includes('eagle') ||
      pLower.includes('hawk') ||
      pLower.includes('falcon') ||
      pLower.includes('soar')
    ) {
      return 'bird';
    }
    if (
      pLower.includes('runner') ||
      pLower.includes('person running') ||
      pLower.includes('man running') ||
      pLower.includes('woman running') ||
      pLower.includes('athlete') ||
      pLower.includes('sprint')
    ) {
      return 'runner';
    }
    return null;
  }

  private renderClean2DSubjectScene(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    time: number,
    progress: number,
    config: VideoConfig,
    storyboard: StoryboardData,
    subjectType: 'horse' | 'car' | 'bird' | 'runner'
  ) {
    if (subjectType === 'horse') {
      this.renderClear2DHorse(ctx, width, height, time, progress, storyboard);
    } else if (subjectType === 'car') {
      this.renderClear2DCar(ctx, width, height, time, progress, storyboard);
    } else if (subjectType === 'bird') {
      this.renderClear2DBird(ctx, width, height, time, progress, storyboard);
    } else if (subjectType === 'runner') {
      this.renderClear2DRunner(ctx, width, height, time, progress, storyboard);
    }
  }

  // --- 1. Crystal Clear 2D Galloping Horse Engine ---
  // Zero unnecessary background clutter: Clean sky, crisp ground line, clear high-contrast 2D equine anatomy

  private renderClear2DHorse(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    time: number,
    progress: number,
    storyboard: StoryboardData
  ) {
    const s = Math.min(width, height) * 0.0022;
    const groundY = height * 0.72;

    // --- Clean Minimalist Background (Strict Prompt Condition: No Unnecessary Clutter) ---
    // Smooth, high-contrast sky backdrop
    const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
    skyGrad.addColorStop(0, '#0b0f19');
    skyGrad.addColorStop(0.7, '#1e293b');
    skyGrad.addColorStop(1, '#334155');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(-width * 0.3, -height * 0.3, width * 1.6, groundY + height * 0.3);

    // Clean ground plane
    const groundGrad = ctx.createLinearGradient(0, groundY, 0, height);
    groundGrad.addColorStop(0, '#090d16');
    groundGrad.addColorStop(1, '#020617');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(-width * 0.3, groundY, width * 1.6, height - groundY + height * 0.3);

    // Crisp minimal ground horizon line
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-width * 0.3, groundY);
    ctx.lineTo(width * 1.3, groundY);
    ctx.stroke();

    // --- Biomechanical 2D Gallop Animation ---
    const cadence = 2.4; // 2.4 strides / sec
    const cycle = (time * cadence) % 1;
    const phase = cycle * Math.PI * 2;

    // Center positioning with true vertical suspension bob & spine pitch
    const horseX = width * 0.46;
    const bob = Math.sin(phase) * 15 * s;
    const horseY = groundY - 110 * s + bob;
    const pitch = Math.sin(phase - 0.35) * 0.11;

    // Clean dynamic ground contact shadow (underneath the horse)
    const shadowAlpha = Math.max(0.18, 0.45 - (bob / (22 * s)) * 0.2);
    const shadowWidth = Math.max(70 * s, (120 - bob * 0.6) * s);
    ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
    ctx.beginPath();
    ctx.ellipse(horseX, groundY + 3 * s, shadowWidth, 11 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(horseX, horseY);
    ctx.rotate(pitch);

    // --- High-Clarity Color Palette ---
    // Deep chestnut with crisp golden highlights & stark contrast between legs
    const cFarLeg = '#3b1d0c';       // 40% darker for instant depth distinction
    const cFarHoof = '#171717';
    const cNearLeg = '#9a3412';      // Rich vibrant chestnut
    const cWhiteSock = '#f8fafc';    // White pastern socks for crystal clear limb motion
    const cNearHoof = '#1e293b';
    const cGoldOutline = 'rgba(253, 230, 138, 0.85)';
    const cMane = '#18181b';         // Espresso black
    const cManeSun = '#d97706';      // Warm amber

    // Phase offsets for 4-phase asymmetric gallop
    const hindFarPhase = (phase + 0.55) % (Math.PI * 2);
    const hindNearPhase = (phase + 0.18) % (Math.PI * 2);
    const foreFarPhase = (phase + 0.38) % (Math.PI * 2);
    const foreNearPhase = phase;

    // Helper: Articulated 2D Hind Leg
    const drawHindLeg = (legPhase: number, isNear: boolean) => {
      ctx.save();
      const hipX = -65 * s;
      const hipY = 5 * s;

      const hipSwing = Math.sin(legPhase) * 0.58 - 0.15;
      const hockAngle = Math.cos(legPhase) * 0.65 + 0.45;
      const ankleAngle = -Math.sin(legPhase) * 0.4 - 0.2;

      // Stifle (knee)
      const thighLen = 58 * s;
      const stifleX = hipX + Math.sin(hipSwing) * thighLen;
      const stifleY = hipY + Math.cos(hipSwing) * thighLen;

      // Hock (heel)
      const gaskinLen = 52 * s;
      const hockX = stifleX - Math.sin(hipSwing + hockAngle) * gaskinLen;
      const hockY = stifleY + Math.cos(hipSwing + hockAngle) * gaskinLen;

      // Fetlock (ankle)
      const cannonLen = 42 * s;
      const fetlockX = hockX + Math.sin(hipSwing + hockAngle + ankleAngle) * cannonLen;
      const fetlockY = hockY + Math.cos(hipSwing + hockAngle + ankleAngle) * cannonLen;

      // Hoof
      const hoofX = fetlockX + 11 * s;
      const hoofY = fetlockY + 13 * s;

      // Thigh musculature
      ctx.fillStyle = isNear ? cNearLeg : cFarLeg;
      ctx.beginPath();
      ctx.moveTo(hipX - 25 * s, hipY - 20 * s);
      ctx.quadraticCurveTo(hipX - 35 * s, stifleY, stifleX - 8 * s, stifleY + 4 * s);
      ctx.lineTo(stifleX + 14 * s, stifleY);
      ctx.quadraticCurveTo(hipX + 22 * s, hipY + 15 * s, hipX + 18 * s, hipY - 10 * s);
      ctx.closePath();
      ctx.fill();

      // Lower leg
      ctx.strokeStyle = isNear ? cNearLeg : cFarLeg;
      ctx.lineWidth = 13 * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(stifleX, stifleY);
      ctx.lineTo(hockX, hockY);
      ctx.stroke();

      ctx.lineWidth = 8.5 * s;
      ctx.beginPath();
      ctx.moveTo(hockX, hockY);
      ctx.lineTo(fetlockX, fetlockY);
      ctx.stroke();

      // White pastern sock on near leg for high-contrast clarity
      if (isNear) {
        ctx.strokeStyle = cWhiteSock;
        ctx.lineWidth = 9.5 * s;
        ctx.beginPath();
        ctx.moveTo(hockX + (fetlockX - hockX) * 0.65, hockY + (fetlockY - hockY) * 0.65);
        ctx.lineTo(fetlockX, fetlockY);
        ctx.stroke();
      }

      // Sculpted Hoof
      ctx.fillStyle = isNear ? cNearHoof : cFarHoof;
      ctx.beginPath();
      ctx.moveTo(fetlockX - 4 * s, fetlockY);
      ctx.lineTo(hoofX + 7 * s, hoofY);
      ctx.lineTo(hoofX - 8 * s, hoofY);
      ctx.closePath();
      ctx.fill();

      // Golden contour on near leg
      if (isNear) {
        ctx.strokeStyle = cGoldOutline;
        ctx.lineWidth = 1.6 * s;
        ctx.beginPath();
        ctx.moveTo(hipX - 25 * s, hipY - 20 * s);
        ctx.quadraticCurveTo(hipX - 35 * s, stifleY, stifleX - 8 * s, stifleY + 4 * s);
        ctx.lineTo(hockX - 3 * s, hockY);
        ctx.lineTo(fetlockX - 3 * s, fetlockY);
        ctx.stroke();
      }
      ctx.restore();
    };

    // Helper: Articulated 2D Fore Leg
    const drawForeLeg = (legPhase: number, isNear: boolean) => {
      ctx.save();
      const shoulderX = 62 * s;
      const shoulderY = 8 * s;

      const shoulderSwing = -Math.sin(legPhase) * 0.76 + 0.1;
      const kneeAngle = Math.max(0, Math.sin(legPhase - 0.4)) * 1.35;
      const pasternAngle = Math.sin(legPhase) * 0.45;

      const armLen = 54 * s;
      const kneeX = shoulderX + Math.sin(shoulderSwing) * armLen;
      const kneeY = shoulderY + Math.cos(shoulderSwing) * armLen;

      const cannonLen = 46 * s;
      const fetlockX = kneeX + Math.sin(shoulderSwing - kneeAngle) * cannonLen;
      const fetlockY = kneeY + Math.cos(shoulderSwing - kneeAngle) * cannonLen;

      const hoofX = fetlockX + Math.sin(shoulderSwing - kneeAngle + pasternAngle) * 14 * s;
      const hoofY = fetlockY + Math.cos(shoulderSwing - kneeAngle + pasternAngle) * 14 * s;

      // Shoulder
      ctx.fillStyle = isNear ? cNearLeg : cFarLeg;
      ctx.beginPath();
      ctx.moveTo(shoulderX - 16 * s, shoulderY - 20 * s);
      ctx.quadraticCurveTo(shoulderX - 22 * s, shoulderY + 15 * s, kneeX - 7 * s, kneeY);
      ctx.lineTo(kneeX + 7 * s, kneeY);
      ctx.quadraticCurveTo(shoulderX + 24 * s, shoulderY + 10 * s, shoulderX + 18 * s, shoulderY - 15 * s);
      ctx.closePath();
      ctx.fill();

      // Forearm & Cannon
      ctx.strokeStyle = isNear ? cNearLeg : cFarLeg;
      ctx.lineWidth = 8.5 * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(kneeX, kneeY);
      ctx.lineTo(fetlockX, fetlockY);
      ctx.stroke();

      // White pastern sock on near leg
      if (isNear) {
        ctx.strokeStyle = cWhiteSock;
        ctx.lineWidth = 9.5 * s;
        ctx.beginPath();
        ctx.moveTo(kneeX + (fetlockX - kneeX) * 0.65, kneeY + (fetlockY - kneeY) * 0.65);
        ctx.lineTo(fetlockX, fetlockY);
        ctx.stroke();
      }

      // Sculpted Hoof
      ctx.fillStyle = isNear ? cNearHoof : cFarHoof;
      ctx.beginPath();
      ctx.moveTo(fetlockX - 4 * s, fetlockY);
      ctx.lineTo(hoofX + 7 * s, hoofY);
      ctx.lineTo(hoofX - 8 * s, hoofY);
      ctx.closePath();
      ctx.fill();

      // Rim outline for near leg
      if (isNear) {
        ctx.strokeStyle = cGoldOutline;
        ctx.lineWidth = 1.6 * s;
        ctx.beginPath();
        ctx.moveTo(shoulderX + 18 * s, shoulderY - 15 * s);
        ctx.lineTo(kneeX + 5 * s, kneeY);
        ctx.lineTo(fetlockX + 3 * s, fetlockY);
        ctx.stroke();
      }
      ctx.restore();
    };

    // 1. Far Hind Leg (Background)
    drawHindLeg(hindFarPhase, false);

    // 2. Far Fore Leg (Background)
    drawForeLeg(foreFarPhase, false);

    // 3. Flowing Windblown Tail
    ctx.save();
    const tailBaseX = -82 * s;
    const tailBaseY = -12 * s;
    for (let t = 0; t < 6; t++) {
      const wave1 = Math.sin(time * 16 - t * 0.6) * 14 * s;
      const wave2 = Math.cos(time * 22 - t * 0.8) * 18 * s;
      ctx.strokeStyle = t % 2 === 0 ? cMane : cManeSun;
      ctx.lineWidth = (7 - t * 0.7) * s;
      ctx.beginPath();
      ctx.moveTo(tailBaseX, tailBaseY + (t - 3) * 2 * s);
      ctx.bezierCurveTo(
        tailBaseX - 45 * s,
        tailBaseY - 18 * s + wave1 * 0.5,
        tailBaseX - 110 * s,
        tailBaseY + wave1,
        tailBaseX - 165 * s - t * 7 * s,
        tailBaseY + 28 * s + wave2
      );
      ctx.stroke();
    }
    ctx.restore();

    // 4. Muscular Torso & Deep Chest
    ctx.save();
    const torsoGrad = ctx.createLinearGradient(-80 * s, -45 * s, 60 * s, 45 * s);
    torsoGrad.addColorStop(0, '#9a3412');
    torsoGrad.addColorStop(0.5, '#7c2d12');
    torsoGrad.addColorStop(1, '#431407');

    ctx.fillStyle = torsoGrad;
    ctx.beginPath();
    ctx.moveTo(45 * s, -38 * s); // Withers
    ctx.quadraticCurveTo(0 * s, -32 * s, -45 * s, -35 * s); // Spine to loin
    ctx.quadraticCurveTo(-85 * s, -35 * s, -88 * s, -10 * s); // Croup & rump
    ctx.quadraticCurveTo(-85 * s, 25 * s, -55 * s, 32 * s); // Thigh
    ctx.quadraticCurveTo(-10 * s, 26 * s, 25 * s, 28 * s); // Underbelly
    ctx.quadraticCurveTo(75 * s, 28 * s, 78 * s, -8 * s); // Chest
    ctx.quadraticCurveTo(68 * s, -30 * s, 45 * s, -38 * s); // Shoulder slope
    ctx.closePath();
    ctx.fill();

    // Subtle muscle highlight
    ctx.strokeStyle = 'rgba(254, 240, 138, 0.2)';
    ctx.lineWidth = 2.5 * s;
    ctx.beginPath();
    ctx.arc(58 * s, -5 * s, 18 * s, 0, Math.PI * 0.7);
    ctx.stroke();
    ctx.restore();

    // 5. Near Hind Leg (Foreground)
    drawHindLeg(hindNearPhase, true);

    // 6. Near Fore Leg (Foreground)
    drawForeLeg(foreNearPhase, true);

    // 7. Muscular Arched Neck & Crest
    ctx.save();
    const neckBaseX = 48 * s;
    const neckBaseY = -28 * s;
    const neckHeadX = 110 * s;
    const neckHeadY = -92 * s;

    const neckGrad = ctx.createLinearGradient(neckBaseX, neckBaseY, neckHeadX, neckHeadY);
    neckGrad.addColorStop(0, '#7c2d12');
    neckGrad.addColorStop(0.6, '#9a3412');
    neckGrad.addColorStop(1, '#6c240d');

    ctx.fillStyle = neckGrad;
    ctx.beginPath();
    ctx.moveTo(neckBaseX, neckBaseY - 10 * s);
    ctx.quadraticCurveTo(75 * s, -75 * s, neckHeadX - 8 * s, neckHeadY);
    ctx.lineTo(neckHeadX + 6 * s, neckHeadY + 22 * s);
    ctx.quadraticCurveTo(78 * s, -40 * s, neckBaseX + 28 * s, neckBaseY + 25 * s);
    ctx.closePath();
    ctx.fill();

    // 8. Chiseled 2D Head with White Blaze & Alert Ears
    const headX = neckHeadX;
    const headY = neckHeadY;

    ctx.fillStyle = '#6c240d';
    ctx.beginPath();
    ctx.moveTo(headX - 6 * s, headY);
    ctx.lineTo(headX + 44 * s, headY + 16 * s); // Nose bridge
    ctx.quadraticCurveTo(headX + 52 * s, headY + 22 * s, headX + 46 * s, headY + 28 * s); // Muzzle
    ctx.lineTo(headX + 32 * s, headY + 30 * s); // Chin
    ctx.quadraticCurveTo(headX + 16 * s, headY + 44 * s, headX + 4 * s, headY + 22 * s); // Jaw
    ctx.closePath();
    ctx.fill();

    // Crisp white blaze on forehead down the bridge of the nose
    ctx.fillStyle = cWhiteSock;
    ctx.beginPath();
    ctx.moveTo(headX + 6 * s, headY + 5 * s);
    ctx.lineTo(headX + 38 * s, headY + 18 * s);
    ctx.lineTo(headX + 35 * s, headY + 22 * s);
    ctx.lineTo(headX + 4 * s, headY + 8 * s);
    ctx.closePath();
    ctx.fill();

    // Alert Ear
    ctx.fillStyle = '#431407';
    ctx.beginPath();
    ctx.moveTo(headX - 4 * s, headY + 2 * s);
    ctx.quadraticCurveTo(headX - 12 * s, headY - 26 * s, headX - 6 * s, headY - 28 * s);
    ctx.quadraticCurveTo(headX + 4 * s, headY - 22 * s, headX + 2 * s, headY - 2 * s);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = cGoldOutline;
    ctx.lineWidth = 1.4 * s;
    ctx.stroke();

    // Eye with golden reflection
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.ellipse(headX + 15 * s, headY + 12 * s, 4 * s, 2.5 * s, 0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(headX + 16 * s, headY + 11 * s, 1.2 * s, 0, Math.PI * 2);
    ctx.fill();

    // Nostril
    ctx.fillStyle = '#1c1917';
    ctx.beginPath();
    ctx.ellipse(headX + 45 * s, headY + 23 * s, 3.2 * s, 2 * s, 0.4, 0, Math.PI * 2);
    ctx.fill();

    // 9. Flowing Mane streaming backward
    for (let m = 0; m < 8; m++) {
      const lockBaseX = neckBaseX + (m / 8) * (headX - neckBaseX);
      const lockBaseY = neckBaseY - 10 * s - (m / 8) * (headY - neckBaseY) * 0.85;
      const wave = Math.sin(time * 18 - m * 0.6) * 15 * s;

      ctx.strokeStyle = m % 2 === 0 ? cMane : cManeSun;
      ctx.lineWidth = (6.5 - m * 0.4) * s;
      ctx.beginPath();
      ctx.moveTo(lockBaseX, lockBaseY);
      ctx.quadraticCurveTo(
        lockBaseX - 28 * s,
        lockBaseY - 14 * s + wave * 0.5,
        lockBaseX - 60 * s - m * 3.5 * s,
        lockBaseY + 6 * s + wave
      );
      ctx.stroke();
    }

    // 10. Crisp Vector Silhouette Contour (Topline)
    ctx.strokeStyle = cGoldOutline;
    ctx.lineWidth = 2 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-82 * s, -35 * s);
    ctx.quadraticCurveTo(-45 * s, -35 * s, 0 * s, -32 * s);
    ctx.quadraticCurveTo(45 * s, -38 * s, 68 * s, -60 * s);
    ctx.quadraticCurveTo(85 * s, -80 * s, headX - 6 * s, headY);
    ctx.stroke();

    ctx.restore(); // Restore horse transform
  }

  // --- 1. Galloping Horse Engine (Legacy) ---

  private renderGallopingHorse(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    time: number,
    progress: number,
    storyboard: StoryboardData
  ) {
    const s = Math.min(width, height) * 0.0019;
    const groundY = height * 0.72;

    // --- A. Dynamic Rolling Prairie & Terrain ---
    // Far golden prairie ridge (parallax scrolling)
    ctx.save();
    const ridgeGrad = ctx.createLinearGradient(0, groundY - 100 * s, 0, groundY + 50 * s);
    ridgeGrad.addColorStop(0, '#593214');
    ridgeGrad.addColorStop(0.5, '#2e1809');
    ridgeGrad.addColorStop(1, '#150a04');

    ctx.fillStyle = ridgeGrad;
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, groundY - 30 * s);
    for (let x = 0; x <= width; x += 30) {
      const hillY =
        groundY -
        40 * s +
        Math.sin((x + time * 180) * 0.004) * 22 * s +
        Math.sin((x + time * 90) * 0.008) * 12 * s;
      ctx.lineTo(x, hillY);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();

    // Foreground fast ground plane
    const groundGrad = ctx.createLinearGradient(0, groundY - 15 * s, 0, height);
    groundGrad.addColorStop(0, '#3a1f0c');
    groundGrad.addColorStop(0.3, '#1e0f05');
    groundGrad.addColorStop(1, '#090402');

    ctx.fillStyle = groundGrad;
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, groundY - 10 * s);
    for (let x = 0; x <= width; x += 20) {
      const gy = groundY - 10 * s + Math.sin((x + time * 900) * 0.02) * 3 * s;
      ctx.lineTo(x, gy);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();

    // Fast-scrolling grass tufts rushing past
    ctx.strokeStyle = '#f59e0b99';
    ctx.lineWidth = 2 * s;
    const grassCount = 28;
    for (let g = 0; g < grassCount; g++) {
      const gx = ((g * (width / grassCount) - time * 1100) % (width + 100)) - 50;
      const gy = groundY - 8 * s + (g % 3) * 6 * s;
      const gh = 18 * s + (g % 4) * 6 * s;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.quadraticCurveTo(gx - 12 * s, gy - gh * 0.6, gx - 22 * s, gy - gh);
      ctx.stroke();
    }

    // --- B. Dynamic Hoof Strike Dust Plumes ---
    const dustCount = 20;
    for (let d = 0; d < dustCount; d++) {
      const dAge = ((time * 3 + d * 0.15) % 1);
      const dDist = dAge * width * 0.35;
      const dx = width * 0.42 - 70 * s - dDist;
      const dy = groundY - 5 * s - dAge * 45 * s + Math.sin(d * 4.3) * 10 * s;
      const dRad = 10 * s + dAge * 50 * s;
      const dAlpha = (1 - dAge) * 0.32;

      if (dAlpha > 0.01) {
        const dustGrad = ctx.createRadialGradient(dx, dy, 2, dx, dy, dRad);
        dustGrad.addColorStop(0, `rgba(245, 158, 11, ${dAlpha})`);
        dustGrad.addColorStop(0.6, `rgba(217, 119, 6, ${dAlpha * 0.4})`);
        dustGrad.addColorStop(1, 'transparent');

        ctx.fillStyle = dustGrad;
        ctx.beginPath();
        ctx.arc(dx, dy, dRad, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Dynamic horizontal wind / speed streaks
    ctx.strokeStyle = 'rgba(253, 230, 138, 0.22)';
    ctx.lineWidth = 1.5;
    for (let w = 0; w < 10; w++) {
      const wx = ((w * 137.5 - time * 1800) % (width + 300)) - 150;
      const wy = groundY - 120 * s + (w % 6) * 28 * s;
      const len = 70 * s + (w % 4) * 50 * s;
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx + len, wy);
      ctx.stroke();
    }
    ctx.restore();

    // --- C. Biomechanical Galloping Horse Model ---
    // Gallop Cadence: ~2.4 strides/sec (typical thoroughbred/wild mustang gallop)
    const strideCadence = 2.4;
    const cycle = (time * strideCadence) % 1;
    const phase = cycle * Math.PI * 2;

    // Center tracking with realistic vertical bob and body tilt
    const horseX = width * 0.45 + Math.sin(time * 1.4) * 15 * s;
    const bob = Math.sin(phase) * 16 * s;
    const horseY = groundY - 135 * s + bob;
    const pitch = Math.sin(phase - 0.35) * 0.11;

    ctx.save();
    ctx.translate(horseX, horseY);
    ctx.rotate(pitch);

    // Color definitions for a magnificent dark bay / midnight stallion
    const cFarLeg = '#100a06';
    const cNearLeg = '#2b170c';
    const cNearLegHilite = '#4a2815';
    const cHoof = '#0d0906';
    const cHoofRim = '#2a1a10';
    const cMane = '#080503';
    const cManeSun = '#d97706';
    const cGoldRim = 'rgba(251, 191, 36, 0.85)';

    // Leg Phase Offsets (4-phase asymmetrical gallop)
    const hindFarPhase = (phase + 0.52) % (Math.PI * 2);
    const hindNearPhase = (phase + 0.16) % (Math.PI * 2);
    const foreFarPhase = (phase + 0.36) % (Math.PI * 2);
    const foreNearPhase = phase;

    // Helper: Draw Hind Leg with articulated hip, stifle, hock, fetlock, and hoof
    const drawHindLeg = (legPhase: number, isNear: boolean) => {
      ctx.save();
      const hipX = -65 * s;
      const hipY = 5 * s;

      // Gallop kinematics: extension vs flexion
      const hipSwing = Math.sin(legPhase) * 0.55 - 0.15;
      const hockAngle = Math.cos(legPhase) * 0.65 + 0.45;
      const ankleAngle = -Math.sin(legPhase) * 0.4 - 0.2;

      // Stifle (knee) position
      const thighLen = 58 * s;
      const stifleX = hipX + Math.sin(hipSwing) * thighLen;
      const stifleY = hipY + Math.cos(hipSwing) * thighLen;

      // Hock (heel) position
      const gaskinLen = 52 * s;
      const hockX = stifleX - Math.sin(hipSwing + hockAngle) * gaskinLen;
      const hockY = stifleY + Math.cos(hipSwing + hockAngle) * gaskinLen;

      // Fetlock position
      const cannonLen = 42 * s;
      const fetlockX = hockX + Math.sin(hipSwing + hockAngle + ankleAngle) * cannonLen;
      const fetlockY = hockY + Math.cos(hipSwing + hockAngle + ankleAngle) * cannonLen;

      // Hoof position
      const hoofX = fetlockX + 12 * s;
      const hoofY = fetlockY + 14 * s;

      // Upper Thigh Muscle
      ctx.fillStyle = isNear ? cNearLeg : cFarLeg;
      ctx.beginPath();
      ctx.moveTo(hipX - 25 * s, hipY - 20 * s);
      ctx.quadraticCurveTo(hipX - 35 * s, stifleY, stifleX - 8 * s, stifleY + 4 * s);
      ctx.lineTo(stifleX + 14 * s, stifleY);
      ctx.quadraticCurveTo(hipX + 22 * s, hipY + 15 * s, hipX + 18 * s, hipY - 10 * s);
      ctx.closePath();
      ctx.fill();

      // Lower Leg (Gaskin & Cannon Bone)
      ctx.strokeStyle = isNear ? cNearLeg : cFarLeg;
      ctx.lineWidth = 14 * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(stifleX, stifleY);
      ctx.lineTo(hockX, hockY);
      ctx.stroke();

      ctx.lineWidth = 9 * s;
      ctx.beginPath();
      ctx.moveTo(hockX, hockY);
      ctx.lineTo(fetlockX, fetlockY);
      ctx.stroke();

      // Sculpted Hoof
      ctx.fillStyle = cHoof;
      ctx.beginPath();
      ctx.moveTo(fetlockX - 5 * s, fetlockY);
      ctx.lineTo(hoofX + 8 * s, hoofY);
      ctx.lineTo(hoofX - 10 * s, hoofY);
      ctx.closePath();
      ctx.fill();

      // Golden Rim on Near Leg
      if (isNear) {
        ctx.strokeStyle = cGoldRim;
        ctx.lineWidth = 1.8 * s;
        ctx.beginPath();
        ctx.moveTo(hipX - 25 * s, hipY - 20 * s);
        ctx.quadraticCurveTo(hipX - 35 * s, stifleY, stifleX - 8 * s, stifleY + 4 * s);
        ctx.lineTo(hockX - 4 * s, hockY);
        ctx.lineTo(fetlockX - 4 * s, fetlockY);
        ctx.stroke();
      }
      ctx.restore();
    };

    // Helper: Draw Foreleg with shoulder, elbow, knee, fetlock, and hoof
    const drawForeLeg = (legPhase: number, isNear: boolean) => {
      ctx.save();
      const shoulderX = 62 * s;
      const shoulderY = 8 * s;

      // Gallop kinematics: reaching forward, striking ground, tucking under
      const shoulderSwing = -Math.sin(legPhase) * 0.75 + 0.1;
      const kneeAngle = Math.max(0, Math.sin(legPhase - 0.4)) * 1.35;
      const pasternAngle = Math.sin(legPhase) * 0.45;

      // Forearm & Knee position
      const armLen = 54 * s;
      const kneeX = shoulderX + Math.sin(shoulderSwing) * armLen;
      const kneeY = shoulderY + Math.cos(shoulderSwing) * armLen;

      // Cannon & Fetlock position
      const cannonLen = 46 * s;
      const fetlockX = kneeX + Math.sin(shoulderSwing - kneeAngle) * cannonLen;
      const fetlockY = kneeY + Math.cos(shoulderSwing - kneeAngle) * cannonLen;

      // Hoof position
      const hoofX = fetlockX + Math.sin(shoulderSwing - kneeAngle + pasternAngle) * 14 * s;
      const hoofY = fetlockY + Math.cos(shoulderSwing - kneeAngle + pasternAngle) * 14 * s;

      // Shoulder & Forearm Musculature
      ctx.fillStyle = isNear ? cNearLeg : cFarLeg;
      ctx.beginPath();
      ctx.moveTo(shoulderX - 16 * s, shoulderY - 20 * s);
      ctx.quadraticCurveTo(shoulderX - 22 * s, shoulderY + 15 * s, kneeX - 7 * s, kneeY);
      ctx.lineTo(kneeX + 7 * s, kneeY);
      ctx.quadraticCurveTo(shoulderX + 24 * s, shoulderY + 10 * s, shoulderX + 18 * s, shoulderY - 15 * s);
      ctx.closePath();
      ctx.fill();

      // Cannon Bone & Pastern
      ctx.strokeStyle = isNear ? cNearLeg : cFarLeg;
      ctx.lineWidth = 8.5 * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(kneeX, kneeY);
      ctx.lineTo(fetlockX, fetlockY);
      ctx.stroke();

      // Sculpted Hoof
      ctx.fillStyle = cHoof;
      ctx.beginPath();
      ctx.moveTo(fetlockX - 4 * s, fetlockY);
      ctx.lineTo(hoofX + 7 * s, hoofY);
      ctx.lineTo(hoofX - 8 * s, hoofY);
      ctx.closePath();
      ctx.fill();

      // Rim light for near foreleg
      if (isNear) {
        ctx.strokeStyle = cGoldRim;
        ctx.lineWidth = 1.8 * s;
        ctx.beginPath();
        ctx.moveTo(shoulderX + 18 * s, shoulderY - 15 * s);
        ctx.lineTo(kneeX + 6 * s, kneeY);
        ctx.lineTo(fetlockX + 4 * s, fetlockY);
        ctx.stroke();
      }
      ctx.restore();
    };

    // 1. Far Hind Leg (Background side)
    drawHindLeg(hindFarPhase, false);

    // 2. Far Fore Leg (Background side)
    drawForeForeLeg: {
      drawForeLeg(foreFarPhase, false);
    }

    // 3. Billowing Wind-Blown Tail (originates from high dock of tail)
    ctx.save();
    const tailBaseX = -82 * s;
    const tailBaseY = -12 * s;
    const tailStrands = 7;

    for (let t = 0; t < tailStrands; t++) {
      const tSpread = (t - tailStrands / 2) * 5 * s;
      const wave1 = Math.sin(time * 16 - t * 0.6) * 14 * s;
      const wave2 = Math.cos(time * 22 - t * 0.8) * 18 * s;

      ctx.strokeStyle = t % 2 === 0 ? cMane : cManeSun;
      ctx.lineWidth = (8 - t * 0.7) * s;
      ctx.beginPath();
      ctx.moveTo(tailBaseX, tailBaseY + tSpread * 0.4);
      ctx.bezierCurveTo(
        tailBaseX - 45 * s,
        tailBaseY - 20 * s + wave1 * 0.5,
        tailBaseX - 110 * s,
        tailBaseY + wave1,
        tailBaseX - 175 * s - t * 8 * s,
        tailBaseY + 30 * s + wave2
      );
      ctx.stroke();
    }
    ctx.restore();

    // 4. Horse Barrel / Torso / Powerful Hindquarters / Chest
    ctx.save();
    const torsoGrad = ctx.createLinearGradient(-80 * s, -45 * s, 40 * s, 45 * s);
    torsoGrad.addColorStop(0, '#542d17');
    torsoGrad.addColorStop(0.4, '#381c0d');
    torsoGrad.addColorStop(1, '#180c06');

    ctx.fillStyle = torsoGrad;
    ctx.beginPath();
    // Withers / Back line
    ctx.moveTo(45 * s, -38 * s);
    // Dip along spine to loin
    ctx.quadraticCurveTo(0 * s, -32 * s, -45 * s, -35 * s);
    // Rounded muscular croup & rump
    ctx.quadraticCurveTo(-85 * s, -35 * s, -88 * s, -10 * s);
    // Rump curve down to thigh
    ctx.quadraticCurveTo(-85 * s, 25 * s, -55 * s, 32 * s);
    // Underbelly curve
    ctx.quadraticCurveTo(-10 * s, 26 * s, 25 * s, 28 * s);
    // Chest / Deep pectoral curve
    ctx.quadraticCurveTo(75 * s, 28 * s, 78 * s, -8 * s);
    // Upward shoulder slope to withers
    ctx.quadraticCurveTo(68 * s, -30 * s, 45 * s, -38 * s);
    ctx.closePath();
    ctx.fill();

    // Subtle muscle contouring
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.arc(60 * s, -5 * s, 20 * s, 0, Math.PI * 0.8);
    ctx.stroke();
    ctx.restore();

    // 5. Near Hind Leg (Foreground side)
    drawHindLeg(hindNearPhase, true);

    // 6. Near Fore Leg (Foreground side)
    drawForeLeg(foreNearPhase, true);

    // 7. Muscular Arched Neck & Shoulder Crest
    ctx.save();
    const neckBaseX = 48 * s;
    const neckBaseY = -28 * s;
    const neckHeadX = 110 * s;
    const neckHeadY = -92 * s;

    const neckGrad = ctx.createLinearGradient(neckBaseX, neckBaseY, neckHeadX, neckHeadY);
    neckGrad.addColorStop(0, '#381c0d');
    neckGrad.addColorStop(0.6, '#4f2a15');
    neckGrad.addColorStop(1, '#2c160b');

    ctx.fillStyle = neckGrad;
    ctx.beginPath();
    // Upper crest curve (arched)
    ctx.moveTo(neckBaseX, neckBaseY - 10 * s);
    ctx.quadraticCurveTo(75 * s, -75 * s, neckHeadX - 8 * s, neckHeadY);
    // Throat line
    ctx.lineTo(neckHeadX + 6 * s, neckHeadY + 22 * s);
    ctx.quadraticCurveTo(78 * s, -40 * s, neckBaseX + 28 * s, neckBaseY + 25 * s);
    ctx.closePath();
    ctx.fill();

    // 8. Chiseled Equine Head & Alert Ears
    const headX = neckHeadX;
    const headY = neckHeadY;

    // Head base silhouette
    ctx.fillStyle = '#2c160b';
    ctx.beginPath();
    // Forehead
    ctx.moveTo(headX - 6 * s, headY);
    ctx.lineTo(headX + 44 * s, headY + 16 * s); // Bridge of nose to muzzle
    // Muzzle tip
    ctx.quadraticCurveTo(headX + 52 * s, headY + 22 * s, headX + 46 * s, headY + 28 * s);
    // Lower chin & jaw
    ctx.lineTo(headX + 32 * s, headY + 30 * s);
    // Large curved cheek bone
    ctx.quadraticCurveTo(headX + 16 * s, headY + 44 * s, headX + 4 * s, headY + 22 * s);
    ctx.closePath();
    ctx.fill();

    // Alert Pinned Ears
    ctx.fillStyle = '#1e0e06';
    ctx.beginPath();
    ctx.moveTo(headX - 4 * s, headY + 2 * s);
    ctx.quadraticCurveTo(headX - 12 * s, headY - 26 * s, headX - 6 * s, headY - 28 * s);
    ctx.quadraticCurveTo(headX + 4 * s, headY - 22 * s, headX + 2 * s, headY - 2 * s);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = cGoldRim;
    ctx.lineWidth = 1.4 * s;
    ctx.stroke();

    // Almond Equine Eye with golden reflection
    ctx.fillStyle = '#060402';
    ctx.beginPath();
    ctx.ellipse(headX + 15 * s, headY + 12 * s, 4 * s, 2.5 * s, 0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(headX + 16 * s, headY + 11 * s, 1.2 * s, 0, Math.PI * 2);
    ctx.fill();

    // Flared Nostril
    ctx.fillStyle = '#0a0502';
    ctx.beginPath();
    ctx.ellipse(headX + 45 * s, headY + 23 * s, 3.5 * s, 2 * s, 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Warm Exhaled Breath Mist drifting back in the cold dawn air
    for (let m = 0; m < 5; m++) {
      const mAge = ((time * 2.5 + m * 0.2) % 1);
      const mx = headX + 50 * s - mAge * 45 * s;
      const my = headY + 22 * s - mAge * 15 * s;
      const mRad = 3 * s + mAge * 14 * s;
      ctx.fillStyle = `rgba(255, 255, 255, ${(1 - mAge) * 0.25})`;
      ctx.beginPath();
      ctx.arc(mx, my, mRad, 0, Math.PI * 2);
      ctx.fill();
    }

    // 9. Flowing Mane streaming backward in the rushing wind
    const maneLocks = 9;
    for (let m = 0; m < maneLocks; m++) {
      const lockBaseX = neckBaseX + (m / maneLocks) * (headX - neckBaseX);
      const lockBaseY = neckBaseY - 10 * s - (m / maneLocks) * (headY - neckBaseY) * 0.85;
      const wave = Math.sin(time * 18 - m * 0.6) * 16 * s;

      ctx.strokeStyle = m % 2 === 0 ? cMane : cManeSun;
      ctx.lineWidth = (7 - m * 0.4) * s;
      ctx.beginPath();
      ctx.moveTo(lockBaseX, lockBaseY);
      ctx.quadraticCurveTo(
        lockBaseX - 30 * s,
        lockBaseY - 15 * s + wave * 0.5,
        lockBaseX - 65 * s - m * 4 * s,
        lockBaseY + 5 * s + wave
      );
      ctx.stroke();
    }

    // 10. Golden Sunset Backlighting & Rim Highlights
    ctx.strokeStyle = cGoldRim;
    ctx.lineWidth = 2.2 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    // Spine & Withers Rim
    ctx.moveTo(-82 * s, -35 * s);
    ctx.quadraticCurveTo(-45 * s, -35 * s, 0 * s, -32 * s);
    ctx.quadraticCurveTo(45 * s, -38 * s, 68 * s, -60 * s);
    // Neck Crest Rim
    ctx.quadraticCurveTo(85 * s, -80 * s, headX - 6 * s, headY);
    ctx.stroke();

    ctx.restore(); // Restore horse transform
    ctx.restore(); // Restore terrain transform
  }

  // --- 2. Clean 2D Sports Car Renderer ---

  private renderClear2DCar(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    time: number,
    progress: number,
    storyboard: StoryboardData
  ) {
    const s = Math.min(width, height) * 0.0018;
    const roadY = height * 0.74;

    // Clean minimal sky
    const skyGrad = ctx.createLinearGradient(0, 0, 0, roadY);
    skyGrad.addColorStop(0, '#020617');
    skyGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(-width * 0.3, -height * 0.3, width * 1.6, roadY + height * 0.3);

    // Asphalt Road
    ctx.save();
    const roadGrad = ctx.createLinearGradient(0, roadY - 20 * s, 0, height);
    roadGrad.addColorStop(0, '#11151e');
    roadGrad.addColorStop(1, '#05070a');
    ctx.fillStyle = roadGrad;
    ctx.fillRect(0, roadY - 15 * s, width, height - roadY + 15 * s);

    // Dashed centerlines rushing backward
    ctx.strokeStyle = '#facc15cc';
    ctx.lineWidth = 4 * s;
    const dashSpacing = 80 * s;
    const dashOffset = (time * 1600) % dashSpacing;
    for (let x = -dashSpacing; x < width + dashSpacing; x += dashSpacing) {
      ctx.beginPath();
      ctx.moveTo(x - dashOffset, roadY + 30 * s);
      ctx.lineTo(x - dashOffset + 45 * s, roadY + 30 * s);
      ctx.stroke();
    }

    // Car Body Position
    const carX = width * 0.46 + Math.sin(time * 2.5) * 8 * s;
    const carY = roadY - 45 * s + Math.sin(time * 20) * 2 * s;

    // Headlight Light Beam Cone
    const beamGrad = ctx.createLinearGradient(carX + 130 * s, carY, carX + 450 * s, carY + 30 * s);
    beamGrad.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
    beamGrad.addColorStop(0.3, 'rgba(56, 189, 248, 0.35)');
    beamGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(carX + 130 * s, carY + 8 * s);
    ctx.lineTo(carX + 500 * s, carY - 20 * s);
    ctx.lineTo(carX + 520 * s, carY + 70 * s);
    ctx.lineTo(carX + 120 * s, carY + 22 * s);
    ctx.closePath();
    ctx.fill();

    // Red Taillight Streaks
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
    ctx.lineWidth = 4 * s;
    ctx.beginPath();
    ctx.moveTo(carX - 120 * s, carY + 12 * s);
    ctx.lineTo(carX - 350 * s, carY + 12 * s);
    ctx.stroke();

    // Car Chassis
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(carX - 120 * s, carY + 20 * s);
    ctx.lineTo(carX - 110 * s, carY - 8 * s);
    ctx.quadraticCurveTo(carX - 60 * s, carY - 28 * s, carX - 10 * s, carY - 30 * s);
    ctx.lineTo(carX + 50 * s, carY - 28 * s);
    ctx.quadraticCurveTo(carX + 90 * s, carY - 5 * s, carX + 130 * s, carY + 12 * s);
    ctx.lineTo(carX + 125 * s, carY + 26 * s);
    ctx.lineTo(carX - 120 * s, carY + 26 * s);
    ctx.closePath();
    ctx.fill();

    // Car Neon Trim
    ctx.strokeStyle = storyboard.palette.primary || '#38bdf8';
    ctx.lineWidth = 2.5 * s;
    ctx.stroke();

    // Spinning Wheels
    const drawWheel = (wx: number, wy: number) => {
      ctx.fillStyle = '#05070a';
      ctx.beginPath();
      ctx.arc(wx, wy, 18 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 3 * s;
      ctx.stroke();

      // Spokes rotating rapidly
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1.5 * s;
      for (let sp = 0; sp < 5; sp++) {
        const ang = time * 30 + (sp * Math.PI * 2) / 5;
        ctx.beginPath();
        ctx.moveTo(wx, wy);
        ctx.lineTo(wx + Math.cos(ang) * 14 * s, wy + Math.sin(ang) * 14 * s);
        ctx.stroke();
      }
    };

    drawWheel(carX - 70 * s, carY + 25 * s);
    drawWheel(carX + 80 * s, carY + 25 * s);
    ctx.restore();
  }

  // --- 3. Clean 2D Soaring Eagle Renderer ---

  private renderClear2DBird(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    time: number,
    progress: number,
    storyboard: StoryboardData
  ) {
    const s = Math.min(width, height) * 0.0018;

    // Clean minimal sky backdrop
    const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
    skyGrad.addColorStop(0, '#0369a1');
    skyGrad.addColorStop(0.6, '#38bdf8');
    skyGrad.addColorStop(1, '#bae6fd');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(-width * 0.3, -height * 0.3, width * 1.6, height * 1.6);

    const flap = Math.sin(time * 4) * 0.45;
    const eagleX = width * 0.5 + Math.sin(time * 0.8) * 35 * s;
    const eagleY = height * 0.42 + Math.cos(time * 1.2) * 18 * s;

    ctx.save();
    ctx.translate(eagleX, eagleY);
    ctx.rotate(Math.sin(time * 0.8) * 0.08);

    // Left Wing
    ctx.fillStyle = '#1c1917';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-70 * s, flap * 60 * s, -140 * s, flap * 90 * s);
    ctx.lineTo(-110 * s, flap * 40 * s + 25 * s);
    ctx.quadraticCurveTo(-50 * s, 20 * s, 0, 15 * s);
    ctx.closePath();
    ctx.fill();

    // Right Wing
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(70 * s, flap * 60 * s, 140 * s, flap * 90 * s);
    ctx.lineTo(110 * s, flap * 40 * s + 25 * s);
    ctx.quadraticCurveTo(50 * s, 20 * s, 0, 15 * s);
    ctx.closePath();
    ctx.fill();

    // Body & Tail
    ctx.fillStyle = '#292524';
    ctx.beginPath();
    ctx.ellipse(0, 5 * s, 14 * s, 32 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // White Tail Feathers
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(-10 * s, 32 * s);
    ctx.lineTo(0, 52 * s);
    ctx.lineTo(10 * s, 32 * s);
    ctx.closePath();
    ctx.fill();

    // White Head & Golden Beak
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(0, -22 * s, 10 * s, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.moveTo(-3 * s, -28 * s);
    ctx.lineTo(0, -38 * s);
    ctx.lineTo(3 * s, -28 * s);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // --- 4. Clean 2D Human Runner Renderer ---

  private renderClear2DRunner(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    time: number,
    progress: number,
    storyboard: StoryboardData
  ) {
    const s = Math.min(width, height) * 0.0018;
    const groundY = height * 0.72;

    // Clean minimal sky
    const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
    skyGrad.addColorStop(0, '#0f172a');
    skyGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(-width * 0.3, -height * 0.3, width * 1.6, groundY + height * 0.3);

    // Clean running track
    const groundGrad = ctx.createLinearGradient(0, groundY, 0, height);
    groundGrad.addColorStop(0, '#334155');
    groundGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(-width * 0.3, groundY, width * 1.6, height - groundY + height * 0.3);

    // Horizon line
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-width * 0.3, groundY);
    ctx.lineTo(width * 1.3, groundY);
    ctx.stroke();

    const strideCadence = 3.2;
    const cycle = (time * strideCadence) % 1;
    const phase = cycle * Math.PI * 2;

    const runnerX = width * 0.48;
    const runnerY = groundY - 110 * s + Math.abs(Math.sin(phase)) * 8 * s;

    ctx.save();
    ctx.translate(runnerX, runnerY);

    // Athletic Silhouette Runner
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 9 * s;
    ctx.lineCap = 'round';

    // Head
    ctx.beginPath();
    ctx.arc(10 * s, -55 * s, 11 * s, 0, Math.PI * 2);
    ctx.fill();

    // Torso (leaning forward into sprint)
    ctx.lineWidth = 14 * s;
    ctx.beginPath();
    ctx.moveTo(5 * s, -40 * s);
    ctx.lineTo(-5 * s, 0);
    ctx.stroke();

    // Legs striding
    const l1 = Math.sin(phase);
    const l2 = Math.sin(phase + Math.PI);

    // Leg 1
    ctx.lineWidth = 8 * s;
    ctx.beginPath();
    ctx.moveTo(-5 * s, 0);
    ctx.lineTo(-5 * s + l1 * 40 * s, 35 * s);
    ctx.lineTo(-5 * s + l1 * 55 * s, 70 * s);
    ctx.stroke();

    // Leg 2
    ctx.beginPath();
    ctx.moveTo(-5 * s, 0);
    ctx.lineTo(-5 * s + l2 * 40 * s, 35 * s);
    ctx.lineTo(-5 * s + l2 * 55 * s, 70 * s);
    ctx.stroke();

    // Arms pumping
    ctx.lineWidth = 6.5 * s;
    ctx.beginPath();
    ctx.moveTo(4 * s, -30 * s);
    ctx.lineTo(4 * s - l1 * 35 * s, -10 * s);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(4 * s, -30 * s);
    ctx.lineTo(4 * s - l2 * 35 * s, -10 * s);
    ctx.stroke();

    ctx.restore();
  }

  // --- Particles & Volumetric Lighting ---

  private renderParticleField(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    time: number,
    progress: number,
    particles: Particle[],
    palette: StoryboardData['palette']
  ) {
    const fov = 400;
    const cx = width / 2;
    const cy = height / 2;

    for (const p of particles) {
      // Move particle towards camera (Z axis)
      p.z -= p.speed * 4;
      if (p.z <= 10) {
        p.z = 800;
        p.x = (Math.random() - 0.5) * width * 1.8;
        p.y = (Math.random() - 0.5) * height * 1.8;
      }

      const scale = fov / p.z;
      const sx = cx + p.x * scale;
      const sy = cy + p.y * scale;
      const sRadius = Math.max(0.8, p.size * scale);

      if (sx >= -50 && sx <= width + 50 && sy >= -50 && sy <= height + 50) {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.min(1.0, (1.0 - p.z / 800) * p.alpha);
        ctx.beginPath();
        ctx.arc(sx, sy, sRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1.0;
  }

  private renderVolumetricLight(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    time: number,
    palette: StoryboardData['palette']
  ) {
    // Subtle sweeping light beam
    const angle = time * 0.3;
    const beamOriginX = width * 0.5;
    const beamOriginY = -50;

    ctx.save();
    ctx.translate(beamOriginX, beamOriginY);
    ctx.rotate(Math.sin(angle) * 0.25);

    const beamGrad = ctx.createLinearGradient(0, 0, 0, height * 1.3);
    beamGrad.addColorStop(0, `${palette.glow}22`);
    beamGrad.addColorStop(0.5, `${palette.primary}0d`);
    beamGrad.addColorStop(1, 'transparent');

    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(-width * 0.25, height * 1.3);
    ctx.lineTo(0, 0);
    ctx.lineTo(width * 0.25, height * 1.3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private renderVignette(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const radius = Math.max(width, height) * 0.75;
    const vigGrad = ctx.createRadialGradient(width / 2, height / 2, radius * 0.45, width / 2, height / 2, radius);
    vigGrad.addColorStop(0, 'transparent');
    vigGrad.addColorStop(0.8, 'rgba(0, 0, 0, 0.45)');
    vigGrad.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, 0, width, height);
  }

  private renderCaptions(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    time: number,
    progress: number,
    storyboard: StoryboardData,
    originalPrompt: string
  ) {
    const fontSizeTitle = Math.max(22, Math.floor(width * 0.038));
    const fontSizeSub = Math.max(14, Math.floor(width * 0.022));

    ctx.save();

    // Scene Title card (at bottom or center top depending on time)
    // 0% - 25% intro fade in title
    // 25% - 85% cinematic captions
    // 85% - 100% outro fade
    let displayTitle = storyboard.title;
    let subtitle = originalPrompt;

    if (storyboard.captions && storyboard.captions.length > 0) {
      const captionIndex = Math.floor(progress * storyboard.captions.length);
      subtitle = storyboard.captions[Math.min(captionIndex, storyboard.captions.length - 1)];
    }

    const captionY = height * 0.86;

    // Pill backdrop for contrast
    ctx.font = `700 ${fontSizeTitle}px 'Plus Jakarta Sans', system-ui, sans-serif`;
    const titleWidth = ctx.measureText(displayTitle).width;
    ctx.font = `500 ${fontSizeSub}px 'Plus Jakarta Sans', system-ui, sans-serif`;
    const subWidth = ctx.measureText(subtitle).width;
    const boxWidth = Math.max(titleWidth, subWidth) + 48;
    const boxHeight = fontSizeTitle + fontSizeSub + 28;

    const boxX = (width - boxWidth) / 2;
    const boxY = captionY - 14;

    ctx.fillStyle = 'rgba(10, 15, 26, 0.75)';
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 14);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Title Text
    ctx.textAlign = 'center';
    ctx.font = `700 ${fontSizeTitle}px 'Plus Jakarta Sans', system-ui, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 8;
    ctx.fillText(displayTitle, width / 2, captionY + fontSizeTitle * 0.75);

    // Subtitle Text
    ctx.font = `500 ${fontSizeSub}px 'Plus Jakarta Sans', system-ui, sans-serif`;
    ctx.fillStyle = storyboard.palette.primary || '#38bdf8';
    ctx.shadowBlur = 4;
    ctx.fillText(subtitle, width / 2, captionY + fontSizeTitle + fontSizeSub + 4);

    ctx.restore();
  }

  // --- Web Audio Synthesizer ---
  private synthesizeAudioTrack(
    audioCtx: AudioContext,
    dest: MediaStreamAudioDestinationNode,
    mood: StoryboardData['audioMood'],
    duration: number,
    prompt?: string
  ) {
    const now = audioCtx.currentTime;
    const pLower = (prompt || '').toLowerCase();
    const isHorse =
      pLower.includes('horse') ||
      pLower.includes('stallion') ||
      pLower.includes('gallop') ||
      pLower.includes('mustang');

    // Master Gain
    const masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(0.01, now);
    masterGain.gain.exponentialRampToValueAtTime(0.35, now + 0.8);
    masterGain.gain.setValueAtTime(0.35, now + duration - 0.8);
    masterGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    masterGain.connect(dest);

    // Tone Frequencies according to mood
    let freqs = [110, 164.81, 220]; // A minor chord default
    if (isHorse) {
      freqs = [146.83, 220.0, 293.66]; // D major warm sunset
    } else if (mood === 'synth-pulse') {
      freqs = [130.81, 196.0, 261.63]; // C major
    } else if (mood === 'space-ethereal') {
      freqs = [87.31, 130.81, 174.61]; // F power
    } else if (mood === 'calm-nature') {
      freqs = [146.83, 220.0, 293.66]; // D major
    }

    // Low-Pass Filter
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, now);
    filter.frequency.exponentialRampToValueAtTime(1200, now + duration * 0.5);
    filter.frequency.exponentialRampToValueAtTime(350, now + duration);
    filter.connect(masterGain);

    // Oscillators for ambient lush pad
    freqs.forEach((freq, idx) => {
      const osc = audioCtx.createOscillator();
      osc.type = idx === 0 ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(freq, now);

      const oscGain = audioCtx.createGain();
      oscGain.gain.setValueAtTime(0.2 / freqs.length, now);

      // Low frequency oscillator for gentle breathing tremolo
      const lfo = audioCtx.createOscillator();
      lfo.frequency.setValueAtTime(0.3 + idx * 0.15, now);
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.setValueAtTime(0.08, now);
      lfo.connect(lfoGain);
      lfoGain.connect(oscGain.gain);

      osc.connect(oscGain);
      oscGain.connect(filter);

      osc.start(now);
      lfo.start(now);
      osc.stop(now + duration + 0.5);
      lfo.stop(now + duration + 0.5);
    });

    // Sub-Bass Pulse
    const subOsc = audioCtx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(55, now);
    const subGain = audioCtx.createGain();
    subGain.gain.setValueAtTime(0.25, now);
    subOsc.connect(subGain);
    subGain.connect(dest);
    subOsc.start(now);
    subOsc.stop(now + duration + 0.5);

    // Synchronized Galloping Hoofbeat Audio Track
    if (isHorse) {
      const hoofGain = audioCtx.createGain();
      hoofGain.gain.setValueAtTime(0.32, now);
      hoofGain.connect(dest);

      const stridePeriod = 1 / 2.4; // 2.4 strides/sec
      const totalStrides = Math.floor(duration / stridePeriod);

      for (let s = 0; s < totalStrides; s++) {
        const strideTime = now + 0.2 + s * stridePeriod;
        if (strideTime + 0.25 > now + duration) break;

        // 3-beat gallop sequence (hind, diagonal, fore)
        const beats = [0, 0.08, 0.16];
        beats.forEach((bOffset, bIdx) => {
          const t = strideTime + bOffset;
          const thud = audioCtx.createOscillator();
          const thudGain = audioCtx.createGain();

          thud.type = 'sine';
          thud.frequency.setValueAtTime(bIdx === 2 ? 105 : 85, t);
          thud.frequency.exponentialRampToValueAtTime(38, t + 0.05);

          thudGain.gain.setValueAtTime(bIdx === 2 ? 0.35 : 0.25, t);
          thudGain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);

          thud.connect(thudGain);
          thudGain.connect(hoofGain);

          thud.start(t);
          thud.stop(t + 0.06);
        });
      }
    }
  }
}
