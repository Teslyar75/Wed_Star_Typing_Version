/** Порт stamina/living_space.Scene — звёзды, кометы, астероиды, планеты (Canvas 2D). */

export type SpaceProfile = "light" | "full";

const PROFILE = {
  light: { stars: 90, comets: 1, rocks: 3, planets: 1 },
  full: { stars: 170, comets: 2, rocks: 6, planets: 2 },
};

type Star = { x: number; y: number; layer: number; b: number };
type Comet = { x: number; y: number; speed: number; drift: number; tail: number };
type Rock = { x: number; y: number; speed: number; shape: [number, number][]; ang: number; rot: number };
type Planet = { x: number; y: number; r: number; c1: string; c2: string; ring: boolean; speed: number };

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class LivingSpaceScene {
  w: number;
  h: number;
  stars: Star[] = [];
  comets: Comet[] = [];
  rocks: Rock[] = [];
  planets: Planet[] = [];
  private rng: () => number;
  private profile: (typeof PROFILE)[SpaceProfile];

  constructor(w: number, h: number, mode: SpaceProfile = "light", seed = 5) {
    this.w = Math.max(w, 50);
    this.h = Math.max(h, 50);
    this.profile = PROFILE[mode];
    this.rng = mulberry32(seed);
    this.seedObjects();
  }

  resize(w: number, h: number) {
    const sx = w / this.w;
    const sy = h / this.h;
    this.w = Math.max(w, 50);
    this.h = Math.max(h, 50);
    for (const s of this.stars) {
      s.x *= sx;
      s.y *= sy;
    }
    for (const c of this.comets) {
      c.x *= sx;
      c.y *= sy;
    }
    for (const r of this.rocks) {
      r.x *= sx;
      r.y *= sy;
    }
    for (const p of this.planets) {
      p.x *= sx;
      p.y *= sy;
      p.r *= Math.min(sx, sy);
    }
  }

  private seedObjects() {
    const r = this.rng;
    const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)]!;
    this.stars = Array.from({ length: this.profile.stars }, () => ({
      x: r() * this.w,
      y: r() * this.h,
      layer: pick([1, 1, 1, 2, 2, 3]),
      b: 0.4 + r() * 0.6,
    }));
    this.comets = Array.from({ length: this.profile.comets }, () => this.newComet(true));
    this.rocks = Array.from({ length: this.profile.rocks }, () => this.newRock(true));
    type Spec = { fx: number; fy: number; fr: number; c1: string; c2: string; ring: boolean; speed: number };
    const specs: Spec[] = [
      { fx: 0.78, fy: 0.3, fr: 0.22, c1: "rgb(70,120,200)", c2: "rgb(30,40,90)", ring: true, speed: 0.6 },
      { fx: 0.18, fy: 0.8, fr: 0.1, c1: "rgb(210,140,80)", c2: "rgb(90,40,30)", ring: false, speed: 1.1 },
    ];
    this.planets = [];
    for (let i = 0; i < this.profile.planets; i++) {
      const s = specs[i]!;
      this.planets.push({
        x: s.fx * this.w,
        y: s.fy * this.h,
        r: Math.min(this.h, this.w * 0.6) * s.fr,
        c1: s.c1,
        c2: s.c2,
        ring: s.ring,
        speed: s.speed,
      });
    }
  }

  private newComet(initial = false): Comet {
    const r = this.rng;
    return {
      x: initial ? (0.2 + r() * 0.8) * this.w : this.w + 50 + r() * 350,
      y: (0.05 + r() * 0.65) * this.h,
      speed: 14 + r() * 16,
      drift: 4 + r() * 6,
      tail: 60 + r() * 60,
    };
  }

  private newRock(initial = false): Rock {
    const r = this.rng;
    const n = 6 + Math.floor(r() * 4);
    const size = 4 + r() * 8;
    const shape: [number, number][] = [];
    for (let k = 0; k < n; k++) {
      const a = (Math.PI * 2 * k) / n;
      shape.push([Math.cos(a) * size * (0.6 + r() * 0.5), Math.sin(a) * size * (0.6 + r() * 0.5)]);
    }
    return {
      x: initial ? r() * this.w : this.w + 20 + r() * 280,
      y: r() * this.h,
      speed: 25 + r() * 35,
      shape,
      ang: r() * Math.PI * 2,
      rot: -0.8 + r() * 1.6,
    };
  }

  step(dt: number, warp = 1) {
    for (const s of this.stars) {
      s.x -= s.layer * 9 * warp * dt;
      if (s.x < -4) {
        s.x = this.w + this.rng() * 30;
        s.y = this.rng() * this.h;
      }
    }
    for (const c of this.comets) {
      c.x -= c.speed * warp * dt;
      c.y += c.drift * dt * 0.25;
      if (c.x < -c.tail * 2) Object.assign(c, this.newComet());
    }
    for (const rk of this.rocks) {
      rk.x -= rk.speed * warp * dt;
      rk.ang += rk.rot * dt;
      if (rk.x < -20) Object.assign(rk, this.newRock());
    }
    for (const p of this.planets) {
      p.x -= p.speed * warp * dt;
      if (p.x < -p.r * 2) p.x = this.w + p.r * 2;
    }
  }

  draw(ctx: CanvasRenderingContext2D, bg: string) {
    const { w, h } = this;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // туманности
    const g1 = ctx.createRadialGradient(w * 0.3, h * 0.35, 0, w * 0.3, h * 0.35, w * 0.45);
    g1.addColorStop(0, "rgba(20,40,80,0.45)");
    g1.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, w, h);
    const g2 = ctx.createRadialGradient(w * 0.75, h * 0.7, 0, w * 0.75, h * 0.7, w * 0.35);
    g2.addColorStop(0, "rgba(45,20,60,0.4)");
    g2.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, w, h);

    for (const p of this.planets) this.drawPlanet(ctx, p);
    for (const s of this.stars) {
      const v = Math.floor((80 + 60 * s.layer) * s.b);
      ctx.fillStyle = `rgb(${v},${Math.min(255, v + 15)},${Math.min(255, v + 30)})`;
      if (s.layer === 3) {
        ctx.fillRect(s.x, s.y, 3, 1);
      } else {
        ctx.fillRect(s.x, s.y, 1, 1);
      }
    }
    for (const c of this.comets) this.drawComet(ctx, c);
    for (const rk of this.rocks) this.drawRock(ctx, rk);
  }

  private drawPlanet(ctx: CanvasRenderingContext2D, p: Planet) {
    const grd = ctx.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.1, p.x, p.y, p.r);
    grd.addColorStop(0, p.c1);
    grd.addColorStop(1, p.c2);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();
    if (p.ring) {
      ctx.strokeStyle = "rgba(200,210,230,0.55)";
      ctx.lineWidth = Math.max(2, p.r / 18);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.r * 1.7, p.r * 0.38, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawComet(ctx: CanvasRenderingContext2D, c: Comet) {
    for (let k = 12; k > 0; k--) {
      const t = k / 12;
      const a = 1 - t;
      ctx.strokeStyle = `rgb(${Math.floor(60 + 140 * a)},${Math.floor(150 + 90 * a)},${Math.floor(190 + 60 * a)})`;
      ctx.lineWidth = Math.max(1, 4 * a);
      ctx.beginPath();
      ctx.moveTo(c.x + c.tail * t, c.y - c.tail * t * 0.12);
      ctx.lineTo(c.x + c.tail * (t - 1 / 12), c.y - c.tail * (t - 1 / 12) * 0.12);
      ctx.stroke();
    }
    ctx.fillStyle = "rgb(235,250,255)";
    ctx.beginPath();
    ctx.arc(c.x, c.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawRock(ctx: CanvasRenderingContext2D, rk: Rock) {
    const ca = Math.cos(rk.ang);
    const sa = Math.sin(rk.ang);
    ctx.beginPath();
    rk.shape.forEach(([px, py], i) => {
      const x = rk.x + px * ca - py * sa;
      const y = rk.y + px * sa + py * ca;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = "rgb(58,54,62)";
    ctx.strokeStyle = "rgb(110,104,112)";
    ctx.fill();
    ctx.stroke();
  }
}
