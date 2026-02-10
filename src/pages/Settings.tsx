import { useState } from 'react';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePoolData, useTranslatorHealth, useJdcHealth, getEndpointConfig } from '@/hooks/usePoolData';
import { formatUptime } from '@/lib/utils';
import type { AppMode } from '@/types/api';
import {
  Network,
  Server,
  Activity,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Info,
  Copy,
  Check,
  Palette,
} from 'lucide-react';
import { useUiConfig } from '@/hooks/useUiConfig';

interface SettingsProps {
  appMode?: AppMode;
}

export function Settings({ appMode = 'translator' }: SettingsProps) {
  const { modeLabel, isJdMode, global: poolGlobal, isLoading } = usePoolData();
  const { data: translatorOk, isLoading: translatorLoading } = useTranslatorHealth();
  const { data: jdcOk, isLoading: jdcLoading } = useJdcHealth();
  const endpoints = getEndpointConfig();
  const { config, updateConfig } = useUiConfig();
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(key);
    window.setTimeout(() => setCopiedField((current) => (current === key ? null : current)), 1400);
  };

  return (
    <Shell appMode={appMode} appName={config.appName}>
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <PageHeader
          title="Settings"
          description="Status, endpoints, and UI settings."
          actions={
            <Button variant="outline" onClick={() => window.location.reload()}>
              Refresh
            </Button>
          }
        />

        <Tabs defaultValue="status" className="space-y-5">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
            <TabsTrigger value="status">Status</TabsTrigger>
            <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
            <TabsTrigger value="api">API Docs</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
          </TabsList>

          <TabsContent value="status">
            <div className="grid gap-5 lg:grid-cols-2">
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Network className="h-5 w-5 text-primary" />
                    Service Health
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <StatusLine
                    label="Translator Proxy"
                    endpoint={endpoints.translator.base}
                    loading={translatorLoading}
                    ok={Boolean(translatorOk)}
                    offlineLabel="Offline"
                  />

                  <StatusLine
                    label="JD Client"
                    endpoint={endpoints.jdc.base}
                    loading={jdcLoading}
                    ok={Boolean(jdcOk)}
                    offlineLabel="Not running"
                  />

                  <div className="grid gap-3 rounded-xl border border-border/70 bg-muted/20 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Active mode</span>
                      <span className="font-medium">
                        {isLoading ? 'Detecting...' : modeLabel}
                        {isJdMode ? ' (JD)' : ''}
                      </span>
                    </div>
                    {poolGlobal && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Uptime</span>
                        <span className="font-mono text-xs">{formatUptime(poolGlobal.uptime_secs)}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Info className="h-5 w-5 text-primary" />
                    Runtime Info
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <InfoPair label="UI Version" value="0.1.0" />
                  <InfoPair label="Protocol" value="Stratum V2" />
                  <InfoPair label="Data Source" value={modeLabel} />
                  <InfoPair label="Transport" value={isJdMode ? 'Translator + JD Client' : 'Translator'} />
                  <InfoPair label="Environment" value={import.meta.env.DEV ? 'Development' : 'Production'} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="endpoints">
            <div className="space-y-5">
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Server className="h-5 w-5 text-primary" />
                    Endpoints
                  </CardTitle>
                  <CardDescription>Runtime endpoint values currently used by the UI.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-5 md:grid-cols-2">
                  <EndpointField
                    label="JD Client URL"
                    value={endpoints.jdc.base}
                    copied={copiedField === 'jdc'}
                    onCopy={() => copyToClipboard('jdc', endpoints.jdc.base)}
                    hint="Set via ?jdc_url= or VITE_JDC_URL"
                    helpText="Used for JD Client health and API requests when JD mode is active."
                  />
                  <EndpointField
                    label="Translator URL"
                    value={endpoints.translator.base}
                    copied={copiedField === 'translator'}
                    onCopy={() => copyToClipboard('translator', endpoints.translator.base)}
                    hint="Set via ?translator_url= or VITE_TRANSLATOR_URL"
                    helpText="Used for Translator health, SV1 client data, and fallback pool telemetry."
                  />
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader>
                  <CardTitle>Quick Start URL</CardTitle>
                  <CardDescription>Open the UI with explicit endpoint values preconfigured.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <ExampleBlock
                    label="Local Development (JD mode)"
                    value="http://localhost:5173/?jdc_url=http://localhost:9091&translator_url=http://localhost:9092"
                  />
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    Configuration Priority
                    <InfoHint text="Endpoint values are resolved once during app startup. Reload after changing URL parameters or environment variables." />
                  </CardTitle>
                  <CardDescription>Order used to resolve endpoint URLs.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <PriorityRow
                    step={1}
                    source="URL query parameters"
                    detail="Values from ?jdc_url= and ?translator_url= override all other sources."
                  />
                  <PriorityRow
                    step={2}
                    source="Environment variables"
                    detail="Uses VITE_JDC_URL and VITE_TRANSLATOR_URL when query parameters are not provided."
                  />
                  <PriorityRow
                    step={3}
                    source="Default local endpoints"
                    detail="Falls back to localhost:9091 for JD Client and localhost:9092 for Translator."
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="api">
            <div className="space-y-5">
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-primary" />
                    API Endpoints
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <EndpointRow method="GET" path="/api/v1/health" description="Health check" />
                    <EndpointRow method="GET" path="/api/v1/global" description="Global statistics" />
                    <EndpointRow method="GET" path="/api/v1/server" description="Upstream server summary" />
                    <EndpointRow method="GET" path="/api/v1/server/channels" description="Upstream channel details" />
                  </div>

                  <div>
                    <p className="mb-2 text-sm font-medium">Translator-specific</p>
                    <div className="space-y-2">
                      <EndpointRow method="GET" path="/api/v1/sv1/clients" description="List SV1 clients" />
                      <EndpointRow method="GET" path="/api/v1/sv1/clients/{id}" description="SV1 client details" />
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-sm font-medium">JD Client-specific</p>
                    <div className="space-y-2">
                      <EndpointRow method="GET" path="/api/v1/clients" description="List SV2 clients" />
                      <EndpointRow method="GET" path="/api/v1/clients/{id}" description="SV2 client details" />
                      <EndpointRow method="GET" path="/api/v1/clients/{id}/channels" description="Client channel details" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader>
                  <CardTitle>Swagger & Metrics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-3">
                    {translatorOk && (
                      <Button variant="outline" asChild>
                        <a
                          href={`${endpoints.translator.base.replace('/api/v1', '')}/swagger-ui`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="gap-2"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Translator Swagger
                        </a>
                      </Button>
                    )}
                    {jdcOk && (
                      <Button variant="outline" asChild>
                        <a
                          href={`${endpoints.jdc.base.replace('/api/v1', '')}/swagger-ui`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="gap-2"
                        >
                          <ExternalLink className="h-4 w-4" />
                          JD Client Swagger
                        </a>
                      </Button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {translatorOk && (
                      <Button variant="outline" asChild>
                        <a
                          href={`${endpoints.translator.base.replace('/api/v1', '')}/metrics`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="gap-2"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Translator Metrics
                        </a>
                      </Button>
                    )}
                    {jdcOk && (
                      <Button variant="outline" asChild>
                        <a
                          href={`${endpoints.jdc.base.replace('/api/v1', '')}/metrics`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="gap-2"
                        >
                          <ExternalLink className="h-4 w-4" />
                          JD Client Metrics
                        </a>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="appearance">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5 text-primary" />
                  Branding
                </CardTitle>
                <CardDescription>UI label and secondary color.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <LabelWithHint
                    htmlFor="app-name"
                    label="App Name"
                    hint="Shown in the sidebar header so operators can identify the deployment quickly."
                  />
                  <Input
                    id="app-name"
                    value={config.appName}
                    onChange={(e) => updateConfig({ appName: e.target.value })}
                    placeholder="SV2 Mining Stack"
                    className="max-w-md"
                  />
                  <p className="text-xs text-muted-foreground">
                    Used in the sidebar.
                  </p>
                </div>

                <div className="space-y-2">
                  <LabelWithHint
                    htmlFor="secondary-color"
                    label="Secondary Surface Color"
                    hint="Applies to muted and accent surfaces in both light and dark themes."
                  />
                  <Input
                    id="secondary-color"
                    type="color"
                    value={hslToHex(config.secondary)}
                    onChange={(e) => updateConfig({ secondary: hexToHslTriplet(e.target.value) })}
                    className="h-11 w-28 cursor-pointer p-1"
                  />
                  <p className="text-xs text-muted-foreground">
                    Applies to muted surfaces.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Shell>
  );
}

function hexToHslTriplet(hex: string): string {
  const cleaned = hex.replace('#', '');
  const bigint = parseInt(cleaned.length === 3
    ? cleaned.split('').map((c) => c + c).join('')
    : cleaned, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;

  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case rNorm:
        h = 60 * (((gNorm - bNorm) / delta) % 6);
        break;
      case gNorm:
        h = 60 * ((bNorm - rNorm) / delta + 2);
        break;
      default:
        h = 60 * ((rNorm - gNorm) / delta + 4);
    }
  }

  if (h < 0) h += 360;

  const hRound = Math.round(h);
  const sRound = Math.round(s * 100);
  const lRound = Math.round(l * 100);

  return `${hRound} ${sRound}% ${lRound}%`;
}

function hslToHex(hslTriplet: string): string {
  const [hStr, sStr, lStr] = hslTriplet.split(' ');
  const h = parseFloat(hStr);
  const s = parseFloat(sStr.replace('%', '')) / 100;
  const l = parseFloat(lStr.replace('%', '')) / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (h >= 0 && h < 60) {
    rPrime = c; gPrime = x; bPrime = 0;
  } else if (h >= 60 && h < 120) {
    rPrime = x; gPrime = c; bPrime = 0;
  } else if (h >= 120 && h < 180) {
    rPrime = 0; gPrime = c; bPrime = x;
  } else if (h >= 180 && h < 240) {
    rPrime = 0; gPrime = x; bPrime = c;
  } else if (h >= 240 && h < 300) {
    rPrime = x; gPrime = 0; bPrime = c;
  } else {
    rPrime = c; gPrime = 0; bPrime = x;
  }

  const r = Math.round((rPrime + m) * 255);
  const g = Math.round((gPrime + m) * 255);
  const b = Math.round((bPrime + m) * 255);

  const toHex = (v: number) => v.toString(16).padStart(2, '0');

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function EndpointRow({ method, path, description }: { method: string; path: string; description: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border/70 bg-muted/20 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="w-10 text-xs font-semibold text-sv2-green">{method}</span>
        <code className="text-xs text-primary sm:text-sm">{path}</code>
      </div>
      <span className="text-xs text-muted-foreground">{description}</span>
    </div>
  );
}

function StatusLine({
  label,
  endpoint,
  loading,
  ok,
  offlineLabel,
}: {
  label: string;
  endpoint: string;
  loading: boolean;
  ok: boolean;
  offlineLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="truncate font-mono text-xs text-muted-foreground">{endpoint}</p>
      </div>
      <div className="flex items-center gap-2 text-xs">
        {loading ? (
          <>
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-sv2-yellow" />
            <span className="text-muted-foreground">Checking...</span>
          </>
        ) : ok ? (
          <>
            <CheckCircle2 className="h-4 w-4 text-sv2-green" />
            <span className="text-sv2-green">Online</span>
          </>
        ) : (
          <>
            <XCircle className="h-4 w-4 text-sv2-red" />
            <span className="text-muted-foreground">{offlineLabel}</span>
          </>
        )}
      </div>
    </div>
  );
}

function EndpointField({
  label,
  value,
  copied,
  onCopy,
  hint,
  helpText,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
  hint: string;
  helpText?: string;
}) {
  return (
    <div className="space-y-2">
      <LabelWithHint label={label} hint={helpText} />
      <div className="flex gap-2">
        <Input value={value} readOnly className="font-mono text-xs" />
        <Button
          variant="outline"
          size="icon"
          onClick={onCopy}
          aria-label={`Copy ${label}`}
          className={copied ? 'border-sv2-green/40 bg-sv2-green/10 text-sv2-green' : ''}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function LabelWithHint({
  label,
  hint,
  htmlFor,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {hint && <InfoHint text={hint} />}
    </div>
  );
}

function InfoHint({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label="More information"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2 rounded-lg border border-border bg-popover px-2.5 py-2 text-[11px] leading-relaxed text-popover-foreground opacity-0 shadow-sm transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

function PriorityRow({
  step,
  source,
  detail,
}: {
  step: number;
  source: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2">
      <p className="text-xs font-semibold text-foreground">{step}. {source}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function ExampleBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <code className="block rounded-xl border border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground break-all">{value}</code>
    </div>
  );
}

function InfoPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/20 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
