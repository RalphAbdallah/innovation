import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, Pressable, StyleSheet, Text, useAnimatedValue, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { CameraView } from 'expo-camera';
import { DeviceMotion } from 'expo-sensors';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import Svg, { Path, Rect } from 'react-native-svg';
import { angDiff, M_PER_UNIT, Room, Route, routeTo, WALK_SPEED, walkMinutes } from './building';
import FloorMap from './FloorMap';
import LiveView from './LiveView';
import { camAzimuth, camForward, Mat3, rotFromEuler, UPRIGHT } from './ar';
import { C } from './theme';

const FULL_VB = [0, 118, 390, 576];          // whole floor in view (phone held flat)
const LIVE_SHARE = 0.62;                      // live view takes the top 62% when raised
const DEG = Math.PI / 180;
const STEP_M = 0.7;                           // one detected step moves you 70 cm
const R_UPRIGHT = rotFromEuler(UPRIGHT.alpha, UPRIGHT.beta, UPRIGHT.gamma);

type Props = { room: Room; camera: boolean; onDone: () => void };
type WalkMode = 'auto' | 'steps';
type Frame = { s: number; heading: number; R: Mat3; offset: number; vb: number[]; time: number; elapsed: number };

export default function NavScreen({ room, camera, onDone }: Props) {
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const route = useMemo(() => new Route(routeTo(room)), [room]);

  // --- simulation state: the loop works on refs, then publishes one Frame per tick for rendering ---
  const sRef = useRef(0);
  const headingRef = useRef(route.segHeading(0));
  const elapsedRef = useRef(0);
  const vbRef = useRef([...FULL_VB]);
  const pausedRef = useRef(false);
  const arrivedRef = useRef(false);
  const raisedRef = useRef(false);
  const sizeRef = useRef({ w: 0, h: 0 });
  const insetBottom = useRef(insets.bottom);
  const [frame, setFrame] = useState<Frame>(() => ({
    s: 0, heading: route.segHeading(0), R: R_UPRIGHT, offset: 0, vb: FULL_VB, time: 0, elapsed: 0,
  }));
  const [walkMode, setWalkModeState] = useState<WalkMode>('auto');
  const walkModeRef = useRef<WalkMode>('auto');
  const [paused, setPaused] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [raised, setRaisedState] = useState(false);
  const [liveOn, setLiveOn] = useState(false);
  const [hint, setHint] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => { insetBottom.current = insets.bottom; }, [insets.bottom]);

  // --- phone orientation & steps ---
  const orient = useRef<{ alpha: number; beta: number; gamma: number } | null>(null);
  const offsetRef = useRef<number | null>(null);   // map -> world rotation, locked when the phone is raised
  const sensorRaised = useRef<boolean | null>(null);
  const stepArmed = useRef(true);
  const lastStep = useRef(0);

  const anim = useAnimatedValue(0);
  const arriveAnim = useAnimatedValue(0);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const setRaised = useCallback((v: boolean) => {
    if (raisedRef.current === v) return;
    raisedRef.current = v;
    setRaisedState(v);
    if (v) setLiveOn(true);
    Animated.timing(anim, { toValue: v ? 1 : 0, duration: 480, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: false })
      .start(({ finished }) => { if (finished && !v) setLiveOn(false); });
    if (v) {
      offsetRef.current = null;   // re-align the route with where the camera points (next frame)
      setHint(true);
      clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => setHint(false), 2200);
    }
  }, [anim]);

  const arrive = useCallback(() => {
    if (arrivedRef.current) return;
    arrivedRef.current = true;
    setArrived(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Animated.spring(arriveAnim, { toValue: 1, useNativeDriver: true, friction: 7, tension: 60, delay: 300 }).start();
  }, [arriveAnim]);

  // Phone orientation (radians on iOS and Android) drives three things:
  //   - phone flat -> 2D map, phone raised -> live view
  //   - the 3D camera that keeps the dots fixed on the floor
  //   - step detection in "My steps" mode
  useEffect(() => {
    let sub: { remove: () => void } | undefined;
    (async () => {
      try {
        if (!(await DeviceMotion.isAvailableAsync())) return;
        const perm = await DeviceMotion.requestPermissionsAsync();
        if (!perm.granted) return;
        DeviceMotion.setUpdateInterval(16);
        sub = DeviceMotion.addListener(m => {
          const r = m.rotation;
          if (!r) return;
          orient.current = { alpha: r.alpha, beta: r.beta, gamma: r.gamma };
          if (arrivedRef.current) return;

          // how far the camera looks down: 0 = straight ahead, -1 = at the floor under you
          const down = camForward(rotFromEuler(r.alpha, r.beta, r.gamma))[2];
          let sr = sensorRaised.current;
          if (down > -0.5) sr = true; else if (down < -0.8) sr = false;
          if (sr !== null && sr !== sensorRaised.current) {
            sensorRaised.current = sr;
            setRaised(sr);
          }

          // a step = a spike in the phone's own acceleration (gravity removed)
          const a = m.acceleration;
          if (a && walkModeRef.current === 'steps' && !pausedRef.current) {
            const mag = Math.hypot(a.x, a.y, a.z);
            const t = Date.now();
            if (stepArmed.current && mag > 1.6 && t - lastStep.current > 330) {
              stepArmed.current = false;
              lastStep.current = t;
              sRef.current = Math.min(route.total, sRef.current + STEP_M / M_PER_UNIT);
            } else if (mag < 0.8) stepArmed.current = true;
          }
        });
      } catch { /* no sensors (e.g. simulator): use the button instead */ }
    })();
    return () => { sub?.remove(); clearTimeout(hintTimer.current); };
  }, [setRaised, route]);

  // Main loop: walk along the route, smooth the heading, follow with the map camera.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!pausedRef.current && !arrivedRef.current) {
        elapsedRef.current += dt;
        if (walkModeRef.current === 'auto') {
          sRef.current = Math.min(route.total, sRef.current + (WALK_SPEED / M_PER_UNIT) * dt);
        }
        if (sRef.current >= route.total) arrive();
      }
      const ahead = Math.min(route.total - 0.01, sRef.current + 1.2 / M_PER_UNIT);
      headingRef.current += angDiff(route.segHeading(route.segAt(ahead)), headingRef.current) * Math.min(1, dt * 3.5);

      // the phone's rotation as a 3D camera; the route is locked to the world when the phone is raised
      const o = orient.current;
      const R = o ? rotFromEuler(o.alpha, o.beta, o.gamma) : R_UPRIGHT;
      if (!o) offsetRef.current = -headingRef.current;            // no sensors: always look down the route
      else if (offsetRef.current == null) offsetRef.current = camAzimuth(R) - headingRef.current;

      // map viewBox: whole floor when flat, follow "me" in the bottom sheet when raised
      const me = route.pointAt(sRef.current);
      const { w, h } = sizeRef.current;
      const sheetMapH = h - (h * LIVE_SHARE - 24) - 22 - insetBottom.current;
      const vbW = 220, vbH = vbW * (sheetMapH / Math.max(1, w));
      const target = raisedRef.current ? [me.x - vbW / 2, me.y - vbH * 0.55, vbW, vbH] : FULL_VB;
      const k = 1 - Math.exp(-dt * 6);
      vbRef.current = vbRef.current.map((v, i) => v + (target[i] - v) * k);

      setFrame({
        s: sRef.current, heading: headingRef.current, R, offset: offsetRef.current ?? 0,
        vb: vbRef.current, time: now / 1000, elapsed: elapsedRef.current,
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [route, arrive]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    sizeRef.current = { w: width, h: height };
    setSize({ w: width, h: height });
  };

  const togglePause = () => {
    if (arrivedRef.current) return;
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  };
  const skipAhead = () => { sRef.current = Math.min(route.total, sRef.current + 8 / M_PER_UNIT); };
  const toggleWalkMode = () => {
    walkModeRef.current = walkModeRef.current === 'auto' ? 'steps' : 'auto';
    setWalkModeState(walkModeRef.current);
  };

  // ---------- derived values for this frame ----------
  const s = frame.s;
  const me = route.pointAt(s);
  const seg = route.segAt(s);
  const liveH = size.h * LIVE_SHARE;
  const remM = (route.total - s) * M_PER_UNIT;

  const dir = room.side === 'R' ? 'right' : 'left';
  let instr: string;
  const segRem = (route.cum[seg + 1] - s) * M_PER_UNIT;
  if (arrived) instr = `${room.id} is right here`;
  else if (paused) instr = 'Paused · tap to continue';
  else if (walkMode === 'steps' && s === 0) instr = 'Start walking: your steps move you';
  else if (seg === 0) instr = `Walk to the main entrance · ${Math.round(segRem + 12)} m`;
  else if (seg === 1) {
    if (segRem > 7) instr = me.y > 470 ? 'Enter the building, go straight' : `Go straight · ${Math.round(segRem)} m`;
    else instr = `Turn ${dir} in ${Math.max(1, Math.round(segRem))} m`;
  } else instr = `${room.id} is on your ${dir}`;
  const eta = arrived ? 'Now' : paused ? '❚❚' : remM < 20 ? `${Math.max(1, Math.round(remM))} m` : `${walkMinutes(remM)} min`;

  const sec = Math.round(frame.elapsed);

  return (
    <View style={st.root} onLayout={onLayout}>
      <StatusBar style={raised ? 'light' : 'dark'} />

      {/* ---------- live view (camera + AR route) ---------- */}
      <Animated.View style={[st.live, { height: liveH, opacity: anim }]}>
        {camera && <CameraView style={StyleSheet.absoluteFill} facing="back" />}
        {liveOn && size.w > 0 && (
          <LiveView width={size.w} height={liveH} route={route} s={s} heading={frame.heading}
            R={frame.R} offset={frame.offset} time={frame.time}
            camera={camera} label={room.id} />
        )}
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setRaised(false)} />
        {!camera && <View style={st.chip} pointerEvents="none"><Text style={st.chipT}>Simulated camera view</Text></View>}
        {hint && <View style={st.hint} pointerEvents="none"><Text style={st.hintT}>Lower your phone to see the map</Text></View>}
      </Animated.View>

      {/* ---------- 2D map (full screen, or bottom sheet when raised) ---------- */}
      <Animated.View style={[st.sheet, {
        top: anim.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(0, liveH - 24)] }),
        borderTopLeftRadius: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 26] }),
        borderTopRightRadius: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 26] }),
      }]}>
        <Animated.View style={[st.grab, { opacity: anim }]} />
        <Animated.View style={[st.mapbox, {
          top: anim.interpolate({ inputRange: [0, 1], outputRange: [insets.top + 88, 22] }),
          bottom: anim.interpolate({ inputRange: [0, 1], outputRange: [insets.bottom + 86, insets.bottom] }),
        }]}>
          <FloorMap dest={room} route={route.pts} seg={seg} me={me} headingDeg={frame.heading / DEG}
            viewBox={frame.vb} pulse={(Math.sin(frame.time * 2.9) + 1) / 2} />
        </Animated.View>
      </Animated.View>

      {/* ---------- top banner: tap = pause, long-press = skip 8 m (for rehearsals) ---------- */}
      <Pressable
        onPress={togglePause}
        onLongPress={skipAhead}
        style={[st.banner, { top: insets.top + 4 }]}>
        <View style={st.navIc}>
          <Svg width={26} height={26} viewBox="0 0 24 24"><Path d="M12 3.5l6.5 15.5-6.5-3.6-6.5 3.6z" fill={C.blue} /></Svg>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.to}>to {room.id}</Text>
          <Text style={st.instr} numberOfLines={1}>{instr}</Text>
        </View>
        <Text style={st.eta}>{eta}</Text>
      </Pressable>

      {/* ---------- walk mode: simulated walking, or move only when you really step ---------- */}
      {!arrived && (
        <Pressable onPress={toggleWalkMode} style={[st.mode, { top: insets.top + 82 }]} hitSlop={8}>
          <View style={[st.modeDot, { backgroundColor: walkMode === 'auto' ? C.blue : C.green }]} />
          <Text style={st.modeT}>{walkMode === 'auto' ? 'Auto-walk' : 'My steps'}</Text>
        </Pressable>
      )}

      {/* ---------- raise prompt ---------- */}
      <Animated.View pointerEvents={raised ? 'none' : 'auto'} style={[st.raiseWrap, {
        bottom: insets.bottom + 10,
        opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 16] }) }],
      }]}>
        <Pressable style={st.raise} onPress={() => setRaised(true)}>
          <Svg width={34} height={34} viewBox="0 0 34 34" fill="none">
            <Rect x={3} y={7} width={13} height={23} rx={3} stroke={C.navy} strokeWidth={2.6} />
            <Path d="M25 30V6M25 4l-6 7M25 4l6 7" stroke={C.blue} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <Text style={st.raiseT}>Raise for live view</Text>
        </Pressable>
      </Animated.View>

      {/* ---------- arrival ---------- */}
      {arrived && (
        <Animated.View style={[StyleSheet.absoluteFill, st.scrim, { opacity: arriveAnim }]}>
          <Animated.View style={[st.card, { bottom: insets.bottom + 10, transform: [{ translateY: arriveAnim.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) }] }]}>
            <Animated.View style={[st.check, { transform: [{ scale: arriveAnim }] }]}>
              <Svg width={52} height={52} viewBox="0 0 48 48"><Path d="M12 25l8 8 16-17" fill="none" stroke={C.white} strokeWidth={5.5} strokeLinecap="round" strokeLinejoin="round" /></Svg>
            </Animated.View>
            <Text style={st.h2}>You&apos;ve arrived</Text>
            <Text style={st.sub}>{room.id} · {room.id.startsWith('SCI') ? 'Salles de Cours ESIB' : room.type}</Text>
            <View style={st.stats}>
              <Stat v={`${Math.round(route.totalM)} m`} k="walked" />
              <Stat v={`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`} k="time" />
              <Stat v="0" k="people asked" />
            </View>
            <Pressable style={st.btn} onPress={onDone}><Text style={st.btnT}>Done</Text></Pressable>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

function Stat({ v, k }: { v: string; k: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={st.statV}>{v}</Text>
      <Text style={st.statK}>{k}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, overflow: 'hidden' },
  live: { position: 'absolute', left: 0, right: 0, top: 0, backgroundColor: '#1a1a1a', overflow: 'hidden' },
  chip: { position: 'absolute', left: 14, bottom: 36, backgroundColor: 'rgba(0,0,0,0.38)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  chipT: { color: C.white, fontSize: 12, fontWeight: '600' },
  hint: { position: 'absolute', alignSelf: 'center', bottom: 36, backgroundColor: 'rgba(20,26,61,0.62)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  hintT: { color: C.white, fontSize: 14, fontWeight: '600' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.bg, overflow: 'hidden' },
  grab: { position: 'absolute', top: 9, alignSelf: 'center', width: 46, height: 5, borderRadius: 3, backgroundColor: '#C9CBD3' },
  mapbox: { position: 'absolute', left: 0, right: 0 },
  banner: {
    position: 'absolute', left: 14, right: 14, height: 70, borderRadius: 35, backgroundColor: C.blue,
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 12, paddingRight: 22,
    shadowColor: C.blue, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  navIc: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  to: { color: C.white, fontSize: 23, fontWeight: '700', letterSpacing: -0.2 },
  instr: { color: C.white, opacity: 0.92, fontSize: 14, marginTop: 2 },
  eta: { color: C.white, fontSize: 17, fontWeight: '600' },
  mode: {
    position: 'absolute', right: 18, flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 16, paddingVertical: 7, paddingHorizontal: 12,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  modeDot: { width: 9, height: 9, borderRadius: 5 },
  modeT: { fontSize: 13, fontWeight: '700', color: C.navy },
  raiseWrap: { position: 'absolute', alignSelf: 'center' },
  raise: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.white, borderWidth: 2.5, borderColor: C.blue,
    borderRadius: 34, paddingVertical: 12, paddingLeft: 24, paddingRight: 30,
  },
  raiseT: { color: C.navy, fontSize: 20, fontWeight: '700' },
  scrim: { backgroundColor: 'rgba(14,19,48,0.32)' },
  card: { position: 'absolute', left: 18, right: 18, backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: 30, paddingTop: 30, paddingHorizontal: 24, paddingBottom: 22, alignItems: 'center' },
  check: { width: 96, height: 96, borderRadius: 48, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  h2: { fontSize: 32, fontWeight: '800', color: C.ink, letterSpacing: -0.5 },
  sub: { fontSize: 18, color: C.muted, marginTop: 6 },
  stats: { flexDirection: 'row', gap: 28, marginTop: 18, marginBottom: 20 },
  statV: { fontSize: 20, fontWeight: '700', color: C.ink },
  statK: { fontSize: 14, color: C.muted },
  btn: { alignSelf: 'stretch', height: 60, borderRadius: 30, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center' },
  btnT: { color: C.white, fontSize: 20, fontWeight: '700' },
});
