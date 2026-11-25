import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { HandKinematicsPanel } from '../components/HandKinematicsPanel';
import type { Landmark3D } from '../lib/gestureSmoothing';

function buildOpenHandLandmarks(): Landmark3D[] {
  const base: Array<[number, number, number]> = [
    [0.0, 0.0, 0.0],
    [-0.08, -0.05, 0.0],
    [-0.14, -0.11, 0.0],
    [-0.19, -0.17, 0.0],
    [-0.24, -0.23, 0.0],
    [-0.06, -0.18, 0.0],
    [-0.07, -0.27, 0.0],
    [-0.075, -0.34, 0.0],
    [-0.08, -0.41, 0.0],
    [0.0, -0.2, 0.0],
    [0.0, -0.3, 0.0],
    [0.0, -0.38, 0.0],
    [0.0, -0.45, 0.0],
    [0.06, -0.18, 0.0],
    [0.07, -0.27, 0.0],
    [0.075, -0.34, 0.0],
    [0.08, -0.4, 0.0],
    [0.12, -0.15, 0.0],
    [0.14, -0.22, 0.0],
    [0.15, -0.28, 0.0],
    [0.16, -0.33, 0.0],
  ];
  return base.map(([x, y, z]) => ({ x, y, z }));
}

describe('HandKinematicsPanel', () => {
  it('renders idle awaiting state when fewer than 21 landmarks are passed', () => {
    render(<HandKinematicsPanel landmarks={[]} />);
    expect(screen.getByRole('region', { name: /hand kinematics telemetry/i })).toBeInTheDocument();
    expect(screen.getByText('IDLE')).toBeInTheDocument();
    expect(screen.getByText(/awaiting 21 mediapipe hand landmarks/i)).toBeInTheDocument();
  });

  it('displays extended finger count, gloss badge, and per-finger progressbars', () => {
    const landmarks = buildOpenHandLandmarks();
    render(
      <HandKinematicsPanel
        landmarks={landmarks}
        predictedGloss="HELLO"
        confidence={0.94}
      />
    );

    expect(screen.getByText(/5\/5 extended/i)).toBeInTheDocument();
    expect(screen.getByText(/HELLO · 94%/)).toBeInTheDocument();
    expect(screen.getAllByText('OPEN')).toHaveLength(5);
    expect(screen.getByRole('progressbar', { name: 'Index extension' })).toBeInTheDocument();
  });

  it('switches to Pinch & Palm view and highlights an active thumb-index pinch', () => {
    const landmarks = buildOpenHandLandmarks();
    // Move index tip directly onto thumb tip to trigger pinch detection
    landmarks[8] = { ...landmarks[4] };

    render(<HandKinematicsPanel landmarks={landmarks} pinchThreshold={0.45} />);

    fireEvent.click(screen.getByRole('tab', { name: /pinch & palm/i }));

    expect(screen.getByText('PINCH')).toBeInTheDocument();
    expect(screen.getByText(/active pinch: index/i)).toBeInTheDocument();
    expect(screen.getByText(/PALM NORMAL/i)).toBeInTheDocument();
  });
});
