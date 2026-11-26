import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useMatchStore } from '../store/useMatchStore';

export function LiveScoringScreen({ onOpenRadar }: { onOpenRadar: () => void }) {
  const {
    pitchMode,
    pitchDistanceYards,
    oversLimit,
    totalRuns,
    wickets,
    legalBalls,
    balls,
    pendingSpeed,
    singleRunAllowed,
    boundaryOnlyMode,
    scoreBall,
    undoLastBall,
  } = useMatchStore();

  const oversDisplay = `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;
  const runRate = legalBalls > 0 ? ((totalRuns / legalBalls) * 6).toFixed(2) : '0.00';

  const handleRun = async (runs: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await scoreBall({ runsOffBat: runs });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* High-Contrast Daylight Scoreboard */}
      <View style={styles.scoreboard}>
        <Text style={styles.metaText}>
          {pitchMode === 'SHORT_PITCH' ? 'Short Pitch' : 'Long Pitch'} · {pitchDistanceYards} yd · {oversLimit} Overs
        </Text>
        <View style={styles.scoreRow}>
          <Text style={styles.scoreMain}>
            {totalRuns}/{wickets}
          </Text>
          <View>
            <Text style={styles.oversText}>Overs {oversDisplay} / {oversLimit}</Text>
            <Text style={styles.crrText}>CRR {runRate}</Text>
          </View>
        </View>
        {pendingSpeed && (
          <Text style={styles.queuedSpeed}>
            Radar queued for next delivery: {pendingSpeed.kmh} km/h ({pendingSpeed.mph} mph)
          </Text>
        )}
      </View>

      {/* Current Over Timeline */}
      <View style={styles.overStrip}>
        {balls.slice(-6).map((b) => (
          <View key={b.id} style={styles.ballCell}>
            <Text style={styles.ballRun}>{b.isWicket ? 'W' : b.runsOffBat + b.extraRuns}</Text>
            {b.speedKmh ? <Text style={styles.ballSpeed}>{b.speedKmh}</Text> : null}
          </View>
        ))}
      </View>

      {/* Large Thumb-Friendly Scoring Pad */}
      <View style={styles.padGrid}>
        {[0, 1, 2, 3, 4, 6].map((r) => {
          const disabled = (boundaryOnlyMode && r !== 0 && r !== 4 && r !== 6) || (!singleRunAllowed && r === 1);
          return (
            <TouchableOpacity
              key={r}
              disabled={disabled}
              style={[styles.runBtn, (r === 4 || r === 6) && styles.boundaryBtn, disabled && styles.disabledBtn]}
              onPress={() => handleRun(r)}
            >
              <Text style={[styles.runBtnText, (r === 4 || r === 6) && styles.whiteText]}>{r}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.extrasRow}>
        <TouchableOpacity style={styles.extraBtn} onPress={() => scoreBall({ runsOffBat: 0, extraType: 'WIDE', extraRuns: 1 })}>
          <Text style={styles.extraText}>WIDE</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.extraBtn} onPress={() => scoreBall({ runsOffBat: 0, extraType: 'NO_BALL', extraRuns: 1 })}>
          <Text style={styles.extraText}>NO BALL</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.wicketBtn} onPress={() => scoreBall({ runsOffBat: 0, isWicket: true, dismissalType: 'BOWLED' })}>
          <Text style={styles.whiteText}>WICKET</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footerActions}>
        <TouchableOpacity style={styles.radarBtn} onPress={onOpenRadar}>
          <Text style={styles.whiteText}>Open Camera Speed Radar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.undoBtn} onPress={undoLastBall}>
          <Text style={styles.undoText}>Undo Last Ball</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F4' },
  content: { padding: 16, gap: 16 },
  scoreboard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#DDE3DE' },
  metaText: { fontSize: 13, color: '#475569', fontWeight: '600' },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 },
  scoreMain: { fontSize: 44, fontWeight: '800', color: '#0B1410', fontVariant: ['tabular-nums'] },
  oversText: { fontSize: 16, fontWeight: '700', color: '#0B1410', textAlign: 'right' },
  crrText: { fontSize: 13, color: '#475569', textAlign: 'right', marginTop: 2 },
  queuedSpeed: { marginTop: 10, fontSize: 13, fontWeight: '700', color: '#0E7A49' },
  overStrip: { flexDirection: 'row', gap: 8, minHeight: 54 },
  ballCell: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: '#DDE3DE', alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  ballRun: { fontSize: 18, fontWeight: '700', color: '#0B1410' },
  ballSpeed: { fontSize: 10, color: '#0E7A49', fontWeight: '600' },
  padGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  runBtn: { width: '31%', height: 64, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  boundaryBtn: { backgroundColor: '#0E7A49', borderColor: '#0E7A49' },
  disabledBtn: { opacity: 0.3 },
  runBtnText: { fontSize: 24, fontWeight: '800', color: '#0B1410' },
  whiteText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  extrasRow: { flexDirection: 'row', gap: 10 },
  extraBtn: { flex: 1, height: 52, borderRadius: 12, backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#F59E0B', alignItems: 'center', justifyContent: 'center' },
  extraText: { fontSize: 14, fontWeight: '700', color: '#92400E' },
  wicketBtn: { flex: 1, height: 52, borderRadius: 12, backgroundColor: '#C81E2B', alignItems: 'center', justifyContent: 'center' },
  footerActions: { gap: 10, marginTop: 4 },
  radarBtn: { height: 56, borderRadius: 12, backgroundColor: '#0B1410', alignItems: 'center', justifyContent: 'center' },
  undoBtn: { height: 48, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  undoText: { fontSize: 14, fontWeight: '600', color: '#334155' },
});
