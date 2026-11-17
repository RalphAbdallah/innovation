import React, { memo } from 'react';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { BUILDING, COURTYARD, Pt, Room, ROOMS } from './building';
import { C } from './theme';

/** Static layer: courtyard, building, rooms, entrance, destination pin. */
const StaticLayer = memo(function StaticLayer({ dest, door }: { dest: Room; door: Pt }) {
  return (
    <G>
      <Rect x={COURTYARD.x} y={COURTYARD.y} width={COURTYARD.w} height={COURTYARD.h} rx={16} fill="#E4EBE0" />
      <Circle cx={62} cy={536} r={15} fill="#C6DEBA" />
      <Circle cx={232} cy={642} r={14} fill="#C6DEBA" />
      <Circle cx={222} cy={528} r={9} fill="#D3E5CA" />
      <SvgText x={44} y={658} fontSize={14} fontWeight="600" fill="#8C9488">Cours carré</SvgText>

      <Rect x={BUILDING.x} y={BUILDING.y} width={BUILDING.w} height={BUILDING.h} rx={14} fill={C.white} />
      {[0, 1, 2, 3, 4, 5].map(i => (
        <Rect key={i} x={176} y={465 + i * 5.5} width={38} height={2.6} rx={1} fill="#C5C8D1" />
      ))}
      <SvgText x={234} y={485} fontSize={13} fontWeight="600" fill={C.roomInk}>Entrance</SvgText>

      {ROOMS.map(r => {
        const on = r.id === dest.id;
        const tx = r.x + r.w / 2 + (on ? (r.side === 'R' ? 12 : -12) : 0);
        return (
          <G key={r.id}>
            <Rect x={r.x} y={r.y} width={r.w} height={r.h} rx={9} fill={on ? C.roomOn : C.room} />
            <SvgText x={tx} y={r.y + r.h / 2 + 5} textAnchor="middle" fontSize={r.w < 70 ? 13 : 15}
              fontWeight={on ? '700' : '600'} fill={on ? C.roomOnInk : C.roomInk}>
              {r.label ?? r.id}
            </SvgText>
          </G>
        );
      })}

      <G transform={`translate(${door.x},${door.y})`}>
        <Circle r={13} fill={C.white} />
        <Circle r={10} fill={C.red} />
        <Circle r={4.2} fill={C.white} />
      </G>
    </G>
  );
});

type Props = {
  dest: Room;
  route: Pt[];          // full route
  seg: number;          // current segment index
  me: Pt;               // live position
  headingDeg: number;
  viewBox: number[];    // [x, y, w, h]
  pulse: number;        // 0..1 for the "you are here" halo
};

export default function FloorMap({ dest, route, seg, me, headingDeg, viewBox, pulse }: Props) {
  let d = `M${me.x.toFixed(1)} ${me.y.toFixed(1)}`;
  for (let j = seg + 1; j < route.length; j++) d += ` L${route[j].x} ${route[j].y}`;
  return (
    <Svg width="100%" height="100%" viewBox={viewBox.map(v => v.toFixed(2)).join(' ')} preserveAspectRatio="xMidYMid meet">
      <StaticLayer dest={dest} door={route[route.length - 1]} />
      <Path d={d} fill="none" stroke={C.blue} strokeWidth={5.5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="0 11" />
      <G transform={`translate(${me.x.toFixed(1)},${me.y.toFixed(1)})`}>
        <Circle r={22 + 9 * pulse} fill={C.blue} opacity={0.22 - 0.1 * pulse} />
        <Circle r={15} fill={C.white} />
        <Circle r={12} fill={C.blue} />
        <Path d="M0,-7 L5.6,6.2 L0,3.2 L-5.6,6.2Z" fill={C.white} transform={`rotate(${headingDeg.toFixed(1)})`} />
      </G>
    </Svg>
  );
}
