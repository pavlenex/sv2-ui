import { StepProps } from '../types';
import { formatSupportedVersions } from '@sv2-ui/shared';

export function TemplateModeSelection({ data, updateData, onNext }: StepProps) {
  const isSoloMode = data.miningMode === 'solo';
  const heading = isSoloMode ? 'Choose how to solo mine' : 'Choose who builds block templates';
  const primaryTitle = isSoloMode ? 'Sovereign Solo' : 'Custom Templates';
  const primaryDescription = isSoloMode
    ? 'Build templates with your own Bitcoin Core node. No solo pool required.'
    : 'Build templates locally with your own Bitcoin node.';
  const secondaryTitle = isSoloMode ? 'Solo Pool' : 'Pool Templates';
  const secondaryDescription = isSoloMode
    ? 'Let a solo pool build templates and send payouts to your address.'
    : 'Use templates supplied by your pool.';
  const primaryRequirement = `Bitcoin Core ${formatSupportedVersions()} · Linux/macOS · Fully synced`;

  const handleSelect = (mode: 'jd' | 'no-jd') => {
    const isSovereignSolo = isSoloMode && mode === 'jd';

    updateData({
      mode,
      pool: isSovereignSolo ? null : data.pool,
      fallbackPools: isSovereignSolo ? [] : data.fallbackPools,
      bitcoin: mode === 'jd' ? data.bitcoin : null,
      jdc: mode === 'jd' ? data.jdc : null,
    });
    onNext();
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
          {heading}
        </h2>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <button
          type="button"
          onClick={() => handleSelect('jd')}
          className="group flex flex-col items-start p-5 rounded-xl border border-border bg-card hover:border-primary/45 hover:bg-primary/[0.03] transition-all text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <div className="font-medium text-sm mb-1 group-hover:text-primary transition-colors">
            {primaryTitle}
          </div>
          <div className="text-xs text-muted-foreground leading-relaxed mb-3">
            {primaryDescription}
          </div>
          <div className="mt-auto text-xs text-muted-foreground">
            {primaryRequirement}
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleSelect('no-jd')}
          className="group flex flex-col items-start p-5 rounded-xl border border-border bg-card hover:border-primary/45 hover:bg-primary/[0.03] transition-all text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <div className="font-medium text-sm mb-1 group-hover:text-primary transition-colors">
            {secondaryTitle}
          </div>
          <div className="text-xs text-muted-foreground leading-relaxed mb-3">
            {secondaryDescription}
          </div>
          <div className="mt-auto text-xs text-muted-foreground">No local Bitcoin node required</div>
        </button>
      </div>
    </div>
  );
}
