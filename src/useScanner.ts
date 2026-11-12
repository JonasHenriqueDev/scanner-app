import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, type Context, type Device } from './api';

export type DeviceState =
  | { status: 'loading' }
  | { status: 'ready'; device: Device; context: Context }
  | { status: 'missing' }
  | { status: 'error'; message: string };

/**
 * Busca o scanner ao abrir o app e sempre que ele volta para a tela
 * (ex.: usuario troca de aba ou reabre o app instalado na tela inicial).
 */
export function useScanner(busy: boolean) {
  const [state, setState] = useState<DeviceState>({ status: 'loading' });
  const last = useRef(0);
  const ctrl = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    last.current = Date.now();
    setState({ status: 'loading' });
    try {
      // Duas aberturas simultaneas podem pegar o cache no meio da recriacao e
      // receber lista vazia: tenta de novo algumas vezes antes de desistir.
      let context = await api.context(c.signal);
      for (let i = 0; i < 3 && context.devices.length === 0; i++) {
        await new Promise((r) => setTimeout(r, 700));
        if (c.signal.aborted) return;
        context = await api.context(c.signal);
      }
      if (c.signal.aborted) return;
      const device = context.devices[0];
      setState(device ? { status: 'ready', device, context } : { status: 'missing' });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setState({
        status: 'error',
        message: e instanceof ApiError ? e.message : 'Não foi possível falar com o scanner.'
      });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !busy && Date.now() - last.current > 20000) {
        refresh();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [busy, refresh]);

  return { state, refresh };
}

/** Mantem a tela acesa durante a digitalizacao (Android/iOS 16.4+). */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock.request('screen').then((l) => (lock = l)).catch(() => {});
    return () => {
      lock?.release().catch(() => {});
    };
  }, [active]);
}

/** Avisa antes de fechar/recarregar a pagina no meio de uma digitalizacao. */
export function useLeaveGuard(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [active]);
}

export function usePersistent<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? { ...initial, ...JSON.parse(raw) } : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* modo privado: ignora */
    }
  }, [key, value]);
  return [value, setValue] as const;
}
