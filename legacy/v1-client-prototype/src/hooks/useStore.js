import { useEffect, useState } from 'react';

export function useStore() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const refresh = () => setTick((t) => t + 1);
    window.addEventListener('valora-store-change', refresh);
    return () => window.removeEventListener('valora-store-change', refresh);
  }, []);
}
