import { useState, useEffect } from 'react';

interface HostEnv {
  HOST_OS: string | null;
  STRATUM_HOST: string | null;
}

export function useHostEnv() {
  const [hostOs, setHostOs] = useState<string | null>(null);
  const [stratumHost, setStratumHost] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/env')
      .then(res => res.json() as Promise<HostEnv>)
      .then(data => {
        if (!cancelled) {
          setHostOs(data.HOST_OS);
          setStratumHost(data.STRATUM_HOST);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  return { hostOs, stratumHost, isLoading };
}
