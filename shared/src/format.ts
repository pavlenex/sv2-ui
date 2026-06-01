import { SUPPORTED_BITCOIN_CORE_VERSIONS } from './constants.js';
import type { BitcoinCoreVersion } from './types.js';

export function formatSupportedVersions(): string {
  const v = SUPPORTED_BITCOIN_CORE_VERSIONS;
  if (v.length === 0) return '';
  if (v.length === 1) return v[0];
  if (v.length === 2) return `${v[0]} or ${v[1]}`;
  return `${v.slice(0, -1).join(', ')}, or ${v[v.length - 1]}`;
}

export function isSupportedBitcoinCoreVersion(
  version: string | null | undefined
): version is BitcoinCoreVersion {
  return SUPPORTED_BITCOIN_CORE_VERSIONS.includes(version as BitcoinCoreVersion);
}

export function rpcVersionToCoreVersion(rpcVersion: number): BitcoinCoreVersion | null {
  const major = Math.floor(rpcVersion / 10000);
  const minor = Math.floor((rpcVersion % 10000) / 100);
  const versionStr = `${major}.${minor}`;
  return isSupportedBitcoinCoreVersion(versionStr) ? versionStr : null;
}
