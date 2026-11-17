import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Polygon, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { CAM_H, CamPt, clipNear, makeCamera, Mat3, Vec3 } from './ar';
import { M_PER_UNIT, Route } from './building';
import { C } from './theme';

type Props = {
  width: number;
  height: number;
  route: Route;
  s: number;            // distance walked along the route, map units
  heading: number;      // walking direction on the map, radians (0 = map up), for the simulated corridor
  R: Mat3;              // phone rotation (device -> world)
  offset: number;       // map -> world rotation, fixed when the phone was raised
  time: number;         // seconds, for the pulse along the dots
  camera: boolean;      // real camera feed underneath, or draw the simulated corridor
  label: string;
};

/**
 * Live view: route dots painted on the floor, anchored in the world.
 * Every dot is a fixed 3D point on the floor; each frame it is projected through the phone's
 * current rotation, so turning or tilting the phone moves the view, not the dots.
 */
export default function LiveView(p: Props) {
  const { width: W, height: H } = p;
  if (!W || !H) return <View style={StyleSheet.absoluteFill} />;
  const cam = makeCamera(p.R, p.offset, W, H);
  const pos = p.route.pointAt(p.s);
  const walkedM = p.s * M_PER_UNIT;

  /** map point (units) at height h -> camera space */
  const mapToCam = (q: { x: number; y: number }, h: number) =>
    cam.toCam(cam.world((q.x - pos.x) * M_PER_UNIT, -(q.y - pos.y) * M_PER_UNIT, h));

  // ---- dots every 1.1 m along the route, up to 30 m ahead ----
  const step = 1.1, R0 = 0.2;
  const dots: { X: number; Y: number; rx: number; ry: number; rot: number; o: number; glow: number }[] = [];
  for (let sm = Math.ceil(walkedM / step) * step; sm <= p.route.totalM && sm - walkedM < 30; sm += step) {
    const q = p.route.pointAt(sm / M_PER_UNIT);
    const e = (q.x - pos.x) * M_PER_UNIT, n = -(q.y - pos.y) * M_PER_UNIT;
    const dist = Math.hypot(e, n);
    if (dist < 0.6) continue;                         // the one under your feet
    const c = cam.toCam(cam.world(e, n, 0));
    if (c.depth < 0.3) continue;                      // behind the camera
    const P = cam.project(c);
    // a second point to the side of the dot gives its on-screen size and tilt (handles roll)
    const side = cam.toCam(cam.world(e + (-n / dist) * R0, n + (e / dist) * R0, 0));
    if (side.depth < 0.3) continue;
    const S = cam.project(side);
    const rx = Math.hypot(S.X - P.X, S.Y - P.Y);
    const squash = Math.max(0.15, Math.min(1, cam_h_over(dist)));
    if (P.X < -rx || P.X > W + rx || P.Y < -rx || P.Y > H + rx) continue;
    const ph = (((p.time * 7 - (sm - walkedM)) % 10) + 10) % 10;
    dots.push({
      X: P.X, Y: P.Y, rx, ry: rx * squash, rot: (Math.atan2(S.Y - P.Y, S.X - P.X) * 180) / Math.PI,
      o: Math.min(1, (30 - dist) / 8), glow: Math.max(0, 1 - Math.abs(ph - 2) / 2),
    });
  }
  dots.reverse(); // far first

  // ---- destination tag, or an edge arrow when the room is out of view ----
  const anchor = mapToCam(p.route.dest, 1.6);
  const tagW = p.label.length * 11.5 + 30;
  let tag: null | { X: number; Y: number } = null;
  let edge: null | 'L' | 'R' = null;
  if (anchor.depth > 0.5) {
    const A = cam.project(anchor);
    if (A.X > 20 && A.X < W - 20 && A.Y > 60 && A.Y < H + 40) tag = { X: A.X, Y: Math.max(110, A.Y) };
    else edge = A.X < W / 2 ? 'L' : 'R';
  } else edge = anchor.x < 0 ? 'L' : 'R';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
        {!p.camera && <Corridor W={W} H={H} cam={cam} heading={p.heading} walked={walkedM} />}
        {dots.map((d, i) => {
          const g = d.glow;
          const fill = g > 0 ? `rgb(${(63 + 120 * g) | 0},${(134 + 90 * g) | 0},245)` : C.blue;
          return (
            <Ellipse key={i} cx={d.X} cy={d.Y} rx={d.rx} ry={d.ry} fill={fill} opacity={d.o}
              transform={`rotate(${d.rot.toFixed(1)} ${d.X.toFixed(1)} ${d.Y.toFixed(1)})`}
              stroke={C.white} strokeWidth={Math.max(1.2, d.rx * 0.14)} />
          );
        })}
        {tag && (
          <G>
            <Rect x={tag.X - tagW / 2} y={tag.Y - 64} width={tagW} height={38} rx={19} fill={C.blue} stroke={C.white} strokeWidth={2.5} />
            <Polygon points={`${tag.X - 9},${tag.Y - 26} ${tag.X + 9},${tag.Y - 26} ${tag.X},${tag.Y - 13}`} fill={C.blue} />
            <Circle cx={tag.X} cy={tag.Y} r={6} fill={C.blue} stroke={C.white} strokeWidth={2.5} />
            <SvgText x={tag.X} y={tag.Y - 38} textAnchor="middle" fontSize={19} fontWeight="700" fill={C.white}>{p.label}</SvgText>
          </G>
        )}
        {edge && (
          <G>
            <Rect x={edge === 'L' ? 10 : W - tagW - 30} y={H / 2 - 21} width={tagW + 20} height={42} rx={21}
              fill={C.blue} stroke={C.white} strokeWidth={2.5} />
            <SvgText x={(edge === 'L' ? 10 : W - tagW - 30) + (tagW + 20) / 2} y={H / 2 + 7} textAnchor="middle"
              fontSize={19} fontWeight="700" fill={C.white}>
              {edge === 'L' ? `‹ ${p.label}` : `${p.label} ›`}
            </SvgText>
          </G>
        )}
      </Svg>
    </View>
  );
}

/** How flat a floor disc looks from the phone: camera height / distance. */
const cam_h_over = (dist: number) => CAM_H / Math.hypot(dist, CAM_H);

type Cam = ReturnType<typeof makeCamera>;

/**
 * A stylised ESIB corridor (beige walls, blue doors, terrazzo floor), used when the camera is off.
 * It is built in 3D around the route, so it is anchored in the world exactly like the dots.
 */
function Corridor({ W, H, cam, heading, walked }: { W: number; H: number; cam: Cam; heading: number; walked: number }) {
  const L = -1.75, Rw = 1.75, CEIL = 3.0, far = 42, back = 6;
  // corridor axes on the map (east, north)
  const ue = Math.sin(heading), un = Math.cos(heading);
  const ve = un, vn = -ue; // to the right
  const pt = (d: number, l: number, h: number): CamPt =>
    cam.toCam(cam.world(d * ue + l * ve, d * un + l * vn, h) as Vec3);
  const poly = (corners: CamPt[]) => {
    const c = clipNear(corners);
    if (c.length < 3) return null;
    return c.map(q => { const P = cam.project(q); return `${P.X.toFixed(1)},${P.Y.toFixed(1)}`; }).join(' ');
  };
  const quad = (a: [number, number, number], b: [number, number, number], c: [number, number, number], d: [number, number, number]) =>
    poly([pt(...a), pt(...b), pt(...c), pt(...d)]);

  const shapes: { pts: string | null; fill: string; op?: number }[] = [];
  const add = (pts: string | null, fill: string, op?: number) => shapes.push({ pts, fill, op });

  add(quad([-back, L, CEIL], [far, L, CEIL], [far, Rw, CEIL], [-back, Rw, CEIL]), '#E6E1D8');   // ceiling
  add(quad([-back, L, 0], [far, L, 0], [far, L, CEIL], [-back, L, CEIL]), '#E2D9C9');           // left wall
  add(quad([-back, Rw, 0], [far, Rw, 0], [far, Rw, CEIL], [-back, Rw, CEIL]), '#D6CCBA');       // right wall
  add(quad([-back, L, 0], [far, L, 0], [far, L, 1.05], [-back, L, 1.05]), '#CBBFAB');
  add(quad([-back, Rw, 0], [far, Rw, 0], [far, Rw, 1.05], [-back, Rw, 1.05]), '#C3B6A1');
  add(quad([-back, L, 0], [far, L, 0], [far, Rw, 0], [-back, Rw, 0]), 'url(#floor)');           // floor
  add(quad([far, L, 0], [far, Rw, 0], [far, Rw, CEIL], [far, L, CEIL]), '#CFC5B4');             // far wall
  add(quad([-back, L, 0], [-back, Rw, 0], [-back, Rw, CEIL], [-back, L, CEIL]), '#CFC5B4');     // wall behind you

  const P = 8; // blue doors
  for (const [lat, ph] of [[L, 1.5], [Rw, 5.5]] as const) {
    for (let d0 = P - ((walked + P - ph) % P) - P; d0 < far; d0 += P) {
      if (d0 > -back) add(quad([d0, lat, 0], [d0 + 1.1, lat, 0], [d0 + 1.1, lat, 2.15], [d0, lat, 2.15]), '#2C4F9E');
    }
  }
  for (let d = 1 - (walked % 1) - back; d < far; d += 1) {             // tile seams (thin strips)
    add(quad([d, L, 0.002], [d + 0.03, L, 0.002], [d + 0.03, Rw, 0.002], [d, Rw, 0.002]), '#503C28', 0.18);
  }
  for (let d = 3 - (walked % 3) - back; d < far; d += 3) {             // ceiling lights
    add(quad([d, -0.35, CEIL - 0.01], [d, 0.35, CEIL - 0.01], [d + 0.6, 0.35, CEIL - 0.01], [d + 0.6, -0.35, CEIL - 0.01]), '#FFFFFA', 0.95);
  }

  return (
    <G>
      <Defs>
        <LinearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#C2B39A" /><Stop offset="1" stopColor="#B09E84" />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill="#DCD5C8" />
      {shapes.map((sh, i) => sh.pts ? <Polygon key={i} points={sh.pts} fill={sh.fill} fillOpacity={sh.op ?? 1} /> : null)}
    </G>
  );
}
