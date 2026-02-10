import { useCallback, useEffect, useRef, useState } from 'react';

export interface HashrateDataPoint {
  time: string;
  timestamp: number;
  hashrate: number;
}

const MAX_HISTORY_POINTS = 60; // Keep last 60 data points
const SAMPLE_INTERVAL_MS = 5000; // Sample every 5 seconds

function formatSampleTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Hook to accumulate hashrate history from real-time data.
 * Since the API doesn't provide historical data, we build it client-side.
 * 
 * @param currentHashrate - The current hashrate value to track
 * @returns Array of historical data points
 */
export function useHashrateHistory(currentHashrate: number | undefined): HashrateDataPoint[] {
  const [history, setHistory] = useState<HashrateDataPoint[]>([]);
  const lastSampleTime = useRef<number>(0);
  const latestHashrateRef = useRef<number | null>(null);

  const appendSample = useCallback((timestamp: number, hashrate: number) => {
    // Prevent near-duplicate points when API updates and timer sampling overlap.
    if (lastSampleTime.current && timestamp - lastSampleTime.current < SAMPLE_INTERVAL_MS - 250) {
      return;
    }

    lastSampleTime.current = timestamp;

    setHistory(prev => {
      const newPoint: HashrateDataPoint = {
        time: formatSampleTime(timestamp),
        timestamp,
        hashrate,
      };

      const updated = [...prev, newPoint];

      // Keep only the last MAX_HISTORY_POINTS
      if (updated.length > MAX_HISTORY_POINTS) {
        return updated.slice(-MAX_HISTORY_POINTS);
      }

      return updated;
    });
  }, []);

  useEffect(() => {
    if (currentHashrate === undefined || currentHashrate === null || Number.isNaN(currentHashrate)) {
      latestHashrateRef.current = null;
      return;
    }

    latestHashrateRef.current = currentHashrate;

    // Seed immediately on first value or after a long gap.
    const now = Date.now();
    if (now - lastSampleTime.current >= SAMPLE_INTERVAL_MS) {
      appendSample(now, currentHashrate);
    }
  }, [currentHashrate, appendSample]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const hashrate = latestHashrateRef.current;
      if (hashrate === null) return;

      appendSample(Date.now(), hashrate);
    }, SAMPLE_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [appendSample]);

  return history;
}

/**
 * Hook to accumulate share submission history.
 * Tracks accepted and submitted shares over time.
 */
export interface ShareDataPoint {
  time: string;
  timestamp: number;
  accepted: number;
  submitted: number;
}

export function useShareHistory(
  accepted: number | undefined, 
  submitted: number | undefined
): ShareDataPoint[] {
  const [history, setHistory] = useState<ShareDataPoint[]>([]);
  const lastSampleTime = useRef<number>(0);
  const lastAccepted = useRef<number>(0);
  const lastSubmitted = useRef<number>(0);

  useEffect(() => {
    if (accepted === undefined || submitted === undefined) return;

    const now = Date.now();
    
    // Only add a new sample if enough time has passed
    if (now - lastSampleTime.current < SAMPLE_INTERVAL_MS) return;
    
    lastSampleTime.current = now;
    
    const timeStr = new Date(now).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    // Calculate delta (new shares since last sample)
    const deltaAccepted = Math.max(0, accepted - lastAccepted.current);
    const deltaSubmitted = Math.max(0, submitted - lastSubmitted.current);
    
    lastAccepted.current = accepted;
    lastSubmitted.current = submitted;

    // Only record if there's actual activity (skip initial zero delta)
    if (history.length > 0 || deltaSubmitted > 0) {
      setHistory(prev => {
        const newPoint: ShareDataPoint = {
          time: timeStr,
          timestamp: now,
          accepted: deltaAccepted,
          submitted: deltaSubmitted,
        };
        
        const updated = [...prev, newPoint];
        
        if (updated.length > MAX_HISTORY_POINTS) {
          return updated.slice(-MAX_HISTORY_POINTS);
        }
        
        return updated;
      });
    }
  }, [accepted, submitted, history.length]);

  return history;
}
