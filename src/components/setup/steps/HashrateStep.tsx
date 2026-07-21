import { useState, useEffect } from 'react';
import { StepProps } from '../types';
import { Check, ChevronDown, Settings2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { HashrateInput } from '@/components/ui/hashrate-input';
import { formatHashrate } from '@/lib/utils';
import { DEFAULT_MIN_HASHRATE } from '@sv2-ui/shared';

interface HashratePreset {
  id: string;
  label: string;
  hashrate: number;
  description: string;
}

const HASHRATE_PRESETS: HashratePreset[] = [
  { id: 'bitaxe',      label: 'Bitaxe / USB Miner', hashrate: 500_000_000_000,     description: '~500 GH/s' },
  { id: 'mid-asic',    label: 'Mid-Range ASIC',       hashrate: DEFAULT_MIN_HASHRATE, description: '~100 TH/s' },
  { id: 'high-asic',   label: 'High-End ASIC',        hashrate: 300_000_000_000_000, description: '~300 TH/s' },
  { id: 'custom',      label: 'Custom',               hashrate: 0,                   description: 'Enter your own value' },
];

const DEFAULT_SHARES_PER_MINUTE = 6;
const DEFAULT_DOWNSTREAM_EXTRANONCE2_SIZE = 4;

function isPositiveNumber(value: string): boolean {
  const parsed = Number(value);
  return value.trim() !== '' && Number.isFinite(parsed) && parsed > 0;
}

function isPositiveInteger(value: string): boolean {
  const parsed = Number(value);
  return isPositiveNumber(value) && Number.isInteger(parsed);
}

export function HashrateStep({ data, updateData, onNext }: StepProps) {
  const isSoloPool = data.miningMode === 'solo' && data.mode === 'no-jd';
  const existingHashrate = data.translator?.min_hashrate || 0;
  const existingSharesPerMinute = data.translator?.shares_per_minute || DEFAULT_SHARES_PER_MINUTE;
  const existingDownstreamExtranonce2Size =
    data.translator?.downstream_extranonce2_size || DEFAULT_DOWNSTREAM_EXTRANONCE2_SIZE;

  const getInitialPreset = () => {
    if (!existingHashrate) return 'mid-asic';
    return HASHRATE_PRESETS.find(p => p.hashrate === existingHashrate)?.id || 'custom';
  };

  const [selectedPreset, setSelectedPreset] = useState(getInitialPreset());
  const [rawHashrate, setRawHashrate] = useState(existingHashrate > 0 ? existingHashrate : DEFAULT_MIN_HASHRATE);
  const [hashrateInputValid, setHashrateInputValid] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [verifyPayout, setVerifyPayout] = useState(data.translator?.verify_payout ?? true);
  const [sharesPerMinute, setSharesPerMinute] = useState(String(existingSharesPerMinute));
  const [downstreamExtranonce2Size, setDownstreamExtranonce2Size] = useState(
    String(existingDownstreamExtranonce2Size),
  );

  const handlePresetChange = (presetId: string) => {
    setSelectedPreset(presetId);
    if (presetId !== 'custom') {
      const preset = HASHRATE_PRESETS.find(p => p.id === presetId);
      if (preset) {
        setRawHashrate(preset.hashrate);
      }
    }
  };

  const hashrate = rawHashrate;
  const advancedIsValid =
    isPositiveNumber(sharesPerMinute) &&
    isPositiveInteger(downstreamExtranonce2Size);

  useEffect(() => {
    updateData({
      translator: {
        enable_vardiff: true,
        aggregate_channels: data.translator?.aggregate_channels ?? false,
        ...(isSoloPool ? { verify_payout: verifyPayout } : {}),
        min_hashrate: hashrate,
        shares_per_minute: Number(sharesPerMinute) || DEFAULT_SHARES_PER_MINUTE,
        downstream_extranonce2_size:
          Number(downstreamExtranonce2Size) || DEFAULT_DOWNSTREAM_EXTRANONCE2_SIZE,
      },
    });
  // intentionally excluded: data.translator and updateData cause infinite loop when included
    // eslint-disable-next-line react-hooks/exhaustive-deps
}, [hashrate, sharesPerMinute, downstreamExtranonce2Size, verifyPayout, isSoloPool]);

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">Lowest Worker Hashrate</h2>
        <p className="text-lg text-muted-foreground">
          One worker? Enter its hashrate. Multiple? Use the lowest performing.
        </p>
      </div>

      <div className="p-4 rounded-xl bg-muted/40" role="note">
        <p className="text-sm text-muted-foreground">
          Difficulty per worker is automatically adjusted via variable difficulty (vardiff) algorithm.
          Give it a starting point. Using the approximate hashrate of your{' '}
          <span className="text-foreground font-medium">lowest performing worker</span> ensures every
          device can find shares right away.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3" role="group" aria-labelledby="hashrate-group-label">
        <span id="hashrate-group-label" className="sr-only">Select hashrate preset</span>
        {HASHRATE_PRESETS.map((preset) => {
          const active = selectedPreset === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => handlePresetChange(preset.id)}
              aria-pressed={active}
              className={`relative p-4 rounded-xl border transition-all text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                active ? 'border-primary bg-primary/[0.04]' : 'border-border bg-card hover:border-primary/45 hover:bg-primary/[0.02]'
              }`}
            >
              {active && <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center" aria-hidden="true"><Check className="w-3 h-3 text-background" /></div>}
              <div className="pr-6">
                <div className={`font-medium text-sm mb-1 ${active ? 'text-primary' : ''}`}>{preset.label}</div>
                <div className="text-xs text-muted-foreground leading-relaxed">{preset.description}</div>
              </div>
            </button>
          );
        })}
      </div>

      {selectedPreset === 'custom' && (
        <HashrateInput
          idPrefix="custom-hashrate"
          value={rawHashrate}
          onChange={setRawHashrate}
          onValidityChange={setHashrateInputValid}
        />
      )}

      {hashrate > 0 && (() => {
        const display = formatHashrate(hashrate);
        return (
          <div className="p-4 rounded-xl bg-primary/[0.08] text-center">
            <div className="text-sm text-muted-foreground mb-1">Starting difficulty per miner</div>
            <div className="text-2xl font-semibold text-primary">{display}</div>
          </div>
        );
      })()}

      <div className="rounded-xl border border-border bg-card">
        <button
          type="button"
          onClick={() => setShowAdvanced((open) => !open)}
          aria-expanded={showAdvanced}
          className="w-full p-4 flex items-center justify-between gap-3 text-left hover:bg-muted/40 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <span className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm font-semibold">Advanced Options</span>
          </span>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>

        {showAdvanced && (
          <div className="border-t border-border p-4 space-y-4">
            {isSoloPool && (
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <p id="verify-payout-label" className="text-sm font-medium">Coinbase Verification</p>
                  <p id="verify-payout-desc" className="text-xs text-muted-foreground">
                    Verify that your payout address is included in the pool&apos;s coinbase transaction.
                  </p>
                </div>
                <Switch
                  id="verify-payout-switch"
                  checked={verifyPayout}
                  onCheckedChange={setVerifyPayout}
                  aria-labelledby="verify-payout-label"
                  aria-describedby="verify-payout-desc"
                />
              </div>
            )}

            <div>
              <label htmlFor="shares-per-minute" className="block text-sm font-medium mb-2">
                Shares Per Minute
              </label>
              <input
                id="shares-per-minute"
                type="number"
                min="0.1"
                step="0.1"
                value={sharesPerMinute}
                onChange={(e) => setSharesPerMinute(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
              />
              {!isPositiveNumber(sharesPerMinute) && (
                <p className="text-xs text-destructive mt-1">Enter a value greater than 0.</p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                Target share rate used by variable difficulty mechanism by the Stratum V2 Client.
              </p>
            </div>

            <div>
              <label htmlFor="downstream-extranonce2-size" className="block text-sm font-medium mb-2">
                Downstream Extranonce2 Size
              </label>
              <input
                id="downstream-extranonce2-size"
                type="number"
                min="1"
                step="1"
                value={downstreamExtranonce2Size}
                onChange={(e) => setDownstreamExtranonce2Size(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
              />
              {!isPositiveInteger(downstreamExtranonce2Size) && (
                <p className="text-xs text-destructive mt-1">Enter a whole number greater than 0.</p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                Extranonce2 bytes assigned to downstream SV1 connections.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={onNext}
          disabled={hashrate <= 0 || (selectedPreset === 'custom' && !hashrateInputValid) || !advancedIsValid}
          className="h-11 px-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors font-medium"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
