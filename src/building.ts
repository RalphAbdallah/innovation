// The digital map of the ESIB "Salles de Cours" ground floor, as drawn in the pitch deck.
// Map units: 1 unit = 16 cm. y grows downwards (north is up).

export const M_PER_UNIT = 0.16;
export const WALK_SPEED = 1.8; // metres per second (a brisk demo pace)

export type Pt = { x: number; y: number };
export type Room = {
  id: string;
  type: string;
  x: number; y: number; w: number; h: number;
  side: 'L' | 'R';            // which side of the corridor the door is on
  label?: string;
  navigable?: boolean;
};

export const BUILDING = { x: 24, y: 130, w: 342, h: 330 };
export const COURTYARD = { x: 24, y: 500, w: 240, h: 172 };
export const START: Pt = { x: 140, y: 606 };   // Cours carré
export const HALL_X = 195;                    // corridor centre line

export const ROOMS: Room[] = [
  { id: 'SCI 01', type: 'Salle de cours', x: 38, y: 142, w: 124, h: 70, side: 'L', navigable: true },
  { id: 'SCI 02', type: 'Salle de cours', x: 38, y: 222, w: 124, h: 70, side: 'L', navigable: true },
  { id: 'Lift', type: 'Elevator', x: 38, y: 302, w: 58, h: 62, side: 'L' },
  { id: 'WC', type: 'Toilets', x: 104, y: 302, w: 58, h: 62, side: 'L', navigable: true },
  { id: 'Stairs', type: 'To floors 1–3', x: 38, y: 374, w: 124, h: 74, side: 'L', navigable: true },
  { id: 'SCI 06', type: 'Salle de cours', x: 228, y: 142, w: 124, h: 70, side: 'R', navigable: true },
  { id: 'SCI 05', type: 'Salle de cours', x: 228, y: 222, w: 124, h: 70, side: 'R', navigable: true },
  { id: 'SCI 04', type: 'Salle de cours', x: 228, y: 302, w: 124, h: 62, side: 'R', navigable: true },
  { id: 'SCI 03', type: 'Salle de cours', x: 228, y: 374, w: 124, h: 74, side: 'R', navigable: true },
];

export const findRoom = (id: string) => ROOMS.find(r => r.id === id);

/** Route = courtyard -> main entrance -> along the corridor -> the room's door. */
export function routeTo(r: Room): Pt[] {
  const cy = r.y + r.h / 2;
  const door = r.side === 'R' ? { x: r.x + 16, y: cy } : { x: r.x + r.w - 16, y: cy };
  return [START, { x: HALL_X, y: 556 }, { x: HALL_X, y: cy }, door];
}

export class Route {
  pts: Pt[];
  cum: number[] = [0];
  total: number;
  constructor(pts: Pt[]) {
    this.pts = pts;
    for (let i = 1; i < pts.length; i++) {
      this.cum.push(this.cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    }
    this.total = this.cum[this.cum.length - 1];
  }
  get totalM() { return this.total * M_PER_UNIT; }
  segAt(s: number) {
    let i = 0;
    while (i < this.pts.length - 2 && s > this.cum[i + 1]) i++;
    return i;
  }
  pointAt(s: number): Pt {
    const i = this.segAt(s), a = this.pts[i], b = this.pts[i + 1];
    const L = this.cum[i + 1] - this.cum[i];
    const k = L ? Math.min(1, Math.max(0, (s - this.cum[i]) / L)) : 0;
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  }
  /** Heading of a segment in radians, 0 = north, clockwise. */
  segHeading(i: number) {
    const a = this.pts[i], b = this.pts[i + 1];
    return Math.atan2(b.x - a.x, -(b.y - a.y));
  }
  get dest() { return this.pts[this.pts.length - 1]; }
}

export const angDiff = (a: number, b: number) => {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
};

export const walkMinutes = (m: number) => Math.max(1, Math.round(m / 1.25 / 60));
