import { useCallback, useState } from 'react';
import {
  Alert, AppBar, BottomNavigation, BottomNavigationAction, Box, Button, Chip, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle, Paper, Snackbar, Stack, Tab, Tabs, Toolbar, Typography,
  useMediaQuery, useTheme, IconButton, Tooltip
} from '@mui/material';
import DocumentScannerIcon from '@mui/icons-material/DocumentScanner';
import FolderIcon from '@mui/icons-material/Folder';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ShareIcon from '@mui/icons-material/Share';
import UsbOffIcon from '@mui/icons-material/UsbOff';
import ScanPage from './ScanPage';
import FilesPage from './FilesPage';
import InstallButton from './InstallButton';
import SettingsDialog from './SettingsDialog';
import FileViewer from './FileViewer';
import SettingsIcon from '@mui/icons-material/Settings';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { useScanner } from './useScanner';
import { api, download, kind, prettyName, shareOrDownload, type ScanFile } from './api';

type TabKey = 'scan' | 'files';

export default function App() {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const [tab, setTab] = useState<TabKey>('scan');
  const [busy, setBusy] = useState(false);
  const { state, refresh } = useScanner(busy);
  const [result, setResult] = useState<ScanFile | null>(null);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const [filesKey, setFilesKey] = useState(0);
  const [settings, setSettings] = useState(false);
  const [viewing, setViewing] = useState<ScanFile | null>(null);

  const onError = useCallback((msg: string) => setToast({ msg, error: true }), []);
  const onMessage = useCallback((msg: string) => setToast({ msg }), []);
  const go = (t: TabKey) => !busy && setTab(t);

  const ocrAvailable = state.status === 'ready'
    && state.context.diagnostics.some((d) => d.success && d.message.includes('tesseract'));

  const chip = (() => {
    switch (state.status) {
      case 'loading':
        return <Chip size="small" label="Procurando…" icon={<CircularProgress size={14} color="inherit" />}
          sx={{ bgcolor: 'rgba(255,255,255,.18)', color: 'inherit' }} />;
      case 'ready':
        return <Chip size="small" label="Pronto" icon={<CheckCircleIcon style={{ color: '#2e7d32' }} />}
          sx={{ bgcolor: '#fff', color: '#1b5e20', fontWeight: 600 }} aria-label="Scanner pronto" />;
      default:
        return <Chip size="small" label="Desconectado" icon={<UsbOffIcon />} color="error" onClick={refresh}
          aria-label="Scanner desconectado. Tocar para procurar de novo" />;
    }
  })();

  const refreshFiles = (
    <Tooltip title="Atualizar lista">
      <IconButton color="inherit" onClick={() => setFilesKey((k) => k + 1)} aria-label="Atualizar lista de arquivos"
        sx={{ width: 48, height: 48 }}>
        <RefreshIcon />
      </IconButton>
    </Tooltip>
  );

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default' }}>
      <AppBar position="sticky" elevation={0} sx={{ pt: 'env(safe-area-inset-top)' }}>
        <Toolbar sx={{ gap: 1, minHeight: { md: 64 } }}>
          {desktop ? (
            <>
              <DocumentScannerIcon />
              <Typography variant="h6" component="h1" sx={{ fontWeight: 700, mr: 3 }}>Scanner</Typography>
              <Tabs value={tab} onChange={(_, v) => go(v)} textColor="inherit"
                TabIndicatorProps={{ sx: { bgcolor: 'currentColor', height: 3 } }} sx={{ flex: 1, alignSelf: 'stretch' }}>
                <Tab value="scan" label="Digitalizar" icon={<DocumentScannerIcon />} iconPosition="start" />
                <Tab value="files" label="Arquivos" icon={<FolderIcon />} iconPosition="start" disabled={busy} />
              </Tabs>
              {chip}
              {tab === 'files' && refreshFiles}
              <InstallButton label />
            </>
          ) : (
            <>
              <Typography variant="h6" component="h1" sx={{ flex: 1, fontWeight: 600 }}>
                {tab === 'scan' ? 'Digitalizar' : 'Arquivos'}
              </Typography>
              {tab === 'scan' ? chip : refreshFiles}
              <InstallButton />
            </>
          )}
          <Tooltip title="Configurações">
            <IconButton color="inherit" onClick={() => setSettings(true)} aria-label="Configurações"
              sx={{ width: 48, height: 48 }}>
              <SettingsIcon />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      <Box component="main" sx={{ maxWidth: desktop ? (tab === 'scan' ? 1280 : 960) : 640, mx: 'auto' }}>
        {/* A tela de digitalizacao fica montada (so escondida) para nao perder
            a previa nem as paginas de um PDF em andamento ao trocar de aba. */}
        <Box sx={{ display: tab === 'scan' ? 'block' : 'none' }}>
          {state.status === 'ready' ? (
            <ScanPage device={state.device} ocrAvailable={ocrAvailable} onBusyChange={setBusy}
              onError={onError}
              onDone={(f) => { setResult(f); setFilesKey((k) => k + 1); }} />
          ) : state.status === 'loading' ? (
            <Stack alignItems="center" spacing={2} sx={{ pt: 12, textAlign: 'center' }} role="status">
              <CircularProgress />
              <Typography color="text.secondary">Procurando o scanner…</Typography>
            </Stack>
          ) : (
            <Stack alignItems="center" spacing={2} sx={{ p: 4, pt: 10, textAlign: 'center', maxWidth: 480, mx: 'auto' }}>
              <UsbOffIcon sx={{ fontSize: 64, color: 'text.disabled' }} />
              <Typography variant="h6">
                {state.status === 'missing' ? 'Scanner não encontrado' : 'Sem conexão'}
              </Typography>
              <Typography color="text.secondary">
                {state.status === 'error' ? state.message : 'Verifique se o scanner está ligado e com o cabo USB conectado.'}
              </Typography>
              <Button variant="contained" size="large" startIcon={<RefreshIcon />} onClick={refresh}>
                Procurar de novo
              </Button>
            </Stack>
          )}
        </Box>
        {tab === 'files' && (
          <FilesPage reloadKey={filesKey} desktop={desktop} onMessage={onMessage} onError={onError}
            onGoScan={() => setTab('scan')} onOpen={setViewing} />
        )}
      </Box>

      {!desktop && (
        <Paper elevation={8} square sx={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 3, pb: 'env(safe-area-inset-bottom)'
        }}>
          <BottomNavigation showLabels value={tab} onChange={(_, v) => go(v)}>
            <BottomNavigationAction value="scan" label="Digitalizar" icon={<DocumentScannerIcon />} />
            <BottomNavigationAction value="files" label="Arquivos" icon={<FolderIcon />} disabled={busy} />
          </BottomNavigation>
        </Paper>
      )}

      {/* Resultado da digitalizacao */}
      <Dialog open={!!result} onClose={() => setResult(null)} fullWidth maxWidth="xs" aria-labelledby="done-title">
        {result && (
          <>
            <DialogTitle id="done-title" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CheckCircleIcon color="success" /> Pronto!
            </DialogTitle>
            <DialogContent>
              <Stack direction="row" spacing={2} alignItems="center">
                {result.extension !== '.zip' && (
                  <Box component="img" src={api.thumbUrl(result.name)} alt=""
                    sx={{ width: 72, borderRadius: 1, border: 1, borderColor: 'divider' }} />
                )}
                <Box>
                  <Typography>{prettyName(result)}</Typography>
                  <Typography variant="body2" color="text.secondary">{kind(result)} · {result.sizeString}</Typography>
                </Box>
              </Stack>
            </DialogContent>
            <DialogActions sx={{ flexWrap: 'wrap', gap: 1, px: 3, pb: 2 }}>
              <Button onClick={() => setResult(null)}>Fechar</Button>
              <Button onClick={() => { download(result); setResult(null); }}>Baixar</Button>
              <Button startIcon={<VisibilityIcon />} onClick={() => { setViewing(result); setResult(null); }}>Ver</Button>
              <Button variant="contained" startIcon={<ShareIcon />}
                onClick={async () => { const f = result; setResult(null); await shareOrDownload(f); }}>
                Compartilhar
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <FileViewer file={viewing} onClose={() => setViewing(null)} onMessage={onMessage} />
      <SettingsDialog open={settings} onClose={() => setSettings(false)} state={state} onRefresh={refresh}
        onMessage={onMessage} />

      <Snackbar open={!!toast} autoHideDuration={toast?.error ? 7000 : 3000} onClose={() => setToast(null)}
        anchorOrigin={{ vertical: desktop ? 'bottom' : 'top', horizontal: 'center' }}
        sx={desktop ? undefined : { top: 'calc(64px + env(safe-area-inset-top))' }}>
        {toast ? (
          <Alert severity={toast.error ? 'error' : 'success'} variant="filled" onClose={() => setToast(null)}
            sx={{ width: '100%' }}>
            {toast.msg}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
