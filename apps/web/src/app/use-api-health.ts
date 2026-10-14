import { healthResponseSchema } from '@torres/shared';
import { useEffect, useState } from 'react';

export type ApiHealthStatus = 'checking' | 'online' | 'offline';

export function useApiHealth(): ApiHealthStatus {
  const [status, setStatus] = useState<ApiHealthStatus>('checking');

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/health', { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        healthResponseSchema.parse(await res.json());
        setStatus('online');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('offline');
      });

    return () => controller.abort();
  }, []);

  return status;
}
