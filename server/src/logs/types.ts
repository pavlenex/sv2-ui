import type { SetupMode } from '@sv2-ui/shared';

export type LogContainerRole = 'translator' | 'jdc';
export type LogOutputStream = 'stdout' | 'stderr';
export type LogSourceKind = 'docker-container-logs' | 'container-log-file';
export type LogStreamId = 'mining-services';
export type DiagnosticSeverity = 'warning' | 'error';

export interface ContainerLogLine {
  container: LogContainerRole;
  stream: LogOutputStream;
  timestamp: string | null;
  message: string;
  raw: string;
}

export interface DiagnosticEvidence {
  container: LogContainerRole;
  stream: LogOutputStream;
  timestamp: string | null;
  line: string;
}

export interface LogDiagnostic {
  code: string;
  severity: DiagnosticSeverity;
  title: string;
  message: string;
  recommendation: string;
  streamId: LogStreamId;
  containers: LogContainerRole[];
  detectedAt: string | null;
  evidence: DiagnosticEvidence[];
}

export interface LogStreamDefinition {
  id: LogStreamId;
  label: string;
  containers: LogContainerRole[];
  collated: boolean;
  source: LogSourceKind;
}

export interface LogDiagnosticsResponse {
  configured: boolean;
  mode: SetupMode | null;
  generatedAt: string;
  streams: LogStreamDefinition[];
  diagnostics: LogDiagnostic[];
}

export interface LogParser {
  code: string;
  // Each parser is expected to represent one diagnostic scenario
  // (for example, one concrete log-derived user-facing error). It receives
  // the collated log lines for the logical stream and can emit one or many
  // matching diagnostics for that scenario.
  match: (lines: ContainerLogLine[]) => LogDiagnostic | LogDiagnostic[] | null;
}
