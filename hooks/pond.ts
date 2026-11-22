// Block-pixel koi pond. Each terminal cell is an upper half block whose
// foreground is the top pixel and background the bottom one, so pixels are
// roughly square and the pond is `columns` x `rows * 2` pixels.

const HALF_BLOCK = 0x2580

type Kind = 'kohaku' | 'sanke' | 'showa' | 'ogon' | 'chagoi'
const KINDS: Kind[] = ['kohaku', 'sanke', 'showa', 'ogon', 'chagoi', 'kohaku']

type Fish = {
  x: number // head position, pixels
  y: number // body center line, pixels
  targetY: number // where the fish is steering to
  dir: 1 | -1
  turnCooldown: number // frames before this fish may turn around again
  len: number
  half: number // half body width at its widest
  speed: number
  phase: number
  kind: Kind
  seed: number
}

type Pad = { x: number; y: number; r: number; notch: number; flower: boolean }

// Salma Koi Classic palette.
const WHITE = 0xf3ede2
const RED = 0xe0475b
const DEEP_RED = 0xc23246
const INK = 0x1c1c24
const GOLD = 0xe8b44c
const GOLD_LIGHT = 0xf5d58a
const ORANGE = 0xf26b3a
const WATER_TOP = 0x12343f
const WATER_BOTTOM = 0x0a1a22
const CAUSTIC = 0x1d4c58
const CAUSTIC_BRIGHT = 0x2a6370
const PAD = 0x3f7a48
const PAD_EDGE = 0x2b5733
const PAD_VEIN = 0x356b3e
const LOTUS = 0xe89ab0
const LOTUS_LIGHT = 0xf6c6d3

// ---------- small helpers ----------

let rngState = 0x9e3779b9
function rand(): number {
  rngState = (rngState + 0x6d2b79f5) | 0
  let t = rngState
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function noise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const a = hash(ix, iy, seed)
  const b = hash(ix + 1, iy, seed)
  const c = hash(ix, iy + 1, seed)
  const d = hash(ix + 1, iy + 1, seed)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

function mix(a: number, b: number, t: number): number {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t)
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t)
  const bl = (a & 255) + (((b & 255) - (a & 255)) * t)
  return ((r & 255) << 16) | ((g & 255) << 8) | (bl & 255)
}

function shade(c: number, k: number): number {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k))
  const g = Math.min(255, Math.round(((c >> 8) & 255) * k))
  const b = Math.min(255, Math.round((c & 255) * k))
  return (r << 16) | (g << 8) | b
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function base64(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const n = bytes[i]! << 16
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + '=='
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8)
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + '='
  }
  return out
}

// ---------- the pond ----------

// How far ahead, in frames, fish look for one another when avoiding overlap.
const LOOKAHEAD = 70

export class Pond {
  /** When true, fish steer around one another or turn back instead of overlapping. */
  private readonly avoidOverlap: boolean

  constructor(avoidOverlap = true) {
    this.avoidOverlap = avoidOverlap
  }

  private width = 0
  private height = 0
  private frame = 0
  private fish: Fish[] = []
  private pads: Pad[] = []
  private pixels = new Uint32Array(0)

  resize(columns: number, rows: number): void {
    const height = rows * 2
    if (columns === this.width && height === this.height) {
      return
    }
    this.width = columns
    this.height = height
    this.pixels = new Uint32Array(columns * height)
    const count = Math.max(2, Math.min(5, Math.round(columns / 40)))
    this.fish = []
    for (let i = 0; i < count; i++) {
      this.fish.push(this.spawn(true))
    }
    this.pads = []
    const padCount = Math.max(1, Math.round(columns / 70))
    for (let i = 0; i < padCount; i++) {
      this.pads.push({
        x: (columns / padCount) * (i + 0.3 + rand() * 0.4),
        y: rand() < 0.5 ? 2 + rand() * 2 : height - 3 - rand() * 2,
        r: 3 + rand() * 1.5,
        notch: rand() * Math.PI * 2,
        flower: i % 2 === 0,
      })
    }
  }

  private spawn(anywhere: boolean): Fish {
    const len = Math.max(22, Math.min(46, this.height * 2.2)) * (0.8 + rand() * 0.35)
    const half = Math.max(2.5, Math.min(this.height * 0.28, len * 0.14))
    const dir: 1 | -1 = rand() < 0.5 ? 1 : -1
    const margin = half + 3
    const pickX = () =>
      anywhere
        ? rand() * this.width
        : dir === 1
          ? -2 - rand() * this.width * 0.4
          : this.width + len + 2 + rand() * this.width * 0.4
    let x = pickX()
    const y = this.freeLane(margin)
    // Start clear of the others: try a few spots for one no fish covers.
    if (this.avoidOverlap) {
      for (let i = 0; i < 12 && this.isCrowded(x, dir, len, half, y); i++) {
        x = pickX()
      }
    }
    return {
      x,
      y,
      targetY: y,
      dir,
      turnCooldown: 0,
      len,
      half,
      speed: 0.25 + rand() * 0.35,
      phase: rand() * Math.PI * 2,
      kind: KINDS[Math.floor(rand() * KINDS.length)]!,
      seed: Math.floor(rand() * 100000),
    }
  }

  // A spawn height, picked to sit as far from the other fish as possible.
  private freeLane(margin: number): number {
    const span = Math.max(1, this.height - margin * 2)
    if (!this.avoidOverlap || this.fish.length === 0) {
      return margin + rand() * span
    }
    let best = margin
    let bestGap = -1
    for (let i = 0; i < 8; i++) {
      const y = margin + rand() * span
      let gap = Infinity
      for (const g of this.fish) {
        gap = Math.min(gap, Math.abs(g.y - y))
      }
      if (gap > bestGap) {
        bestGap = gap
        best = y
      }
    }
    return best
  }

  private isCrowded(x: number, dir: 1 | -1, len: number, half: number, y: number): boolean {
    const a = Math.min(x, x - len * dir) - 4
    const b = Math.max(x, x - len * dir) + 4
    return this.fish.some(g => {
      const ga = Math.min(g.x, g.x - g.len * g.dir)
      const gb = Math.max(g.x, g.x - g.len * g.dir)
      return ga <= b && a <= gb && Math.abs(g.y - y) < (half + g.half) * 1.2 + 1
    })
  }

  // The pixel columns a fish covers now, widened by where it will be soon.
  private reach(f: Fish, frames = LOOKAHEAD): [number, number] {
    const tail = f.x - f.len * f.dir
    const ahead = f.x + f.speed * f.dir * frames
    return [Math.min(tail, ahead, f.x), Math.max(tail, ahead, f.x)]
  }

  // Turns a fish around in place: the tail becomes the head, so the body
  // keeps the span it had and nothing jumps.
  private turn(f: Fish): void {
    f.x -= f.dir * f.len
    f.dir = f.dir === 1 ? -1 : 1
    f.turnCooldown = 120
  }

  // Two fish that can't pass: one turns back, or, if both just turned,
  // the one behind slows down behind the other.
  private giveWay(f: Fish, g: Fish, turned: Set<Fish>): void {
    if (turned.has(f) || turned.has(g)) return
    const isFacing = f.dir !== g.dir && (g.x - f.x) * f.dir > 0
    const isMovingApart = f.dir !== g.dir && !isFacing
    if (isMovingApart) return
    // Head-on: whichever may turn sooner; same way: the one behind.
    const turner = isFacing ? (f.turnCooldown <= g.turnCooldown ? f : g) : (g.x - f.x) * f.dir > 0 ? f : g
    const other = turner === f ? g : f
    if (turner.turnCooldown === 0) {
      this.turn(turner)
      turned.add(turner)
      // Now going the same way: keep ahead of the one it turned from.
      if (turner.dir === other.dir) {
        turner.speed = Math.max(turner.speed, other.speed + 0.05)
      }
    } else if (!isFacing) {
      turner.speed = Math.max(0.12, Math.min(turner.speed, other.speed - 0.05))
    } else if (other.turnCooldown === 0) {
      this.turn(other)
      turned.add(other)
    }
  }

  private avoid(): void {
    const fish = this.fish
    // Each fish may leave the pond by part of its body, so a dodge can use the edges.
    const lo = (f: Fish) => -f.half * 0.5
    const hi = (f: Fish) => this.height + f.half * 0.5
    // Fins and tail reach about 1.15 half-widths from the center line.
    const sep = (f: Fish, g: Fish) => (f.half + g.half) * 1.2 + 1

    // Pairs whose paths cross within the lookahead.
    const pairs: [Fish, Fish][] = []
    for (let i = 0; i < fish.length; i++) {
      for (let j = i + 1; j < fish.length; j++) {
        const f = fish[i]!
        const g = fish[j]!
        const [fa, fb] = this.reach(f)
        const [ga, gb] = this.reach(g)
        if (fb >= ga && gb >= fa) pairs.push([f, g])
      }
    }

    // About to touch and not yet apart: no time to dodge, so one turns back.
    const turned = new Set<Fish>()
    for (const [f, g] of pairs) {
      const [fa, fb] = this.reach(f, 12)
      const [ga, gb] = this.reach(g, 12)
      if (fb >= ga && gb >= fa && Math.abs(f.y - g.y) < sep(f, g) * 0.85) {
        this.giveWay(f, g, turned)
      }
    }

    // Spread the lanes: push crossing pairs apart until each has room,
    // the upper one going up, within the pond's edges.
    const target = new Map<Fish, number>()
    for (const f of fish) target.set(f, f.y)
    for (let round = 0; round < 8; round++) {
      for (const [f, g] of pairs) {
        const [up, down] = target.get(f)! <= target.get(g)! ? [f, g] : [g, f]
        const gap = target.get(down)! - target.get(up)!
        const need = sep(f, g) - gap
        if (need <= 0) continue
        target.set(up, Math.max(lo(up), target.get(up)! - need / 2))
        target.set(down, Math.min(hi(down), target.get(down)! + need / 2))
      }
    }

    // Still no room for a pair: one of them turns back.
    for (const [f, g] of pairs) {
      if (Math.abs(target.get(f)! - target.get(g)!) < sep(f, g) * 0.9) {
        this.giveWay(f, g, turned)
      }
    }

    for (const f of fish) {
      f.targetY = target.get(f)!
      f.y += (f.targetY - f.y) * 0.08
      if (f.turnCooldown > 0) f.turnCooldown--
    }
  }


  private step(): void {
    this.frame++
    if (this.avoidOverlap) {
      this.avoid()
    }
    for (let i = 0; i < this.fish.length; i++) {
      const f = this.fish[i]!
      f.x += f.speed * f.dir
      const gone = f.dir === 1 ? f.x - f.len > this.width + 2 : f.x + f.len < -2
      if (gone) {
        this.fish[i] = this.spawn(false)
      }
    }
    for (const p of this.pads) {
      p.x += 0.015
      if (p.x - p.r > this.width) {
        p.x = -p.r
      }
    }
  }

  private water(px: number, py: number): number {
    const t = this.frame
    const base = mix(WATER_TOP, WATER_BOTTOM, py / Math.max(1, this.height - 1))
    const v =
      Math.sin(px * 0.21 + t * 0.05) +
      Math.sin(py * 0.6 + px * 0.07 - t * 0.07) +
      Math.sin((px + py) * 0.13 + t * 0.03)
    if (v > 2.55) return CAUSTIC_BRIGHT
    if (v > 2.1) return mix(base, CAUSTIC, 0.8)
    return base
  }

  // Where (px, py) falls on fish f: 0 nothing, 1 body, 2 fin. Fills `out`
  // with the local coordinates used to color it.
  private hit(f: Fish, px: number, py: number, out: { s: number; dy: number; w: number }): number {
    const s = ((f.x - px) * f.dir) / f.len
    if (s < 0 || s > 1) return 0
    const t = this.frame
    const yc = f.y + Math.sin(t * 0.02 + f.phase) * (this.avoidOverlap ? 0.6 : 1.5)
    const wag = Math.sin(t * 0.32 + f.phase - s * 4.5) * f.half * 0.9 * s * s
    const dy = py + 0.5 - (yc + wag)
    const ady = Math.abs(dy)
    const h = f.half

    if (s <= 0.78) {
      const bw = s < 0.3 ? h * Math.sqrt(s / 0.3) : h * (1 - 0.85 * Math.pow((s - 0.3) / 0.48, 1.3))
      out.s = s
      out.dy = dy
      out.w = bw
      if (ady <= bw) return 1
      if (s > 0.24 && s < 0.42) {
        const flap = 0.7 + 0.3 * Math.sin(t * 0.3 + f.phase)
        const fw = bw + h * 0.8 * (1 - (s - 0.24) / 0.18) * flap
        if (ady <= fw) return 2
      }
      return 0
    }
    const k = (s - 0.78) / 0.22
    const tw = h * (0.15 + 1.0 * k)
    out.s = s
    out.dy = dy
    out.w = tw
    if (ady > tw) return 0
    if (k > 0.7 && ady < tw * (k - 0.7) * 1.6) return 0 // forked tail
    return 2
  }

  private bodyColor(f: Fish, s: number, dy: number, w: number): number {
    const e = Math.abs(dy) / Math.max(0.5, w)
    if (s > 0.05 && s < 0.11 && e > 0.45 && e < 0.95) return 0x0a0a0e // eyes
    const u = s * f.len * 0.16
    const v = dy * 0.32
    const n = noise(u, v + 10, f.seed)
    const n2 = noise(u * 2.1, v * 2.1 + 40, f.seed + 7)
    let c: number
    switch (f.kind) {
      case 'kohaku':
        c = (s < 0.2 && e < 0.8) || n > 0.55 ? RED : WHITE
        break
      case 'sanke':
        c = n2 > 0.78 && s > 0.15 ? INK : (s < 0.18 && e < 0.8) || n > 0.58 ? RED : WHITE
        break
      case 'showa':
        c = n > 0.6 ? RED : n2 > 0.5 || s > 0.6 ? INK : WHITE
        break
      case 'ogon':
        c = mix(GOLD, GOLD_LIGHT, Math.max(0, Math.sin(u * 3 + this.frame * 0.08) * 0.5))
        break
      case 'chagoi':
        c = n2 > 0.72 ? WHITE : ORANGE
        break
    }
    if (c === RED && n > 0.7) c = DEEP_RED
    if (e > 0.78) return shade(c, 0.72)
    if (e < 0.22 && s > 0.12) return shade(c, 1.08)
    return c
  }

  private finColor(f: Fish, under: number, s: number, dy: number): number {
    const tint = f.kind === 'ogon' ? GOLD_LIGHT : f.kind === 'chagoi' ? ORANGE : f.kind === 'showa' ? 0x8a8a96 : WHITE
    const ray = Math.sin(dy * 1.6 + s * 20) > 0.3 ? 0.6 : 0.45
    return mix(under, tint, ray)
  }

  private padColor(px: number, py: number): number {
    for (const p of this.pads) {
      const dx = px + 0.5 - p.x
      const dy = py + 0.5 - p.y
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d > p.r) continue
      let a = Math.atan2(dy, dx) - p.notch
      a = Math.atan2(Math.sin(a), Math.cos(a))
      if (Math.abs(a) < 0.35 && d > 0.6) continue // the notch
      if (p.flower && d < 1.6) return d < 0.8 ? GOLD_LIGHT : (Math.floor(px + py) & 1) === 0 ? LOTUS : LOTUS_LIGHT
      if (d > p.r - 0.9) return PAD_EDGE
      return Math.abs(Math.sin(Math.atan2(dy, dx) * 3)) < 0.18 ? PAD_VEIN : PAD
    }
    return -1
  }

  /** Advances one frame and returns the Raster cells for it. */
  render(): string {
    this.step()
    const { width: W, height: H, pixels } = this
    const out = { s: 0, dy: 0, w: 0 }
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        let c = this.water(px, py)
        // shadows first, offset down and to the right
        for (const f of this.fish) {
          if (this.hit(f, px - 2, py - 2, out) !== 0) {
            c = shade(c, 0.62)
            break
          }
        }
        for (const f of this.fish) {
          const kind = this.hit(f, px, py, out)
          if (kind === 1) c = this.bodyColor(f, out.s, out.dy, out.w)
          else if (kind === 2) c = this.finColor(f, c, out.s, out.dy)
        }
        const pad = this.padColor(px, py)
        if (pad !== -1) c = pad
        pixels[py * W + px] = c
      }
    }
    const rows = H / 2
    const words = new Uint32Array(W * rows * 3)
    let i = 0
    for (let r = 0; r < rows; r++) {
      for (let x = 0; x < W; x++) {
        words[i++] = HALF_BLOCK
        words[i++] = pixels[r * 2 * W + x]!
        words[i++] = pixels[(r * 2 + 1) * W + x]!
      }
    }
    return base64(new Uint8Array(words.buffer))
  }
}
