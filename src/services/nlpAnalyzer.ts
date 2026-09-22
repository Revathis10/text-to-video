/**
 * Advanced NLP Semantic Analyzer Engine for Text-to-Video
 * Extracts deep semantic entities, actions, motion velocities, lighting,
 * aesthetic constraints, and subject attributes from natural language prompts.
 */

export interface NlpSubjectData {
  type: 'horse' | 'car' | 'bird' | 'runner' | 'cosmic' | 'city' | 'nature' | 'abstract' | 'unknown';
  label: string;
  category: 'animal' | 'vehicle' | 'human' | 'environment' | 'abstract';
  action: string;
  speed: 'slow' | 'moderate' | 'fast' | 'hyper';
  cadenceMultiplier: number;
  colorName?: string;
  colorHex?: string;
  secondaryColorHex?: string;
  isClean2D: boolean;
}

export interface NlpLightingData {
  timeOfDay: 'day' | 'night' | 'sunset' | 'golden-hour' | 'dawn' | 'dusk' | 'neon' | 'studio';
  skyTop: string;
  skyBottom: string;
  horizonColor: string;
  lightingType: string;
}

export interface NlpAnalysisResult {
  rawPrompt: string;
  subject: NlpSubjectData;
  lighting: NlpLightingData;
  camera: {
    recommendedMotion: 'drift-zoom' | 'orbit' | 'hyperlapse' | 'ambient-shimmer' | 'dramatic-tilt';
    angleDescription: string;
    speed: number;
  };
  keywords: string[];
  suggestedStyle: 'cinematic' | 'cyberpunk' | 'nature' | 'space' | 'synthwave' | 'minimal';
  enhancementSuggestion: string;
}

export class NlpAnalyzer {
  /**
   * Fast, zero-latency local NLP extraction running client-side or server-side.
   */
  public static analyze(prompt: string): NlpAnalysisResult {
    const text = (prompt || '').toLowerCase().trim();
    const words = text.split(/[\s,.-]+/).filter(Boolean);

    // 1. Detect Clean 2D / Minimalist Constraint
    const clean2dKeywords = [
      '2d', 'clear', 'clean', 'simple', 'minimal', 'no background', 'without background',
      'uncluttered', 'flat', 'vector', 'isolated', 'pure', 'silhouette', 'outline',
    ];
    const isCleanRequested = clean2dKeywords.some((k) => text.includes(k));

    // 2. Extract Color Entity
    let detectedColorHex: string | undefined;
    let detectedSecondaryHex: string | undefined;
    let detectedColorName: string | undefined;

    if (text.includes('white') || text.includes('silver') || text.includes('snow')) {
      detectedColorName = 'White / Silver';
      detectedColorHex = '#f8fafc';
      detectedSecondaryHex = '#cbd5e1';
    } else if (text.includes('black') || text.includes('obsidian') || text.includes('dark')) {
      detectedColorName = 'Black / Obsidian';
      detectedColorHex = '#18181b';
      detectedSecondaryHex = '#09090b';
    } else if (text.includes('gold') || text.includes('golden') || text.includes('amber') || text.includes('yellow')) {
      detectedColorName = 'Golden Amber';
      detectedColorHex = '#d97706';
      detectedSecondaryHex = '#b45309';
    } else if (text.includes('red') || text.includes('crimson') || text.includes('ruby')) {
      detectedColorName = 'Crimson Red';
      detectedColorHex = '#dc2626';
      detectedSecondaryHex = '#991b1b';
    } else if (text.includes('blue') || text.includes('cyan') || text.includes('azure') || text.includes('sapphire')) {
      detectedColorName = 'Neon Azure';
      detectedColorHex = '#0284c7';
      detectedSecondaryHex = '#0369a1';
    } else if (text.includes('green') || text.includes('emerald') || text.includes('jade')) {
      detectedColorName = 'Emerald Green';
      detectedColorHex = '#16a34a';
      detectedSecondaryHex = '#15803d';
    }

    // 3. Extract Motion & Velocity
    let speed: 'slow' | 'moderate' | 'fast' | 'hyper' = 'fast';
    let cadenceMultiplier = 1.0;
    let actionDesc = 'in motion';

    if (text.includes('sprint') || text.includes('hyper') || text.includes('turbo') || text.includes('supersonic') || text.includes('racing')) {
      speed = 'hyper';
      cadenceMultiplier = 1.35;
      actionDesc = 'sprinting at peak velocity';
    } else if (text.includes('gallop') || text.includes('running') || text.includes('run') || text.includes('driving') || text.includes('soaring')) {
      speed = 'fast';
      cadenceMultiplier = 1.0;
      actionDesc = text.includes('gallop') ? 'full rhythmic gallop' : text.includes('soar') ? 'dynamic high-altitude soar' : 'running in high stride';
    } else if (text.includes('trot') || text.includes('canter') || text.includes('jog') || text.includes('cruise')) {
      speed = 'moderate';
      cadenceMultiplier = 0.78;
      actionDesc = 'moderately paced stride';
    } else if (text.includes('slow') || text.includes('walk') || text.includes('gliding') || text.includes('hover') || text.includes('drift')) {
      speed = 'slow';
      cadenceMultiplier = 0.55;
      actionDesc = 'smooth slow-motion drift';
    }

    // 4. Extract Primary Subject Entity
    let subjectType: NlpSubjectData['type'] = 'unknown';
    let label = 'Visual Sequence';
    let category: NlpSubjectData['category'] = 'environment';

    const isHorse =
      text.includes('horse') ||
      text.includes('stallion') ||
      text.includes('gallop') ||
      text.includes('mustang') ||
      text.includes('equine') ||
      text.includes('mare') ||
      text.includes('colt') ||
      text.includes('pony') ||
      text.includes('steed');

    const isCar =
      text.includes('car') ||
      text.includes('vehicle') ||
      text.includes('automobile') ||
      text.includes('supercar') ||
      text.includes('ferrari') ||
      text.includes('porsche') ||
      text.includes('racing') ||
      text.includes('drive');

    const isBird =
      text.includes('bird') ||
      text.includes('eagle') ||
      text.includes('hawk') ||
      text.includes('falcon') ||
      text.includes('soar') ||
      text.includes('wings');

    const isRunner =
      text.includes('runner') ||
      text.includes('person running') ||
      text.includes('man running') ||
      text.includes('woman running') ||
      text.includes('athlete') ||
      text.includes('sprinter') ||
      text.includes('jogger');

    if (isHorse) {
      subjectType = 'horse';
      label = detectedColorName ? `${detectedColorName} Stallion` : 'Galloping Stallion';
      category = 'animal';
    } else if (isCar) {
      subjectType = 'car';
      label = detectedColorName ? `${detectedColorName} Sports Car` : 'High-Performance Sports Car';
      category = 'vehicle';
    } else if (isBird) {
      subjectType = 'bird';
      label = 'Soaring Eagle';
      category = 'animal';
    } else if (isRunner) {
      subjectType = 'runner';
      label = 'Athletic Sprinter';
      category = 'human';
    } else if (text.includes('city') || text.includes('cyber') || text.includes('neon') || text.includes('tokyo')) {
      subjectType = 'city';
      label = 'Cybernetic Metropolis';
      category = 'environment';
    } else if (text.includes('space') || text.includes('galaxy') || text.includes('star') || text.includes('nebula')) {
      subjectType = 'cosmic';
      label = 'Cosmic Deep Space';
      category = 'environment';
    } else if (text.includes('mountain') || text.includes('forest') || text.includes('ocean') || text.includes('nature')) {
      subjectType = 'nature';
      label = 'Organic Landscape';
      category = 'environment';
    } else {
      subjectType = 'abstract';
      label = 'Kinetic Motion Canvas';
      category = 'abstract';
    }

    // 5. Extract Lighting & Atmosphere
    let timeOfDay: NlpLightingData['timeOfDay'] = 'sunset';
    let skyTop = '#0b0f19';
    let skyBottom = '#334155';
    let horizonColor = 'rgba(148, 163, 184, 0.4)';
    let lightingType = 'Crisp Balanced Light';

    if (text.includes('night') || text.includes('midnight') || text.includes('dark')) {
      timeOfDay = 'night';
      skyTop = '#020617';
      skyBottom = '#0f172a';
      horizonColor = 'rgba(51, 65, 85, 0.5)';
      lightingType = 'Moonlit Low-Key Contrast';
    } else if (text.includes('sunrise') || text.includes('dawn')) {
      timeOfDay = 'dawn';
      skyTop = '#1e1b4b';
      skyBottom = '#f43f5e';
      horizonColor = 'rgba(251, 146, 60, 0.6)';
      lightingType = 'Soft Dawn Inversion';
    } else if (text.includes('sunset') || text.includes('golden') || text.includes('dusk')) {
      timeOfDay = 'sunset';
      skyTop = '#18181b';
      skyBottom = '#78350f';
      horizonColor = 'rgba(245, 158, 11, 0.6)';
      lightingType = 'Warm Golden Hour Rim Light';
    } else if (text.includes('neon') || text.includes('cyber')) {
      timeOfDay = 'neon';
      skyTop = '#080d1a';
      skyBottom = '#1e1b4b';
      horizonColor = 'rgba(56, 189, 248, 0.7)';
      lightingType = 'Saturated Neon Emissive';
    } else if (text.includes('day') || text.includes('bright') || text.includes('sun')) {
      timeOfDay = 'day';
      skyTop = '#0369a1';
      skyBottom = '#38bdf8';
      horizonColor = 'rgba(224, 242, 254, 0.7)';
      lightingType = 'High Key Natural Sunlight';
    }

    // 6. Camera Recommendation
    let recommendedMotion: NlpAnalysisResult['camera']['recommendedMotion'] = 'drift-zoom';
    if (text.includes('orbit') || text.includes('spin') || text.includes('360')) {
      recommendedMotion = 'orbit';
    } else if (text.includes('speed') || text.includes('fast') || text.includes('hyper') || text.includes('rush')) {
      recommendedMotion = 'hyperlapse';
    } else if (text.includes('tilt') || text.includes('sky') || text.includes('upward')) {
      recommendedMotion = 'dramatic-tilt';
    } else if (text.includes('ambient') || text.includes('calm') || text.includes('shimmer')) {
      recommendedMotion = 'ambient-shimmer';
    }

    // 7. Suggested Theme Style
    let suggestedStyle: NlpAnalysisResult['suggestedStyle'] = 'cinematic';
    if (text.includes('cyber') || text.includes('neon') || text.includes('matrix')) suggestedStyle = 'cyberpunk';
    else if (text.includes('space') || text.includes('star') || text.includes('cosmic')) suggestedStyle = 'space';
    else if (text.includes('nature') || text.includes('forest') || text.includes('mountain') || isHorse) suggestedStyle = 'nature';
    else if (text.includes('synth') || text.includes('80s') || text.includes('retro')) suggestedStyle = 'synthwave';
    else if (text.includes('minimal') || text.includes('geometry') || isCleanRequested) suggestedStyle = 'minimal';

    // 8. Extract Salient NLP Keywords
    const stopWords = new Set(['a', 'an', 'the', 'in', 'on', 'at', 'with', 'and', 'to', 'for', 'of', 'by']);
    const salientKeywords = words.filter((w) => w.length > 2 && !stopWords.has(w)).slice(0, 6);

    // 9. Craft High-Level NLP Enhanced Prompt Suggestion
    const enhancementSuggestion = NlpAnalyzer.generateEnhancedPromptText(
      prompt,
      subjectType,
      actionDesc,
      lightingType,
      isCleanRequested
    );

    return {
      rawPrompt: prompt,
      subject: {
        type: subjectType,
        label,
        category,
        action: actionDesc,
        speed,
        cadenceMultiplier,
        colorName: detectedColorName,
        colorHex: detectedColorHex,
        secondaryColorHex: detectedSecondaryHex,
        isClean2D: isCleanRequested || subjectType !== 'unknown',
      },
      lighting: {
        timeOfDay,
        skyTop,
        skyBottom,
        horizonColor,
        lightingType,
      },
      camera: {
        recommendedMotion,
        angleDescription: isHorse || isRunner ? 'Dynamic tracking profile' : 'Cinematic wide anamorphic sweep',
        speed: speed === 'hyper' ? 1.4 : speed === 'slow' ? 0.7 : 1.0,
      },
      keywords: salientKeywords,
      suggestedStyle,
      enhancementSuggestion,
    };
  }

  private static generateEnhancedPromptText(
    basePrompt: string,
    subjectType: string,
    action: string,
    lighting: string,
    isClean2D: boolean
  ): string {
    if (subjectType === 'horse') {
      return isClean2D
        ? 'Clean 2D cinematic silhouette of a muscular galloping stallion in high stride with white socks, flowing mane and tail against a clean dusk horizon.'
        : 'High-definition cinematic capture of a wild stallion galloping across the plains at sunset, dynamic camera tracking shot with volumetric rim lighting.';
    }
    if (subjectType === 'car') {
      return 'Sleek aerodynamic sports car cutting through the dark with illuminated neon chassis and high-speed tire motion, dynamic tracking angle.';
    }
    if (subjectType === 'bird') {
      return 'Golden eagle soaring gracefully with wide wingspan against an expansive sky, smooth cinematic aerial camera drift.';
    }
    if (subjectType === 'runner') {
      return 'Athletic sprinter in powerful motion with focused forward lean, crisp 2D biomechanical stride, high-contrast tracking perspective.';
    }
    return `Cinematic high-definition rendering of ${basePrompt}, featuring ${lighting.toLowerCase()}, refined atmospheric depth, and fluid camera motion.`;
  }
}
