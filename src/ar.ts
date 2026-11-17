// World-anchored camera math for the live view.
//
// World frame: x = east, y = north, z = up (metres). The phone's rotation comes from
// expo-sensors DeviceMotion.rotation (alpha, beta, gamma in radians), which follows the
// W3C DeviceOrientation convention on both iOS and Android:  R = Rz(alpha) · Rx(beta) · Ry(gamma)
// R turns device coordinates (x = right, y = top of phone, z = out of the screen) into world ones.
// The back camera looks along device -z.

export type Mat3 = number[]; // row-major 3x3
export type Vec3 = [number, number, number];

export const CAM_H = 1.45;   // phone height above the floor, metres

/** Phone held upright in portrait, camera facing north. Used when there are no sensors. */
export const UPRIGHT = { alpha: 0, beta: Math.PI / 2, gamma: 0 };

export function rotFromEuler(alpha: number, beta: number, gamma: number): Mat3 {
  const ca = Math.cos(alpha), sa = Math.sin(alpha);
  const cb = Math.cos(beta), sb = Math.sin(beta);
  const cg = Math.cos(gamma), sg = Math.sin(gamma);
  return [
    ca * cg - sa * sb * sg, -cb * sa, cg * sa * sb + ca * sg,
    cg * sa + ca * sb * sg, ca * cb, sa * sg - ca * cg * sb,
    -cb * sg, sb, cb * cg,
  ];
}

/** Direction the back camera looks at, in world coordinates. */
export const camForward = (R: Mat3): Vec3 => [-R[2], -R[5], -R[8]];

/** Compass-style direction of the camera (0 = north, clockwise), robust when looking down. */
export function camAzimuth(R: Mat3): number {
  const f = camForward(R);
  if (Math.hypot(f[0], f[1]) > 0.3) return Math.atan2(f[0], f[1]);
  return Math.atan2(R[1], R[4]); // phone flat: use the direction the top of the phone points
}

export type CamPt = { x: number; y: number; depth: number };

/**
 * A pinhole camera for the live-view area.
 * `offset` turns map directions into world directions; it is chosen when the phone is raised
 * so that the route ahead lines up with where the camera points. After that the route stays put.
 */
export function makeCamera(R: Mat3, offset: number, W: number, H: number) {
  const f = W * 0.98;                       // ≈ 54° horizontal field of view (phone main camera, portrait)
  const co = Math.cos(offset), so = Math.sin(offset);
  /** east/north metres relative to the phone, height above the floor -> world vector */
  const world = (e: number, n: number, h: number): Vec3 => [e * co + n * so, n * co - e * so, h - CAM_H];
  /** world vector -> camera space (x right, y up, depth forward) */
  const toCam = (v: Vec3): CamPt => ({
    x: R[0] * v[0] + R[3] * v[1] + R[6] * v[2],
    y: R[1] * v[0] + R[4] * v[1] + R[7] * v[2],
    depth: -(R[2] * v[0] + R[5] * v[1] + R[8] * v[2]),
  });
  const project = (c: CamPt) => ({ X: W / 2 + (f * c.x) / c.depth, Y: H / 2 - (f * c.y) / c.depth });
  return { f, world, toCam, project };
}

const NEAR = 0.15;
/** Clip a camera-space polygon against the near plane (so walls behind you don't explode). */
export function clipNear(poly: CamPt[]): CamPt[] {
  const out: CamPt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ain = a.depth >= NEAR, bin = b.depth >= NEAR;
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = (NEAR - a.depth) / (b.depth - a.depth);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, depth: NEAR });
    }
  }
  return out;
}
