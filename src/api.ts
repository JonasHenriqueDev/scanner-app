// Cliente da API do scanservjs (v3). Todas as rotas sao relativas: o app e
// servido no mesmo dominio que a API (Caddy faz o proxy de /api).

export interface Feature {
  default: string | number;
  options?: Array<string | number>;
  limits?: [number, number];
}

export interface Device {
  id: string;
  name: string;
  features: Record<string, Feature>;
  settings: {
    pipeline: { options: string[]; default: string };
    batchMode: { options: string[]; default: string };
    filters: { options: string[]; default: string[] };
  };
}

export interface Context {
  devices: Device[];
  version: string;
  diagnostics: Array<{ success: boolean; message: string }>;
}

export interface ScanFile {
  name: string;
  extension: string;
  lastModified: string;
  size: number;
  sizeString: string;
}

export interface ScanParams {
  deviceId: string;
  mode?: string;
  resolution: number;
  top: number;
  left: number;
  width: number;
  height: number;
  brightness?: number;
  contrast?: number;
}

export interface ScanRequest {
  params: ScanParams;
  filters: string[];
  pipeline: string;
  batch: string;
  index: number;
}

export interface ScanResponse {
  index?: number;
  image?: string;
  file?: ScanFile;
}

export class ApiError extends Error {}

// Chave de acesso: vem no link (?k=...). Fica na URL (o atalho salvo ja a
// contem) e tambem guardada no aparelho, para o app instalado na tela inicial
// (no iPhone ele nao compartilha cookies com o Safari).
const KEY_STORE = 'scanner-key';
function readKey(): string {
  const fromUrl = new URLSearchParams(location.search).get('k');
  try {
    if (fromUrl) localStorage.setItem(KEY_STORE, fromUrl);
    return fromUrl || localStorage.getItem(KEY_STORE) || '';
  } catch {
    return fromUrl || '';
  }
}
const KEY = readKey();

export const hasKey = () => KEY !== '';
export const accessLink = () => (KEY ? `${location.origin}/?k=${encodeURIComponent(KEY)}` : '');
export function forgetKey() {
  try {
    localStorage.removeItem(KEY_STORE);
  } catch {
    /* ignora */
  }
}

export interface SystemInfo {
  os: { arch: string; freemem: number; platform: string; release: string; type: string; version: string };
  node: string;
  docker: boolean;
}

/** Acrescenta a chave a uma URL da API (inclusive <img> e links de download). */
function withKey(url: string): string {
  return KEY ? `${url}${url.includes('?') ? '&' : '?'}k=${encodeURIComponent(KEY)}` : url;
}

async function call<T>(method: string, url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(withKey(url), {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      signal
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError('Sem conexão com o scanner. Verifique sua internet e tente de novo.');
  }
  if (res.status === 403) {
    throw new ApiError(KEY
      ? 'Link de acesso inválido ou trocado. Peça o link novo.'
      : 'Acesso negado. Abra o link de acesso do scanner neste aparelho.');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(friendly(text) || `O scanner respondeu com erro (${res.status}).`);
  }
  const type = res.headers.get('content-type') || '';
  return (type.includes('json') ? res.json() : res.text()) as Promise<T>;
}

function friendly(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('device busy')) return 'O scanner está ocupado. Aguarde terminar e tente de novo.';
  if (t.includes('no matching') || t.includes('not found') || t.includes('invalid argument'))
    return 'Scanner não encontrado. Verifique se ele está ligado e conectado.';
  if (t.includes('cover open')) return 'A tampa do scanner está aberta.';
  return '';
}

const enc = encodeURIComponent;

/** Se o scanner estiver momentaneamente ocupado, espera e tenta de novo. */
async function retryBusy<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const busy = e instanceof ApiError && e.message.includes('ocupado');
      const generic = e instanceof ApiError && e.message.includes('respondeu com erro (500)');
      if (i >= tries || !(busy || generic)) throw e;
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

export const api = {
  context: (signal?: AbortSignal) => call<Context>('GET', '/api/v1/context', undefined, signal),
  createPreview: (params: Partial<ScanParams>) =>
    retryBusy(() => call<unknown>('POST', '/api/v1/preview', { params })),
  readPreview: () => call<{ content: string }>('GET', '/api/v1/preview'),
  deletePreview: () => call<unknown>('DELETE', '/api/v1/preview'),
  // So a 1a passada e repetida: repetir "concluir" (index -1) nao re-digitaliza nada.
  scan: (req: ScanRequest) => retryBusy(() => call<ScanResponse>('POST', '/api/v1/scan', req), req.index === 1 || req.index === -1 ? 3 : 2),
  files: () => call<ScanFile[]>('GET', '/api/v1/files'),
  system: () => call<SystemInfo>('GET', '/api/v1/system'),
  deleteFile: (name: string) => call<unknown>('DELETE', `/api/v1/files/${enc(name)}`),
  fileUrl: (name: string) => withKey(`/api/v1/files/${enc(name)}`),
  thumbUrl: (name: string) => withKey(`/api/v1/files/${enc(name)}/thumbnail`)
};

/**
 * Sem previa salva, o scanservjs devolve uma imagem padrao (fundo do vidro).
 * Ela e sempre identica: reconhece pelo fim do base64 para nao mostra-la.
 */
const DEFAULT_PREVIEW_TAIL = 'GB2rT7UYq0O1wDVNKgYGe9epAM2/qPXzXqFCn//Z';
export function isDefaultPreview(content: string): boolean {
  return !content || content.endsWith(DEFAULT_PREVIEW_TAIL);
}

/** "scan_2026-11-11 19.35.58.pdf" -> "11/11/2026 às 19:35" (ou o nome original). */
export function prettyName(f: ScanFile): string {
  const m = f.name.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2})\.(\d{2})/);
  if (!m) return f.name;
  return `${m[3]}/${m[2]}/${m[1]} às ${m[4]}:${m[5]}`;
}

export function kind(f: ScanFile): string {
  return f.extension.replace('.', '').toUpperCase();
}

/** Compartilha via Web Share API (Android/iPhone); se nao der, baixa. */
export async function shareOrDownload(f: ScanFile): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const url = api.fileUrl(f.name);
  try {
    if (navigator.canShare) {
      const blob = await (await fetch(url, { credentials: 'same-origin' })).blob();
      const file = new File([blob], f.name, { type: blob.type || 'application/octet-stream' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: prettyName(f) });
        return 'shared';
      }
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return 'cancelled';
  }
  download(f);
  return 'downloaded';
}

export function download(f: ScanFile) {
  const a = document.createElement('a');
  a.href = api.fileUrl(f.name);
  a.download = f.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
