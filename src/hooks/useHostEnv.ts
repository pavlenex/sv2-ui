import { useState, useEffect } from 'react';

interface HostEnv {
  HOST_OS: string | null;
}

export function useHostEnv() {
  const [hostOs, setHostOs] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/env')
      .then(res => res.json() as Promise<HostEnv>)
      .then(data => {
        if (!cancelled) {
          setHostOs(data.HOST_OS);
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

  return { hostOs, isLoading };
}
