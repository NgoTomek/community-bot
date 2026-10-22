"use client";

import { useEffect, useState, type CSSProperties } from "react";

// Palette: violet, fuchsia, pink, amber, plus a couple of type colours for variety.
const COLORS = ["#7c3aed", "#c026d3", "#db2777", "#f59e0b", "#fbbf24", "#2563eb", "#14b8a6", "#a78bfa"];

type Piece = { style: CSSProperties };

function makePieces(count: number): Piece[] {
  return Array.from({ length: count }, (_, i) => {
    const fromLeft = i % 2 === 0;
    // Two cannons from the top corners, arcing inward and falling.
    const x = fromLeft ? 8 + Math.random() * 18 : 74 + Math.random() * 18;
    const dx = (fromLeft ? 1 : -1) * (10 + Math.random() * 38);
    const dy = 55 + Math.random() * 45;
    const w = 6 + Math.random() * 6;
    const strip = Math.random() < 0.55;
    return {
      style: {
        "--x": `${x}vw`,
        "--y0": `${-4 - Math.random() * 10}vh`,
        "--dx": `${dx}vw`,
        "--dy": `${dy}vh`,
        "--rot": `${(Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 540)}deg`,
        "--w": `${w}px`,
        "--h": `${strip ? w * 0.45 : w}px`,
        "--r": strip ? "2px" : Math.random() < 0.5 ? "50%" : "2px",
        "--c": COLORS[i % COLORS.length],
        "--dur": `${1400 + Math.random() * 900}ms`,
        "--delay": `${Math.random() * 220}ms`,
      } as CSSProperties,
    };
  });
}

/** A one-shot, dependency-free confetti burst. Renders nothing for reduced-motion users. */
export function Confetti({ count = 60, duration = 2500 }: { count?: number; duration?: number }) {
  const [pieces, setPieces] = useState<Piece[] | null>(null);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    setPieces(makePieces(count));
    const t = window.setTimeout(() => setPieces(null), duration);
    return () => window.clearTimeout(t);
  }, [count, duration]);

  if (!pieces) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      {pieces.map((p, i) => (
        <span key={i} className="confetti-piece" style={p.style} />
      ))}
    </div>
  );
}
