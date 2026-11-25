import React, { useMemo, useState } from 'react';
import type { Landmark3D } from '../lib/gestureSmoothing';
import {
  analyzeHandKinematics,
  type FingerName,
  type HandKinematicsSummary,
} from '../lib/handKinematics';

export interface HandKinematicsPanelProps {
  landmarks: readonly Landmark3D[];
  predictedGloss?: string;
  confidence?: number;
  pinchThreshold?: number;
  className?: string;
}

type PanelTab = 'extension' | 'pinch';

const FINGER_LABELS: Record<FingerName, string> = {
  thumb: 'Thumb',
  index: 'Index',
  middle: 'Middle',
  ring: 'Ring',
  pinky: 'Pinky',
};

const FINGER_ORDER: readonly FingerName[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];
const PINCH_TARGETS: readonly Exclude<FingerName, 'thumb'>[] = ['index', 'middle', 'ring', 'pinky'];

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(100, Math.max(0, value)));
}

export const HandKinematicsPanel: React.FC<HandKinematicsPanelProps> = ({
  landmarks,
  predictedGloss,
  confidence,
  pinchThreshold = 0.45,
  className = '',
}) => {
  const [activeTab, setActiveTab] = useState<PanelTab>('extension');

  const summary: HandKinematicsSummary | null = useMemo(() => {
    if (!landmarks || landmarks.length !== 21) {
      return null;
    }
    return analyzeHandKinematics(landmarks);
  }, [landmarks]);

  if (!summary) {
    return (
      <section
        aria-label="Hand Kinematics Telemetry"
        className={`rounded-xl border border-slate-800 bg-slate-950/80 p-4 text-slate-300 shadow-lg backdrop-blur-md ${className}`}
      >
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
          <span className="text-xs font-mono uppercase tracking-wider text-cyan-400">
            Kinematic Telemetry
          </span>
          <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-mono text-slate-400">
            IDLE
          </span>
        </div>
        <p className="mt-4 text-center text-xs text-slate-400">
          Awaiting 21 MediaPipe hand landmarks to compute finger flexion and pinch vectors.
        </p>
      </section>
    );
  }

  const extendedCount = FINGER_ORDER.filter((f) => summary.fingers[f].isExtended).length;
  const activePinches = PINCH_TARGETS.filter(
    (f) => summary.pinchDistances[f] <= pinchThreshold
  );

  return (
    <section
      aria-label="Hand Kinematics Telemetry"
      className={`rounded-xl border border-slate-800 bg-slate-950/85 p-4 text-slate-200 shadow-xl backdrop-blur-md ${className}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
            <h3 className="text-xs font-mono uppercase tracking-wider text-cyan-300">
              Kinematic Telemetry
            </h3>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {extendedCount}/5 extended · Span {summary.palmBasis.palmSpan.toFixed(2)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {predictedGloss ? (
            <span className="rounded-md border border-cyan-500/40 bg-cyan-500/15 px-2 py-0.5 text-xs font-semibold text-cyan-200">
              {predictedGloss}
              {typeof confidence === 'number' && Number.isFinite(confidence)
                ? ` · ${Math.round(confidence * 100)}%`
                : ''}
            </span>
          ) : null}
          <div
            role="tablist"
            aria-label="Kinematics view mode"
            className="inline-flex rounded-lg border border-slate-800 bg-slate-900 p-0.5 text-[11px]"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'extension'}
              onClick={() => setActiveTab('extension')}
              className={`rounded-md px-2 py-0.5 transition-colors ${
                activeTab === 'extension'
                  ? 'bg-cyan-500/20 text-cyan-200'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Fingers
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'pinch'}
              onClick={() => setActiveTab('pinch')}
              className={`rounded-md px-2 py-0.5 transition-colors ${
                activeTab === 'pinch'
                  ? 'bg-cyan-500/20 text-cyan-200'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Pinch &amp; Palm
            </button>
          </div>
        </div>
      </header>

      {activeTab === 'extension' ? (
        <ul className="mt-3 space-y-2.5" aria-label="Finger extension metrics">
          {FINGER_ORDER.map((finger) => {
            const fk = summary.fingers[finger];
            const pct = clampPct((fk.extensionRatio / 2.4) * 100);
            return (
              <li key={finger} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-12 font-medium text-slate-200">
                      {FINGER_LABELS[finger]}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.2 text-[10px] font-mono ${
                        fk.isExtended
                          ? 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                          : 'border border-amber-500/30 bg-amber-500/10 text-amber-300'
                      }`}
                    >
                      {fk.isExtended ? 'OPEN' : 'CURLED'}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400">
                    PIP {Math.round(fk.pipAngleDeg)}° · {fk.extensionRatio.toFixed(2)}×
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={`${FINGER_LABELS[finger]} extension`}
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800"
                >
                  <div
                    className={`h-full rounded-full transition-all duration-150 ${
                      fk.isExtended ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-3 space-y-3" aria-label="Pinch and palm orientation metrics">
          <div className="grid grid-cols-2 gap-2">
            {PINCH_TARGETS.map((target) => {
              const dist = summary.pinchDistances[target];
              const isPinching = dist <= pinchThreshold;
              return (
                <div
                  key={target}
                  className={`rounded-lg border px-2.5 py-2 text-xs ${
                    isPinching
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200'
                      : 'border-slate-800 bg-slate-900/70 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Thumb–{FINGER_LABELS[target]}</span>
                    {isPinching ? (
                      <span className="text-[10px] font-mono uppercase text-emerald-300">
                        PINCH
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-slate-400">
                    {dist.toFixed(2)}× span
                  </p>
                </div>
              );
            })}
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-[11px] font-mono text-slate-300">
            <div className="flex items-center justify-between text-slate-400">
              <span>PALM NORMAL (n̂)</span>
              <span>
                {activePinches.length > 0
                  ? `Active pinch: ${activePinches.join(', ')}`
                  : 'No active pinch'}
              </span>
            </div>
            <p className="mt-1 text-cyan-300">
              ({summary.palmBasis.normal.x.toFixed(2)}, {summary.palmBasis.normal.y.toFixed(2)},{' '}
              {summary.palmBasis.normal.z.toFixed(2)})
            </p>
          </div>
        </div>
      )}
    </section>
  );
};
