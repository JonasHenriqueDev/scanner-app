import { useEffect, useMemo, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, ButtonBase, Checkbox, CircularProgress,
  Collapse, Dialog, FormControl, FormControlLabel, FormGroup, IconButton, InputLabel, LinearProgress, MenuItem,
  Paper, Select, Slider, Stack, Switch, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery, useTheme
} from '@mui/material';
import DocumentScannerIcon from '@mui/icons-material/DocumentScanner';
import VisibilityIcon from '@mui/icons-material/Visibility';
import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import ImageSearchIcon from '@mui/icons-material/ImageSearch';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import TuneIcon from '@mui/icons-material/Tune';
import ZoomOutMapIcon from '@mui/icons-material/ZoomOutMap';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import { api, ApiError, isDefaultPreview, type Device, type ScanFile, type ScanRequest } from './api';
import { usePersistent, useLeaveGuard, useWakeLock } from './useScanner';

type Format = 'pdf' | 'jpg' | 'png';
type PaperKey = 'a4' | 'letter' | 'a5' | 'full';
type Quality = 'high' | 'medium' | 'low' | 'lossless';

interface Settings {
  mode: string;
  format: Format;
  resolution: number;
  paper: PaperKey;
  multi: boolean;
  ocr: boolean;
  quality: Quality;
  filters: string[];
  brightness: number;
  contrast: number;
}

const PAPERS: Record<PaperKey, { label: string; w?: number; h?: number }> = {
  a4: { label: 'A4 (210 × 297 mm)', w: 210, h: 297 },
  letter: { label: 'Carta (216 × 279 mm)', w: 215.9, h: 279.4 },
  a5: { label: 'A5 (148 × 210 mm)', w: 148, h: 210 },
  full: { label: 'Vidro inteiro' }
};

const MODE_LABEL: Record<string, string> = { Color: 'Colorido', Gray: 'Cinza', Lineart: 'P&B' };

const RES_LABEL: Record<number, { label: string; hint: string }> = {
  75: { label: 'Mínima', hint: '75 dpi · só para conferir, texto pequeno fica ilegível' },
  150: { label: 'Rápida', hint: '150 dpi · arquivo leve, bom para enviar por WhatsApp' },
  300: { label: 'Normal', hint: '300 dpi · recomendado para documentos' },
  600: { label: 'Alta', hint: '600 dpi · fotos e detalhes finos (mais lento)' }
};
const QUICK_RES = [150, 300, 600];

const QUALITY_LABEL: Record<Quality, { label: string; hint: string }> = {
  high: { label: 'Alta', hint: 'Melhor imagem, arquivo maior' },
  medium: { label: 'Média', hint: 'Equilíbrio entre qualidade e tamanho' },
  low: { label: 'Baixa', hint: 'Arquivo bem leve, perde detalhes' },
  lossless: { label: 'Sem perdas', hint: 'Máxima fidelidade (TIFF), arquivo muito grande' }
};

const PIPE: Record<Format, Partial<Record<Quality, string>>> = {
  pdf: {
    high: 'PDF (JPG | @:pipeline.high-quality)',
    medium: 'PDF (JPG | @:pipeline.medium-quality)',
    low: 'PDF (JPG | @:pipeline.low-quality)',
    lossless: 'PDF (TIF | @:pipeline.lzw-compressed)'
  },
  jpg: {
    high: 'JPG | @:pipeline.high-quality',
    medium: 'JPG | @:pipeline.medium-quality',
    low: 'JPG | @:pipeline.low-quality'
  },
  png: { high: 'PNG' }
};
const OCR_PIPELINE = '@:pipeline.ocr | PDF (JPG | @:pipeline.high-quality)';

const FILTER_LABEL: Record<string, { label: string; hint: string }> = {
  'filter.auto-level': { label: 'Ajuste automático de níveis', hint: 'Clareia o fundo e escurece o texto' },
  'filter.auto-contrast': { label: 'Equalizar contraste', hint: 'Realça documentos apagados' },
  'filter.more-contrast': { label: 'Mais contraste', hint: 'Texto mais forte' },
  'filter.threshold': { label: 'Preto e branco puro', hint: 'Remove cinzas, ideal para texto' },
  'filter.blur': { label: 'Suavizar', hint: 'Reduz granulado e pontilhado de impressão' }
};

const DEFAULTS = { quality: 'high' as Quality, filters: [] as string[], brightness: 0, contrast: 0 };

interface Props {
  device: Device;
  ocrAvailable: boolean;
  onBusyChange: (busy: boolean) => void;
  onDone: (file: ScanFile) => void;
  onError: (message: string) => void;
}

export default function ScanPage({ device, ocrAvailable, onBusyChange, onDone, onError }: Props) {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const f = device.features;
  const modes = (f['--mode']?.options as string[] | undefined) ?? [];
  const resolutions = ((f['--resolution']?.options as number[] | undefined) ?? []).filter((r) => RES_LABEL[r]);
  const quickRes = resolutions.filter((r) => QUICK_RES.includes(r));
  const maxW = f['-x']?.limits?.[1] ?? 215.9;
  const maxH = f['-y']?.limits?.[1] ?? 297;
  const hasBrightness = '--brightness' in f;
  const hasContrast = '--contrast' in f;
  const filterOptions = device.settings.filters.options.filter((o) => FILTER_LABEL[o]);

  const [s, setS] = usePersistent<Settings>('scan-settings', {
    mode: modes.includes('Color') ? 'Color' : modes[0] ?? '',
    format: 'pdf',
    resolution: resolutions.includes(300) ? 300 : resolutions[0] ?? 150,
    paper: 'a4',
    multi: false,
    ocr: false,
    ...DEFAULTS
  });
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((o) => ({ ...o, [k]: v }));

  const [busy, setBusyState] = useState<null | 'preview' | 'scan' | 'finish'>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewKind, setPreviewKind] = useState<'preview' | 'scan' | 'saved'>('saved');
  const [zoom, setZoom] = useState(false);

  // Mostra a ultima previa/digitalizacao salva no scanner (sobrevive a recarregar o app)
  async function loadSavedPreview(kind: 'preview' | 'scan' | 'saved') {
    try {
      const { content } = await api.readPreview();
      if (isDefaultPreview(content)) {
        setPreview(null);
      } else {
        setPreview(`data:image/jpeg;base64,${content}`);
        setPreviewKind(kind);
      }
    } catch {
      /* sem previa: mantem o estado vazio */
    }
  }
  useEffect(() => {
    loadSavedPreview('saved');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device.id]);

  async function clearPreview() {
    try {
      await api.deletePreview();
      setPreview(null);
    } catch (e) {
      fail(e);
    }
  }
  const [pages, setPages] = useState<string[]>([]);
  useWakeLock(busy !== null);
  useLeaveGuard(busy !== null || pages.length > 0);

  const setBusy = (b: typeof busy) => {
    setBusyState(b);
    onBusyChange(b !== null);
  };

  const area = useMemo(() => {
    const p = PAPERS[s.paper];
    return { w: Math.min(p.w ?? maxW, maxW), h: Math.min(p.h ?? maxH, maxH) };
  }, [s.paper, maxW, maxH]);

  // Qualidades possiveis para o formato atual (so as que o servidor oferece)
  const opts = device.settings.pipeline.options;
  const qualities = (Object.keys(PIPE[s.format]) as Quality[]).filter((q) => opts.includes(PIPE[s.format][q]!));
  const quality: Quality = qualities.includes(s.quality) ? s.quality : qualities[0] ?? 'high';
  const ocrOn = s.format === 'pdf' && s.ocr && ocrAvailable && opts.includes(OCR_PIPELINE);
  const pipeline = ocrOn ? OCR_PIPELINE : PIPE[s.format][quality] ?? device.settings.pipeline.default;

  const multi = s.format === 'pdf' && s.multi;
  const mode = modes.includes(s.mode) ? s.mode : modes[0];
  const resolution = resolutions.includes(s.resolution) ? s.resolution : resolutions[0];
  const filters = s.filters.filter((x) => filterOptions.includes(x));
  const advancedChanged = quality !== 'high' || filters.length > 0 || s.brightness !== 0 || s.contrast !== 0
    || !QUICK_RES.includes(resolution);

  const request = (index: number, batch: string): ScanRequest => ({
    params: {
      deviceId: device.id, mode, resolution, top: 0, left: 0, width: area.w, height: area.h,
      ...(hasBrightness ? { brightness: s.brightness } : {}),
      ...(hasContrast ? { contrast: s.contrast } : {})
    },
    filters,
    pipeline,
    batch,
    index
  });

  const fail = (e: unknown) =>
    onError(e instanceof ApiError ? e.message : 'Algo deu errado ao digitalizar. Tente de novo.');

  async function doPreview() {
    setBusy('preview');
    try {
      await api.createPreview({
        deviceId: device.id, mode, resolution: 100,
        ...(hasBrightness ? { brightness: s.brightness } : {}),
        ...(hasContrast ? { contrast: s.contrast } : {})
      });
      await loadSavedPreview('preview');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  async function doScan() {
    setBusy('scan');
    try {
      if (multi) {
        const res = await api.scan(request(pages.length + 1, 'manual'));
        if (res.image) setPages((p) => [...p, `data:image/jpeg;base64,${res.image}`]);
        navigator.vibrate?.(60);
      } else {
        const res = await api.scan(request(1, 'none'));
        if (res.file) finishWith(res.file);
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  async function doFinish() {
    setBusy('finish');
    try {
      const res = await api.scan(request(-1, 'manual'));
      setPages([]);
      if (res.file) finishWith(res.file);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  function finishWith(file: ScanFile) {
    navigator.vibrate?.([60, 40, 60]);
    onDone(file);
    // o scanner atualiza a previa com a pagina digitalizada
    loadSavedPreview('scan');
  }

  const locked = busy !== null;
  const inBatch = pages.length > 0;
  const disabled = locked || inBatch;
  const busyText =
    busy === 'preview' ? 'Gerando pré-visualização…'
      : busy === 'finish' ? `Montando o PDF com ${pages.length} página${pages.length > 1 ? 's' : ''}…`
        : busy === 'scan' ? (multi ? `Digitalizando a página ${pages.length + 1}…` : 'Digitalizando…')
          : '';

  // ---------- Previa (moldura quadrada, imagem inteira sem distorcer) ----------
  const previewBox = (
    <Paper variant="outlined" sx={{
      position: 'relative', overflow: 'hidden', borderRadius: 1.5, mx: 'auto',
      width: desktop ? '100%' : 'min(calc(100% - 32px), 46dvh)',
      maxWidth: desktop ? 'min(100%, calc(100dvh - 180px))' : undefined
    }}>
      <ButtonBase
        onClick={() => preview && setZoom(true)}
        disabled={!preview || busy === 'preview'}
        aria-label={preview ? 'Abrir pré-visualização em tela cheia' : 'Nenhuma pré-visualização ainda'}
        sx={{
          position: 'relative', width: '100%', aspectRatio: '1 / 1', display: 'grid', placeItems: 'center',
          bgcolor: 'action.hover', cursor: preview ? 'zoom-in' : 'default'
        }}
      >
        {/* Area com a proporcao do vidro, centralizada no quadrado */}
        <Box sx={{
          position: 'absolute', top: '3%', height: '94%', left: '50%', transform: 'translateX(-50%)',
          aspectRatio: `${maxW} / ${maxH}`
        }}>
          {preview ? (
            <Box component="img" src={preview} alt="" sx={{
              width: '100%', height: '100%', objectFit: 'fill', display: 'block', borderRadius: 1, boxShadow: 2
            }} />
          ) : (
            <Stack alignItems="center" justifyContent="center" spacing={1} sx={{
              height: '100%', p: 2, textAlign: 'center', color: 'text.secondary',
              border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper'
            }}>
              <ImageSearchIcon sx={{ fontSize: 40 }} />
              <Typography variant="body2">
                Coloque o documento virado para baixo no canto do vidro e toque em <b>Ver prévia</b>.
              </Typography>
            </Stack>
          )}
          {/* Contorno do papel escolhido (origem no canto superior esquerdo do vidro) */}
          <Box aria-hidden sx={{
            position: 'absolute', left: 0, top: 0, pointerEvents: 'none',
            width: `${(area.w / maxW) * 100}%`, height: `${(area.h / maxH) * 100}%`,
            border: '2px dashed', borderColor: 'primary.main', borderRadius: 1
          }} />
        </Box>
        {preview && busy !== 'preview' && (
          <Box aria-hidden sx={{
            position: 'absolute', right: 10, bottom: 10, display: 'flex', alignItems: 'center', gap: 0.5,
            px: 1, py: 0.5, borderRadius: 1, bgcolor: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 13
          }}>
            <ZoomOutMapIcon sx={{ fontSize: 16 }} /> Ampliar
          </Box>
        )}
        {busy === 'preview' && (
          <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', bgcolor: 'rgba(0,0,0,.4)' }}>
            <CircularProgress sx={{ color: '#fff' }} aria-label="Gerando pré-visualização" />
          </Box>
        )}
      </ButtonBase>
      {/* Fora do ButtonBase (botao dentro de botao nao e permitido) */}
      {preview && busy !== 'preview' && (
        <>
          <Box aria-hidden sx={{
            position: 'absolute', left: 10, top: 10, px: 1, py: 0.25, borderRadius: 1,
            bgcolor: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 12, fontWeight: 600, pointerEvents: 'none'
          }}>
            {previewKind === 'scan' ? 'Última digitalização' : previewKind === 'preview' ? 'Prévia' : 'Última imagem'}
          </Box>
          <Button size="small" onClick={clearPreview} disabled={locked} startIcon={<DeleteSweepIcon />}
            aria-label="Limpar a última prévia ou digitalização da tela"
            sx={{
              position: 'absolute', right: 8, top: 8, minHeight: 36, px: 1.25, borderRadius: 1,
              bgcolor: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 13,
              '&:hover': { bgcolor: 'rgba(0,0,0,.75)' }
            }}>
            Limpar
          </Button>
        </>
      )}
    </Paper>
  );

  const pagesStrip = (
    <Collapse in={inBatch} unmountOnExit>
      <Box sx={{ pt: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="subtitle2">{pages.length} página{pages.length > 1 ? 's' : ''} no PDF</Typography>
          <Button size="small" color="inherit" startIcon={<CloseIcon />} disabled={locked} onClick={() => setPages([])}>
            Descartar
          </Button>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', py: 1 }} role="list">
          {pages.map((src, i) => (
            <Box key={i} role="listitem" sx={{ position: 'relative', flex: '0 0 auto' }}>
              <Box component="img" src={src} alt={`Página ${i + 1}`}
                sx={{ height: 96, borderRadius: 1, border: 1, borderColor: 'divider', display: 'block' }} />
              <Typography variant="caption" sx={{
                position: 'absolute', bottom: 4, right: 4, px: 0.75, borderRadius: 1, bgcolor: 'rgba(0,0,0,.6)', color: '#fff'
              }}>{i + 1}</Typography>
            </Box>
          ))}
        </Stack>
      </Box>
    </Collapse>
  );

  // ---------- Opcoes ----------
  const options = (
    <Stack spacing={2.5}>
      {modes.length > 1 && (
        <Box>
          <Typography component="h2" variant="subtitle2" gutterBottom id="lbl-mode">Cor</Typography>
          <ToggleButtonGroup exclusive fullWidth value={mode} aria-labelledby="lbl-mode" disabled={disabled}
            onChange={(_, v) => v && set('mode', v)}>
            {['Color', 'Gray', 'Lineart'].filter((m) => modes.includes(m)).map((m) => (
              <ToggleButton key={m} value={m}>{MODE_LABEL[m] ?? m}</ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
      )}

      <Box>
        <Typography component="h2" variant="subtitle2" gutterBottom id="lbl-format">Formato</Typography>
        <ToggleButtonGroup exclusive fullWidth value={s.format} aria-labelledby="lbl-format" disabled={disabled}
          onChange={(_, v) => v && set('format', v)}>
          <ToggleButton value="pdf">PDF</ToggleButton>
          <ToggleButton value="jpg">JPG</ToggleButton>
          <ToggleButton value="png">PNG</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {quickRes.length > 1 && (
        <Box>
          <Typography component="h2" variant="subtitle2" gutterBottom id="lbl-res">Resolução</Typography>
          <ToggleButtonGroup exclusive fullWidth value={resolution} aria-labelledby="lbl-res"
            aria-describedby="hint-res" disabled={disabled} onChange={(_, v) => v && set('resolution', v)}>
            {quickRes.map((r) => <ToggleButton key={r} value={r}>{RES_LABEL[r].label}</ToggleButton>)}
          </ToggleButtonGroup>
          <Typography id="hint-res" variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
            {RES_LABEL[resolution]?.hint}
          </Typography>
        </Box>
      )}

      <FormControl fullWidth disabled={disabled}>
        <InputLabel id="lbl-paper">Tamanho do papel</InputLabel>
        <Select labelId="lbl-paper" label="Tamanho do papel" value={s.paper}
          onChange={(e) => set('paper', e.target.value as PaperKey)}>
          {(Object.keys(PAPERS) as PaperKey[]).map((k) => <MenuItem key={k} value={k}>{PAPERS[k].label}</MenuItem>)}
        </Select>
      </FormControl>

      <Collapse in={s.format === 'pdf'}>
        <FormControlLabel sx={{ justifyContent: 'space-between', ml: 0, minHeight: 48, width: '100%' }}
          labelPlacement="start" disabled={disabled}
          control={<Switch checked={s.multi} onChange={(e) => set('multi', e.target.checked)} />}
          label={<Box><Typography>Várias páginas</Typography>
            <Typography variant="caption" color="text.secondary">Junta tudo em um único PDF</Typography></Box>} />
      </Collapse>

      {/* ---------- Avancado ---------- */}
      <Accordion disableGutters variant="outlined" sx={{ borderRadius: 1.5, '&:before': { display: 'none' }, overflow: 'hidden' }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 56 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <TuneIcon color="action" />
            <Box>
              <Typography>Qualidade avançada</Typography>
              <Typography variant="caption" color="text.secondary">
                {advancedChanged ? 'Ajustes personalizados ativos' : 'Compressão, filtros e resolução exata'}
              </Typography>
            </Box>
          </Stack>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2.5}>
            <FormControl fullWidth disabled={disabled}>
              <InputLabel id="lbl-dpi">Resolução exata</InputLabel>
              <Select labelId="lbl-dpi" label="Resolução exata" value={resolution}
                onChange={(e) => set('resolution', Number(e.target.value))}>
                {resolutions.map((r) => <MenuItem key={r} value={r}>{r} dpi · {RES_LABEL[r].label}</MenuItem>)}
              </Select>
            </FormControl>

            {qualities.length > 1 && (
              <Box>
                <Typography variant="subtitle2" gutterBottom id="lbl-q">Compressão do arquivo</Typography>
                <ToggleButtonGroup exclusive fullWidth value={quality} aria-labelledby="lbl-q" disabled={disabled || ocrOn}
                  aria-describedby="hint-q" onChange={(_, v) => v && set('quality', v)}>
                  {qualities.map((q) => (
                    <ToggleButton key={q} value={q} sx={{ px: 0.5, fontSize: '0.85rem', lineHeight: 1.2 }}>
                      {QUALITY_LABEL[q].label}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
                <Typography id="hint-q" variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                  {ocrOn ? 'Com texto pesquisável a compressão fica em Alta.' : QUALITY_LABEL[quality].hint}
                </Typography>
              </Box>
            )}

            {ocrAvailable && s.format === 'pdf' && (
              <FormControlLabel sx={{ justifyContent: 'space-between', ml: 0, minHeight: 48, width: '100%' }}
                labelPlacement="start" disabled={disabled}
                control={<Switch checked={s.ocr} onChange={(e) => set('ocr', e.target.checked)} />}
                label={<Box><Typography>Texto pesquisável (OCR)</Typography>
                  <Typography variant="caption" color="text.secondary">Permite copiar e buscar texto (mais lento)</Typography></Box>} />
            )}

            {filterOptions.length > 0 && (
              <Box>
                <Typography variant="subtitle2" id="lbl-filters">Melhorias de imagem</Typography>
                <FormGroup aria-labelledby="lbl-filters">
                  {filterOptions.map((o) => (
                    <FormControlLabel key={o} disabled={disabled} sx={{ minHeight: 48, alignItems: 'center' }}
                      control={<Checkbox checked={filters.includes(o)}
                        onChange={(e) => set('filters', e.target.checked ? [...filters, o] : filters.filter((x) => x !== o))} />}
                      label={<Box><Typography variant="body2">{FILTER_LABEL[o].label}</Typography>
                        <Typography variant="caption" color="text.secondary">{FILTER_LABEL[o].hint}</Typography></Box>} />
                  ))}
                </FormGroup>
              </Box>
            )}

            {hasBrightness && (
              <Box>
                <Typography variant="subtitle2" id="lbl-bri">Brilho: {s.brightness}</Typography>
                <Slider value={s.brightness} min={-100} max={100} step={5} disabled={disabled} aria-labelledby="lbl-bri"
                  onChange={(_, v) => set('brightness', v as number)} />
              </Box>
            )}
            {hasContrast && mode !== 'Lineart' && (
              <Box>
                <Typography variant="subtitle2" id="lbl-con">Contraste: {s.contrast}</Typography>
                <Slider value={s.contrast} min={-100} max={100} step={5} disabled={disabled} aria-labelledby="lbl-con"
                  onChange={(_, v) => set('contrast', v as number)} />
              </Box>
            )}

            <Button startIcon={<RestartAltIcon />} color="inherit" disabled={disabled || !advancedChanged}
              onClick={() => setS((o) => ({ ...o, ...DEFAULTS, resolution: resolutions.includes(300) ? 300 : o.resolution }))}
              sx={{ alignSelf: 'flex-start' }}>
              Restaurar padrão
            </Button>
          </Stack>
        </AccordionDetails>
      </Accordion>
    </Stack>
  );

  // ---------- Acoes ----------
  const actions = (
    <>
      {locked && (
        <Box sx={{ mb: 1.5 }} role="status" aria-live="polite">
          <Typography variant="body2" sx={{ mb: 0.75 }}>{busyText}</Typography>
          <LinearProgress />
          {busy !== 'preview' && (
            <Typography variant="caption" color="text.secondary">Não abra a tampa nem feche esta tela.</Typography>
          )}
        </Box>
      )}
      {!locked && inBatch && (
        <Alert severity="info" sx={{ mb: 1.5, py: 0 }} icon={false}>
          Troque a folha no vidro e toque em <b>Próxima página</b>, ou finalize.
        </Alert>
      )}
      <Stack direction="row" spacing={1.5}>
        {inBatch ? (
          <>
            <Button fullWidth size="large" variant="outlined" startIcon={<AddIcon />} disabled={locked} onClick={doScan}>
              Próxima página
            </Button>
            <Button fullWidth size="large" variant="contained" startIcon={<CheckIcon />} disabled={locked} onClick={doFinish}>
              Concluir
            </Button>
          </>
        ) : (
          <>
            <Button size="large" variant="outlined" startIcon={<VisibilityIcon />} disabled={locked}
              onClick={doPreview} sx={{ flex: '0 0 auto' }}>
              Ver prévia
            </Button>
            <Button fullWidth size="large" variant="contained" startIcon={<DocumentScannerIcon />} disabled={locked} onClick={doScan}>
              {multi ? 'Digitalizar página 1' : 'Digitalizar'}
            </Button>
          </>
        )}
      </Stack>
    </>
  );

  const zoomDialog = (
    <Dialog open={zoom} onClose={() => setZoom(false)} fullScreen aria-label="Pré-visualização em tela cheia"
      slotProps={{ paper: { sx: { bgcolor: '#000' } } }}>
      <IconButton onClick={() => setZoom(false)} aria-label="Fechar pré-visualização" sx={{
        position: 'fixed', top: 'calc(12px + env(safe-area-inset-top))', right: 12, zIndex: 1,
        width: 48, height: 48, bgcolor: 'rgba(255,255,255,.15)', color: '#fff',
        '&:hover': { bgcolor: 'rgba(255,255,255,.25)' }
      }}>
        <CloseIcon />
      </IconButton>
      {/* toque-ampliar nativo: o navegador permite pinça para zoom */}
      <Box onClick={() => setZoom(false)} sx={{
        width: '100%', height: '100%', display: 'grid', placeItems: 'center', p: 'env(safe-area-inset-top) 0 env(safe-area-inset-bottom)',
        overflow: 'auto', touchAction: 'pinch-zoom'
      }}>
        {preview && (
          <Box component="img" src={preview} alt="Pré-visualização do vidro do scanner"
            onClick={(e) => e.stopPropagation()}
            sx={{ maxWidth: '100%', maxHeight: '100dvh', objectFit: 'contain', display: 'block' }} />
        )}
      </Box>
    </Dialog>
  );

  if (desktop) {
    return (
      <Box sx={{
        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 420px', gap: 4, p: 4, alignItems: 'start'
      }}>
        <Box sx={{ position: 'sticky', top: 96 }}>
          {previewBox}
          {pagesStrip}
        </Box>
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 1.5 }}>
          {options}
          <Box sx={{ mt: 3 }}>{actions}</Box>
        </Paper>
        {zoomDialog}
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 'calc(150px + env(safe-area-inset-bottom))' }}>
      <Box sx={{ pt: 2 }}>{previewBox}</Box>
      <Box sx={{ px: 2 }}>{pagesStrip}</Box>
      <Box sx={{ px: 2, pt: 2.5 }}>{options}</Box>
      {/* Barra de acoes fixa, na zona do polegar, acima da navegacao */}
      <Paper elevation={8} square sx={{
        position: 'fixed', left: 0, right: 0, bottom: 'calc(56px + env(safe-area-inset-bottom))', zIndex: 2,
        px: 2, py: 1.5, borderTop: 1, borderColor: 'divider'
      }}>
        {actions}
      </Paper>
      {zoomDialog}
    </Box>
  );
}
