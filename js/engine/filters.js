// js/engine/filters.js

// Every adjustment key. Most run from -100 to 100; hue is -180 to 180; the effect keys run 0 to 100.
export const ADJUST_KEYS = [
  'exposure', 'brightness', 'contrast', 'highlights', 'shadows', 'saturation', 'temperature', 'tint',
  'hue', 'sharpen', 'clarity', 'blur', 'grayscale', 'sepia', 'invert', 'vignette',
];

export const PRESETS = [
  { id: 'original', label: 'Original', values: {} },
  { id: 'bw', label: 'Black and White', values: { grayscale: 100, contrast: 12 } },
  { id: 'vintage', label: 'Vintage', values: { sepia: 35, contrast: -8, saturation: -15, temperature: 15, vignette: 30, brightness: 5 } },
  { id: 'vivid', label: 'Vivid', values: { saturation: 35, contrast: 15, clarity: 15 } },
  { id: 'dramatic', label: 'Dramatic', values: { contrast: 30, saturation: -15, shadows: -20, highlights: -10, vignette: 35, clarity: 25 } },
  { id: 'warm', label: 'Warm', values: { temperature: 30, tint: 5, saturation: 10 } },
  { id: 'cool', label: 'Cool', values: { temperature: -30, saturation: 5 } },
  { id: 'cinematic', label: 'Cinematic', values: { contrast: 20, saturation: -10, temperature: -8, shadows: -10, vignette: 25 } },
  { id: 'portrait', label: 'Portrait', values: { brightness: 6, contrast: -8, saturation: 8, clarity: -10, temperature: 6 } },
  { id: 'highcontrast', label: 'High Contrast', values: { contrast: 45, saturation: 10, clarity: 20 } },
];

export function getPreset(id) {
  return PRESETS.find((p) => p.id === id) || PRESETS[0];
}

// The photo's own adjustments plus the chosen look (scaled by its intensity).
// A look saved by the user carries its own values, so recipes stay self-contained.
export function mergeValues(adjust = {}, filter = null) {
  const out = {};
  ADJUST_KEYS.forEach((k) => { out[k] = adjust[k] || 0; });
  if (filter) {
    const values = filter.values || getPreset(filter.preset).values;
    const k = filter.intensity == null ? 1 : filter.intensity;
    Object.keys(values).forEach((key) => { out[key] = (out[key] || 0) + values[key] * k; });
  }
  return out;
}
