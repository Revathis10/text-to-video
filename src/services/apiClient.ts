import { StoryboardData, VideoConfig } from '../types/video';

export interface ApiStatus {
  status: string;
  hasApiKey: boolean;
  engine: string;
}

export async function checkApiStatus(): Promise<ApiStatus> {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) throw new Error('API status unavailable');
    return await res.json();
  } catch (err) {
    return { status: 'fallback', hasApiKey: false, engine: 'client-offline' };
  }
}

export async function enhancePromptApi(prompt: string): Promise<string> {
  try {
    const res = await fetch('/api/ai/enhance-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to enhance prompt');
    }
    const data = await res.json();
    return data.enhancedPrompt || prompt;
  } catch (err: any) {
    console.warn('Enhance prompt API error:', err);
    return prompt;
  }
}

export async function generateStoryboardApi(config: VideoConfig): Promise<StoryboardData> {
  try {
    const res = await fetch('/api/ai/storyboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: config.enhancedPrompt || config.prompt,
        style: config.style,
        cameraMotion: config.cameraMotion,
      }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to generate storyboard');
    }
    const data = await res.json();
    return data.storyboard;
  } catch (err: any) {
    console.warn('Using client fallback storyboard:', err);
    // Dynamic client-side fallback
    const styleThemes: Record<string, StoryboardData> = {
      cyberpunk: {
        title: 'Neo Tokyo Horizon',
        theme: 'cyberpunk',
        cameraMotion: config.cameraMotion,
        palette: {
          bgTop: '#080d1a',
          bgBottom: '#030508',
          primary: '#00f0ff',
          secondary: '#7000ff',
          accent: '#ff007f',
          glow: '#00ffff',
        },
        visualElements: ['Neon Skyscraper Grid', 'Rain Reflections', 'Holographic Ads', 'Flying Transit'],
        captions: ['In the heart of the neon city', 'Data streams ignite the night'],
        particleCount: 260,
        particleSpeed: 1.8,
        audioMood: 'synth-pulse',
        cameraSpeed: 1.2,
      },
      space: {
        title: 'Celestial Genesis',
        theme: 'space',
        cameraMotion: config.cameraMotion,
        palette: {
          bgTop: '#060919',
          bgBottom: '#010206',
          primary: '#38bdf8',
          secondary: '#818cf8',
          accent: '#ec4899',
          glow: '#67e8f9',
        },
        visualElements: ['Spiral Nebula', 'Orbital Eclipse', 'Starlight Clusters', 'Cosmic Dust'],
        captions: ['Where stars are born', 'Infinite frontiers unfold'],
        particleCount: 280,
        particleSpeed: 1.0,
        audioMood: 'space-ethereal',
        cameraSpeed: 0.9,
      },
      nature: {
        title: 'Dawn Over Valleys',
        theme: 'nature',
        cameraMotion: config.cameraMotion,
        palette: {
          bgTop: '#131b2e',
          bgBottom: '#090f1a',
          primary: '#34d399',
          secondary: '#fbbf24',
          accent: '#f97316',
          glow: '#6ee7b7',
        },
        visualElements: ['Mountain Silhouettes', 'Mist Inversion', 'Golden Sunbeam', 'Rising Thermal Current'],
        captions: ['The earth awakens', 'Breathe in the morning light'],
        particleCount: 190,
        particleSpeed: 0.8,
        audioMood: 'calm-nature',
        cameraSpeed: 0.8,
      },
      synthwave: {
        title: 'Outrun Sunset',
        theme: 'synthwave',
        cameraMotion: config.cameraMotion,
        palette: {
          bgTop: '#100720',
          bgBottom: '#040208',
          primary: '#06b6d4',
          secondary: '#a855f7',
          accent: '#f43f5e',
          glow: '#f43f5e',
        },
        visualElements: ['Wireframe Grid', 'Vector Sun', 'Highway to Infinity', 'Neon Mountains'],
        captions: ['Drive into the electric horizon', 'Synth waves roll on forever'],
        particleCount: 220,
        particleSpeed: 1.5,
        audioMood: 'synth-pulse',
        cameraSpeed: 1.4,
      },
      minimal: {
        title: 'Prism Geometry',
        theme: 'minimal',
        cameraMotion: config.cameraMotion,
        palette: {
          bgTop: '#11141c',
          bgBottom: '#080a0f',
          primary: '#60a5fa',
          secondary: '#c084fc',
          accent: '#38bdf8',
          glow: '#93c5fd',
        },
        visualElements: ['Sacred Geometry', 'Concentric Ripples', 'Glass Prism', 'Harmonic Resonance'],
        captions: ['Pure mathematical beauty', 'Simplicity in motion'],
        particleCount: 160,
        particleSpeed: 0.7,
        audioMood: 'ambient-drone',
        cameraSpeed: 0.8,
      },
    };

    return (
      styleThemes[config.style] || {
        title: 'Cinematic Flow',
        theme: 'cinematic',
        cameraMotion: config.cameraMotion,
        palette: {
          bgTop: '#0c1220',
          bgBottom: '#03050a',
          primary: '#38bdf8',
          secondary: '#818cf8',
          accent: '#f43f5e',
          glow: '#38bdf8',
        },
        visualElements: ['Atmospheric Bokeh', 'Golden Flare', 'Volumetric Shimmer', 'Subtle Depth Field'],
        captions: ['A cinematic journey in motion', 'Captured through light and vision'],
        particleCount: 220,
        particleSpeed: 1.1,
        audioMood: 'ambient-drone',
        cameraSpeed: 1.0,
      }
    );
  }
}

// Veo 3.1 Cloud Video Generation API
export async function startVeoGeneration(config: VideoConfig): Promise<string> {
  const res = await fetch('/api/veo/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: config.enhancedPrompt || config.prompt,
      resolution: config.resolution,
      aspectRatio: config.aspectRatio,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    let msg = errorData.error || 'Veo video generation failed to initiate';
    let isQuota = Boolean(errorData.isQuota) || res.status === 429;

    // In case the backend error message itself contained raw JSON
    if (typeof msg === 'string' && msg.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(msg.trim());
        if (parsed.error?.message) {
          msg = parsed.error.message;
        }
        if (parsed.error?.code === 429 || parsed.error?.status === 'RESOURCE_EXHAUSTED') {
          isQuota = true;
        }
      } catch {}
    }

    if (
      typeof msg === 'string' &&
      (msg.includes('429') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.toLowerCase().includes('quota') ||
        msg.toLowerCase().includes('rate-limit'))
    ) {
      isQuota = true;
      msg =
        'Google Veo 3.1 cloud quota exceeded (429 RESOURCE_EXHAUSTED). Free tier API keys do not include cloud video generation credits.';
    }

    const err = new Error(msg) as any;
    err.isQuota = isQuota;
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  return data.operationName;
}

export async function pollVeoStatus(operationName: string): Promise<{ done: boolean; error?: string | null; hasVideo?: boolean }> {
  const res = await fetch('/api/veo/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operationName }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    let msg = errorData.error || 'Failed to poll video status';
    if (typeof msg === 'string' && msg.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(msg.trim());
        if (parsed.error?.message) msg = parsed.error.message;
      } catch {}
    }
    const err = new Error(msg) as any;
    err.isQuota = Boolean(errorData.isQuota) || res.status === 429;
    throw err;
  }

  return await res.json();
}
