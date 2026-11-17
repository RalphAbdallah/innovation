import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { M_PER_UNIT, Room, ROOMS, Route, routeTo, walkMinutes } from './building';
import { C } from './theme';

const NAV_ROOMS = ROOMS.filter(r => r.navigable);
const norm = (s: string) => s.toUpperCase().replace(/\s+/g, '');

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={12} fill={C.cyan} />
      <Path d="M12 5.2l5.4 12.6-5.4-2.9-5.4 2.9z" fill={C.navy} />
    </Svg>
  );
}

export default function SearchScreen({ initial, onStart }: { initial: string; onStart: (r: Room) => void }) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState(initial);
  const [picked, setPicked] = useState<Room | null>(null);
  const [focused, setFocused] = useState(false);

  const results = useMemo(() => {
    const q = norm(query);
    if (!q) return NAV_ROOMS.filter(r => r.id === 'SCI 04');
    return NAV_ROOMS.filter(r => norm(r.id).includes(q) || r.type.toUpperCase().includes(query.trim().toUpperCase())).slice(0, 4);
  }, [query]);

  const exact = results.find(r => norm(r.id) === norm(query));
  const selected = exact ?? (picked && results.includes(picked) ? picked : null);

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.hdr, { paddingTop: insets.top + 14 }]}>
        <View style={s.brand}><Logo /><Text style={s.brandTxt}>WenAna</Text></View>
        <Text style={s.h1}>Where to?</Text>
      </View>

      <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
        <Text style={s.flabel}>Building</Text>
        <Text style={s.building}>USJ · ESIB, Mar Roukoz</Text>

        <View style={[s.search, (focused || query) ? { borderColor: C.cyan } : null]}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth={2.4} strokeLinecap="round">
            <Circle cx={10.5} cy={10.5} r={6.5} /><Path d="M15.5 15.5L20 20" />
          </Svg>
          <TextInput
            value={query}
            onChangeText={t => { setQuery(t); setPicked(null); }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Room, lab or office"
            placeholderTextColor="#B0B3C0"
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={() => selected && onStart(selected)}
            style={s.input}
          />
        </View>

        <View style={{ marginTop: 12, gap: 8 }}>
          {results.length === 0 && <Text style={s.empty}>No room matches. Try “SCI 04”.</Text>}
          {results.map(r => {
            const m = new Route(routeTo(r)).total * M_PER_UNIT;
            const on = r === selected;
            return (
              <Pressable key={r.id} onPress={() => { setPicked(r); setQuery(r.id); }} style={[s.res, on && s.resOn]}>
                <Text style={s.resT}>{r.id} · {r.type}</Text>
                <Text style={s.resS}>Ground floor · {walkMinutes(m)} min walk · {Math.round(m)} m</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={s.from}><View style={s.dot} /><Text style={s.fromT}>From: Cours carré entrance</Text></View>
      </ScrollView>

      <View style={[s.foot, { paddingBottom: insets.bottom + 8 }]}>
        <Pressable disabled={!selected} onPress={() => selected && onStart(selected)}
          style={({ pressed }) => [s.btn, !selected && { opacity: 0.35 }, pressed && { transform: [{ scale: 0.98 }] }]}>
          <Text style={s.btnT}>Start AR navigation</Text>
        </Pressable>
        <Text style={s.fine}>Works offline · your location stays on your phone</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.white },
  hdr: { backgroundColor: C.navy, paddingHorizontal: 28, paddingBottom: 26 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14 },
  brandTxt: { color: C.white, fontSize: 17, fontWeight: '700' },
  h1: { color: C.white, fontSize: 30, fontWeight: '700', letterSpacing: -0.3 },
  body: { flex: 1, paddingHorizontal: 28, paddingTop: 24 },
  flabel: { fontSize: 14, color: C.muted, marginBottom: 4 },
  building: { fontSize: 21, fontWeight: '700', color: C.ink, marginBottom: 22 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 2.5, borderColor: C.line, borderRadius: 18, paddingHorizontal: 16, height: 62 },
  input: { flex: 1, fontSize: 22, fontWeight: '600', color: C.ink, paddingVertical: 0 },
  empty: { color: C.muted, fontSize: 15, paddingVertical: 8 },
  res: { borderRadius: 16, paddingVertical: 13, paddingHorizontal: 16, backgroundColor: '#F6F7FA', borderWidth: 2, borderColor: 'transparent' },
  resOn: { backgroundColor: '#EAF5FF', borderColor: '#BFE6FF' },
  resT: { fontSize: 18, fontWeight: '700', color: C.ink },
  resS: { fontSize: 15, color: C.muted, marginTop: 2 },
  from: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 22, marginHorizontal: 4 },
  dot: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.green },
  fromT: { fontSize: 17, fontWeight: '600', color: C.ink },
  foot: { paddingHorizontal: 24, paddingTop: 12 },
  btn: { height: 64, borderRadius: 32, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center' },
  btnT: { color: C.white, fontSize: 21, fontWeight: '700' },
  fine: { textAlign: 'center', color: C.muted, fontSize: 13, marginTop: 10 },
});
