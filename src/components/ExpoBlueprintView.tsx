import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface BlueprintFile {
  path: string;
  content: string;
}

export function ExpoBlueprintView() {
  const [files, setFiles] = useState<BlueprintFile[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>('mobile-expo/src/vision/bowlingSpeedProcessor.ts');
  const [copied, setCopied] = useState(false);

  // Interactive Timestamp Math Explorer
  const [calcYards, setCalcYards] = useState(14);
  const [calcDtMs, setCalcDtMs] = useState(380);

  useEffect(() => {
    fetch('/api/blueprints')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.files)) {
          setFiles(data.files);
        }
      })
      .catch(() => {});
  }, []);

  const activeFile = files.find((f) => f.path === selectedPath) || files[0];

  const handleCopy = async () => {
    if (!activeFile) return;
    await navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const distanceMeters = calcYards * 0.9144;
  const speedKmh = (distanceMeters / (calcDtMs / 1000)) * 3.6;
  const speedMph = speedKmh * 0.621371;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-8 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#0B1410]">
          React Native / Expo Source, Schemas &amp; CV Algorithm
        </h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Complete Expo SDK 52 + VisionCamera v4 codebase, MySQL/MongoDB schemas, Express RBAC middleware, and frame-timestamp math.
        </p>
      </div>

      {/* Screen Flow + Mathematical Speed Derivation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-6 bg-white border border-[#DDE3DE] rounded-xl p-5 space-y-4">
          <h2 className="font-display text-base font-bold text-[#0B1410]">
            React Native Screen Flow &amp; State Architecture
          </h2>
          <ol className="space-y-3 text-sm text-slate-700">
            <li>
              <span className="font-semibold text-[#0B1410]">1. Role Authentication &amp; Match Setup:</span>{' '}
              JWT Bearer token stored in secure memory (`expo-secure-store` on device). Scorer selects Short Pitch (12–16 yd, tape/tennis ball, boundary-only option) or Long Pitch (22 yd).
            </li>
            <li>
              <span className="font-semibold text-[#0B1410]">2. LiveScoringScreen + Zustand Store:</span>{' '}
              Thumb-friendly runs pad triggers optimistic updates in `useMatchStore`, syncs via `POST /api/matches/:id/balls`, and emits WebSocket broadcasts to spectators.
            </li>
            <li>
              <span className="font-semibold text-[#0B1410]">3. SpeedTrackerScreen (VisionCamera 60/120fps):</span>{' '}
              Runs a JSI Worklet Frame Processor downscaling frames to `160x120`, isolating the central pitch corridor, and applying HSV color thresholds for tape/leather balls.
            </li>
            <li>
              <span className="font-semibold text-[#0B1410]">4. One-Tap Ball Telemetry Attachment:</span>{' '}
              Captured `speedKmh`, `speedMph`, `releaseTsMs`, and `reachTsMs` attach directly to the current delivery via `PATCH /api/matches/:id/balls/:ballId/speed`.
            </li>
          </ol>
        </section>

        <section className="lg:col-span-6 bg-white border border-[#DDE3DE] rounded-xl p-5 space-y-4">
          <h2 className="font-display text-base font-bold text-[#0B1410]">
            Sub-Frame Timestamp Interpolation Calculator
          </h2>
          <div className="bg-slate-50 border border-[#DDE3DE] rounded-lg p-3 font-mono text-xs text-[#0B1410] space-y-1">
            <div>alpha = (y_line - y_prev) / (y_curr - y_prev)</div>
            <div>t_cross = t_prev + alpha * (t_curr - t_prev)</div>
            <div>dt = t_reach - t_release</div>
            <div>v_kmh = (pitch_yards * 0.9144 / (dt / 1000)) * 3.6</div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-1">
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                <span>Pitch Distance</span>
                <span className="font-mono tabular-nums">{calcYards} yd</span>
              </div>
              <input
                type="range"
                min={10}
                max={24}
                step={0.5}
                value={calcYards}
                onChange={(e) => setCalcYards(Number(e.target.value))}
                className="w-full accent-[#0E7A49]"
              />
            </div>
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                <span>Elapsed Time (dt)</span>
                <span className="font-mono tabular-nums">{calcDtMs} ms</span>
              </div>
              <input
                type="range"
                min={240}
                max={1200}
                step={5}
                value={calcDtMs}
                onChange={(e) => setCalcDtMs(Number(e.target.value))}
                className="w-full accent-[#0B1410]"
              />
            </div>
          </div>

          <div className="flex items-baseline justify-between pt-2 border-t border-[#DDE3DE]">
            <span className="text-xs font-medium text-slate-600">
              {distanceMeters.toFixed(2)} m in {(calcDtMs / 1000).toFixed(3)} s
            </span>
            <span className="font-mono tabular-nums text-xl font-bold text-[#0E7A49]">
              {speedKmh.toFixed(1)} km/h ({speedMph.toFixed(1)} mph)
            </span>
          </div>
        </section>
      </div>

      {/* File Browser for Actual Repo Deliverables */}
      <section className="bg-white border border-[#DDE3DE] rounded-xl overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12">
          <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-[#DDE3DE] p-3 space-y-1 bg-slate-50/70">
            <p className="px-3 py-2 text-xs font-bold text-slate-500">Deliverable Project Files</p>
            {files.map((f) => (
              <button
                key={f.path}
                type="button"
                onClick={() => setSelectedPath(f.path)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-mono truncate cursor-pointer ${
                  f.path === activeFile?.path
                    ? 'bg-[#0B1410] text-white font-semibold'
                    : 'text-slate-700 hover:bg-slate-200/60'
                }`}
              >
                {f.path}
              </button>
            ))}
          </div>

          <div className="lg:col-span-8 flex flex-col">
            <div className="px-4 py-3 border-b border-[#DDE3DE] flex items-center justify-between bg-white">
              <span className="font-mono text-xs font-semibold text-[#0B1410] truncate">
                {activeFile?.path || 'Loading...'}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-1.5 text-xs font-semibold border border-[#DDE3DE] rounded-lg inline-flex items-center gap-1.5 hover:bg-slate-50 cursor-pointer shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-[#0E7A49]" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy Code'}
              </button>
            </div>
            <pre className="p-4 text-xs font-mono leading-relaxed text-slate-800 bg-slate-50 overflow-x-auto max-h-[540px] overflow-y-auto">
              <code>{activeFile?.content || ''}</code>
            </pre>
          </div>
        </div>
      </section>
    </div>
  );
}
