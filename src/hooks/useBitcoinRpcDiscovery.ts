import { useQuery } from '@tanstack/react-query';

import { rpcVersionToCoreVersion } from '@sv2-ui/shared';
import type { BitcoinNetwork } from '@sv2-ui/shared';

export interface BitcoinRpcDiscoveryResult {
  valid: true;
  dataDir: string;
  network: BitcoinNetwork;
  chain: string;
  version: number;
  initialBlockDownload: boolean;
  logpath: string;
}

async function discoverBitcoinRpc(): Promise<BitcoinRpcDiscoveryResult[]> {
  try {
    const response = await fetch('/api/validate/bitcoin-rpc', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) return [];
    return response.json();
  } catch {
    return [];
  }
}

export function useBitcoinRpcDiscovery() {
  const { data, isFetching, refetch } = useQuery({
    queryKey: ['bitcoin-rpc-discovery'],
    queryFn: discoverBitcoinRpc,
    staleTime: 0,
    retry: false,
    refetchInterval: (query) => {
      const results = query.state.data as BitcoinRpcDiscoveryResult[] | undefined;
      if (!results || results.length === 0) return false;
      const hasUnsupportedVersion = results.some(n => !rpcVersionToCoreVersion(n.version));
      if (hasUnsupportedVersion) return false;
      const isSyncing = results.some(n => n.initialBlockDownload);
      return isSyncing ? 10_000 : false;
    },
  });

  return {
    results: data ?? [],
    isLoading: isFetching,
    retry: () => refetch(),
  };
}
