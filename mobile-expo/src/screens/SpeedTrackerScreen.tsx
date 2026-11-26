import React, { useCallback, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
  useFrameProcessor,
} from 'react-native-vision-camera';
import { Worklets } from 'react-native-worklets-core';
import { useResizePlugin } from 'vision-camera-resize-plugin';
import * as Haptics from 'expo-haptics';
import { useMatchStore } from '../store/useMatchStore';
import {
  matchesBallColorRGB,
  interpolateCrossingTimestamp,
  computeDeliverySpeed,
  SpeedMeasurement,
} from '../vision/bowlingSpeedProcessor';

export function SpeedTrackerScreen({ onBackToScorer }: { onBackToScorer: () => void }) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const format = useCameraFormat(device, [
    { fps: 120 },
    { fps: 60 },
    { videoResolution: { width: 1280, height: 720 } },
  ]);
  const { resize } = useResizePlugin();

  const { pitchDistanceYards, ballType, attachSpeedToLastBall, balls } = useMatchStore();
  const [releaseLineY] = useState(0.76);
  const [reachLineY] = useState(0.32);
  const [isArmed, setIsArmed] = useState(true);
  const [lastSpeed, setLastSpeed] = useState<SpeedMeasurement | null>(null);
  const [loggedFeedback, setLoggedFeedback] = useState(false);

  const prevSampleRef = useRef<{ yNorm: number; tsMs: number } | null>(null);
  const releaseCrossTsRef = useRef<number | null>(null);

  const handleCentroidJS = useCallback(
    (yNorm: number, tsMs: number) => {
      if (!isArmed) return;
      const prev = prevSampleRef.current;
      if (prev) {
        if (releaseCrossTsRef.current === null) {
          const t1 = interpolateCrossingTimestamp(prev.yNorm, prev.tsMs, yNorm, tsMs, releaseLineY);
          if (t1 !== null) {
            releaseCrossTsRef.current = t1;
          }
        } else {
          const t2 = interpolateCrossingTimestamp(prev.yNorm, prev.tsMs, yNorm, tsMs, reachLineY);
          if (t2 !== null) {
            const result = computeDeliverySpeed(releaseCrossTsRef.current, t2, pitchDistanceYards);
            if (result) {
              setLastSpeed(result);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
            releaseCrossTsRef.current = null;
          }
        }
      }
      prevSampleRef.current = { yNorm, tsMs };
    },
    [isArmed, releaseLineY, reachLineY, pitchDistanceYards]
  );

  const onBallCentroidDetected = Worklets.createRunOnJS(handleCentroidJS);

  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet';
      const w = 160;
      const h = 120;
      const resized = resize(frame, {
        scale: { width: w, height: h },
        pixelFormat: 'rgb',
        dataType: 'uint8',
      });

      let sumY = 0;
      let count = 0;
      const xStart = Math.floor(w * 0.28);
      const xEnd = Math.floor(w * 0.72);

      for (let y = 8; y < h - 8; y += 2) {
        for (let x = xStart; x < xEnd; x += 2) {
          const idx = (y * w + x) * 3;
          if (matchesBallColorRGB(resized[idx], resized[idx + 1], resized[idx + 2], ballType)) {
            sumY += y;
            count += 1;
          }
        }
      }

      if (count >= 4 && count <= 180) {
        const centroidYNorm = sumY / count / h;
        onBallCentroidDetected(centroidYNorm, frame.timestamp / 1_000_000);
      }
    },
    [ballType, onBallCentroidDetected]
  );

  const handleLogToBall = async () => {
    if (!lastSpeed) return;
    await attachSpeedToLastBall(
      lastSpeed.speedKmh,
      lastSpeed.speedMph,
      lastSpeed.releaseTsMs,
      lastSpeed.reachTsMs
    );
    setLoggedFeedback(true);
    setTimeout(() => setLoggedFeedback(false), 1800);
  };

  if (!hasPermission) {
    return (
      <View style={styles.center}>
        <Text style={styles.whiteText}>Camera permission is needed to measure bowling speed.</Text>
        <TouchableOpacity style={styles.primaryBtnSmall} onPress={requestPermission}>
          <Text style={styles.primaryBtnText}>Grant Camera Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backBtn} onPress={onBackToScorer}>
          <Text style={styles.backBtnText}>Return to Live Scorecard</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.center}>
        <Text style={styles.whiteText}>Rear camera unavailable on this device.</Text>
        <TouchableOpacity style={styles.backBtn} onPress={onBackToScorer}>
          <Text style={styles.backBtnText}>Return to Live Scorecard</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        format={format}
        fps={format?.maxFps ? Math.min(120, format.maxFps) : 60}
        isActive={true}
        frameProcessor={frameProcessor}
      />

      <View style={[styles.calibrationLine, { top: `${reachLineY * 100}%`, borderColor: '#F59E0B' }]}>
        <Text style={styles.lineLabel}>REACH LINE · STRIKER CREASE ({pitchDistanceYards} yd)</Text>
      </View>

      <View style={[styles.calibrationLine, { top: `${releaseLineY * 100}%`, borderColor: '#10B981' }]}>
        <Text style={styles.lineLabel}>RELEASE LINE · BOWLING CREASE (0 yd)</Text>
      </View>

      <View style={styles.bottomOverlay}>
        <View style={styles.speedReadout}>
          <Text style={styles.speedValue}>
            {lastSpeed ? `${lastSpeed.speedKmh.toFixed(1)} km/h` : '--.- km/h'}
          </Text>
          <Text style={styles.speedSub}>
            {lastSpeed
              ? `${lastSpeed.speedMph.toFixed(1)} mph · dt ${lastSpeed.deltaTimeMs} ms`
              : 'Stand behind umpire stumps and bowl'}
          </Text>
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => setIsArmed((v) => !v)}>
            <Text style={styles.secondaryBtnText}>{isArmed ? 'Pause Radar' : 'Arm Radar'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryBtn, !lastSpeed && styles.disabledBtn]}
            disabled={!lastSpeed}
            onPress={handleLogToBall}
          >
            <Text style={styles.primaryBtnText}>
              {loggedFeedback
                ? 'Saved to Ball'
                : balls.length
                ? 'Log to Current Ball'
                : 'Queue for Next Ball'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.backBtn} onPress={onBackToScorer}>
          <Text style={styles.backBtnText}>Return to Live Scorecard</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0F0D' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0F0D', padding: 24, gap: 14 },
  whiteText: { color: '#FFFFFF', fontSize: 16, textAlign: 'center' },
  calibrationLine: { position: 'absolute', left: 16, right: 16, borderTopWidth: 2, borderStyle: 'dashed' },
  lineLabel: {
    color: '#FFFFFF',
    backgroundColor: 'rgba(10,15,13,0.78)',
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(11,20,16,0.9)',
    borderRadius: 16,
    padding: 16,
  },
  speedReadout: { marginBottom: 12 },
  speedValue: { color: '#FFFFFF', fontSize: 34, fontWeight: '800', fontVariant: ['tabular-nums'] },
  speedSub: { color: '#CBD5E1', fontSize: 13, marginTop: 2 },
  actionsRow: { flexDirection: 'row', gap: 10 },
  primaryBtn: {
    flex: 2,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#0E7A49',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnSmall: {
    paddingHorizontal: 20,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#0E7A49',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledBtn: { opacity: 0.45 },
  primaryBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  secondaryBtn: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  backBtn: { marginTop: 10, height: 44, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },
});
