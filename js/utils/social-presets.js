// js/utils/social-presets.js

export const SOCIAL_PRESETS = [
  { value: 'none', label: 'None', width: null, height: null },
  { value: 'ig-square', label: 'Instagram Square', width: 1080, height: 1080 },
  { value: 'ig-portrait', label: 'Instagram Portrait', width: 1080, height: 1350 },
  { value: 'story', label: 'Story / Reel', width: 1080, height: 1920 },
  { value: 'facebook', label: 'Facebook', width: 1200, height: 630 },
  { value: 'x', label: 'X Post', width: 1600, height: 900 },
  { value: 'whatsapp', label: 'WhatsApp', width: 1080, height: 1080 },
  { value: 'youtube', label: 'YouTube Thumbnail', width: 1280, height: 720 },
];

export function getSocialPreset(value) {
  return SOCIAL_PRESETS.find((p) => p.value === value) || SOCIAL_PRESETS[0];
}
