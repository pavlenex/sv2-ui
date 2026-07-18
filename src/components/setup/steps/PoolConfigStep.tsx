import { useEffect, useRef, useState } from 'react';
import { StepProps, PoolConfig, BitcoinNetwork, MiningMode } from '../types';
import { DEFAULT_POOL_PORT } from '@sv2-ui/shared';
import { AlertCircle, ArrowDown, ArrowUp, GripVertical, X } from 'lucide-react';
import { shouldAggregateTranslatorChannels } from '../poolRules';
import { PoolIcon } from '@/components/ui/pool-icon';
import {
  createEmptyCustomPool,
  getPoolsForMode,
  isSamePool,
  knownPoolToConfig,
  type KnownPool,
} from '@/lib/pools';
import {
  buildSriIdentity,
  getPoolIdentityError,
  isSriPool,
  normalizePoolUserIdentity,
  parseSriIdentity,
} from '@/lib/miningIdentity';
import {
  getBitcoinAddressError,
  getBitcoinAddressPlaceholder,
  getPoolAuthorityPubkeyError,
  isValidPoolAuthorityPubkey,
  stripWrappingQuotes,
} from '@/lib/utils';

const DONATION_SNAP_POINTS = [0, 10, 25, 50, 75, 100];
const DONATION_SNAP_THRESHOLD = 3;

function snapDonation(value: number): number {
  const nearest = DONATION_SNAP_POINTS.find((p) => Math.abs(value - p) <= DONATION_SNAP_THRESHOLD);
  return nearest ?? value;
}

function poolMatchesPreset(pool: PoolConfig | null | undefined, preset: KnownPool): boolean {
  return isSamePool(pool, preset);
}

function getSelectedPreset(pool: PoolConfig | null | undefined, pools: KnownPool[]): KnownPool | null {
  return pools.find((preset) => poolMatchesPreset(pool, preset)) ?? null;
}

function isPoolComplete(
  pool: PoolConfig | null | undefined,
  miningMode: MiningMode | null,
  network: BitcoinNetwork,
): boolean {
  return Boolean(
    pool?.address &&
    Number.isInteger(pool.port) &&
    pool.port > 0 &&
    pool.port <= 65535 &&
    isValidPoolAuthorityPubkey(pool.authority_public_key) &&
    !getPoolIdentityError(pool, miningMode, network),
  );
}

function isPoolConnectionComplete(pool: PoolConfig | null | undefined): boolean {
  return Boolean(
    pool?.address &&
    Number.isInteger(pool.port) &&
    pool.port > 0 &&
    pool.port <= 65535 &&
    isValidPoolAuthorityPubkey(pool.authority_public_key),
  );
}

function getIdentityFieldLabel(miningMode: MiningMode | null): string {
  return miningMode === 'solo' ? 'Payout address' : 'Pool username';
}

function getIdentityStepTitle(miningMode: MiningMode | null): string {
  return miningMode === 'solo' ? 'Add Payout Address' : 'Add Pool Username';
}

function getFallbackDefaultIdentity(
  primaryPool: PoolConfig | null | undefined,
  fallbackPool: PoolConfig,
  miningMode: MiningMode | null,
): string {
  const primaryIdentity = primaryPool?.user_identity ?? '';
  if (!primaryIdentity) return '';

  if (miningMode === 'solo' && isSriPool(primaryPool) && !isSriPool(fallbackPool)) {
    const parsed = parseSriIdentity(primaryIdentity);
    return parsed.donationPercent >= 100 ? '' : parsed.address;
  }

  return normalizePoolUserIdentity(
    { ...fallbackPool, user_identity: primaryIdentity },
    miningMode,
  ).user_identity;
}

function withFallbackDefaultIdentity(
  primaryPool: PoolConfig | null | undefined,
  fallbackPool: PoolConfig,
  miningMode: MiningMode | null,
): PoolConfig {
  return normalizePoolUserIdentity(
    {
      ...fallbackPool,
      user_identity: getFallbackDefaultIdentity(primaryPool, fallbackPool, miningMode),
    },
    miningMode,
  );
}

type PoolConfigStepProps = StepProps;

export function PoolConfigStep({ data, updateData, onNext }: PoolConfigStepProps) {
  const [step, setStep] = useState<'pools' | 'identity'>('pools');
  const [showFallbackIdentityFields, setShowFallbackIdentityFields] = useState(false);
  const pools = getPoolsForMode(data.miningMode, data.mode);
  const fallbackPools = data.fallbackPools ?? [];
  const network = data.bitcoin?.network ?? 'mainnet';

  const primaryPool = data.pool;
  const selectedPools = [
    primaryPool,
    ...fallbackPools,
  ].filter((pool): pool is PoolConfig => Boolean(pool));
  const selectedPreset = getSelectedPreset(primaryPool, pools);

  const updateSelectedPools = (nextPools: PoolConfig[]) => {
    const normalizedPools = nextPools.map((pool) => normalizePoolUserIdentity(pool, data.miningMode));
    const nextPrimaryPool = normalizedPools[0] ?? null;

    updateData({
      pool: nextPrimaryPool,
      fallbackPools: normalizedPools.slice(1).map((fallbackPool) => {
        const previousDefaultIdentity = getFallbackDefaultIdentity(primaryPool, fallbackPool, data.miningMode);

        if (fallbackPool.user_identity && fallbackPool.user_identity !== previousDefaultIdentity) {
          return fallbackPool;
        }

        return withFallbackDefaultIdentity(nextPrimaryPool, fallbackPool, data.miningMode);
      }),
    });
  };

  const updatePrimaryPool = (pool: PoolConfig) => {
    updateSelectedPools([pool, ...fallbackPools]);
  };

  const updateFallbackPool = (index: number, pool: PoolConfig) => {
    updateSelectedPools(selectedPools.map((item, i) => (
      i === index + 1 ? pool : item
    )));
  };

  const updateSelectedPool = (index: number, pool: PoolConfig) => {
    updateSelectedPools(selectedPools.map((item, i) => (
      i === index ? pool : item
    )));
  };

  const moveSelectedPool = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= selectedPools.length) {
      return;
    }

    const nextPools = [...selectedPools];
    const [movedPool] = nextPools.splice(fromIndex, 1);
    nextPools.splice(toIndex, 0, movedPool);
    updateSelectedPools(nextPools);
  };

  const toggleKnownPool = (pool: KnownPool) => {
    const selectedIndex = selectedPools.findIndex((selectedPool) => isSamePool(selectedPool, pool));
    if (selectedIndex >= 0) {
      updateSelectedPools(selectedPools.filter((_, index) => index !== selectedIndex));
      return;
    }

    updateSelectedPools([...selectedPools, knownPoolToConfig(pool, primaryPool?.user_identity ?? '')]);
  };

  const toggleCustomPool = () => {
    const selectedIndex = selectedPools.findIndex((pool) => !getSelectedPreset(pool, pools));
    if (selectedIndex >= 0) {
      updateSelectedPools(selectedPools.filter((_, index) => index !== selectedIndex));
      return;
    }

    updateSelectedPools([...selectedPools, createEmptyCustomPool(primaryPool?.user_identity ?? '')]);
  };

  const poolSelectionValid =
    selectedPools.length > 0 &&
    selectedPools.every(isPoolConnectionComplete);
  const primaryPoolValid = isPoolComplete(primaryPool, data.miningMode, network);
  const fallbackPoolsValid = fallbackPools.every((pool) => isPoolComplete(pool, data.miningMode, network));
  const isValid = primaryPoolValid && fallbackPoolsValid;
  const identityLabel = getIdentityFieldLabel(data.miningMode);
  const fallbackIdentityBlocked = primaryPoolValid && !fallbackPoolsValid;

  if (step === 'identity') {
    return (
      <div className="space-y-8">
        <div className="text-center">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
            {getIdentityStepTitle(data.miningMode)}
          </h2>
        </div>

        {primaryPool && (
          <SelectedPoolSummary
            pool={primaryPool}
            preset={selectedPreset}
            onChangePool={() => setStep('pools')}
          />
        )}

        {primaryPool && (
          <PoolIdentityFields
            pool={primaryPool}
            miningMode={data.miningMode}
            network={network}
            idPrefix="primary-pool"
            onChange={updatePrimaryPool}
          />
        )}

        {fallbackPools.length > 0 && (
          <FallbackIdentitySection
            fallbackPools={fallbackPools}
            pools={pools}
            miningMode={data.miningMode}
            network={network}
            identityLabel={identityLabel}
            expanded={showFallbackIdentityFields || fallbackIdentityBlocked}
            hasBlockingError={fallbackIdentityBlocked}
            onToggle={() => setShowFallbackIdentityFields((current) => !current)}
            onChange={updateFallbackPool}
            onUsePrimary={(index) => {
              const fallbackPool = fallbackPools[index];
              if (fallbackPool) {
                updateFallbackPool(index, withFallbackDefaultIdentity(primaryPool, fallbackPool, data.miningMode));
              }
            }}
          />
        )}

        <div className="flex flex-col-reverse items-center justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => setStep('pools')}
            className="h-11 px-6 rounded-full border border-border text-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors font-medium"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!isValid}
            className="h-11 px-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors font-medium"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Select Pools
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Select one pool as primary. Select more pools to add fallbacks, then drag selected pools to reorder priority.
        </p>
      </div>

      <div className="space-y-3">
        <PoolPriorityList
          pools={pools}
          selectedPools={selectedPools}
          onTogglePool={toggleKnownPool}
          onToggleCustom={toggleCustomPool}
          onMove={moveSelectedPool}
          onChangeSelectedPool={updateSelectedPool}
        />
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setStep('identity')}
          disabled={!poolSelectionValid}
          className="h-11 px-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors font-medium"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function SelectedPoolSummary({
  pool,
  preset,
  onChangePool,
}: {
  pool: PoolConfig;
  preset: KnownPool | null;
  onChangePool: () => void;
}) {
  const displayName = preset?.name ?? pool.name ?? 'Custom Pool';

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
      <div className="flex min-w-0 items-center gap-3">
        <PoolIcon
          logoUrl={preset?.logoUrl}
          logoOnDark={preset?.logoOnDark}
          monogram={preset?.monogram}
          invertLogoInDarkMode={preset?.invertLogoInDarkMode}
          logoScale={preset?.logoScale}
          name={displayName}
        />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{displayName}</div>
          <div className="truncate font-mono text-xs text-muted-foreground">
            {pool.address}:{pool.port}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onChangePool}
        className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        Change
      </button>
    </div>
  );
}

function FallbackIdentitySection({
  fallbackPools,
  pools,
  miningMode,
  network,
  identityLabel,
  expanded,
  hasBlockingError,
  onToggle,
  onChange,
  onUsePrimary,
}: {
  fallbackPools: PoolConfig[];
  pools: KnownPool[];
  miningMode: PoolConfigStepProps['data']['miningMode'];
  network: BitcoinNetwork;
  identityLabel: string;
  expanded: boolean;
  hasBlockingError: boolean;
  onToggle: () => void;
  onChange: (index: number, pool: PoolConfig) => void;
  onUsePrimary: (index: number) => void;
}) {
  if (!expanded) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>Fallback pools will use this same {identityLabel.toLowerCase()}.</span>
          <button
            type="button"
            onClick={onToggle}
            className="self-start rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:self-auto"
          >
            Customize
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-4 rounded-lg border p-4 ${
      hasBlockingError
        ? 'border-destructive/40 bg-destructive/[0.08]'
        : 'border-border bg-muted/20'
    }`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">Fallback identities</h3>
          <p className={`mt-1 text-sm ${hasBlockingError ? 'text-destructive' : 'text-muted-foreground'}`}>
            {hasBlockingError
              ? `Set a valid fallback ${identityLabel.toLowerCase()} or remove fallback pools.`
              : 'Optional. Leave these matching the primary value unless a fallback pool needs a different one.'}
          </p>
        </div>
        {!hasBlockingError && (
          <button
            type="button"
            onClick={onToggle}
            className="self-start rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:self-auto"
          >
            Hide
          </button>
        )}
      </div>

      <div className="space-y-4">
        {fallbackPools.map((pool, index) => {
          const selectedPreset = getSelectedPreset(pool, pools);
          const displayName = selectedPreset?.name ?? pool.name ?? `Fallback ${index + 1}`;

          return (
            <div key={`fallback-identity-${index}`} className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <PoolIcon
                    logoUrl={selectedPreset?.logoUrl}
                    logoOnDark={selectedPreset?.logoOnDark}
                    monogram={selectedPreset?.monogram}
                    invertLogoInDarkMode={selectedPreset?.invertLogoInDarkMode}
                    logoScale={selectedPreset?.logoScale}
                    name={displayName}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{displayName}</div>
                    <div className="truncate font-mono text-xs text-muted-foreground">
                      {pool.address}:{pool.port}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onUsePrimary(index)}
                  className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  Use primary
                </button>
              </div>

              <PoolIdentityFields
                pool={pool}
                miningMode={miningMode}
                network={network}
                idPrefix={`fallback-identity-${index}`}
                onChange={(nextPool) => onChange(index, nextPool)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PoolPriorityList({
  pools,
  selectedPools,
  onTogglePool,
  onToggleCustom,
  onMove,
  onChangeSelectedPool,
}: {
  pools: KnownPool[];
  selectedPools: PoolConfig[];
  onTogglePool: (pool: KnownPool) => void;
  onToggleCustom: () => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onChangeSelectedPool: (index: number, pool: PoolConfig) => void;
}) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const draggedIndexRef = useRef<number | null>(null);
  const selectedCustomIndex = selectedPools.findIndex((pool) => !getSelectedPreset(pool, pools));
  const unselectedPools = pools.filter((pool) => !selectedPools.some((selectedPool) => isSamePool(selectedPool, pool)));

  const finishDrag = (toIndex: number) => {
    if (draggedIndexRef.current !== null) {
      onMove(draggedIndexRef.current, toIndex);
    }
    draggedIndexRef.current = null;
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="space-y-2">
      {selectedPools.map((pool, index) => {
        const preset = getSelectedPreset(pool, pools);
        const isCustom = !preset;
        const displayName = preset?.name ?? pool.name ?? 'Custom Pool';

        return (
          <div
            key={`selected-pool-${index}`}
            onDragEnter={() => {
              if (draggedIndexRef.current !== null && draggedIndexRef.current !== index) {
                setDragOverIndex(index);
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(event) => {
              event.preventDefault();
              finishDrag(index);
            }}
            className={`rounded-xl border bg-card transition-colors ${
              dragOverIndex === index && draggedIndex !== index
                ? 'border-primary bg-primary/[0.04]'
                : 'border-primary/70'
            } ${draggedIndex === index ? 'opacity-60' : ''}`}
          >
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-4">
              <button
                type="button"
                draggable
                onDragStart={(event) => {
                  draggedIndexRef.current = index;
                  setDraggedIndex(index);
                  setDragOverIndex(index);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', String(index));
                }}
                onDragEnd={() => {
                  draggedIndexRef.current = null;
                  setDraggedIndex(null);
                  setDragOverIndex(null);
                }}
                className="inline-flex h-11 w-9 cursor-grab items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-label={`Drag ${displayName} to reorder pool priority`}
                title="Drag to reorder priority"
              >
                <GripVertical className="h-5 w-5" aria-hidden="true" />
              </button>

              <div className="flex min-w-0 items-center gap-4">
                <PoolIcon
                  logoUrl={preset?.logoUrl}
                  logoOnDark={preset?.logoOnDark}
                  monogram={preset?.monogram}
                  invertLogoInDarkMode={preset?.invertLogoInDarkMode}
                  logoScale={preset?.logoScale}
                  name={displayName}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-primary">{displayName}</span>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {index === 0 ? 'Primary' : `Fallback ${index}`}
                    </span>
                  </div>
                  {pool.address && (
                    <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
                      {pool.address}:{pool.port}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => onMove(index, index - 1)}
                  disabled={index === 0}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  aria-label={`Move ${displayName} up`}
                  title="Move up"
                >
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onMove(index, index + 1)}
                  disabled={index === selectedPools.length - 1}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  aria-label={`Move ${displayName} down`}
                  title="Move down"
                >
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (preset) {
                      onTogglePool(preset);
                    } else {
                      onToggleCustom();
                    }
                  }}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  aria-label={`Remove ${displayName} from pool priority`}
                  title="Remove"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            {isCustom && (
              <FallbackCustomPoolFields
                pool={pool}
                idPrefix={`custom-pool-${index}`}
                onChange={(nextPool) => onChangeSelectedPool(index, nextPool)}
              />
            )}
          </div>
        );
      })}

      {unselectedPools.map((pool) => {
        const isDisabled = pool.badge === 'coming-soon';
        return (
          <button
            key={pool.id}
            type="button"
            onClick={() => !isDisabled && onTogglePool(pool)}
            disabled={isDisabled}
            aria-pressed="false"
            className={`group w-full p-5 rounded-xl border transition-all text-left relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
              isDisabled
                ? 'border-border opacity-50 cursor-not-allowed bg-card'
                : 'border-border bg-card hover:border-primary/45 hover:bg-primary/[0.02]'
            }`}
          >
            {pool.badge && (
              <div className="absolute top-4 right-4">
                <span className={`text-xs font-medium uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  pool.badge === 'testing'
                    ? 'bg-warning/10 text-warning'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {pool.badge === 'testing' ? 'Testing' : 'Coming Soon'}
                </span>
              </div>
            )}
            <div className="flex items-start gap-4">
              <PoolIcon
                logoUrl={pool.logoUrl}
                logoOnDark={pool.logoOnDark}
                monogram={pool.monogram}
                invertLogoInDarkMode={pool.invertLogoInDarkMode}
                logoScale={pool.logoScale}
                name={pool.name}
              />
              <div className="flex-1 min-w-0 pr-8">
                <div className="font-medium text-sm mb-1">{pool.name}</div>
                {pool.address && (
                  <div className="text-xs text-muted-foreground font-mono">{pool.address}:{pool.port}</div>
                )}
              </div>
            </div>
          </button>
        );
      })}

      {selectedCustomIndex === -1 && (
        <button
          type="button"
          onClick={onToggleCustom}
          aria-pressed="false"
          className="group w-full p-5 rounded-xl border border-border bg-card transition-all text-left relative hover:border-primary/45 hover:bg-primary/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <div className="pr-8">
            <div className="font-medium text-sm">Custom Pool</div>
          </div>
        </button>
      )}
    </div>
  );
}

function FallbackCustomPoolFields({
  pool,
  idPrefix,
  onChange,
}: {
  pool: PoolConfig;
  idPrefix: string;
  onChange: (pool: PoolConfig) => void;
}) {
  const updateField = (field: keyof PoolConfig, value: string | number) => {
    const normalized =
      field === 'authority_public_key' && typeof value === 'string'
        ? stripWrappingQuotes(value)
        : value;
    onChange({ ...pool, [field]: normalized });
  };
  const pubkeyError = getPoolAuthorityPubkeyError(pool.authority_public_key);

  return (
    <div className="border-t border-border bg-muted/20 p-3">
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_7rem_minmax(0,1.4fr)]">
        <div>
          <label htmlFor={`${idPrefix}-address`} className="mb-1 block text-xs font-medium text-muted-foreground">
            Address
          </label>
          <input
            id={`${idPrefix}-address`}
            type="text"
            value={pool.address}
            onChange={(event) => updateField('address', event.target.value)}
            placeholder="pool.example.com"
            aria-required="true"
            autoComplete="off"
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-all focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15"
          />
        </div>

        <div>
          <label htmlFor={`${idPrefix}-port`} className="mb-1 block text-xs font-medium text-muted-foreground">
            Port
          </label>
          <input
            id={`${idPrefix}-port`}
            type="number"
            value={pool.port}
            onChange={(event) => updateField('port', parseInt(event.target.value, 10) || DEFAULT_POOL_PORT)}
            aria-required="true"
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-all focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15"
          />
        </div>

        <div>
          <label htmlFor={`${idPrefix}-pubkey`} className="mb-1 block text-xs font-medium text-muted-foreground">
            Authority Public Key
          </label>
          <input
            id={`${idPrefix}-pubkey`}
            type="text"
            value={pool.authority_public_key}
            onChange={(event) => updateField('authority_public_key', event.target.value)}
            placeholder="Pool authority public key"
            aria-required="true"
            autoComplete="off"
            className={`h-9 w-full rounded-lg border bg-background px-3 font-mono text-sm outline-none transition-all focus-visible:ring-2 focus-visible:ring-primary/15 ${
              pubkeyError ? 'border-destructive focus-visible:border-destructive' : 'border-input focus-visible:border-primary'
            }`}
          />
          {pubkeyError && <p className="mt-1 text-xs text-destructive">{pubkeyError}</p>}
        </div>
      </div>
    </div>
  );
}

function PoolIdentityFields({
  pool,
  miningMode,
  network,
  idPrefix,
  onChange,
}: {
  pool: PoolConfig;
  miningMode: PoolConfigStepProps['data']['miningMode'];
  network: BitcoinNetwork;
  idPrefix: string;
  onChange: (pool: PoolConfig) => void;
}) {
  if (miningMode === 'solo' && isSriPool(pool)) {
    return (
      <SriPoolIdentityFields
        pool={pool}
        network={network}
        idPrefix={idPrefix}
        onChange={onChange}
      />
    );
  }

  const label = getIdentityFieldLabel(miningMode);
  const placeholder = miningMode === 'solo' ? getBitcoinAddressPlaceholder(network) : 'username.worker1';
  const error = getPoolIdentityError(pool, miningMode, network);
  const showBraiinsUsernameWarning = miningMode !== 'solo' && shouldAggregateTranslatorChannels(pool);

  return (
    <div>
      <label htmlFor={`${idPrefix}-identity`} className="block text-sm font-medium mb-2">
        {label} <span className="text-primary" aria-hidden="true">*</span>
        <span className="sr-only">(required)</span>
      </label>
      {showBraiinsUsernameWarning && (
        <div className="mb-3 flex gap-3 rounded-xl bg-warning/[0.08] p-4 text-sm text-warning" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <p>
            Use the exact username from your Braiins Pool account. If this value does not match an existing
            Braiins account, the pool connection will not be established properly.
          </p>
        </div>
      )}
      <input
        id={`${idPrefix}-identity`}
        type="text"
        value={pool.user_identity}
        onChange={(e) => onChange({ ...pool, user_identity: e.target.value })}
        placeholder={placeholder}
        aria-required="true"
        autoComplete="off"
        className="w-full h-10 px-3 rounded-lg border border-input bg-background focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all font-mono text-sm"
      />
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      <p className="text-xs text-muted-foreground mt-2">
        {miningMode === 'solo'
          ? 'Bitcoin address used by the pool for solo mining payouts.'
          : 'Pool account username sent to this upstream'}
      </p>
    </div>
  );
}

function SriPoolIdentityFields({
  pool,
  network,
  idPrefix,
  onChange,
}: {
  pool: PoolConfig;
  network: BitcoinNetwork;
  idPrefix: string;
  onChange: (pool: PoolConfig) => void;
}) {
  const parsed = parseSriIdentity(pool.user_identity);
  const needsAddress = parsed.donationPercent < 100;
  const identityError = getPoolIdentityError(pool, 'solo', network);

  useEffect(() => {
    const normalizedPool = normalizePoolUserIdentity(pool, 'solo');
    if (normalizedPool !== pool) {
      onChange(normalizedPool);
    }
  }, [onChange, pool]);

  const updateSriIdentity = (address: string, workerName: string, donationPercent: number) => {
    onChange({
      ...pool,
      user_identity: buildSriIdentity(address, workerName, donationPercent),
    });
  };

  return (
    <div className="space-y-4">
      {needsAddress && (
        <div>
          <label htmlFor={`${idPrefix}-payout-address`} className="block text-sm font-medium mb-2">
            Bitcoin payout address <span className="text-primary" aria-hidden="true">*</span>
            <span className="sr-only">(required)</span>
          </label>
          <input
            id={`${idPrefix}-payout-address`}
            type="text"
            value={parsed.address}
            onChange={(e) => updateSriIdentity(e.target.value, parsed.workerName, parsed.donationPercent)}
            placeholder={getBitcoinAddressPlaceholder(network)}
            aria-required="true"
            autoComplete="off"
            className="w-full h-10 px-3 rounded-lg border border-input bg-background focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all font-mono text-sm"
          />
          {getBitcoinAddressError(parsed.address, network) && (
            <p className="text-xs text-destructive mt-1">{getBitcoinAddressError(parsed.address, network)}</p>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            Used with worker and donation settings to build this pool identity.
          </p>
        </div>
      )}

      <div>
        <label htmlFor={`${idPrefix}-worker-name`} className="block text-sm font-medium mb-2">
          Worker Name <span className="text-muted-foreground text-xs font-normal">(optional)</span>
        </label>
        <input
          id={`${idPrefix}-worker-name`}
          type="text"
          value={parsed.workerName}
          onChange={(e) => updateSriIdentity(parsed.address, e.target.value, parsed.donationPercent)}
          placeholder="worker1"
          autoComplete="off"
          className="w-full h-10 px-3 rounded-lg border border-input bg-background focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all font-mono text-sm"
        />
      </div>

      <div>
        <label htmlFor={`${idPrefix}-donation-slider`} className="block text-sm font-medium mb-2">
          Donation to SRI Development <span className="text-muted-foreground text-xs font-normal">(optional)</span>
        </label>
        <div className="p-4 rounded-xl bg-muted/40 space-y-3">
          <input
            id={`${idPrefix}-donation-slider`}
            type="range"
            min={0}
            max={100}
            value={parsed.donationPercent}
            onChange={(e) => updateSriIdentity(parsed.address, parsed.workerName, snapDonation(Number(e.target.value)))}
            aria-label={`Donation: ${parsed.donationPercent}%`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={parsed.donationPercent}
            className="w-full accent-primary"
            list={`${idPrefix}-donation-snap-points`}
          />
          <datalist id={`${idPrefix}-donation-snap-points`}>
            <option value="0" />
            <option value="10" />
            <option value="25" />
            <option value="50" />
            <option value="75" />
            <option value="100" />
          </datalist>
          <div className="flex justify-between text-xs text-muted-foreground select-none">
            <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {parsed.donationPercent === 0
            ? 'Full block reward goes to your payout address'
            : parsed.donationPercent >= 100
              ? 'Full block reward is donated to SRI development'
              : `${parsed.donationPercent}% of the block reward goes to SRI development, ${100 - parsed.donationPercent}% to your address`}
        </p>
      </div>

      {identityError && <p className="text-xs text-destructive">{identityError}</p>}
    </div>
  );
}
