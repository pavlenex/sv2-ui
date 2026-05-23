import type { MiningMode, SetupMode, OperatingSystem, BitcoinCoreVersion, BitcoinNetwork, HealthStatus } from '@sv2-ui/shared';

export interface PoolConfig {
  name: string;
  address: string;
  port: number;
  authority_public_key: string;
}

export interface BitcoinConfig {
  core_version: BitcoinCoreVersion | null;
  network: BitcoinNetwork;
  os: OperatingSystem;
  customDataDir: string;
  socket_path: string;
}

export interface JdcConfig {
  user_identity: string;
  jdc_signature: string;
  coinbase_reward_address: string;
}

export interface TranslatorConfig {
  user_identity: string;
  enable_vardiff: boolean;
  aggregate_channels: boolean;
  min_hashrate: number;
  shares_per_minute: number;
  downstream_extranonce2_size: number;
}

export interface SetupData {
  miningMode: MiningMode;
  mode: SetupMode;
  pool: PoolConfig | null;
  bitcoin: BitcoinConfig | null;
  jdc: JdcConfig | null;
  translator: TranslatorConfig;
}

export interface ContainerStatus {
  id: string;
  name: string;
  status: HealthStatus;
  ports: Record<string, string>;
}

export interface StatusResponse {
  configured: boolean;
  running: boolean;
  miningMode: MiningMode | null;
  mode: SetupMode | null;
  poolName: string | null;
  containers: {
    translator: ContainerStatus | null;
    jdc: ContainerStatus | null;
  };
}

export interface SetupResponse {
  success: boolean;
  error?: string;
}
