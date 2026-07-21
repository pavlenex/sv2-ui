import { useEffect, useState } from 'react';

import { formatHashrate } from '@/lib/utils';

const SLIDER_MIN_EXPONENT = 9;
const SLIDER_MAX_EXPONENT = 16;
const SLIDER_STEPS = 1000;

interface HashrateUnit {
  label: string;
  multiplier: number;
}

function getAutoUnit(hashrate: number): HashrateUnit {
  if (hashrate >= 1e15) return { label: 'PH/s', multiplier: 1e15 };
  if (hashrate >= 1e12) return { label: 'TH/s', multiplier: 1e12 };
  if (hashrate >= 1e9) return { label: 'GH/s', multiplier: 1e9 };
  return { label: 'MH/s', multiplier: 1e6 };
}

function formatInputValue(hashrate: number): string {
  const { multiplier } = getAutoUnit(hashrate);
  return (hashrate / multiplier).toPrecision(6).replace(/\.?0+$/, '');
}

function rawToSlider(hashrate: number): number {
  const exponent = Math.log10(Math.max(hashrate, 10 ** SLIDER_MIN_EXPONENT));
  const position = ((exponent - SLIDER_MIN_EXPONENT) / (SLIDER_MAX_EXPONENT - SLIDER_MIN_EXPONENT))
    * SLIDER_STEPS;
  return Math.min(SLIDER_STEPS, Math.max(0, Math.round(position)));
}

function sliderToRaw(position: number): number {
  return Math.round(10 ** (
    SLIDER_MIN_EXPONENT
    + (position / SLIDER_STEPS) * (SLIDER_MAX_EXPONENT - SLIDER_MIN_EXPONENT)
  ));
}

interface HashrateInputProps {
  value: number;
  onChange: (value: number) => void;
  onValidityChange?: (isValid: boolean) => void;
  idPrefix?: string;
}

/**
 * Shared logarithmic hashrate input used by setup and configuration settings.
 */
export function HashrateInput({
  value,
  onChange,
  onValidityChange,
  idPrefix = 'hashrate',
}: HashrateInputProps) {
  const [inputValue, setInputValue] = useState(() => formatInputValue(value));
  const [inputError, setInputError] = useState<string | null>(null);
  const { label, multiplier } = getAutoUnit(value);
  const inputId = `${idPrefix}-input`;
  const unitId = `${idPrefix}-unit`;
  const errorId = `${idPrefix}-error`;

  useEffect(() => {
    setInputValue(formatInputValue(value));
    onValidityChange?.(Number.isFinite(value) && value > 0);
  }, [onValidityChange, value]);

  const handleInputChange = (nextValue: string) => {
    const cleaned = nextValue.replace(/e/i, '');
    setInputValue(cleaned);

    const parsed = Number(cleaned);
    if (cleaned === '' || !Number.isFinite(parsed) || parsed <= 0) {
      setInputError(cleaned === '' ? 'Required' : 'Invalid hashrate');
      onValidityChange?.(false);
      return;
    }

    setInputError(null);
    onValidityChange?.(true);
    onChange(Math.round(parsed * multiplier));
  };

  const handleSliderChange = (position: number) => {
    setInputError(null);
    onValidityChange?.(true);
    onChange(sliderToRaw(position));
  };

  return (
    <div className="p-4 rounded-xl bg-muted/40 space-y-3">
      <div className="flex items-center gap-2">
        <label htmlFor={inputId} className="sr-only">Hashrate value in {label}</label>
        <input
          id={inputId}
          type="number"
          min="0"
          value={inputValue}
          onChange={(event) => handleInputChange(event.target.value)}
          aria-describedby={`${unitId}${inputError ? ` ${errorId}` : ''}`}
          aria-invalid={inputError ? true : undefined}
          className="flex-1 h-10 min-w-0 px-3 rounded-lg border border-input bg-background text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
        />
        <span
          id={unitId}
          className="text-sm font-medium text-muted-foreground w-12 text-right"
          aria-live="polite"
        >
          {label}
        </span>
      </div>
      {inputError && <div id={errorId} className="text-xs text-destructive">{inputError}</div>}
      <input
        type="range"
        min={0}
        max={SLIDER_STEPS}
        value={rawToSlider(value)}
        onChange={(event) => handleSliderChange(Number(event.target.value))}
        aria-label={`Hashrate: ${formatHashrate(value)}`}
        aria-valuemin={0}
        aria-valuemax={SLIDER_STEPS}
        aria-valuenow={rawToSlider(value)}
        className="w-full accent-primary"
      />
      <div className="flex justify-between text-xs text-muted-foreground select-none" aria-hidden="true">
        <span>1 GH/s</span><span>8 GH/s</span><span>56 GH/s</span><span>420 GH/s</span><span>3 TH/s</span><span>24 TH/s</span><span>180 TH/s</span><span>1 PH/s</span><span>10 PH/s</span>
      </div>
    </div>
  );
}
