import { GoogleGenAI, GenerateVideosOperation, Type } from '@google/genai';
import type { IncomingMessage, ServerResponse } from 'http';
import { NlpAnalyzer } from '../services/nlpAnalyzer';

let genAIClient: GoogleGenAI | null = null;

export function hasGeminiApiKey(): boolean {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  return Boolean(apiKey && apiKey !== 'PLACEHOLDER_API_KEY');
}

export function getGenAI(): GoogleGenAI {
  if (!genAIClient) {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
      throw new Error('GEMINI_API_KEY is missing or still set to the placeholder value. Add a real Gemini API key in .env.local to enable cloud generation.');
    }
    genAIClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return genAIClient;
}

// Helper to parse JSON body from incoming HTTP request
export async function readJsonBody<T = any>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

// Send standard JSON response
export function sendJson(res: ServerResponse, status: number, data: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(data));
}

// Helper to cleanly extract and format Gemini API error messages, especially 429 and 503
export function extractCleanErrorMessage(err: any): { message: string; isQuota: boolean; statusCode: number } {
  let raw = err?.message || String(err || '');
  let isQuota = false;
  let statusCode = err?.status || (err?.code && typeof err.code === 'number' ? err.code : 500);

  // If raw string starts with or contains JSON (common with GoogleGenAI SDK error message)
  if (typeof raw === 'string') {
    try {
      const trimmed = raw.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        const parsed = JSON.parse(trimmed);
        if (parsed.error) {
          if (parsed.error.code === 429 || parsed.error.status === 'RESOURCE_EXHAUSTED') {
            isQuota = true;
            statusCode = 429;
          } else if (parsed.error.code === 503 || parsed.error.status === 'UNAVAILABLE') {
            statusCode = 503;
          }
          raw = parsed.error.message || raw;
        }
      }
    } catch {
      // ignore JSON parse error
    }
  }

  const rawLower = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (
    rawLower.includes('429') ||
    rawLower.includes('resource_exhausted') ||
    rawLower.includes('quota') ||
    rawLower.includes('rate-limit') ||
    rawLower.includes('exceeded your current quota')
  ) {
    isQuota = true;
    statusCode = 429;
    return {
      message:
        'Google Veo 3.1 cloud video generation quota exceeded (429 RESOURCE_EXHAUSTED). Free tier API keys do not include cloud video generation credits. The app will synthesize your video using the Real-Time Engine without quotas.',
      isQuota: true,
      statusCode: 429,
    };
  }

  if (rawLower.includes('503') || rawLower.includes('unavailable') || rawLower.includes('high demand')) {
    return {
      message: 'Gemini service is currently experiencing temporary high demand (503). Using procedural neural choreographer.',
      isQuota: false,
      statusCode: 503,
    };
  }

  return { message: raw, isQuota, statusCode };
}

// Prompt-aware procedural storyboard choreographer (used when Gemini is unavailable, 503, or offline)
function generateDynamicStoryboard(prompt: string, userStyle: string, userMotion: string) {
  const nlp = NlpAnalyzer.analyze(prompt);
  const pLower = prompt.toLowerCase();

  // Extract clean keywords for title
  const capitalizedTitle = nlp.subject.label || (
    prompt
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .slice(0, 4)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ') || 'Cinematic Flow'
  );

  let theme = userStyle || nlp.suggestedStyle || 'cinematic';
  const isHorsePrompt = nlp.subject.type === 'horse';
  const isCarPrompt = nlp.subject.type === 'car';
  const isBirdPrompt = nlp.subject.type === 'bird';
  const isRunnerPrompt = nlp.subject.type === 'runner';

  const palettes: Record<string, { bgTop: string; bgBottom: string; primary: string; secondary: string; accent: string; glow: string }> = {
    cyberpunk: {
      bgTop: '#080d1a',
      bgBottom: '#020408',
      primary: '#00f0ff',
      secondary: '#8a2be2',
      accent: '#ff007f',
      glow: '#00f0ff',
    },
    space: {
      bgTop: '#060919',
      bgBottom: '#010206',
      primary: '#38bdf8',
      secondary: '#818cf8',
      accent: '#ec4899',
      glow: '#67e8f9',
    },
    nature: {
      bgTop: '#131b2e',
      bgBottom: '#090f1a',
      primary: '#34d399',
      secondary: '#fbbf24',
      accent: '#f97316',
      glow: '#6ee7b7',
    },
    synthwave: {
      bgTop: '#100720',
      bgBottom: '#040208',
      primary: '#06b6d4',
      secondary: '#a855f7',
      accent: '#f43f5e',
      glow: '#f43f5e',
    },
    minimal: {
      bgTop: '#11141c',
      bgBottom: '#080a0f',
      primary: '#60a5fa',
      secondary: '#c084fc',
      accent: '#38bdf8',
      glow: '#93c5fd',
    },
    cinematic: {
      bgTop: '#0c1220',
      bgBottom: '#03050a',
      primary: '#38bdf8',
      secondary: '#818cf8',
      accent: '#f43f5e',
      glow: '#38bdf8',
    },
  };

  const visualElementsMap: Record<string, string[]> = {
    cyberpunk: ['Neon Skyscraper Grid', 'Reflective Wet Surfaces', 'Holographic Overlays', 'Kinetic Light Streaks'],
    space: ['Deep Nebula Filaments', 'Pulsing Celestial Clusters', 'Orbital Horizon', 'Cosmic Dust Strands'],
    nature: ['Atmospheric Mist Layers', 'Golden Light Inversion', 'Ethereal Canopy Rays', 'Gentle Wind Particulates'],
    synthwave: ['Wireframe Perspective Plane', 'Digital Horizon Glow', 'Vector Mountain Silhouettes', 'Phosphor Trails'],
    minimal: ['Harmonic Geometric Rings', 'Prismatic Refraction Rays', 'Balanced Negative Space', 'Fluid Sine Waves'],
    cinematic: ['Volumetric Light Rays', 'Atmospheric Shimmer Dust', 'Golden Anamorphic Flare', 'Dynamic Depth Perspective'],
  };

  const audioMoodMap: Record<string, string> = {
    cyberpunk: 'synth-pulse',
    space: 'space-ethereal',
    nature: 'calm-nature',
    synthwave: 'synth-pulse',
    minimal: 'ambient-drone',
    cinematic: 'ambient-drone',
  };

  let finalPalette = palettes[theme] || palettes.cinematic;
  let finalVisualElements = visualElementsMap[theme] || visualElementsMap.cinematic;
  let captions = [
    `"${prompt.slice(0, 48)}${prompt.length > 48 ? '...' : ''}"`,
    'Visual choreography in motion',
  ];

  if (isHorsePrompt) {
    theme = 'nature';
    finalPalette = {
      bgTop: nlp.lighting.skyTop || '#1e1107',
      bgBottom: nlp.lighting.skyBottom || '#080503',
      primary: nlp.subject.colorHex || '#f59e0b',
      secondary: nlp.subject.secondaryColorHex || '#d97706',
      accent: '#fbbf24',
      glow: '#fef08a',
    };
    finalVisualElements = [
      `${capitalizedTitle} in High Stride`,
      'Synchronized Kinetic Gait',
      'Articulated Hoof Contact Line',
      'Flowing Mane and Tail',
      'Minimal Clean Horizon Plane',
    ];
    captions = [
      `${capitalizedTitle} in rhythmic gallop`,
      'Precision 2D equine motion choreography',
    ];
  } else if (isCarPrompt) {
    theme = 'cyberpunk';
    finalPalette = {
      bgTop: '#030712',
      bgBottom: '#020617',
      primary: nlp.subject.colorHex || '#ef4444',
      secondary: '#38bdf8',
      accent: '#facc15',
      glow: '#67e8f9',
    };
    finalVisualElements = [
      'High-Speed Aerodynamic Silhouette',
      'Dashed Centerline Velocity Streaks',
      'Reflective Asphalt Contact Plane',
      'Projected Anamorphic Headlight Cone',
    ];
    captions = ['Velocity engineered in motion', 'Sleek aerodynamic performance'];
  } else if (isBirdPrompt) {
    theme = 'nature';
    finalPalette = {
      bgTop: '#0369a1',
      bgBottom: '#bae6fd',
      primary: '#f59e0b',
      secondary: '#1c1917',
      accent: '#f8fafc',
      glow: '#38bdf8',
    };
    finalVisualElements = [
      'Expansive Wing Dihedral Arc',
      'High-Altitude Atmospheric Flow',
      'Crisp Minimalist Sky Gradient',
      'Thermal Updraft Gliding',
    ];
    captions = ['Soaring upon high thermal currents', 'Effortless aerodynamic grace'];
  } else if (isRunnerPrompt) {
    theme = 'minimal';
    finalPalette = {
      bgTop: '#0f172a',
      bgBottom: '#1e293b',
      primary: '#38bdf8',
      secondary: '#f43f5e',
      accent: '#34d399',
      glow: '#38bdf8',
    };
    finalVisualElements = [
      'Kinetic Biomechanical Sprint Cycle',
      'Forward Athletic Lean Vector',
      'Ground Contact Impulse Dynamics',
      'Minimal Horizon Speed Plane',
    ];
    captions = ['Full velocity sprint cadence', 'Biomechanical kinetic energy'];
  }

  return {
    title: capitalizedTitle,
    theme,
    cameraMotion: userMotion || nlp.camera.recommendedMotion || 'drift-zoom',
    palette: finalPalette,
    visualElements: finalVisualElements,
    captions,
    particleCount: nlp.subject.isClean2D ? 40 : theme === 'space' ? 280 : theme === 'cyberpunk' ? 260 : 200,
    particleSpeed: nlp.subject.speed === 'hyper' ? 2.0 : nlp.subject.speed === 'slow' ? 0.7 : 1.1,
    audioMood: isHorsePrompt ? 'calm-nature' : audioMoodMap[theme] || 'ambient-drone',
    cameraSpeed: nlp.camera.speed || 1.0,
  };
}

export async function handleApiRoute(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = req.url || '';

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.end();
    return true;
  }

  // 1. Check API Key status
  if (url === '/api/status' && req.method === 'GET') {
    const hasKey = hasGeminiApiKey();
    sendJson(res, 200, {
      status: 'ok',
      hasApiKey: hasKey,
      engine: 'gemini-2.5-flash & veo-2.0',
    });
    return true;
  }

  // 2. High-Level NLP Semantic Prompt Analyzer
  if (url === '/api/ai/analyze-prompt' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const userPrompt = (body.prompt || '').trim();
      if (!userPrompt) {
        sendJson(res, 400, { error: 'Prompt is required' });
        return true;
      }

      // Fast deterministic NLP semantic breakdown
      const localNlp = NlpAnalyzer.analyze(userPrompt);

      // Attempt AI-assisted semantic enrichment with Gemini when a real API key is configured.
      let enrichedTags: string[] = [];
      let directorNotes = '';
      if (hasGeminiApiKey()) {
        try {
          const ai = getGenAI();
          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `You are an expert NLP Cinematographer. Analyze this video prompt:
Prompt: "${userPrompt}"

Extract semantic entities and visual directions:
1. Primary kinetic subject
2. Camera focal length & angle
3. Lighting temperature & mood
4. Physical movement velocity

Return valid JSON with:
- "directorNotes": string (under 25 words describing cinematic execution)
- "keywords": array of 4-6 salient semantic tags`,
            config: {
              responseMimeType: 'application/json',
            },
          });
          if (response?.text) {
            const parsed = JSON.parse(response.text.trim());
            if (parsed.keywords && Array.isArray(parsed.keywords)) enrichedTags = parsed.keywords;
            if (parsed.directorNotes) directorNotes = parsed.directorNotes;
          }
        } catch (err: any) {
          console.warn('Gemini NLP enrichment notice:', err?.message || err);
        }
      }

      sendJson(res, 200, {
        success: true,
        analysis: {
          ...localNlp,
          keywords: enrichedTags.length > 0 ? enrichedTags : localNlp.keywords,
          directorNotes: directorNotes || `${localNlp.subject.label} in ${localNlp.subject.action}`,
        },
        fallbackUsed: !hasGeminiApiKey(),
      });
      return true;
    } catch (err: any) {
      console.warn('NLP Analysis error:', err?.message || err);
      sendJson(res, 500, { error: 'Failed to analyze prompt' });
      return true;
    }
  }

  // 3. Multi-Tier NLP Prompt Enhancement with Gemini
  if (url === '/api/ai/enhance-prompt' && req.method === 'POST') {
    let userPrompt = '';
    let mode: 'director' | '2d-motion' | 'cinematic' = 'cinematic';
    try {
      const body = await readJsonBody(req);
      userPrompt = (body.prompt || '').trim();
      mode = body.mode || 'cinematic';

      if (!userPrompt) {
        sendJson(res, 400, { error: 'Prompt is required' });
        return true;
      }

      const nlp = NlpAnalyzer.analyze(userPrompt);
      const is2dClean = mode === '2d-motion' || nlp.subject.isClean2D;

      if (!hasGeminiApiKey()) {
        const fallbackSuggestion = nlp.enhancementSuggestion || userPrompt;
        sendJson(res, 200, {
          enhancedPrompt: fallbackSuggestion,
          fallback: true,
          notice: 'GEMINI_API_KEY is not configured; using the local prompt enhancement fallback.',
        });
        return true;
      }

      const ai = getGenAI();
      let enhanced = '';
      const modelsToTry = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

      const promptInstructions = is2dClean
        ? `You are an expert animator and visual choreographer. Enhance this prompt for a clean, high-contrast 2D animated sequence focusing directly on the subject.
Original prompt: "${userPrompt}"
Rules:
- Focus solely on the subject's anatomy, rhythm, silhouette, and movement mechanics.
- Do NOT add unnecessary backgrounds, complex environments, or clutter.
- Keep it concise (maximum 30 words). Provide only the enhanced prompt without introductory commentary.`
        : mode === 'director'
        ? `You are a visionary film director and cinematographer. Enhance this prompt into a precision director's shot specification.
Original prompt: "${userPrompt}"
Rules:
- Specify camera focal length, tracking angle, lighting temperature, and kinetic subject choreography.
- Keep it crisp and evocative (maximum 35 words). Provide only the enhanced prompt without quotes.`
        : `Enhance this brief text prompt into a vivid, visually compelling video generation prompt. Describe camera motion, cinematic lighting, atmosphere, colors, and dynamic movement. Keep it concise (maximum 35 words).
Original prompt: "${userPrompt}"
Provide only the enhanced prompt without introductory remarks or quotes.`;

      for (const model of modelsToTry) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: promptInstructions,
          });
          if (response?.text && response.text.trim()) {
            enhanced = response.text.trim();
            break;
          }
        } catch (err: any) {
          console.warn(`Enhance model ${model} temporarily unavailable:`, err?.message || err);
        }
      }

      if (!enhanced) {
        enhanced = nlp.enhancementSuggestion || userPrompt;
      }

      sendJson(res, 200, { enhancedPrompt: enhanced, mode });
      return true;
    } catch (err: any) {
      console.warn('Notice enhancing prompt with Gemini:', err?.message);
      const fallbackSuggestion = NlpAnalyzer.analyze(userPrompt).enhancementSuggestion;
      sendJson(res, 200, {
        enhancedPrompt: fallbackSuggestion || userPrompt,
        fallback: true,
        notice: 'Gemini enhance temporarily unavailable; applied procedural NLP enhancement.',
      });
      return true;
    }
  }

  // 4. Generate Cinematic Storyboard with Gemini (multi-model + dynamic prompt fallback)
  if (url === '/api/ai/storyboard' && req.method === 'POST') {
    let prompt = '';
    let userStyle = 'cinematic';
    let userMotion = 'drift-zoom';

    try {
      const body = await readJsonBody(req);
      prompt = (body.prompt || '').trim();
      userStyle = body.style || 'cinematic';
      userMotion = body.cameraMotion || 'drift-zoom';

      if (!prompt) {
        sendJson(res, 400, { error: 'Prompt is required' });
        return true;
      }

      if (!hasGeminiApiKey()) {
        const dynamicFallback = generateDynamicStoryboard(prompt || 'Cinematic Vision', userStyle, userMotion);
        sendJson(res, 200, {
          storyboard: dynamicFallback,
          fallbackUsed: true,
          notice: 'GEMINI_API_KEY is not configured; using the local cinematic storyboard fallback.',
        });
        return true;
      }

      const ai = getGenAI();
      let parsedStoryboard: any = null;
      const modelsToTry = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

      for (const model of modelsToTry) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: `You are a film director and visual choreographer for generative video.
Generate a structured visual choreography plan for a high-definition video matching this user request:
Prompt: "${prompt}"
Desired Style: "${userStyle}"
Camera Motion: "${userMotion}"

Return valid JSON with these fields:
- "title": Short cinematic title (2-4 words)
- "theme": One of ["cinematic", "cyberpunk", "nature", "space", "synthwave", "minimal"]
- "cameraMotion": One of ["drift-zoom", "orbit", "hyperlapse", "ambient-shimmer", "dramatic-tilt"]
- "palette": Object with 6 hex colors:
  - "bgTop" (dark background gradient top, e.g. "#0a0e1a")
  - "bgBottom" (background gradient bottom, e.g. "#020408")
  - "primary" (dominant visual color, e.g. "#00f0ff")
  - "secondary" (secondary harmonic color, e.g. "#8a2be2")
  - "accent" (bright accent color, e.g. "#ff007f")
  - "glow" (emissive glow color, e.g. "#38bdf8")
- "visualElements": array of 4-6 strings describing key visual layers (e.g. ["deep nebula clouds", "twinkling star clusters", "cosmic dust filaments", "pulsating light core"])
- "captions": array of 2-3 cinematic sentence lines to present over time (each under 8 words)
- "particleCount": integer between 100 and 400
- "particleSpeed": float between 0.5 and 2.5
- "audioMood": One of ["ambient-drone", "synth-pulse", "space-ethereal", "calm-nature"]
- "cameraSpeed": float between 0.8 and 2.0`,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  theme: { type: Type.STRING },
                  cameraMotion: { type: Type.STRING },
                  palette: {
                    type: Type.OBJECT,
                    properties: {
                      bgTop: { type: Type.STRING },
                      bgBottom: { type: Type.STRING },
                      primary: { type: Type.STRING },
                      secondary: { type: Type.STRING },
                      accent: { type: Type.STRING },
                      glow: { type: Type.STRING },
                    },
                    required: ['bgTop', 'bgBottom', 'primary', 'secondary', 'accent', 'glow'],
                  },
                  visualElements: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  captions: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  particleCount: { type: Type.INTEGER },
                  particleSpeed: { type: Type.NUMBER },
                  audioMood: { type: Type.STRING },
                  cameraSpeed: { type: Type.NUMBER },
                },
                required: ['title', 'theme', 'palette', 'visualElements', 'captions'],
              },
            },
          });

          if (response?.text) {
            parsedStoryboard = JSON.parse(response.text.trim());
            break;
          }
        } catch (modelErr: any) {
          console.warn(`Storyboard model ${model} temporarily unavailable:`, modelErr?.message || modelErr);
        }
      }

      if (parsedStoryboard) {
        sendJson(res, 200, { storyboard: parsedStoryboard });
        return true;
      }

      // If Gemini models are experiencing high demand (503) or rate limits (429), use dynamic prompt-aware choreography
      const dynamicStoryboard = generateDynamicStoryboard(prompt, userStyle, userMotion);
      sendJson(res, 200, { storyboard: dynamicStoryboard, fallbackUsed: true });
      return true;
    } catch (err: any) {
      console.warn('Notice generating storyboard, applying dynamic fallback:', err?.message || err);
      const dynamicFallback = generateDynamicStoryboard(prompt || 'Cinematic Vision', userStyle, userMotion);
      sendJson(res, 200, { storyboard: dynamicFallback, fallbackUsed: true, note: err?.message });
      return true;
    }
  }

  // 4. Start Google Veo 3.1 Video Generation
  if (url === '/api/veo/generate' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const prompt = (body.prompt || '').trim();
      const resolution = body.resolution === '1080p' ? '1080p' : '720p';
      const aspectRatio = body.aspectRatio === '9:16' ? '9:16' : body.aspectRatio === '1:1' ? '1:1' : '16:9';

      if (!prompt) {
        sendJson(res, 400, { error: 'Prompt is required' });
        return true;
      }

      if (!hasGeminiApiKey()) {
        sendJson(res, 400, {
          error: 'GEMINI_API_KEY is not configured. Add a valid key in .env.local to enable Veo generation.',
          isQuota: false,
          code: 401,
        });
        return true;
      }

      const ai = getGenAI();
      const operation = await ai.models.generateVideos({
        model: 'veo-2.0-generate-001',
        prompt,
        config: {
          numberOfVideos: 1,
          resolution,
          aspectRatio,
        },
      });

      sendJson(res, 200, {
        success: true,
        operationName: operation.name,
      });
      return true;
    } catch (err: any) {
      console.warn('Notice starting Veo generation:', err?.message || err);
      const cleaned = extractCleanErrorMessage(err);
      sendJson(res, cleaned.statusCode, {
        error: cleaned.message,
        isQuota: cleaned.isQuota,
        code: cleaned.statusCode,
      });
      return true;
    }
  }

  // 5. Poll Veo Video Status
  if (url === '/api/veo/status' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const operationName = body.operationName;
      if (!operationName) {
        sendJson(res, 400, { error: 'operationName is required' });
        return true;
      }

      const ai = getGenAI();
      const op = new GenerateVideosOperation();
      op.name = operationName;
      const updated = await ai.operations.getVideosOperation({ operation: op });

      const isDone = Boolean(updated.done);
      const hasError = updated.error;
      const videoUri = updated.response?.generatedVideos?.[0]?.video?.uri;

      let errorMsg: string | null = null;
      if (hasError) {
        errorMsg = extractCleanErrorMessage(hasError).message;
      }

      sendJson(res, 200, {
        done: isDone,
        error: errorMsg,
        hasVideo: Boolean(videoUri),
      });
      return true;
    } catch (err: any) {
      console.warn('Notice polling Veo status:', err?.message || err);
      const cleaned = extractCleanErrorMessage(err);
      sendJson(res, cleaned.statusCode, {
        error: cleaned.message,
        isQuota: cleaned.isQuota,
        code: cleaned.statusCode,
      });
      return true;
    }
  }

  // 6. Direct Download Veo Video Stream
  if ((url.startsWith('/api/veo/download') || url === '/api/veo/download') && (req.method === 'GET' || req.method === 'POST')) {
    try {
      let operationName = '';
      if (req.method === 'POST') {
        const body = await readJsonBody(req);
        operationName = body.operationName;
      } else {
        const parsedUrl = new URL(url, 'http://localhost');
        operationName = parsedUrl.searchParams.get('operationName') || '';
      }

      if (!operationName) {
        sendJson(res, 400, { error: 'operationName query parameter or body is required' });
        return true;
      }

      const ai = getGenAI();
      const op = new GenerateVideosOperation();
      op.name = operationName;
      const updated = await ai.operations.getVideosOperation({ operation: op });

      const videoUri = updated.response?.generatedVideos?.[0]?.video?.uri;
      if (!videoUri) {
        sendJson(res, 404, { error: 'Video generation is still processing or video URI is unavailable' });
        return true;
      }

      const apiKey = process.env.GEMINI_API_KEY;
      const videoRes = await fetch(videoUri, {
        headers: {
          'x-goog-api-key': apiKey || '',
        },
      });

      if (!videoRes.ok) {
        sendJson(res, videoRes.status, { error: 'Failed to fetch video stream from Google storage' });
        return true;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', 'attachment; filename="ai-generated-video.mp4"');

      if (videoRes.body) {
        const reader = videoRes.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) res.write(value);
        }
        res.end();
      } else {
        const buffer = Buffer.from(await videoRes.arrayBuffer());
        res.end(buffer);
      }
      return true;
    } catch (err: any) {
      console.warn('Notice downloading Veo video:', err?.message || err);
      sendJson(res, 500, { error: err.message || 'Failed to download video' });
      return true;
    }
  }

  return false;
}
