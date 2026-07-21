import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { PoolIcon } from '@/components/ui/pool-icon';
import { useSetupStatus } from '@/hooks/useSetupStatus';
import { useControlApi, getCurrentConfig } from '@/hooks/useControlApi';
import {
  createEmptyCustomPool,
  getKnownPoolForConfig,
  getPoolsForMode,
  isSamePool,
  knownPoolToConfig,
  type KnownPool,
} from '@/lib/pools';
import {
  buildSriIdentity,
  getPoolIdentityError,
  getPoolUserIdentityDisplay,
  isSriPool,
  normalizePoolUserIdentity,
  parseSriIdentity,
} from '@/lib/miningIdentity';
import {
  getBitcoinAddressError,
  getBitcoinAddressPlaceholder,
  getIdentifierError,
  getPoolAuthorityPubkeyError,
  isValidPoolAuthorityPubkey,
  isTomlSafeIdentifier,
  stripWrappingQuotes,
} from '@/lib/utils';
import { isBitcoinSocketError } from '@/lib/bitcoinSocketErrors';
import type { PoolConfig, SetupData } from '@/components/setup/types';
import {
  DEFAULT_SHARES_PER_MINUTE,
  DEFAULT_DOWNSTREAM_EXTRANONCE2_SIZE,
  DEFAULT_POOL_PORT,
  formatBitcoinCoreVersion,
  normalizeBitcoinCoreVersion,
} from '@sv2-ui/shared';
import {
  Loader2,
  AlertCircle,
  ArrowDown,
  ArrowUp,
  GripVertical,
  RotateCw,
  StopCircle,
  Trash2,
  Pencil,
  Check,
  X,
} from 'lucide-react';

function clearPersistedDashboardState() {
  if (typeof window === 'undefined') return;

  const prefixes = [
    'sv2_hashrate_history:',
    'sv2_blocks_found:',
    'sv2_best_diff:',
    'sv2_share_stats:',
  ];

  const keysToRemove: string[] = [];

  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (key && prefixes.some((prefix) => key.startsWith(prefix))) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => {
    window.localStorage.removeItem(key);
  });
}

const SETUP_TARGET_STEP_STORAGE_KEY = 'sv2-ui-setup-target-step';
const DONATION_SNAP_POINTS = [0, 10, 25, 50, 75, 100];
const DONATION_SNAP_THRESHOLD = 3;

type EditingField = null | 'pool' | 'fallbackPools' | 'mode' | 'signature' | 'advanced';

function snapDonation(value: number): number {
  const nearest = DONATION_SNAP_POINTS.find((p) => Math.abs(value - p) <= DONATION_SNAP_THRESHOLD);
  return nearest ?? value;
}

function isPositiveNumber(value: string): boolean {
  const parsed = Number(value);
  return value.trim() !== '' && Number.isFinite(parsed) && parsed > 0;
}

function isPositiveInteger(value: string): boolean {
  const parsed = Number(value);
  return isPositiveNumber(value) && Number.isInteger(parsed);
}

/**
 * Configuration tab for Settings page.
 * Shows current setup and allows inline editing of pool and template mode.
 */
export function ConfigurationTab() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<SetupData | null>(null);
  const [loading, setLoading] = useState(true);
  const {
    isOrchestrated,
    isConfigured,
    isRunning,
    miningMode: statusMiningMode,
    mode: statusMode,
    activePoolIndex,
  } = useSetupStatus();
  const {
    stop,
    restart,
    setup,
    isStoppingOrRestarting,
    isSettingUp,
    stopError,
    restartError,
    setupError,
  } = useControlApi();

  const [editing, setEditing] = useState<EditingField>(null);
  const [editPool, setEditPool] = useState<PoolConfig | null>(null);
  const [editFallbackPools, setEditFallbackPools] = useState<PoolConfig[] | null>(null);
  const [isCustomPool, setIsCustomPool] = useState(false);
  const [editMode, setEditMode] = useState<'jd' | 'no-jd' | null>(null);
  const [editSignature, setEditSignature] = useState<string>('');
  const [editAdvanced, setEditAdvanced] = useState<{
    shares_per_minute: string;
    downstream_extranonce2_size: string;
    verify_payout?: boolean;
  } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const clearDashboardClientState = () => {
    clearPersistedDashboardState();

    [
      ['pool-global'],
      ['server-channels'],
      ['sv2-clients'],
      ['sv1-clients'],
      ['translator-server-channels'],
      ['translator-health'],
      ['jdc-health'],
    ].forEach((queryKey) => {
      queryClient.removeQueries({ queryKey });
    });
  };

  useEffect(() => {
    if (isOrchestrated && isConfigured) {
      getCurrentConfig().then(cfg => {
        setConfig(cfg);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, [isOrchestrated, isConfigured]);

  useEffect(() => {
    if (!saveSuccess) return;
    const t = setTimeout(() => setSaveSuccess(false), 2000);
    return () => clearTimeout(t);
  }, [saveSuccess]);

  const handleReconfigure = () => {
    clearDashboardClientState();
    navigate('/setup');
  };

  const handleStop = () => {
    if (confirm('Stop all services? Your miners will disconnect.')) {
      stop();
    }
  };

  const handleRestart = () => {
    if (confirm('Restart services? There will be a brief interruption.')) {
      restart();
    }
  };

  const handleReset = async () => {
    if (confirm('Delete configuration and stop all services? This cannot be undone.')) {
      try {
        const response = await fetch('/api/reset', { method: 'POST' });
        if (response.ok) {
          clearDashboardClientState();
          window.location.href = '/setup';
        }
      } catch (error) {
        console.error('Reset failed:', error);
      }
    }
  };

  const handleOpenBitcoinSetup = () => {
    window.sessionStorage.setItem(SETUP_TARGET_STEP_STORAGE_KEY, 'bitcoin');
    navigate('/setup');
  };

  const startEditPool = () => {
    if (!config?.pool) return;
    const availablePools = getPoolsForMode(config.miningMode, config.mode);
    const matchesPreset = availablePools.some(p => p.address === config.pool?.address && p.port === config.pool?.port);
    setIsCustomPool(!matchesPreset);
    setEditPool(normalizePoolUserIdentity({ ...config.pool }, config.miningMode));
    setEditing('pool');
  };

  const startEditFallbackPools = () => {
    setEditFallbackPools((config?.fallbackPools ?? []).map((pool) => (
      normalizePoolUserIdentity(pool, config?.miningMode ?? null)
    )));
    setEditing('fallbackPools');
  };

  const startEditMode = () => {
    setEditMode(config?.mode ?? statusMode ?? 'no-jd');
    setEditing('mode');
  };

  const startEditSignature = (currentValue: string) => {
    setEditSignature(currentValue);
    setEditing('signature');
  };

  const startEditAdvanced = () => {
    if (!config?.translator) return;
    const configIsSoloPool = config.miningMode === 'solo' && config.mode === 'no-jd';
    setEditAdvanced({
      shares_per_minute: String(config.translator.shares_per_minute ?? DEFAULT_SHARES_PER_MINUTE),
      downstream_extranonce2_size: String(
        config.translator.downstream_extranonce2_size ?? DEFAULT_DOWNSTREAM_EXTRANONCE2_SIZE,
      ),
      ...(configIsSoloPool ? { verify_payout: config.translator.verify_payout ?? true } : {}),
    });
    setEditing('advanced');
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditPool(null);
    setEditFallbackPools(null);
    setIsCustomPool(false);
    setEditMode(null);
    setEditSignature('');
    setEditAdvanced(null);
  };

  const editNetwork = config?.bitcoin?.network ?? 'mainnet';
  const isPoolValid =
    !!editPool?.address &&
    Number.isInteger(editPool.port) &&
    editPool.port > 0 &&
    editPool.port <= 65535 &&
    (editPool.jds_port === undefined || (
      Number.isInteger(editPool.jds_port) && editPool.jds_port > 0 && editPool.jds_port <= 65535
    )) &&
    !!editPool?.authority_public_key &&
    isValidPoolAuthorityPubkey(editPool.authority_public_key) &&
    !getPoolIdentityError(editPool, config?.miningMode ?? null, editNetwork);
  const isFallbackPoolsValid = (editFallbackPools ?? []).every((pool) => (
    !!pool.address &&
    Number.isInteger(pool.port) &&
    pool.port > 0 &&
    pool.port <= 65535 &&
    (pool.jds_port === undefined || (
      Number.isInteger(pool.jds_port) && pool.jds_port > 0 && pool.jds_port <= 65535
    )) &&
    !!pool.authority_public_key &&
    isValidPoolAuthorityPubkey(pool.authority_public_key) &&
    !getPoolIdentityError(pool, config?.miningMode ?? null, editNetwork)
  ));
  const isSignatureValid = editSignature === '' || isTomlSafeIdentifier(editSignature);
  const isAdvancedValid =
    !!editAdvanced &&
    isPositiveNumber(editAdvanced.shares_per_minute) &&
    isPositiveInteger(editAdvanced.downstream_extranonce2_size);

  const saveEdit = () => {
    if (!config) return;

    const updated: SetupData = { ...config };

    if (editing === 'pool' && editPool) {
      if (!isPoolValid) return;
      updated.pool = { ...editPool };
    } else if (editing === 'fallbackPools') {
      if (!isFallbackPoolsValid || !editFallbackPools) return;
      updated.fallbackPools = [...editFallbackPools];
    } else if (editing === 'mode') {
      if (editMode === 'jd' && !config.bitcoin) {
        navigate('/setup');
        return;
      }
      updated.mode = editMode;
      if (editMode === 'no-jd') {
        updated.jdc = null;
        updated.bitcoin = null;
      }
    } else if (editing === 'signature') {
      if (!isSignatureValid || !config.jdc) return;
      updated.jdc = { ...config.jdc, jdc_signature: editSignature.trim() };
    } else if (editing === 'advanced') {
      if (!isAdvancedValid || !config.translator || !editAdvanced) return;
      const configIsSoloPool = config.miningMode === 'solo' && config.mode === 'no-jd';
      updated.translator = {
        enable_vardiff: true,
        aggregate_channels: config.translator.aggregate_channels,
        ...(configIsSoloPool ? { verify_payout: editAdvanced.verify_payout ?? true } : {}),
        min_hashrate: config.translator.min_hashrate,
        shares_per_minute: Number(editAdvanced.shares_per_minute),
        downstream_extranonce2_size: Number(editAdvanced.downstream_extranonce2_size),
      };
    }

    setup(updated, {
      onSuccess: async (response) => {
        if (!response.success) return;

        await queryClient.invalidateQueries({ queryKey: ['setup-status'] });
        const refreshedConfig = await getCurrentConfig();
        setConfig(refreshedConfig ?? updated);
        cancelEdit();
        setSaveSuccess(true);
      },
    });
  };

  // Not using orchestration backend
  if (!isOrchestrated) {
    return (
      <div className="space-y-6 animate-in slide-in-from-left-2 duration-300">
        <Card className="border-dashed">
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Standalone Mode</p>
              <p>
                This UI is running in monitoring-only mode. Configuration management is not available.
                Services should be configured and started manually.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Not configured yet
  if (!isConfigured) {
    return (
      <div className="space-y-6 animate-in slide-in-from-left-2 duration-300">
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="space-y-3">
                <div className="text-sm">
                  <p className="font-medium text-primary mb-1">Not Configured</p>
                  <p className="text-muted-foreground">
                    No configuration found. Run the setup wizard to configure your mining client.
                  </p>
                </div>
                <Button onClick={() => navigate('/setup')}>
                  Go to Setup
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading || !config) {
    return <div className="text-center text-muted-foreground py-8">Loading configuration...</div>;
  }

  const activeMiningMode = config.miningMode ?? statusMiningMode;
  const activeMode = config.mode ?? statusMode;
  const isJdMode = activeMode === 'jd';
  const isSoloMode = activeMiningMode === 'solo';
  const isSovereignSolo = isSoloMode && isJdMode;
  const isSoloPool = isSoloMode && activeMode === 'no-jd';
  const bitcoinCoreVersion = normalizeBitcoinCoreVersion(config.bitcoin?.core_version);
  const templateModeLabel = isSoloMode
    ? isJdMode
      ? 'Sovereign Solo Mining'
      : 'Solo Pool Templates'
    : isJdMode
      ? 'Custom Templates (Job Declaration)'
      : 'Pool Templates';
  const pools = getPoolsForMode(activeMiningMode, activeMode);
  const isSaving = isSettingUp;

  return (
    <div className="space-y-6 animate-in slide-in-from-left-2 duration-300">
      {/* Status Banner */}
      <Card className={isRunning ? 'border-green-500/30 bg-green-500/5' : 'border-muted'}>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className={`h-3 w-3 shrink-0 rounded-full ${isRunning ? 'bg-green-500' : 'bg-muted-foreground'}`} />
              <div className="min-w-0">
                <p className="font-medium">{isRunning ? 'Services Running' : 'Services Stopped'}</p>
                <p className="text-sm text-muted-foreground">
                  {isSovereignSolo ? 'Sovereign Solo Mining' : isSoloMode ? 'Solo Mining' : 'Pool Mining'}
                  {isJdMode && !isSovereignSolo && ' (Job Declaration)'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:flex-nowrap sm:justify-end">
              {isRunning ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRestart}
                    disabled={isStoppingOrRestarting}
                  >
                    {isStoppingOrRestarting ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Restarting...</>
                    ) : (
                      <><RotateCw className="mr-2 h-4 w-4" /> Restart</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleStop}
                    disabled={isStoppingOrRestarting}
                  >
                    {isStoppingOrRestarting ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Stopping...</>
                    ) : (
                      <><StopCircle className="mr-2 h-4 w-4" /> Stop</>
                    )}
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  onClick={handleRestart}
                  disabled={isStoppingOrRestarting}
                  className="w-full sm:w-auto"
                >
                  {isStoppingOrRestarting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting...</>
                  ) : (
                    'Start Services'
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error Messages */}
      {(stopError || restartError || setupError) && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-500">
                  {stopError?.message || restartError?.message || setupError?.message || 'Operation failed'}
                </p>
              </div>
              {isBitcoinSocketError(stopError || restartError || setupError) && (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={handleOpenBitcoinSetup}
                  className="sm:ml-4"
                >
                  Open Bitcoin Setup
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save Success */}
      {saveSuccess && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Check className="h-5 w-5 text-green-500" />
              <p className="text-sm text-green-500">Settings saved. Services restarting with new configuration.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Current Configuration */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1.5">
              <CardTitle>Current Configuration</CardTitle>
              <CardDescription>Your active mining client setup. Click the edit icon to change a setting.</CardDescription>
            </div>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap sm:justify-end">
              <Button variant="outline" onClick={handleReconfigure} className="flex-1 sm:flex-none">
                Reconfigure
              </Button>
              <Button variant="outline" onClick={handleReset} className="flex-1 sm:flex-none">
                <Trash2 className="mr-2 h-4 w-4" />
                Reset
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mining Mode (read-only) */}
          <div className="flex items-center justify-between gap-3 p-4 rounded-lg border border-border/50 bg-muted/20">
            <div className="min-w-0">
              <p className="font-medium">Mining Mode</p>
              <p className="text-sm text-muted-foreground">
                {isSovereignSolo ? 'Sovereign Solo Mining' : isSoloMode ? 'Solo Mining' : 'Pool Mining'}
                {isJdMode && !isSovereignSolo && ' (Job Declaration)'}
              </p>
            </div>
            <Badge variant={isSoloMode ? 'default' : 'secondary'} className="shrink-0">
              {isSoloMode ? 'Solo' : 'Pool'}
            </Badge>
          </div>

          {/* Template Mode — inline-editable only for Pool Mining */}
          {!isSoloMode ? (
            <ConfigRow
              label="Block Templates"
              editing={editing === 'mode'}
              onEdit={startEditMode}
              onSave={saveEdit}
              onCancel={cancelEdit}
              isSaving={isSaving}
              disabled={editing !== null && editing !== 'mode'}
              display={
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <p className="text-sm text-muted-foreground">{templateModeLabel}</p>
                  <Badge variant={isJdMode ? 'default' : 'secondary'}>
                    {isJdMode ? 'JD' : 'No-JD'}
                  </Badge>
                </div>
              }
              editContent={
                <div className="space-y-2">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    {(['no-jd', 'jd'] as const).map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setEditMode(m)}
                        className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                          editMode === m
                            ? 'border-primary bg-primary/[0.04] text-primary'
                            : 'border-border bg-card hover:border-primary/45'
                        }`}
                      >
                        {m === 'jd' ? 'Job Declaration (Custom Templates)' : 'Pool Templates'}
                      </button>
                    ))}
                  </div>
                  {editMode === 'jd' && !config.bitcoin && (
                    <p className="text-xs text-warning">
                      JD mode requires Bitcoin Core configuration. Saving will redirect to the Setup Wizard.
                    </p>
                  )}
                </div>
              }
            />
          ) : (
            <div className="p-4 rounded-lg border border-border/50 bg-muted/20">
              <p className="font-medium mb-1">Block Templates</p>
              <p className="text-sm text-muted-foreground">{templateModeLabel}</p>
            </div>
          )}

          {/* Pool — inline-editable when not Sovereign Solo */}
          {!isSovereignSolo && config.pool && (
            <ConfigRow
              label="Pool"
              editing={editing === 'pool'}
              onEdit={startEditPool}
              onSave={saveEdit}
              onCancel={cancelEdit}
              isSaving={isSaving}
              saveDisabled={!isPoolValid}
              disabled={editing !== null && editing !== 'pool'}
              display={
                <PoolSummary
                  pool={config.pool}
                  miningMode={activeMiningMode}
                  isActive={isRunning && activePoolIndex === 0}
                />
              }
              editContent={
                <div className="space-y-2">
                  {pools.filter(p => p.badge !== 'coming-soon').map(pool => (
                    <PoolOption
                      key={pool.id}
                      pool={pool}
                      selected={!isCustomPool && editPool?.address === pool.address && editPool?.port === pool.port}
                      onSelect={() => {
                        setIsCustomPool(false);
                        setEditPool(normalizePoolUserIdentity(
                          knownPoolToConfig(pool, editPool?.user_identity ?? config.pool?.user_identity ?? ''),
                          activeMiningMode,
                        ));
                      }}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomPool(true);
                      setEditPool(normalizePoolUserIdentity(
                        createEmptyCustomPool(editPool?.user_identity ?? config.pool?.user_identity ?? ''),
                        activeMiningMode,
                      ));
                    }}
                    className={`w-full p-3 rounded-lg border transition-all text-left ${
                      isCustomPool
                        ? 'border-primary bg-primary/[0.04]'
                        : 'border-border bg-card hover:border-primary/45'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className={`font-medium text-sm ${isCustomPool ? 'text-primary' : ''}`}>Custom Pool</div>
                        <div className="text-xs text-muted-foreground">Enter your own pool connection details</div>
                      </div>
                      {isCustomPool && (
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                          <Check className="w-3 h-3 text-background" />
                        </div>
                      )}
                    </div>
                  </button>
                  {isCustomPool && (
                    <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/30">
                      <div>
                        <label htmlFor="edit-pool-address" className="block text-xs font-medium mb-1">Pool Address</label>
                        <input
                          id="edit-pool-address"
                          type="text"
                          value={editPool?.address ?? ''}
                          onChange={e => setEditPool(prev => prev ? { ...prev, address: e.target.value } : prev)}
                          placeholder="pool.example.com"
                          className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label htmlFor="edit-pool-port" className="block text-xs font-medium mb-1">
                          {isJdMode ? 'Pool Port' : 'Port'}
                        </label>
                        <input
                          id="edit-pool-port"
                          type="number"
                          value={editPool?.port ?? DEFAULT_POOL_PORT}
                          onChange={e => setEditPool(prev => prev ? { ...prev, port: parseInt(e.target.value) || DEFAULT_POOL_PORT } : prev)}
                          className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
                        />
                      </div>
                      {isJdMode && !isSovereignSolo && (
                        <div>
                          <label htmlFor="edit-pool-jds-port" className="block text-xs font-medium mb-1">
                            JD Port (optional)
                          </label>
                          <input
                            id="edit-pool-jds-port"
                            type="number"
                            min={1}
                            max={65535}
                            value={editPool?.jds_port ?? ''}
                            onChange={e => setEditPool(prev => prev ? {
                              ...prev,
                              jds_port: e.target.value === '' ? undefined : Number(e.target.value),
                            } : prev)}
                            placeholder="3334"
                            className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Only set this when specified by your pool.
                          </p>
                        </div>
                      )}
                      <div>
                        <label htmlFor="edit-pool-pubkey" className="block text-xs font-medium mb-1">Authority Public Key</label>
                        <input
                          id="edit-pool-pubkey"
                          type="text"
                          value={editPool?.authority_public_key ?? ''}
                          onChange={e => setEditPool(prev => prev ? { ...prev, authority_public_key: stripWrappingQuotes(e.target.value) } : prev)}
                          placeholder="Enter pool's authority public key"
                          className="w-full h-9 px-3 rounded-lg border border-input bg-background font-mono text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
                        />
                        {getPoolAuthorityPubkeyError(editPool?.authority_public_key ?? '') && (
                          <p className="text-xs text-destructive mt-1">
                            {getPoolAuthorityPubkeyError(editPool?.authority_public_key ?? '')}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  {editPool && (
                    <PoolIdentityEdit
                      pool={editPool}
                      miningMode={activeMiningMode}
                      network={editNetwork}
                      idPrefix="edit-primary-pool"
                      onChange={setEditPool}
                    />
                  )}
                </div>
              }
            />
          )}

          {/* Fallback pools */}
          {!isSovereignSolo && (
            <ConfigRow
              label="Fallback Pools"
              editing={editing === 'fallbackPools'}
              onEdit={startEditFallbackPools}
              onSave={saveEdit}
              onCancel={cancelEdit}
              isSaving={isSaving}
              saveDisabled={!isFallbackPoolsValid}
              disabled={editing !== null && editing !== 'fallbackPools'}
              display={
                <div className="space-y-2">
                  {(config.fallbackPools ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">None</p>
                  ) : (
                    config.fallbackPools.map((pool, index) => (
                      <PoolSummary
                        key={`${pool.address}:${pool.port}:${index}`}
                        pool={pool}
                        miningMode={activeMiningMode}
                        fallbackIndex={index}
                        isActive={isRunning && activePoolIndex === index + 1}
                      />
                    ))
                  )}
                </div>
              }
              editContent={
                <FallbackPoolsEdit
                  pools={editFallbackPools ?? []}
                  availablePools={pools}
                  isJdMode={isJdMode}
                  miningMode={activeMiningMode}
                  network={editNetwork}
                  onChange={setEditFallbackPools}
                />
              }
            />
          )}

          {/* Miner Signature (JD mode) */}
          {isJdMode && config.jdc && (
            <ConfigRow
              label="Miner Signature"
              editing={editing === 'signature'}
              onEdit={() => startEditSignature(config.jdc?.jdc_signature || '')}
              onSave={saveEdit}
              onCancel={cancelEdit}
              isSaving={isSaving}
              saveDisabled={!isSignatureValid}
              disabled={editing !== null && editing !== 'signature'}
              display={
                <div className="space-y-1">
                  <p className="font-mono text-xs text-muted-foreground truncate">
                    {config.jdc.jdc_signature || (isSovereignSolo ? 'solo_miner' : 'Not set')}
                  </p>
                  {isSovereignSolo && !config.jdc.jdc_signature && (
                    <p className="text-xs text-muted-foreground">Defaults to solo_miner</p>
                  )}
                </div>
              }
              editContent={
                <div>
                  <input
                    type="text"
                    value={editSignature}
                    onChange={(e) => setEditSignature(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && isSignatureValid && !isSaving) saveEdit();
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    autoFocus
                    autoComplete="off"
                    placeholder="Miner signature"
                    className="w-full h-10 px-3 rounded-lg border border-input bg-background font-mono text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
                  />
                  {editSignature && getIdentifierError(editSignature) && (
                    <p className="text-xs text-destructive mt-1">{getIdentifierError(editSignature)}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    Miner-chosen tag shown in coinbase transactions on block explorers.
                  </p>
                </div>
              }
            />
          )}

          {/* Advanced mining configuration */}
          {config.translator && (
            <ConfigRow
              label="Advanced Mining Config"
              editing={editing === 'advanced'}
              onEdit={startEditAdvanced}
              onSave={saveEdit}
              onCancel={cancelEdit}
              isSaving={isSaving}
              saveDisabled={!isAdvancedValid}
              disabled={editing !== null && editing !== 'advanced'}
              display={
                <div className="grid gap-1 text-xs text-muted-foreground">
                  <p>
                    Shares/min:{' '}
                    <span className="font-mono text-foreground">
                      {config.translator.shares_per_minute ?? DEFAULT_SHARES_PER_MINUTE}
                    </span>
                  </p>
                  <p>
                    Downstream extranonce2:{' '}
                    <span className="font-mono text-foreground">
                      {config.translator.downstream_extranonce2_size ?? DEFAULT_DOWNSTREAM_EXTRANONCE2_SIZE}
                    </span>
                  </p>
                  {isSoloPool && (
                    <p>
                      Coinbase verification:{' '}
                      <span className="font-mono text-foreground">
                        {(config.translator.verify_payout ?? true) ? 'Enabled' : 'Disabled'}
                      </span>
                    </p>
                  )}
                </div>
              }
              editContent={
                editAdvanced && (
                  <div className="space-y-4">
                    {isSoloPool && (
                      <div className="flex items-center justify-between gap-4">
                        <div className="space-y-0.5">
                          <p id="edit-verify-payout-label" className="text-xs font-medium">
                            Coinbase Verification
                          </p>
                          <p id="edit-verify-payout-desc" className="text-xs text-muted-foreground">
                            Verify that your payout address is included in the pool&apos;s coinbase transaction.
                          </p>
                        </div>
                        <Switch
                          id="edit-verify-payout-switch"
                          checked={editAdvanced.verify_payout ?? true}
                          onCheckedChange={(checked) => setEditAdvanced({ ...editAdvanced, verify_payout: checked })}
                          aria-labelledby="edit-verify-payout-label"
                          aria-describedby="edit-verify-payout-desc"
                        />
                      </div>
                    )}

                    <div>
                      <label htmlFor="edit-shares-per-minute" className="block text-xs font-medium mb-1">
                        Shares Per Minute
                      </label>
                      <input
                        id="edit-shares-per-minute"
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={editAdvanced.shares_per_minute}
                        onChange={(e) => setEditAdvanced({ ...editAdvanced, shares_per_minute: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
                      />
                      {!isPositiveNumber(editAdvanced.shares_per_minute) && (
                        <p className="text-xs text-destructive mt-1">Enter a value greater than 0.</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="edit-downstream-extranonce2-size" className="block text-xs font-medium mb-1">
                        Downstream Extranonce2 Size
                      </label>
                      <input
                        id="edit-downstream-extranonce2-size"
                        type="number"
                        min="1"
                        step="1"
                        value={editAdvanced.downstream_extranonce2_size}
                        onChange={(e) => setEditAdvanced({ ...editAdvanced, downstream_extranonce2_size: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
                      />
                      {!isPositiveInteger(editAdvanced.downstream_extranonce2_size) && (
                        <p className="text-xs text-destructive mt-1">Enter a whole number greater than 0.</p>
                      )}
                    </div>
                  </div>
                )
              }
            />
          )}

          {/* Bitcoin Core (JD mode) */}
          {isJdMode && config.bitcoin && (
            <div className="p-4 rounded-lg border border-border/50 bg-muted/20 space-y-2">
              <div className="flex items-center gap-2">
                <p className="font-medium">Bitcoin Core</p>
                <Badge variant="outline" className="text-xs">
                  {bitcoinCoreVersion ? formatBitcoinCoreVersion(bitcoinCoreVersion) : 'Not selected'}
                </Badge>
                <Badge variant="outline" className="text-xs">{config.bitcoin.network}</Badge>
              </div>
              <p className="text-muted-foreground font-mono text-xs truncate">
                {config.bitcoin.socket_path}
              </p>
            </div>
          )}

          {/* Fallback Address (JD mode) */}
          {isJdMode && config.jdc?.coinbase_reward_address && (
            <div className="p-4 rounded-lg border border-border/50 bg-muted/20">
              <p className="font-medium mb-1">{isSovereignSolo ? 'Block Reward Address' : 'Fallback Address'}</p>
              <p className="text-muted-foreground font-mono text-xs truncate">
                {config.jdc.coinbase_reward_address}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Reusable editable config row with display/edit toggle.
 */
function ConfigRow({
  label,
  editing,
  onEdit,
  onSave,
  onCancel,
  isSaving,
  saveDisabled,
  disabled,
  display,
  editContent,
}: {
  label: string;
  editing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  saveDisabled?: boolean;
  disabled: boolean;
  display: React.ReactNode;
  editContent: React.ReactNode;
}) {
  if (editing) {
    return (
      <div className="p-4 rounded-lg border border-primary/50 bg-primary/[0.02] space-y-3">
        <p className="font-medium text-sm text-primary">{label}</p>
        {editContent}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onSave} disabled={isSaving || saveDisabled}>
            {isSaving ? (
              <><Loader2 className="mr-2 h-3 w-3 animate-spin" /> Saving...</>
            ) : (
              <><Check className="mr-2 h-3 w-3" /> Save & Restart</>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isSaving}>
            <X className="mr-2 h-3 w-3" /> Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group p-4 rounded-lg border border-border/50 bg-muted/20">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium text-sm">{label}</p>
          {display}
        </div>
        <button
          type="button"
          onClick={onEdit}
          disabled={disabled}
          className={
            disabled
              ? 'p-1.5 rounded-md text-muted-foreground/50 opacity-40 cursor-not-allowed'
              : 'p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100'
          }
          title={disabled ? 'Finish your current edit to change this' : `Edit ${label.toLowerCase()}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function PoolSummary({
  pool,
  miningMode,
  fallbackIndex,
  isActive = false,
}: {
  pool: PoolConfig;
  miningMode: SetupData['miningMode'];
  fallbackIndex?: number;
  isActive?: boolean;
}) {
  const knownPool = getKnownPoolForConfig(pool);
  const displayName = (knownPool?.name ?? pool.name) || 'Custom Pool';
  const identityDisplay = getPoolUserIdentityDisplay(pool, miningMode);

  return (
    <div className="flex items-start gap-3">
      {fallbackIndex !== undefined && (
        <div className="mt-0.5 inline-flex h-9 min-w-9 items-center justify-center rounded-lg bg-muted/60 px-2 text-xs font-semibold text-muted-foreground">
          {fallbackIndex + 1}
        </div>
      )}
      <PoolIcon
        logoUrl={knownPool?.logoUrl}
        logoOnDark={knownPool?.logoOnDark}
        monogram={knownPool?.monogram}
        invertLogoInDarkMode={knownPool?.invertLogoInDarkMode}
        logoScale={knownPool?.logoScale}
        name={displayName}
        className="h-9 w-9 rounded-lg"
        imageClassName="h-5 w-5"
        fallbackClassName="h-4 w-4"
      />
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="font-medium text-sm">{displayName}</p>
          {isActive && <Badge variant="default">Current</Badge>}
          {isActive && fallbackIndex !== undefined && (
            <Badge variant="secondary">Fallback</Badge>
          )}
        </div>
        <p className="text-muted-foreground font-mono text-xs">
          {pool.address}:{pool.port}
        </p>
        <p className="text-muted-foreground text-xs truncate">
          {identityDisplay}
        </p>
      </div>
    </div>
  );
}

function PoolIdentityEdit({
  pool,
  miningMode,
  network,
  idPrefix,
  onChange,
}: {
  pool: PoolConfig;
  miningMode: SetupData['miningMode'];
  network: NonNullable<SetupData['bitcoin']>['network'];
  idPrefix: string;
  onChange: (pool: PoolConfig) => void;
}) {
  if (miningMode === 'solo' && isSriPool(pool)) {
    return (
      <SriPoolIdentityEdit
        pool={pool}
        network={network}
        idPrefix={idPrefix}
        onChange={onChange}
      />
    );
  }

  const error = getPoolIdentityError(pool, miningMode, network);
  const label = 'Username';
  const placeholder = miningMode === 'solo' ? getBitcoinAddressPlaceholder(network) : 'username.worker1';

  return (
    <div>
      <label htmlFor={`${idPrefix}-identity`} className="block text-xs font-medium mb-1">{label}</label>
      <input
        id={`${idPrefix}-identity`}
        type="text"
        value={pool.user_identity}
        onChange={(e) => onChange({ ...pool, user_identity: e.target.value })}
        placeholder={placeholder}
        className="w-full h-9 px-3 rounded-lg border border-input bg-background font-mono text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
      />
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}

function SriPoolIdentityEdit({
  pool,
  network,
  idPrefix,
  onChange,
}: {
  pool: PoolConfig;
  network: NonNullable<SetupData['bitcoin']>['network'];
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
    <div className="space-y-3">
      {needsAddress && (
        <div>
          <label htmlFor={`${idPrefix}-payout-address`} className="block text-xs font-medium mb-1">
            Username
          </label>
          <input
            id={`${idPrefix}-payout-address`}
            type="text"
            value={parsed.address}
            onChange={(event) => updateSriIdentity(event.target.value, parsed.workerName, parsed.donationPercent)}
            placeholder={getBitcoinAddressPlaceholder(network)}
            aria-required="true"
            autoComplete="off"
            className="w-full h-9 px-3 rounded-lg border border-input bg-background font-mono text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
          />
          {getBitcoinAddressError(parsed.address, network) && (
            <p className="text-xs text-destructive mt-1">{getBitcoinAddressError(parsed.address, network)}</p>
          )}
        </div>
      )}

      <div>
        <label htmlFor={`${idPrefix}-worker-name`} className="block text-xs font-medium mb-1">
          Worker Name <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <input
          id={`${idPrefix}-worker-name`}
          type="text"
          value={parsed.workerName}
          onChange={(event) => updateSriIdentity(parsed.address, event.target.value, parsed.donationPercent)}
          placeholder="worker1"
          autoComplete="off"
          className="w-full h-9 px-3 rounded-lg border border-input bg-background font-mono text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 outline-none transition-all"
        />
      </div>

      <div>
        <label htmlFor={`${idPrefix}-donation-slider`} className="block text-xs font-medium mb-1">
          Donation to SRI Development <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <div className="p-3 rounded-lg bg-muted/40 space-y-2">
          <input
            id={`${idPrefix}-donation-slider`}
            type="range"
            min={0}
            max={100}
            value={parsed.donationPercent}
            onChange={(event) => updateSriIdentity(parsed.address, parsed.workerName, snapDonation(Number(event.target.value)))}
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

function FallbackPoolsEdit({
  pools,
  availablePools,
  isJdMode,
  miningMode,
  network,
  onChange,
}: {
  pools: PoolConfig[];
  availablePools: KnownPool[];
  isJdMode: boolean;
  miningMode: SetupData['miningMode'];
  network: NonNullable<SetupData['bitcoin']>['network'];
  onChange: (pools: PoolConfig[]) => void;
}) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const draggedIndexRef = useRef<number | null>(null);

  const updatePool = (index: number, nextPool: PoolConfig) => {
    onChange(pools.map((pool, i) => (
      i === index ? normalizePoolUserIdentity(nextPool, miningMode) : pool
    )));
  };

  const removePool = (index: number) => {
    onChange(pools.filter((_, i) => i !== index));
  };

  const movePool = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= pools.length) {
      return;
    }

    const nextPools = [...pools];
    const [movedPool] = nextPools.splice(fromIndex, 1);
    nextPools.splice(toIndex, 0, movedPool);
    onChange(nextPools);
  };

  const addPool = () => {
    const availablePreset = availablePools.find((pool) => (
      pool.badge !== 'coming-soon' &&
      !pools.some((usedPool) => isSamePool(usedPool, pool))
    ));

    onChange([
      ...pools,
      normalizePoolUserIdentity(
        availablePreset ? knownPoolToConfig(availablePreset) : createEmptyCustomPool(),
        miningMode,
      ),
    ]);
  };

  const finishDrag = (toIndex: number) => {
    if (draggedIndexRef.current !== null) {
      movePool(draggedIndexRef.current, toIndex);
    }
    draggedIndexRef.current = null;
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="space-y-3">
      {pools.length === 0 && (
        <p className="text-sm text-muted-foreground">No fallback pools configured.</p>
      )}

      {pools.map((pool, index) => (
        <SettingsFallbackPoolRow
          key={`fallback-pool-${index}`}
          pool={pool}
          index={index}
          totalPools={pools.length}
          availablePools={availablePools}
          isJdMode={isJdMode}
          miningMode={miningMode}
          network={network}
          isDragging={draggedIndex === index}
          isDragTarget={dragOverIndex === index && draggedIndex !== index}
          onDragStart={(event) => {
            draggedIndexRef.current = index;
            setDraggedIndex(index);
            setDragOverIndex(index);
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', String(index));
          }}
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
          onDragEnd={() => {
            draggedIndexRef.current = null;
            setDraggedIndex(null);
            setDragOverIndex(null);
          }}
          onMoveUp={() => movePool(index, index - 1)}
          onMoveDown={() => movePool(index, index + 1)}
          onRemove={() => removePool(index)}
          onChange={(nextPool) => updatePool(index, nextPool)}
        />
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addPool}
      >
        Add Fallback Pool
      </Button>
    </div>
  );
}

function SettingsFallbackPoolRow({
  pool,
  index,
  totalPools,
  availablePools,
  isJdMode,
  miningMode,
  network,
  isDragging,
  isDragTarget,
  onDragStart,
  onDragEnter,
  onDragOver,
  onDrop,
  onDragEnd,
  onMoveUp,
  onMoveDown,
  onRemove,
  onChange,
}: {
  pool: PoolConfig;
  index: number;
  totalPools: number;
  availablePools: KnownPool[];
  isJdMode: boolean;
  miningMode: SetupData['miningMode'];
  network: NonNullable<SetupData['bitcoin']>['network'];
  isDragging: boolean;
  isDragTarget: boolean;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  onDragEnter: () => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onChange: (pool: PoolConfig) => void;
}) {
  const selectedPreset = availablePools.find((preset) => isSamePool(pool, preset)) ?? null;
  const knownPool = selectedPreset ?? getKnownPoolForConfig(pool);
  const isCustom = !selectedPreset;
  const selectedPoolValue = selectedPreset?.id ?? 'custom';
  const displayName = (knownPool?.name ?? pool.name) || `Fallback Pool ${index + 1}`;
  const endpoint = `${pool.address || 'pool.example.com'}:${pool.port || DEFAULT_POOL_PORT}`;
  const identityError = getPoolIdentityError(pool, miningMode, network);
  const usesSriIdentity = miningMode === 'solo' && isSriPool(pool);

  const updateField = (field: keyof PoolConfig, value: string | number) => {
    const normalized =
      field === 'authority_public_key' && typeof value === 'string'
        ? stripWrappingQuotes(value)
        : value;
    onChange({ ...pool, [field]: normalized });
  };

  const handlePoolSelection = (poolId: string) => {
    if (poolId === 'custom') {
      onChange(createEmptyCustomPool(pool.user_identity));
      return;
    }

    const preset = availablePools.find((item) => item.id === poolId);
    if (preset && preset.badge !== 'coming-soon') {
      onChange(knownPoolToConfig(preset, pool.user_identity));
    }
  };

  const pubkeyError = getPoolAuthorityPubkeyError(pool.authority_public_key);

  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`rounded-lg border bg-muted/30 transition-colors ${
        isDragTarget
          ? 'border-primary bg-primary/[0.04]'
          : 'border-border'
      } ${isDragging ? 'opacity-60' : ''}`}
    >
      <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] gap-3 p-4 md:grid-cols-[auto_auto_minmax(0,1fr)_minmax(0,1.1fr)_auto] md:items-start">
        <button
          type="button"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className="inline-flex h-11 w-9 cursor-grab items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-label={`Drag fallback pool ${index + 1} to reorder`}
          title="Drag to reorder fallback priority"
        >
          <GripVertical className="h-5 w-5" aria-hidden="true" />
        </button>

        <div className="inline-flex h-11 min-w-9 items-center justify-center rounded-lg bg-background/70 px-2 text-xs font-semibold text-muted-foreground">
          {index + 1}
        </div>

        <div className="flex min-w-0 items-start gap-3">
          <PoolIcon
            logoUrl={knownPool?.logoUrl}
            logoOnDark={knownPool?.logoOnDark}
            monogram={knownPool?.monogram}
            invertLogoInDarkMode={knownPool?.invertLogoInDarkMode}
            logoScale={knownPool?.logoScale}
            name={displayName}
            className="h-11 w-11 rounded-xl"
          />
          <div className="min-w-0 flex-1">
            <label htmlFor={`fallback-${index}-preset`} className="sr-only">
              Pool for fallback priority {index + 1}
            </label>
            <select
              id={`fallback-${index}-preset`}
              value={selectedPoolValue}
              onChange={(event) => handlePoolSelection(event.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-all focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15"
            >
              {availablePools.map((preset) => (
                <option key={preset.id} value={preset.id} disabled={preset.badge === 'coming-soon'}>
                  {preset.name}{preset.badge === 'coming-soon' ? ' (coming soon)' : ''}
                </option>
              ))}
              <option value="custom">Custom Pool</option>
            </select>
            <p className="mt-1 truncate text-xs text-muted-foreground font-mono">{endpoint}</p>
          </div>
        </div>

        <div className="col-span-2 col-start-3 min-w-0 md:col-span-1 md:col-start-auto">
          <label htmlFor={`fallback-${index}-identity`} className="sr-only">
            Username for fallback pool {index + 1}
          </label>
          {usesSriIdentity ? (
            <div className="flex min-h-10 items-center rounded-lg border border-border bg-background px-3 font-mono text-xs text-muted-foreground">
              <span className="truncate">{getPoolUserIdentityDisplay(pool, miningMode)}</span>
            </div>
          ) : (
            <>
              <input
                id={`fallback-${index}-identity`}
                type="text"
                value={pool.user_identity}
                onChange={(event) => onChange({ ...pool, user_identity: event.target.value })}
                placeholder={miningMode === 'solo' ? getBitcoinAddressPlaceholder(network) : 'username.worker1'}
                aria-required="true"
                autoComplete="off"
                className={`h-10 w-full rounded-lg border bg-background px-3 font-mono text-sm outline-none transition-all focus-visible:ring-2 focus-visible:ring-primary/15 ${
                  identityError ? 'border-destructive focus-visible:border-destructive' : 'border-input focus-visible:border-primary'
                }`}
              />
              {identityError && <p className="mt-1 text-xs text-destructive">{identityError}</p>}
            </>
          )}
        </div>

        <div className="col-start-4 row-start-1 flex h-11 shrink-0 items-center justify-end gap-1 md:col-start-auto md:row-start-auto">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-label={`Move fallback pool ${index + 1} up`}
            title="Move up"
          >
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === totalPools - 1}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-label={`Move fallback pool ${index + 1} down`}
            title="Move down"
          >
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-label={`Remove fallback pool ${index + 1}`}
            title="Remove fallback pool"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {usesSriIdentity && (
        <div className="border-t border-border bg-background/40 p-4">
          <SriPoolIdentityEdit
            pool={pool}
            network={network}
            idPrefix={`fallback-${index}`}
            onChange={onChange}
          />
        </div>
      )}

      {isCustom && (
        <div className="border-t border-border bg-background/40 p-3">
          <div className={`grid gap-2 ${
            isJdMode
              ? 'md:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_7rem_9rem]'
              : 'md:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_7rem_minmax(0,1.3fr)]'
          }`}>
            <div>
              <label htmlFor={`fallback-${index}-name`} className="mb-1 block text-xs font-medium text-muted-foreground">
                Name
              </label>
              <input
                id={`fallback-${index}-name`}
                type="text"
                value={pool.name}
                onChange={(event) => updateField('name', event.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-all focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15"
              />
            </div>

            <div>
              <label htmlFor={`fallback-${index}-address`} className="mb-1 block text-xs font-medium text-muted-foreground">
                Address
              </label>
              <input
                id={`fallback-${index}-address`}
                type="text"
                value={pool.address}
                onChange={(event) => updateField('address', event.target.value)}
                placeholder="pool.example.com"
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-all focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15"
              />
            </div>

            <div>
              <label htmlFor={`fallback-${index}-port`} className="mb-1 block text-xs font-medium text-muted-foreground">
                {isJdMode ? 'Pool Port' : 'Port'}
              </label>
              <input
                id={`fallback-${index}-port`}
                type="number"
                value={pool.port}
                onChange={(event) => updateField('port', parseInt(event.target.value, 10) || DEFAULT_POOL_PORT)}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-all focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15"
              />
            </div>

            {isJdMode && (
              <div>
                <label htmlFor={`fallback-${index}-jds-port`} className="mb-1 block text-xs font-medium text-muted-foreground">
                  JD Port (optional)
                </label>
                <input
                  id={`fallback-${index}-jds-port`}
                  type="number"
                  min={1}
                  max={65535}
                  value={pool.jds_port ?? ''}
                  onChange={(event) => onChange({
                    ...pool,
                    jds_port: event.target.value === '' ? undefined : Number(event.target.value),
                  })}
                  placeholder="3334"
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-all focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15"
                />
                <p className="mt-1 text-xs text-muted-foreground">Only set this when specified by your pool.</p>
              </div>
            )}

            <div className={isJdMode ? 'md:col-span-4' : undefined}>
              <label htmlFor={`fallback-${index}-pubkey`} className="mb-1 block text-xs font-medium text-muted-foreground">
                Authority Public Key
              </label>
              <input
                id={`fallback-${index}-pubkey`}
                type="text"
                value={pool.authority_public_key}
                onChange={(event) => updateField('authority_public_key', event.target.value)}
                placeholder="Pool authority public key"
                className={`h-9 w-full rounded-lg border bg-background px-3 font-mono text-sm outline-none transition-all focus-visible:ring-2 focus-visible:ring-primary/15 ${
                  pubkeyError ? 'border-destructive focus-visible:border-destructive' : 'border-input focus-visible:border-primary'
                }`}
              />
              {pubkeyError && <p className="mt-1 text-xs text-destructive">{pubkeyError}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Pool selection option for inline editing.
 */
function PoolOption({
  pool,
  selected,
  onSelect,
}: {
  pool: KnownPool;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full p-3 rounded-lg border transition-all text-left flex items-center gap-3 ${
        selected
          ? 'border-primary bg-primary/[0.04]'
          : 'border-border bg-card hover:border-primary/45'
      }`}
    >
      <PoolIcon
        logoUrl={pool.logoUrl}
        logoOnDark={pool.logoOnDark}
        monogram={pool.monogram}
        invertLogoInDarkMode={pool.invertLogoInDarkMode}
        logoScale={pool.logoScale}
        name={pool.name}
      />
      <div className="flex-1 min-w-0">
        <div className={`font-medium text-sm ${selected ? 'text-primary' : ''}`}>{pool.name}</div>
        <div className="text-xs text-muted-foreground font-mono">{pool.address}:{pool.port}</div>
      </div>
      {selected && (
        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
          <Check className="w-3 h-3 text-background" />
        </div>
      )}
    </button>
  );
}
