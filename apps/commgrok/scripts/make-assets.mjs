// Generates the local cover images (SVG) and PWA icons (PNG). Run: npm run icons
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = (p) => path.join(root, "public", p);
fs.mkdirSync(out("covers"), { recursive: true });
fs.mkdirSync(out("icons"), { recursive: true });

const svg = (inner, defs = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800"><defs>${defs}</defs>${inner}</svg>`;
const lin = (id, a, b, x2 = 1, y2 = 1) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
const font = `font-family="Inter, -apple-system, Segoe UI, Helvetica, Arial, sans-serif"`;

const covers = {
  "prompt-clinic": svg(
    `<rect width="800" height="800" fill="url(#g)"/>
     ${Array.from({ length: 12 }, (_, r) => Array.from({ length: 12 }, (_, c) => `<circle cx="${70 + c * 60}" cy="${70 + r * 60}" r="3" fill="#fff" opacity=".22"/>`).join("")).join("")}
     <text x="400" y="470" text-anchor="middle" ${font} font-size="300" font-weight="800" fill="#fff">{ }</text>
     <rect x="250" y="560" width="300" height="22" rx="11" fill="#fff" opacity=".85"/>
     <rect x="300" y="600" width="200" height="22" rx="11" fill="#fff" opacity=".5"/>`,
    lin("g", "#f59e0b", "#e11d48"),
  ),
  "canal-run": svg(
    `<rect width="800" height="800" fill="url(#g)"/>
     <circle cx="580" cy="230" r="110" fill="#fde68a"/>
     ${[0, 1, 2, 3, 4].map((i) => `<path d="M0 ${470 + i * 70} C 130 ${430 + i * 70}, 270 ${510 + i * 70}, 400 ${470 + i * 70} S 670 ${430 + i * 70}, 800 ${470 + i * 70}" stroke="#fff" stroke-width="14" fill="none" stroke-linecap="round" opacity="${0.85 - i * 0.15}"/>`).join("")}`,
    lin("g", "#0ea5e9", "#0f766e", 0, 1),
  ),
  "oss-sprint": svg(
    `<rect width="800" height="800" fill="#0f172a"/>
     ${Array.from({ length: 9 }, (_, r) =>
       Array.from({ length: 9 }, (_, c) => {
         const v = (r * 7 + c * 13 + r * c) % 5;
         const col = ["#1e293b", "#14532d", "#15803d", "#22c55e", "#4ade80"][v];
         return `<rect x="${85 + c * 72}" y="${85 + r * 72}" width="56" height="56" rx="12" fill="${col}"/>`;
       }).join(""),
     ).join("")}`,
  ),
  "ai-builders": svg(
    `<rect width="800" height="800" fill="url(#g)"/>
     ${[300, 230, 160, 90].map((r, i) => `<circle cx="400" cy="400" r="${r}" fill="none" stroke="#fff" stroke-width="3" opacity="${0.2 + i * 0.15}"/>`).join("")}
     <text x="400" y="455" text-anchor="middle" ${font} font-size="170" font-weight="800" fill="#fff">#14</text>`,
    lin("g", "#7c3aed", "#db2777"),
  ),
  "lightning-talks": svg(
    `<rect width="800" height="800" fill="#111827"/>
     ${Array.from({ length: 6 }, (_, i) => `<rect x="${60 + i * 120}" y="660" width="80" height="${40 + ((i * 37) % 70)}" rx="8" fill="#fde047" opacity=".25" transform="translate(0 ${-((i * 37) % 70)})"/>`).join("")}
     <polygon points="450,110 230,440 380,440 330,690 570,330 410,330" fill="#facc15"/>`,
  ),
  "breakfast-club": svg(
    `<rect width="800" height="800" fill="url(#g)"/>
     <circle cx="400" cy="420" r="200" fill="#fff" opacity=".9"/>
     <circle cx="400" cy="420" r="150" fill="#7c2d12" opacity=".85"/>
     <path d="M330 420 q70 -60 140 0" stroke="#fdba74" stroke-width="16" fill="none" stroke-linecap="round"/>
     ${[300, 400, 500].map((x) => `<path d="M${x} 190 q-25 -35 0 -70 q25 -35 0 -70" stroke="#fff" stroke-width="12" fill="none" stroke-linecap="round" opacity=".7"/>`).join("")}`,
    lin("g", "#fb923c", "#db2777"),
  ),
  "ai-social": svg(
    `<rect width="800" height="800" fill="url(#g)"/>
     ${[
       [180, 200, 60],
       [610, 170, 40],
       [640, 600, 70],
       [160, 620, 36],
       [400, 400, 130],
     ]
       .map(([x, y, s]) => `<path d="M${x} ${y - s} Q${x} ${y} ${x + s} ${y} Q${x} ${y} ${x} ${y + s} Q${x} ${y} ${x - s} ${y} Q${x} ${y} ${x} ${y - s}Z" fill="#fff" opacity="${s > 100 ? 0.95 : 0.7}"/>`)
       .join("")}`,
    lin("g", "#7c3aed", "#f97316"),
  ),
};

for (const [name, s] of Object.entries(covers)) fs.writeFileSync(out(`covers/${name}.svg`), s);

// Monogram icon: a "C" drawn as an arc on the violet -> pink brand gradient, with an amber spark.
const icon = (rounded, scale = 1) => {
  const r = 120 * scale;
  const w = 56 * scale;
  const a = (r * Math.SQRT1_2).toFixed(1);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7c3aed"/>
      <stop offset=".55" stop-color="#c026d3"/>
      <stop offset="1" stop-color="#db2777"/>
    </linearGradient>
    <radialGradient id="hi" cx=".22" cy=".18" r=".7">
      <stop offset="0" stop-color="#fff" stop-opacity=".28"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="url(#bg)"/>
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="url(#hi)"/>
  <path d="M ${256 + +a} ${256 - +a} A ${r} ${r} 0 1 0 ${256 + +a} ${256 + +a}" fill="none" stroke="#fff" stroke-width="${w}" stroke-linecap="round"/>
  <circle cx="${(256 + r * 0.92).toFixed(1)}" cy="256" r="${(w * 0.42).toFixed(1)}" fill="#fbbf24"/>
</svg>`;
};
fs.writeFileSync(out("icons/icon.svg"), icon(true));
const jobs = [
  ["icons/icon-192.png", icon(true), 192],
  ["icons/icon-512.png", icon(true), 512],
  ["icons/maskable-512.png", icon(false, 0.8), 512],
  ["icons/apple-touch-icon.png", icon(false), 180],
];
for (const [file, s, size] of jobs) {
  await sharp(Buffer.from(s)).resize(size, size).png().toFile(out(file));
}
console.log("covers and icons written to /public");
