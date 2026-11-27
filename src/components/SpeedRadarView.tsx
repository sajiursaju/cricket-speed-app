import React, { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, Crosshair, Play, Video, VideoOff } from 'lucide-react';
import type { BallType, MatchRecord, PendingSpeed, PublicUser } from '../types';

interface SpeedRadarViewProps {
  activeMatch: MatchRecord | null;
  currentUser: PublicUser | null;
  authToken: string | null;
  onQueueSpeedForNextBall: (speed: PendingSpeed) => void;
  onMatchUpdated: (match: MatchRecord) => void;
  onReturnToScorer: () => void;
  onOpenAuth: () => void;
}

interface SpeedMeasurement {
  speedKmh: number;
  speedMph: number;
  deltaTimeMs: number;
  releaseTsMs: number;
  reachTsMs: number;
  fps: number;
}

const YARDS_TO_METERS = 0.9144;

function matchesBallColor(r: number, g: number, b: number, profile: BallType): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const v = max / 255;
  const s = max === 0 ? 0 : delta / max;

  let h = 0;
  if (delta > 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  if (h < 0) h += 360;

  switch (profile) {
    case 'TAPE_GREEN':
      return h >= 70 && h <= 155 && s >= 0.35 && v >= 0.32;
    case 'TENNIS_YELLOW':
      return h >= 40 && h <= 74 && s >= 0.40 && v >= 0.42;
    case 'LEATHER_RED':
      return (h <= 22 || h >= 338) && s >= 0.42 && v >= 0.22 && v <= 0.88;
    case 'LEATHER_WHITE':
      return s <= 0.16 && v >= 0.85;
  }
}

export function SpeedRadarView({
  activeMatch,
  currentUser,
  authToken,
  onQueueSpeedForNextBall,
  onMatchUpdated,
  onReturnToScorer,
  onOpenAuth,
}: SpeedRadarViewProps) {
  const [sourceMode, setSourceMode] = useState<'SIMULATOR' | 'CAMERA'>('SIMULATOR');
  const [pitchYards, setPitchYards] = useState<number>(activeMatch?.rules.pitchDistanceYards || 14);
  const [ballProfile, setBallProfile] = useState<BallType>(activeMatch?.rules.ballType || 'TAPE_GREEN');
  const [releaseLineY, setReleaseLineY] = useState<number>(0.78); // Bowler's crease (near bottom)
  const [reachLineY, setReachLineY] = useState<number>(0.34); // Striker's crease (farther up)
  const [simTargetKmh, setSimTargetKmh] = useState<number>(118);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [measured, setMeasured] = useState<SpeedMeasurement | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('Calibrate Release & Reach lines over the pitch creases.');
  const [logStatus, setLogStatus] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pitchImgRef = useRef<HTMLImageElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // Simulator delivery state
  const simDeliveryRef = useRef<{
    active: boolean;
    startTs: number;
    durationMs: number;
    xNorm: number;
  } | null>(null);

  // CV Frame Processor crossing state
  const prevCentroidRef = useRef<{ yNorm: number; tsMs: number } | null>(null);
  const releaseCrossTsRef = useRef<number | null>(null);
  const frameCounterRef = useRef<{ count: number; windowStart: number; fps: number }>({
    count: 0,
    windowStart: performance.now(),
    fps: 60,
  });

  useEffect(() => {
    if (activeMatch) {
      setPitchYards(activeMatch.rules.pitchDistanceYards);
      setBallProfile(activeMatch.rules.ballType);
    }
  }, [activeMatch?.id]);

  // Preload photorealistic umpire pitch image for Simulator mode
  useEffect(() => {
    const img = new Image();
    img.src = '/src/assets/images/umpire_pitch_viewfinder_1795684061682.jpg';
    img.onload = () => {
      pitchImgRef.current = img;
    };
  }, []);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera API unavailable in this browser context. Use Pitch Simulator to test tracking.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 60, min: 30 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      setStatusMessage('Rear camera active. Hold steady behind bowler stumps.');
    } catch (err) {
      setCameraError(
        err instanceof Error
          ? `Camera access denied or unavailable (${err.message}). Switching back to Pitch Simulator.`
          : 'Camera unavailable.'
      );
      setSourceMode('SIMULATOR');
    }
  };

  useEffect(() => {
    if (sourceMode === 'CAMERA') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [sourceMode]);

  // Real-time frame processor loop (runs identical crossing algorithm on either Simulator or Live Camera frames)
  useEffect(() => {
    const offscreen = document.createElement('canvas');
    offscreen.width = 160;
    offscreen.height = 120;
    const offCtx = offscreen.getContext('2d', { willReadFrequently: true });

    const renderLoop = (now: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx && offCtx) {
        const w = canvas.width;
        const h = canvas.height;

        // Track live FPS
        frameCounterRef.current.count += 1;
        if (now - frameCounterRef.current.windowStart >= 1000) {
          frameCounterRef.current.fps = frameCounterRef.current.count;
          frameCounterRef.current.count = 0;
          frameCounterRef.current.windowStart = now;
        }

        // 1. Draw backdrop (either WebRTC video or Umpire Pitch Image + simulated ball)
        if (sourceMode === 'CAMERA' && videoRef.current && videoRef.current.readyState >= 2) {
          ctx.drawImage(videoRef.current, 0, 0, w, h);
        } else {
          ctx.fillStyle = '#0A0F0D';
          ctx.fillRect(0, 0, w, h);
          if (pitchImgRef.current) {
            ctx.drawImage(pitchImgRef.current, 0, 0, w, h);
          }

          // Render simulated delivery moving from bottom (y=0.92) to striker stumps (y=0.22)
          const sim = simDeliveryRef.current;
          if (sim && sim.active) {
            const elapsed = now - sim.startTs;
            const progress = elapsed / sim.durationMs;
            if (progress >= 1.15) {
              sim.active = false;
            } else {
              const startY = 0.92;
              const endY = 0.22;
              const currYNorm = startY + (endY - startY) * progress;
              // Perspective scale: ball looks larger near bowler's crease, smaller near striker's crease
              const radius = Math.max(5, 16 * (1 - progress * 0.62));
              const bounceCurve = Math.sin(Math.min(1, progress) * Math.PI) * 10;
              const cx = (sim.xNorm + (0.5 - sim.xNorm) * progress * 0.4) * w;
              const cy = currYNorm * h - bounceCurve;

              ctx.save();
              ctx.beginPath();
              ctx.arc(cx, cy, radius, 0, Math.PI * 2);
              ctx.fillStyle =
                ballProfile === 'TAPE_GREEN'
                  ? '#39E639'
                  : ballProfile === 'TENNIS_YELLOW'
                  ? '#EAB308'
                  : ballProfile === 'LEATHER_RED'
                  ? '#B91C1C'
                  : '#F8FAFC';
              ctx.fill();
              ctx.lineWidth = 1.5;
              ctx.strokeStyle = 'rgba(0,0,0,0.45)';
              ctx.stroke();
              ctx.restore();
            }
          }
        }

        // 2. Run actual pixel color-blob centroid detection on downscaled 160x120 buffer
        offCtx.drawImage(canvas, 0, 0, 160, 120);
        const frameData = offCtx.getImageData(0, 0, 160, 120).data;

        let sumX = 0;
        let sumY = 0;
        let matchCount = 0;
        const xMin = Math.floor(160 * 0.25);
        const xMax = Math.floor(160 * 0.75);

        for (let y = 10; y < 112; y += 1) {
          for (let x = xMin; x < xMax; x += 1) {
            const idx = (y * 160 + x) * 4;
            if (matchesBallColor(frameData[idx], frameData[idx + 1], frameData[idx + 2], ballProfile)) {
              sumX += x;
              sumY += y;
              matchCount += 1;
            }
          }
        }

        if (matchCount >= 3 && matchCount <= 220) {
          const cxNorm = sumX / matchCount / 160;
          const cyNorm = sumY / matchCount / 120;

          // Draw live CV bounding reticle
          ctx.save();
          ctx.strokeStyle = '#38BDF8';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cxNorm * w, cyNorm * h, 18, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();

          const prev = prevCentroidRef.current;
          if (prev) {
            if (releaseCrossTsRef.current === null) {
              if (prev.yNorm >= releaseLineY && cyNorm < releaseLineY) {
                const dy = cyNorm - prev.yNorm;
                const alpha = Math.abs(dy) > 1e-5 ? (releaseLineY - prev.yNorm) / dy : 1;
                releaseCrossTsRef.current = prev.tsMs + alpha * (now - prev.tsMs);
                setStatusMessage('Release line crossed (t1 captured). Tracking to striker crease...');
              }
            } else if (prev.yNorm >= reachLineY && cyNorm < reachLineY) {
              const dy = cyNorm - prev.yNorm;
              const alpha = Math.abs(dy) > 1e-5 ? (reachLineY - prev.yNorm) / dy : 1;
              const t2 = prev.tsMs + alpha * (now - prev.tsMs);
              const t1 = releaseCrossTsRef.current;
              const dtMs = t2 - t1;

              if (dtMs >= 160 && dtMs <= 2800) {
                const distanceMeters = pitchYards * YARDS_TO_METERS;
                const speedKmh = Number(((distanceMeters / (dtMs / 1000)) * 3.6).toFixed(1));
                const speedMph = Number((speedKmh * 0.621371).toFixed(1));
                setMeasured({
                  speedKmh,
                  speedMph,
                  deltaTimeMs: Number(dtMs.toFixed(1)),
                  releaseTsMs: Math.round(t1),
                  reachTsMs: Math.round(t2),
                  fps: frameCounterRef.current.fps || 60,
                });
                setStatusMessage(`Delivery locked: ${speedKmh.toFixed(1)} km/h (dt = ${dtMs.toFixed(1)} ms)`);
              }
              releaseCrossTsRef.current = null;
            }
          }
          prevCentroidRef.current = { yNorm: cyNorm, tsMs: now };
        }

        // 3. Draw Calibration Virtual Lines (Reach Line top, Release Line bottom)
        const reachPx = reachLineY * h;
        const releasePx = releaseLineY * h;

        ctx.save();
        ctx.setLineDash([8, 6]);
        ctx.lineWidth = 2;

        ctx.strokeStyle = '#F59E0B';
        ctx.beginPath();
        ctx.moveTo(20, reachPx);
        ctx.lineTo(w - 20, reachPx);
        ctx.stroke();

        ctx.strokeStyle = '#10B981';
        ctx.beginPath();
        ctx.moveTo(20, releasePx);
        ctx.lineTo(w - 20, releasePx);
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = 'rgba(11, 20, 16, 0.85)';
        ctx.fillRect(20, reachPx - 22, 235, 20);
        ctx.fillStyle = '#FCD34D';
        ctx.font = '600 11px "JetBrains Mono", monospace';
        ctx.fillText(`REACH LINE · ${pitchYards} YD (t2)`, 26, reachPx - 8);

        ctx.fillStyle = 'rgba(11, 20, 16, 0.85)';
        ctx.fillRect(20, releasePx + 4, 215, 20);
        ctx.fillStyle = '#34D399';
        ctx.font = '600 11px "JetBrains Mono", monospace';
        ctx.fillText('RELEASE LINE · 0 YD (t1)', 26, releasePx + 18);
      }

      rafRef.current = requestAnimationFrame(renderLoop);
    };

    rafRef.current = requestAnimationFrame(renderLoop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [sourceMode, ballProfile, releaseLineY, reachLineY, pitchYards]);

  const launchSimulatedDelivery = () => {
    setLogStatus(null);
    prevCentroidRef.current = null;
    releaseCrossTsRef.current = null;

    // Compute exact transit time across full canvas span (0.92 -> 0.22) so the calibrated span (releaseLineY -> reachLineY) matches simTargetKmh!
    const distMeters = pitchYards * YARDS_TO_METERS;
    const speedMps = simTargetKmh / 3.6;
    const calibratedDtMs = (distMeters / speedMps) * 1000;
    const calibratedRatioSpan = Math.max(0.15, releaseLineY - reachLineY);
    const totalCanvasRatioSpan = 0.92 - 0.22;
    const totalDurationMs = calibratedDtMs * (totalCanvasRatioSpan / calibratedRatioSpan);

    simDeliveryRef.current = {
      active: true,
      startTs: performance.now(),
      durationMs: totalDurationMs,
      xNorm: 0.48 + (Math.random() * 0.06 - 0.03),
    };
    setStatusMessage(`Tracking simulated ${simTargetKmh} km/h delivery...`);
  };

  const handleLogToCurrentBall = async () => {
    if (!measured) return;
    if (!currentUser || !authToken) {
      onOpenAuth();
      return;
    }
    if (!activeMatch) return;

    const activeInnings =
      activeMatch.activeInningsNumber === 1 ? activeMatch.innings1 : activeMatch.innings2 || activeMatch.innings1;
    const lastBall = activeInnings.balls[activeInnings.balls.length - 1];

    if (!lastBall) {
      onQueueSpeedForNextBall({
        speedKmh: measured.speedKmh,
        speedMph: measured.speedMph,
        releaseTsMs: measured.releaseTsMs,
        reachTsMs: measured.reachTsMs,
        cameraFps: measured.fps,
      });
      setLogStatus('Queued for the next ball you score.');
      return;
    }

    try {
      const res = await fetch(`/api/matches/${activeMatch.id}/balls/${lastBall.id}/speed`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          speedKmh: measured.speedKmh,
          speedMph: measured.speedMph,
          releaseTsMs: measured.releaseTsMs,
          reachTsMs: measured.reachTsMs,
          cameraFps: measured.fps,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onMatchUpdated(data.match);
        setLogStatus(`Saved ${measured.speedKmh.toFixed(1)} km/h to Over ${lastBall.overNumber}.${lastBall.ballInOver}!`);
      } else {
        setLogStatus(data.error || 'Could not log speed.');
      }
    } catch {
      setLogStatus('Network error logging speed.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-8 space-y-6">
      {/* Header & Source Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0B1410]">Umpire-Perspective Bowling Speed Radar</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Position behind the bowler&apos;s stumps looking down the {pitchYards}-yard pitch toward the striker&apos;s crease.
          </p>
        </div>

        <div className="inline-flex p-1 bg-slate-200/80 rounded-lg self-start shrink-0">
          <button
            type="button"
            onClick={() => setSourceMode('SIMULATOR')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md cursor-pointer ${
              sourceMode === 'SIMULATOR' ? 'bg-white text-[#0B1410] shadow-sm' : 'text-slate-600'
            }`}
          >
            Pitch Simulator
          </button>
          <button
            type="button"
            onClick={() => setSourceMode('CAMERA')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 cursor-pointer ${
              sourceMode === 'CAMERA' ? 'bg-white text-[#0B1410] shadow-sm' : 'text-slate-600'
            }`}
          >
            {cameraActive ? <Video className="w-3.5 h-3.5 text-[#0E7A49]" /> : <VideoOff className="w-3.5 h-3.5" />}
            Live Camera
          </button>
        </div>
      </div>

      {cameraError && (
        <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-medium text-amber-900">
          {cameraError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Camera / Simulator Viewfinder */}
        <div className="lg:col-span-8 bg-[#0A0F0D] rounded-2xl overflow-hidden border border-[#DDE3DE]">
          <div className="relative aspect-[4/3] w-full bg-[#0A0F0D]">
            <video ref={videoRef} playsInline muted className="hidden" />
            <canvas ref={canvasRef} width={720} height={540} className="w-full h-full object-cover block" />

            {/* Top HUD */}
            <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-none">
              <div className="bg-black/75 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg text-xs font-mono tabular-nums">
                {sourceMode === 'CAMERA' ? 'WEBRTC CV TRACKER' : 'PITCH SIMULATOR CV'} · {pitchYards} YD
              </div>
              <div className="bg-black/75 backdrop-blur-sm text-emerald-300 px-3 py-1.5 rounded-lg text-xs font-mono">
                {ballProfile.replace('_', ' ')}
              </div>
            </div>

            {/* Bottom Speed Telemetry Overlay */}
            <div className="absolute bottom-3 left-3 right-3 bg-[#0B1410]/90 backdrop-blur-md text-white rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-white/10">
              <div>
                <div className="font-mono tabular-nums text-3xl sm:text-4xl font-bold tracking-tight">
                  {measured ? `${measured.speedKmh.toFixed(1)} km/h` : '--.- km/h'}
                </div>
                <p className="text-xs text-slate-300 mt-1 font-mono tabular-nums">
                  {measured
                    ? `${measured.speedMph.toFixed(1)} mph · dt ${measured.deltaTimeMs} ms · ${measured.fps} fps`
                    : statusMessage}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {sourceMode === 'SIMULATOR' && (
                  <button
                    type="button"
                    onClick={launchSimulatedDelivery}
                    className="h-12 px-4 rounded-xl bg-white text-[#0B1410] hover:bg-slate-100 text-sm font-bold flex items-center gap-2 cursor-pointer"
                  >
                    <Play className="w-4 h-4" />
                    Bowl Test Ball
                  </button>
                )}

                <button
                  type="button"
                  disabled={!measured}
                  onClick={handleLogToCurrentBall}
                  className="h-12 px-5 rounded-xl bg-[#0E7A49] hover:bg-[#0B633B] text-white text-sm font-bold flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Log to Current Ball
                </button>
              </div>
            </div>
          </div>

          {logStatus && (
            <div className="px-4 py-2.5 bg-emerald-950 text-emerald-200 text-xs font-semibold flex items-center justify-between">
              <span>{logStatus}</span>
              <button type="button" onClick={onReturnToScorer} className="underline text-white cursor-pointer">
                View on Scorecard
              </button>
            </div>
          )}
        </div>

        {/* Calibration & Ball Profile Controls */}
        <div className="lg:col-span-4 space-y-5">
          <section className="bg-white border border-[#DDE3DE] rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Crosshair className="w-4 h-4 text-[#0E7A49]" />
              <h2 className="font-display text-base font-bold text-[#0B1410]">Crease Calibration</h2>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                <span>Pitch Distance</span>
                <span className="font-mono tabular-nums">{pitchYards} yards ({(pitchYards * YARDS_TO_METERS).toFixed(2)} m)</span>
              </div>
              <input
                type="range"
                min={10}
                max={24}
                step={0.5}
                value={pitchYards}
                onChange={(e) => setPitchYards(Number(e.target.value))}
                className="w-full accent-[#0E7A49]"
              />
              <div className="flex gap-1.5 mt-2">
                {[12, 14, 16, 22].map((yd) => (
                  <button
                    key={yd}
                    type="button"
                    onClick={() => setPitchYards(yd)}
                    className={`flex-1 py-1.5 text-xs font-mono rounded-lg border cursor-pointer ${
                      pitchYards === yd ? 'bg-[#0B1410] text-white border-[#0B1410]' : 'bg-white text-slate-700 border-[#DDE3DE]'
                    }`}
                  >
                    {yd} yd
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                <span className="text-amber-700">Reach Line (Striker Crease)</span>
                <span className="font-mono tabular-nums">{Math.round(reachLineY * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.18}
                max={0.55}
                step={0.01}
                value={reachLineY}
                onChange={(e) => setReachLineY(Math.min(releaseLineY - 0.12, Number(e.target.value)))}
                className="w-full accent-amber-500"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                <span className="text-[#0E7A49]">Release Line (Bowler Crease)</span>
                <span className="font-mono tabular-nums">{Math.round(releaseLineY * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.58}
                max={0.90}
                step={0.01}
                value={releaseLineY}
                onChange={(e) => setReleaseLineY(Math.max(reachLineY + 0.12, Number(e.target.value)))}
                className="w-full accent-[#0E7A49]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Ball HSV Color Mask</label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: 'TAPE_GREEN', label: 'Green Tape' },
                    { id: 'TENNIS_YELLOW', label: 'Yellow Tennis' },
                    { id: 'LEATHER_RED', label: 'Red Leather' },
                    { id: 'LEATHER_WHITE', label: 'White Leather' },
                  ] as Array<{ id: BallType; label: string }>
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setBallProfile(item.id)}
                    className={`py-2 px-3 text-xs font-semibold rounded-lg border cursor-pointer ${
                      ballProfile === item.id
                        ? 'bg-[#0E7A49] text-white border-[#0E7A49]'
                        : 'bg-white text-slate-700 border-[#DDE3DE]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {sourceMode === 'SIMULATOR' && (
              <div className="pt-2 border-t border-[#DDE3DE]">
                <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                  <span>Simulated Delivery Pace</span>
                  <span className="font-mono tabular-nums">{simTargetKmh} km/h</span>
                </div>
                <input
                  type="range"
                  min={65}
                  max={150}
                  step={1}
                  value={simTargetKmh}
                  onChange={(e) => setSimTargetKmh(Number(e.target.value))}
                  className="w-full accent-[#0B1410]"
                />
              </div>
            )}
          </section>

          <section className="bg-white border border-[#DDE3DE] rounded-xl p-5 space-y-2.5">
            <h3 className="font-display text-sm font-bold text-[#0B1410]">Speed Formula</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              The frame processor linearly interpolates the sub-frame crossing timestamps{' '}
              <span className="font-mono">t1</span> (Release) and <span className="font-mono">t2</span> (Reach) to eliminate 60Hz shutter quantization error:
            </p>
            <div className="bg-slate-50 border border-[#DDE3DE] rounded-lg p-3 font-mono text-xs text-[#0B1410] space-y-1">
              <div>dt = t2 - t1</div>
              <div>v (km/h) = (D_yards × 0.9144 / (dt / 1000)) × 3.6</div>
            </div>
            {measured && (
              <button
                type="button"
                onClick={() => {
                  onQueueSpeedForNextBall({
                    speedKmh: measured.speedKmh,
                    speedMph: measured.speedMph,
                    releaseTsMs: measured.releaseTsMs,
                    reachTsMs: measured.reachTsMs,
                    cameraFps: measured.fps,
                  });
                  onReturnToScorer();
                }}
                className="w-full mt-2 h-11 rounded-lg bg-[#0B1410] text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                Queue Speed &amp; Return to Scorer
              </button>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
