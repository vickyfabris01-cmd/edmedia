// js/engine/sample.js

import { createCanvas } from './canvas.js';

let cached = null;

// A drawn landscape used to preview built-in templates. No image file is needed.
export function samplePhoto() {
  if (cached) return cached;
  const w = 1200;
  const h = 800;
  const c = createCanvas(w, h);
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, h * 0.7);
  sky.addColorStop(0, '#38bdf8');
  sky.addColorStop(0.6, '#bae6fd');
  sky.addColorStop(1, '#fde68a');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#fef3c7';
  g.beginPath();
  g.arc(w * 0.72, h * 0.3, 90, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#15803d';
  g.beginPath();
  g.ellipse(w * 0.25, h * 0.85, w * 0.55, h * 0.3, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#166534';
  g.beginPath();
  g.ellipse(w * 0.8, h * 0.92, w * 0.6, h * 0.28, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#064e3b';
  g.beginPath();
  g.ellipse(w * 0.5, h * 1.02, w * 0.7, h * 0.22, 0, 0, Math.PI * 2);
  g.fill();
  cached = c;
  return c;
}
