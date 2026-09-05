import { useEffect, useRef } from "react";

// A field of hexagons covering the viewport. Each one darkens toward the
// cursor and fades back out with distance, so only a small neighbourhood
// around the pointer ever lights up — not a fixed set of "hovered" cells,
// but a continuous falloff that recomputes every frame the mouse moves.

interface Hex {
  x: number;
  y: number;
}

const HEX_SIZE = 24; // centre-to-vertex, in CSS px
const HOVER_RADIUS = 110; // how far the darkening reaches
const BASE_FILL: [number, number, number, number] = [30, 41, 59, 0.006];
const HOVER_FILL: [number, number, number, number] = [30, 41, 59, 0.08];
const STROKE = "rgba(30, 41, 59, 0.025)";

function hexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    const x = cx + size * Math.cos(angle);
    const y = cy + size * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function lerpColor(a: typeof BASE_FILL, b: typeof BASE_FILL, t: number): string {
  const r = a[0] + (b[0] - a[0]) * t;
  const g = a[1] + (b[1] - a[1]) * t;
  const bl = a[2] + (b[2] - a[2]) * t;
  const al = a[3] + (b[3] - a[3]) * t;
  return `rgba(${r.toFixed(0)}, ${g.toFixed(0)}, ${bl.toFixed(0)}, ${al.toFixed(3)})`;
}

export default function HexBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let hexes: Hex[] = [];
    let mouse = { x: -9999, y: -9999 };
    let raf: number | null = null;

    function buildGrid(width: number, height: number) {
      const hexW = Math.sqrt(3) * HEX_SIZE;
      const hexH = 2 * HEX_SIZE;
      const vertSpacing = hexH * 0.75;
      const rows = Math.ceil(height / vertSpacing) + 2;
      const cols = Math.ceil(width / hexW) + 2;
      const next: Hex[] = [];
      for (let row = -1; row < rows; row++) {
        const y = row * vertSpacing;
        const xOffset = row % 2 !== 0 ? hexW / 2 : 0;
        for (let col = -1; col < cols; col++) {
          next.push({ x: col * hexW + xOffset, y });
        }
      }
      hexes = next;
    }

    function draw() {
      const width = window.innerWidth;
      const height = window.innerHeight;
      ctx!.clearRect(0, 0, width, height);
      for (const hex of hexes) {
        const dx = hex.x - mouse.x;
        const dy = hex.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const t = Math.max(0, 1 - dist / HOVER_RADIUS);
        const eased = t * t;
        ctx!.fillStyle = eased > 0.01 ? lerpColor(BASE_FILL, HOVER_FILL, eased) : `rgba(${BASE_FILL.join(",")})`;
        hexPath(ctx!, hex.x, hex.y, HEX_SIZE - 1.5);
        ctx!.fill();
        ctx!.strokeStyle = STROKE;
        ctx!.lineWidth = 1;
        ctx!.stroke();
      }
    }

    function scheduleDraw() {
      if (raf != null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        draw();
      });
    }

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const width = window.innerWidth;
      const height = window.innerHeight;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildGrid(width, height);
      draw();
    }

    function handleMouseMove(e: MouseEvent) {
      mouse = { x: e.clientX, y: e.clientY };
      scheduleDraw();
    }

    function handleMouseLeave(e: MouseEvent) {
      if (!e.relatedTarget) {
        mouse = { x: -9999, y: -9999 };
        scheduleDraw();
      }
    }

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", handleMouseMove);
    document.documentElement.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
      document.documentElement.removeEventListener("mouseleave", handleMouseLeave);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0" />;
}
