/** Image backdrop + engine FX (порт идей stamina/backgrounds/scenes.py). */

export type BgEngine = "living_space" | "sonar" | "gears" | "candles" | "city_rain" | "zen" | string;

type Particle = { x: number; y: number; r: number; v: number; a?: number };

function cssVar(name: string, fallback: string) {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export class SkinBackdropScene {
  w: number;
  h: number;
  engine: BgEngine;
  themeId: string;
  t = 0;
  angle = 0;
  particles: Particle[] = [];
  private img: HTMLImageElement | null = null;
  private imgReady = false;
  private rot = 0;

  constructor(w: number, h: number, themeId: string, engine: BgEngine = "living_space") {
    this.w = Math.max(w, 40);
    this.h = Math.max(h, 40);
    this.themeId = themeId;
    this.engine = engine;
    this.resetParticles();
    this.loadImage();
  }

  setTheme(themeId: string, engine: BgEngine) {
    if (themeId === this.themeId && engine === this.engine) return;
    this.themeId = themeId;
    this.engine = engine;
    this.imgReady = false;
    this.img = null;
    this.resetParticles();
    this.loadImage();
  }

  resize(w: number, h: number) {
    this.w = Math.max(w, 40);
    this.h = Math.max(h, 40);
  }

  private resetParticles() {
    const n = this.engine === "city_rain" ? 60 : 28;
    this.particles = Array.from({ length: n }, () => ({
      x: Math.random() * this.w,
      y: Math.random() * this.h,
      r: 0.8 + Math.random() * 2.2,
      v: 0.4 + Math.random() * 1.2,
      a: Math.random() * Math.PI * 2,
    }));
  }

  private loadImage() {
    const el = new Image();
    el.decoding = "async";
    el.onload = () => {
      this.img = el;
      this.imgReady = true;
    };
    el.onerror = () => {
      this.img = null;
      this.imgReady = false;
    };
    el.src = `/skins/${this.themeId}/bg1.jpg`;
  }

  step(dt: number) {
    this.t += dt;
    const warp = 1;
    if (this.engine === "sonar") {
      this.angle = (this.angle + dt * 0.85) % (Math.PI * 2);
      for (const p of this.particles) {
        p.y -= (18 + 20 * warp) * dt * p.v;
        p.x += Math.sin(this.t * 2 + p.r) * 10 * dt;
        if (p.y < -4) {
          p.y = this.h + 4;
          p.x = Math.random() * this.w;
        }
      }
    } else if (this.engine === "gears") {
      this.rot += dt * (0.6 + warp);
      for (const p of this.particles) {
        p.y -= 8 * dt * p.v;
        if (p.y < -4) p.y = this.h + 4;
      }
    } else if (this.engine === "city_rain") {
      for (const p of this.particles) {
        p.y += (90 + 40 * warp) * dt * p.v;
        p.x += 12 * dt;
        if (p.y > this.h + 10) {
          p.y = -10;
          p.x = Math.random() * this.w;
        }
      }
    } else if (this.engine === "candles") {
      for (const p of this.particles) {
        p.y -= (10 + 8 * warp) * dt * p.v;
        p.x += Math.sin(this.t * 3 + p.r) * 6 * dt;
        if (p.y < -4) {
          p.y = this.h * 0.7 + Math.random() * this.h * 0.3;
          p.x = Math.random() * this.w;
        }
      }
    } else if (this.engine === "zen") {
      for (const p of this.particles) {
        p.x += Math.cos(p.a || 0) * 12 * dt;
        p.y += Math.sin(p.a || 0) * 6 * dt + 4 * dt;
        if (p.x < -10 || p.x > this.w + 10 || p.y > this.h + 10) {
          p.x = Math.random() * this.w;
          p.y = -8;
          p.a = Math.random() * Math.PI * 2;
        }
      }
    } else {
      for (const p of this.particles) {
        p.y -= 6 * dt * p.v;
        if (p.y < -4) p.y = this.h + 4;
      }
    }
  }

  private drawCover(ctx: CanvasRenderingContext2D, bg: string) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.w, this.h);
    if (!this.imgReady || !this.img) return;
    const iw = this.img.naturalWidth || 1;
    const ih = this.img.naturalHeight || 1;
    const scale = Math.max(this.w / iw, this.h / ih);
    const nw = iw * scale;
    const nh = ih * scale;
    const ox = (this.w - nw) / 2;
    const oy = (this.h - nh) / 2;
    ctx.globalAlpha = 0.42;
    ctx.drawImage(this.img, ox, oy, nw, nh);
    ctx.globalAlpha = 1;
    ctx.fillStyle = bg;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.globalAlpha = 1;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const bg = cssVar("--st-bg", "#03060c");
    const accent = cssVar("--st-cyan", cssVar("--st-accent", "#00e5ff"));
    this.drawCover(ctx, bg);
    ctx.strokeStyle = accent;
    ctx.fillStyle = accent;

    if (this.engine === "sonar") {
      const cx = this.w * 0.72;
      const cy = this.h * 0.55;
      const reach = Math.min(this.w, this.h) * 0.42;
      ctx.globalAlpha = 0.35;
      for (let i = 1; i <= 4; i++) {
        const r = Math.min(this.w, this.h) * 0.08 * i;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(this.angle) * reach, cy + Math.sin(this.angle) * reach);
      ctx.stroke();
      ctx.globalAlpha = 0.5;
      for (const p of this.particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      return;
    }

    if (this.engine === "gears") {
      const gears = [
        [0.22, 0.7, 40],
        [0.4, 0.62, 28],
        [0.78, 0.3, 48],
      ] as const;
      ctx.globalAlpha = 0.4;
      gears.forEach(([fx, fy, r], i) => {
        const x = this.w * fx;
        const y = this.h * fy;
        const a = this.rot * (i % 2 === 0 ? 1 : -1.3);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
        for (let k = 0; k < 8; k++) {
          const ang = a + (k / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(ang) * (r - 4), y + Math.sin(ang) * (r - 4));
          ctx.lineTo(x + Math.cos(ang) * (r + 8), y + Math.sin(ang) * (r + 8));
          ctx.stroke();
        }
      });
      ctx.globalAlpha = 0.35;
      for (const p of this.particles) {
        ctx.fillRect(p.x, p.y, 2, 2);
      }
      ctx.globalAlpha = 1;
      return;
    }

    if (this.engine === "city_rain") {
      ctx.globalAlpha = 0.45;
      for (const p of this.particles) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + 2, p.y + 10);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      return;
    }

    if (this.engine === "candles") {
      ctx.globalAlpha = 0.4;
      for (const p of this.particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      return;
    }

    if (this.engine === "zen") {
      ctx.globalAlpha = 0.4;
      for (const p of this.particles) {
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 4, 2, p.a || 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 0.2;
      ctx.beginPath();
      ctx.arc(this.w * 0.5, this.h * 0.7, 20 + Math.sin(this.t) * 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }

    // living_space / generic: лёгкие частицы поверх фото (если есть)
    ctx.globalAlpha = 0.3;
    for (const p of this.particles) {
      ctx.fillRect(p.x, p.y, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;
  }
}
