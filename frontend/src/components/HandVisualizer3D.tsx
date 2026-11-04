import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { Landmark3D } from '../lib/gestureSmoothing';
import {
  projectLandmarks3D,
  computePalmNormal,
  computeSpatialConfidenceVectors,
  HAND_BONE_CONNECTIONS,
  DEFAULT_CAMERA_ORBIT,
  type CameraOrbit,
  type ProjectedPoint2D,
} from '../lib/hand3DProjection';

export interface HandVisualizer3DProps {
  landmarks: Landmark3D[];
  width?: number;
  height?: number;
  className?: string;
  overlayMode?: boolean;
  showVectors?: boolean;
  showPalmNormal?: boolean;
  autoRotate?: boolean;
  onCameraChange?: (orbit: CameraOrbit) => void;
}

export const HandVisualizer3D: React.FC<HandVisualizer3DProps> = ({
  landmarks = [],
  width = 400,
  height = 360,
  className = '',
  overlayMode = false,
  showVectors: initialShowVectors = true,
  showPalmNormal: initialShowPalmNormal = true,
  autoRotate: initialAutoRotate = false,
  onCameraChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [camera, setCamera] = useState<CameraOrbit>(DEFAULT_CAMERA_ORBIT);
  const [showVectors, setShowVectors] = useState(initialShowVectors);
  const [showPalmNormal, setShowPalmNormal] = useState(initialShowPalmNormal);
  const [autoRotate, setAutoRotate] = useState(initialAutoRotate);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; yaw: number; pitch: number }>({
    x: 0,
    y: 0,
    yaw: 0,
    pitch: 0,
  });

  // Handle auto-rotate animation
  useEffect(() => {
    if (!autoRotate) return;
    let animId: number;
    const step = () => {
      setCamera((prev) => {
        const next = { ...prev, yaw: (prev.yaw + 0.015) % (Math.PI * 2) };
        onCameraChange?.(next);
        return next;
      });
      animId = requestAnimationFrame(step);
    };
    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [autoRotate, onCameraChange]);

  // Orbit control event handlers
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      yaw: camera.yaw,
      pitch: camera.pitch,
    };
  }, [camera]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    const sensitivity = 0.008;

    setCamera((prev) => {
      const next = {
        ...prev,
        yaw: dragStartRef.current.yaw + dx * sensitivity,
        pitch: Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, dragStartRef.current.pitch + dy * sensitivity)),
      };
      onCameraChange?.(next);
      return next;
    });
  }, [isDragging, onCameraChange]);

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    setCamera((prev) => {
      const next = {
        ...prev,
        zoom: Math.max(120, Math.min(800, prev.zoom * zoomFactor)),
      };
      onCameraChange?.(next);
      return next;
    });
  }, [onCameraChange]);

  const resetCamera = useCallback(() => {
    setCamera(DEFAULT_CAMERA_ORBIT);
    onCameraChange?.(DEFAULT_CAMERA_ORBIT);
  }, [onCameraChange]);

  // Main canvas render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Retina display scaling
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear background
    ctx.clearRect(0, 0, width, height);
    if (!overlayMode) {
      ctx.fillStyle = '#0a0d14';
      ctx.fillRect(0, 0, width, height);

      // Subtle 3D ground plane / grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      const gridSize = 20;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }

    if (!landmarks || landmarks.length < 21) {
      // Empty state
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Awaiting 3D hand keypoints...', width / 2, height / 2);
      return;
    }

    // 1. Perspective project 3D landmarks
    const projected = projectLandmarks3D(landmarks, width, height, camera);

    // 2. Render Anatomical Bones
    for (const [startIdx, endIdx] of HAND_BONE_CONNECTIONS) {
      const p1 = projected[startIdx];
      const p2 = projected[endIdx];
      if (!p1 || !p2) continue;

      const grad = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
      grad.addColorStop(0, 'rgba(16, 185, 129, 0.7)'); // Emerald
      grad.addColorStop(1, 'rgba(6, 182, 212, 0.7)'); // Cyan

      ctx.strokeStyle = grad;
      ctx.lineWidth = Math.max(2, 3.5 * Math.min(p1.scale, p2.scale));
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    // 3. Render Live Spatial Confidence Vectors (Fingertips)
    if (showVectors) {
      const vectors = computeSpatialConfidenceVectors(landmarks, projected);
      for (const vec of vectors) {
        const p1 = vec.startPoint;
        const p2 = vec.endPoint;
        const extX = p2.x + (p2.x - p1.x) * 0.4;
        const extY = p2.y + (p2.y - p1.y) * 0.4;

        // Confidence line
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.85)'; // Rose accent
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(extX, extY);
        ctx.stroke();

        // Arrow head
        const angle = Math.atan2(extY - p2.y, extX - p2.x);
        const headLen = 6;
        ctx.fillStyle = 'rgba(244, 63, 94, 0.9)';
        ctx.beginPath();
        ctx.moveTo(extX, extY);
        ctx.lineTo(extX - headLen * Math.cos(angle - Math.PI / 6), extY - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(extX - headLen * Math.cos(angle + Math.PI / 6), extY - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();

        // Vector magnitude label
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '9px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${(vec.magnitude * 100).toFixed(0)}cm`, extX + 4, extY);
      }
    }

    // 4. Render Palm Normal Orientation
    if (showPalmNormal) {
      const normal = computePalmNormal(landmarks);
      const palmCenter = projected[0]; // Wrist anchor or MCP midpoint
      const normalLen = 45 * camera.zoom / 350;
      const nx = palmCenter.x + normal.x * normalLen;
      const ny = palmCenter.y + normal.y * normalLen;

      ctx.strokeStyle = '#eab308'; // Amber normal vector
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 2]);
      ctx.beginPath();
      ctx.moveTo(palmCenter.x, palmCenter.y);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#eab308';
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText('Normal (n̂)', nx + 4, ny);
    }

    // 5. Render Joint Nodes (Depth sorted: back to front)
    const sortedJoints: ProjectedPoint2D[] = [...projected].sort((a, b) => a.depth - b.depth);

    for (const pt of sortedJoints) {
      const radius = Math.max(2.5, 4.5 * pt.scale);

      // Glow halo
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, radius * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(6, 182, 212, 0.15)';
      ctx.fill();

      // Main core
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = pt.landmarkIndex === 0 ? '#38bdf8' : pt.landmarkIndex % 4 === 0 ? '#10b981' : '#f8fafc';
      ctx.fill();

      // Border ring
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#0284c7';
      ctx.stroke();
    }
  }, [landmarks, camera, width, height, overlayMode, showVectors, showPalmNormal]);

  return (
    <div className={`relative flex flex-col items-center select-none ${className}`}>
      <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950/80 shadow-2xl backdrop-blur-md">
        <canvas
          ref={canvasRef}
          style={{ width: `${width}px`, height: `${height}px` }}
          className="cursor-grab active:cursor-grabbing touch-none block"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        />

        {/* HUD Overlay Badge */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-900/80 border border-slate-700/60 text-[10px] font-mono text-cyan-400">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span>3D SPATIAL KINEMATICS</span>
        </div>

        {/* Control toolbar */}
        <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-900/90 border border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setShowVectors((v) => !v)}
            className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
              showVectors ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'text-slate-400 hover:text-white'
            }`}
            title="Toggle fingertip spatial confidence vectors"
          >
            Vectors
          </button>
          <button
            type="button"
            onClick={() => setShowPalmNormal((n) => !n)}
            className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
              showPalmNormal ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-slate-400 hover:text-white'
            }`}
            title="Toggle palm plane normal vector"
          >
            Normal
          </button>
          <button
            type="button"
            onClick={() => setAutoRotate((r) => !r)}
            className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
              autoRotate ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-white'
            }`}
            title="Toggle auto orbit rotation"
          >
            Orbit
          </button>
          <button
            type="button"
            onClick={resetCamera}
            className="px-1.5 py-0.5 rounded text-[10px] text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Reset 3D camera angles and zoom"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
};
