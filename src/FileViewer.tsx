import { useEffect, useRef, useState } from 'react';
import {
  AppBar, Box, Button, CircularProgress, Dialog, IconButton, Stack, Toolbar, Tooltip, Typography
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ShareIcon from '@mui/icons-material/Share';
import DownloadIcon from '@mui/icons-material/Download';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { api, download, kind, prettyName, shareOrDownload, type ScanFile } from './api';

const ZOOMS = [1, 1.5, 2, 3];

/** Carrega o pdf.js so quando precisa (nao pesa na abertura do app). */
async function loadPdf(url: string): Promise<PDFDocumentProxy> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  // Range requests: a 1a pagina aparece antes do arquivo inteiro chegar
  return pdfjs.getDocument({ url, withCredentials: true, disableAutoFetch: true }).promise;
}

/** Uma pagina: so desenha quando entra (ou esta perto de entrar) na tela. */
function PdfPage({ doc, n, width, ratio }: { doc: PDFDocumentProxy; n: number; width: number; ratio: number }) {
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !canvas.current || width <= 0) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    (async () => {
      const page = await doc.getPage(n);
      if (cancelled || !canvas.current) return;
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / base.width });
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const c = canvas.current;
      c.width = Math.floor(viewport.width * dpr);
      c.height = Math.floor(viewport.height * dpr);
      c.style.width = `${Math.floor(viewport.width)}px`;
      c.style.height = `${Math.floor(viewport.height)}px`;
      task = page.render({ canvasContext: c.getContext('2d')!, viewport, transform: [dpr, 0, 0, dpr, 0, 0] });
      try {
        await task.promise;
        if (!cancelled) setDone(true);
      } catch {
        /* render cancelado ao trocar zoom */
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [visible, doc, n, width]);

  return (
    <Box ref={holder} sx={{
      position: 'relative', width, height: Math.round(width * ratio), mx: 'auto', bgcolor: '#fff',
      boxShadow: 3, borderRadius: 0.5, flex: '0 0 auto'
    }} role="img" aria-label={`Página ${n}`}>
      <canvas ref={canvas} style={{ display: 'block' }} />
      {!done && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
          <CircularProgress size={28} />
        </Box>
      )}
    </Box>
  );
}

export default function FileViewer({ file, onClose, onMessage }: {
  file: ScanFile | null; onClose: () => void; onMessage: (m: string) => void;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [ratio, setRatio] = useState(1.414);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(0);
  const [boxW, setBoxW] = useState(0);
  // ref de callback: o Dialog monta o conteudo num portal depois do 1o efeito
  const [areaEl, setAreaEl] = useState<HTMLDivElement | null>(null);

  const isPdf = file?.extension === '.pdf';
  const isImage = !!file && ['.jpg', '.jpeg', '.png'].includes(file.extension);

  useEffect(() => {
    setDoc(null);
    setError('');
    setZoom(0);
    if (!file || !isPdf) return;
    let alive = true;
    let loaded: PDFDocumentProxy | null = null;
    loadPdf(api.fileUrl(file.name))
      .then(async (d) => {
        loaded = d;
        if (!alive) return d.destroy();
        const p1 = await d.getPage(1);
        const v = p1.getViewport({ scale: 1 });
        setRatio(v.height / v.width);
        setDoc(d);
      })
      .catch(() => alive && setError('Não foi possível abrir este PDF aqui.'));
    return () => {
      alive = false;
      loaded?.destroy();
    };
  }, [file, isPdf]);

  // Largura disponivel (acompanha rotacao do celular / redimensionar janela)
  useEffect(() => {
    if (!areaEl) return;
    setBoxW(areaEl.clientWidth);
    const ro = new ResizeObserver(([e]) => setBoxW(e.contentRect.width));
    ro.observe(areaEl);
    return () => ro.disconnect();
  }, [areaEl]);

  const fit = Math.min(Math.max(boxW - 24, 200), 1000);
  const pageW = Math.round(fit * ZOOMS[zoom]);

  return (
    <Dialog open={!!file} onClose={onClose} fullScreen aria-label={file ? `Visualizar ${prettyName(file)}` : undefined}
      slotProps={{ paper: { sx: { bgcolor: 'grey.900' } } }}>
      {file && (
        <>
          <AppBar position="sticky" elevation={0} color="default" sx={{ pt: 'env(safe-area-inset-top)' }}>
            <Toolbar sx={{ gap: 0.5 }}>
              <IconButton edge="start" onClick={onClose} aria-label="Voltar" sx={{ width: 48, height: 48 }}>
                <ArrowBackIcon />
              </IconButton>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap fontWeight={600}>{prettyName(file)}</Typography>
                <Typography variant="caption" color="text.secondary" noWrap component="div">
                  {kind(file)} · {file.sizeString}{doc ? ` · ${doc.numPages} página${doc.numPages > 1 ? 's' : ''}` : ''}
                </Typography>
              </Box>
              {(isPdf || isImage) && (
                <>
                  <Tooltip title="Diminuir zoom">
                    <span><IconButton onClick={() => setZoom((z) => Math.max(0, z - 1))} disabled={zoom === 0}
                      aria-label="Diminuir zoom"><ZoomOutIcon /></IconButton></span>
                  </Tooltip>
                  <Tooltip title="Aumentar zoom">
                    <span><IconButton onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}
                      disabled={zoom === ZOOMS.length - 1} aria-label="Aumentar zoom"><ZoomInIcon /></IconButton></span>
                  </Tooltip>
                </>
              )}
              <Tooltip title="Compartilhar">
                <IconButton aria-label="Compartilhar"
                  onClick={async () => { if ((await shareOrDownload(file)) === 'downloaded') onMessage('Download iniciado.'); }}>
                  <ShareIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Baixar">
                <IconButton aria-label="Baixar" onClick={() => download(file)}><DownloadIcon /></IconButton>
              </Tooltip>
            </Toolbar>
          </AppBar>

          <Box ref={setAreaEl} sx={{
            flex: 1, overflow: 'auto', py: 2, pb: 'calc(16px + env(safe-area-inset-bottom))',
            display: 'flex', flexDirection: 'column', alignItems: zoom > 0 ? 'flex-start' : 'center', gap: 2,
            px: 1.5, WebkitOverflowScrolling: 'touch'
          }}>
            {isPdf && !doc && !error && (
              <Stack alignItems="center" spacing={2} sx={{ m: 'auto', color: 'grey.300' }} role="status">
                <CircularProgress color="inherit" />
                <Typography>Abrindo PDF…</Typography>
              </Stack>
            )}
            {isPdf && doc && boxW > 0 && Array.from({ length: doc.numPages }, (_, i) => (
              <PdfPage key={`${i}-${pageW}`} doc={doc} n={i + 1} width={pageW} ratio={ratio} />
            ))}
            {isImage && (
              <Box component="img" src={api.fileUrl(file.name)} alt={prettyName(file)}
                sx={{ width: zoom === 0 ? 'auto' : pageW, maxWidth: zoom === 0 ? '100%' : 'none', height: 'auto', m: 'auto', boxShadow: 3, bgcolor: '#fff' }} />
            )}
            {(error || (!isPdf && !isImage)) && (
              <Stack alignItems="center" spacing={2} sx={{ m: 'auto', color: 'grey.300', textAlign: 'center', px: 3 }}>
                <InsertDriveFileIcon sx={{ fontSize: 64 }} />
                <Typography>{error || `Arquivos ${kind(file)} não podem ser visualizados aqui.`}</Typography>
                <Button variant="contained" startIcon={<DownloadIcon />} onClick={() => download(file)}>Baixar arquivo</Button>
              </Stack>
            )}
          </Box>
        </>
      )}
    </Dialog>
  );
}
