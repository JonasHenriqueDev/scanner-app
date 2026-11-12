import { useEffect, useState } from 'react';
import {
  AppBar, Box, Button, Chip, CircularProgress, Dialog, DialogContent, Divider, IconButton, List, ListItem,
  ListItemIcon, ListItemText, Stack, ToggleButton, ToggleButtonGroup, Toolbar, Typography, useColorScheme,
  useMediaQuery, useTheme
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ScannerIcon from '@mui/icons-material/Scanner';
import UsbIcon from '@mui/icons-material/Usb';
import RefreshIcon from '@mui/icons-material/Refresh';
import PaletteIcon from '@mui/icons-material/Palette';
import KeyIcon from '@mui/icons-material/Key';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import MemoryIcon from '@mui/icons-material/Memory';
import AspectRatioIcon from '@mui/icons-material/AspectRatio';
import TuneIcon from '@mui/icons-material/Tune';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import BrightnessAutoIcon from '@mui/icons-material/BrightnessAuto';
import InstallButton from './InstallButton';
import { accessLink, api, forgetKey, hasKey, type SystemInfo } from './api';
import type { DeviceState } from './useScanner';

const APP_VERSION = '1.1.0';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box component="section" sx={{ mb: 3 }}>
      <Typography variant="overline" color="text.secondary" component="h2" sx={{ px: 0.5, fontWeight: 700 }}>{title}</Typography>
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden', bgcolor: 'background.paper' }}>
        {children}
      </Box>
    </Box>
  );
}

/** "epson2:libusb:001:004" -> { driver: "epson2", conexao: "USB (barramento 1, dispositivo 4)" } */
function describeId(id: string) {
  const [driver, transport, bus, dev] = id.split(':');
  const conexao = transport === 'libusb' && bus && dev
    ? `USB · barramento ${Number(bus)}, dispositivo ${Number(dev)}`
    : transport || 'desconhecida';
  return { driver, conexao };
}

const MODE_LABEL: Record<string, string> = { Color: 'Colorido', Gray: 'Cinza', Lineart: 'Preto e branco' };

export default function SettingsDialog({ open, onClose, state, onRefresh, onMessage }: {
  open: boolean; onClose: () => void; state: DeviceState; onRefresh: () => void; onMessage: (m: string) => void;
}) {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { mode, setMode } = useColorScheme();
  const [sys, setSys] = useState<SystemInfo | null>(null);

  useEffect(() => {
    if (open && !sys) api.system().then(setSys).catch(() => {});
  }, [open, sys]);

  const device = state.status === 'ready' ? state.device : null;
  const f = device?.features ?? {};
  const ids = device ? describeId(device.id) : null;
  const res = (f['--resolution']?.options as number[] | undefined) ?? [];
  const modes = (f['--mode']?.options as string[] | undefined) ?? [];
  const w = f['-x']?.limits?.[1];
  const h = f['-y']?.limits?.[1];

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(accessLink());
      onMessage('Link de acesso copiado.');
    } catch {
      onMessage('Não foi possível copiar. Copie da barra de endereço.');
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullScreen={mobile} fullWidth maxWidth="sm" aria-labelledby="cfg-title"
      slotProps={{ paper: { sx: { bgcolor: 'background.default' } } }}>
      <AppBar position="sticky" color="inherit" elevation={0}
        sx={{ pt: mobile ? 'env(safe-area-inset-top)' : 0, borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar>
          <Typography id="cfg-title" variant="h6" component="h1" sx={{ flex: 1, fontWeight: 600 }}>Configurações</Typography>
          <IconButton edge="end" onClick={onClose} aria-label="Fechar configurações" sx={{ width: 48, height: 48 }}>
            <CloseIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
      <DialogContent sx={{ p: 2, pb: 'calc(16px + env(safe-area-inset-bottom))' }}>
        <Section title="Scanner conectado">
          <List disablePadding>
            <ListItem>
              <ListItemIcon><ScannerIcon /></ListItemIcon>
              <ListItemText
                primary={device ? 'Epson (driver epson2)' : state.status === 'loading' ? 'Procurando…' : 'Nenhum scanner'}
                secondary={device ? device.id : state.status === 'error' ? state.message : 'Verifique se está ligado e com o cabo USB'} />
              {state.status === 'ready' ? <Chip size="small" color="success" label="Pronto" />
                : state.status === 'loading' ? <CircularProgress size={20} />
                  : <Chip size="small" color="error" label="Desconectado" />}
            </ListItem>
            {ids && (
              <>
                <Divider component="li" variant="inset" />
                <ListItem>
                  <ListItemIcon><UsbIcon /></ListItemIcon>
                  <ListItemText primary="Conexão" secondary={ids.conexao} />
                </ListItem>
                <Divider component="li" variant="inset" />
                <ListItem>
                  <ListItemIcon><TuneIcon /></ListItemIcon>
                  <ListItemText primary="Capacidades"
                    secondary={`${res.join(', ')} dpi · ${modes.map((m) => MODE_LABEL[m] ?? m).join(', ')}`} />
                </ListItem>
                {w && h && (
                  <>
                    <Divider component="li" variant="inset" />
                    <ListItem>
                      <ListItemIcon><AspectRatioIcon /></ListItemIcon>
                      <ListItemText primary="Área do vidro" secondary={`${w} × ${h} mm`} />
                    </ListItem>
                  </>
                )}
              </>
            )}
          </List>
          <Box sx={{ p: 1.5, pt: 0 }}>
            <Button fullWidth variant="outlined" startIcon={<RefreshIcon />} onClick={onRefresh}
              disabled={state.status === 'loading'}>
              Procurar scanner novamente
            </Button>
          </Box>
        </Section>

        <Section title="Aparência">
          <Stack direction="row" alignItems="center" spacing={2} sx={{ p: 2 }}>
            <PaletteIcon color="action" />
            <Typography sx={{ flex: 1 }} id="lbl-theme">Tema</Typography>
          </Stack>
          <Box sx={{ px: 2, pb: 2 }}>
            <ToggleButtonGroup exclusive fullWidth value={mode ?? 'system'} aria-labelledby="lbl-theme"
              onChange={(_, v) => v && setMode(v)}>
              <ToggleButton value="system"><BrightnessAutoIcon sx={{ mr: 1 }} fontSize="small" />Auto</ToggleButton>
              <ToggleButton value="light"><LightModeIcon sx={{ mr: 1 }} fontSize="small" />Claro</ToggleButton>
              <ToggleButton value="dark"><DarkModeIcon sx={{ mr: 1 }} fontSize="small" />Escuro</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Section>

        <Section title="Acesso">
          <List disablePadding>
            <ListItem>
              <ListItemIcon><KeyIcon /></ListItemIcon>
              <ListItemText primary={hasKey() ? 'Chave de acesso salva neste aparelho' : 'Sem chave neste aparelho'}
                secondary="O link de acesso já contém a chave. Trate-o como uma senha." />
            </ListItem>
          </List>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ p: 1.5, pt: 0 }}>
            <Button fullWidth variant="outlined" startIcon={<ContentCopyIcon />} onClick={copyLink} disabled={!hasKey()}>
              Copiar link de acesso
            </Button>
            <Box sx={{ display: 'flex', justifyContent: 'center', color: 'primary.main' }}>
              <InstallButton label />
            </Box>
          </Stack>
          {hasKey() && (
            <Box sx={{ px: 1.5, pb: 1.5 }}>
              <Button fullWidth color="error" onClick={() => {
                if (confirm('Remover a chave deste aparelho? Será preciso abrir o link de acesso de novo.')) {
                  forgetKey();
                  location.replace('/');
                }
              }}>
                Esquecer chave neste aparelho
              </Button>
            </Box>
          )}
        </Section>

        <Section title="Sobre">
          <List disablePadding>
            <ListItem>
              <ListItemIcon><InfoOutlinedIcon /></ListItemIcon>
              <ListItemText primary="Scanner (app)" secondary={`Versão ${APP_VERSION}`} />
            </ListItem>
            <Divider component="li" variant="inset" />
            <ListItem>
              <ListItemIcon><ScannerIcon /></ListItemIcon>
              <ListItemText primary="Servidor de digitalização"
                secondary={state.status === 'ready' ? `scanservjs ${state.context.version}` : 'scanservjs'} />
            </ListItem>
            <Divider component="li" variant="inset" />
            <ListItem>
              <ListItemIcon><MemoryIcon /></ListItemIcon>
              <ListItemText primary="Raspberry Pi"
                secondary={sys
                  ? `${sys.os.type} ${sys.os.release} · ${sys.os.arch} · ${sys.os.freemem} MB de memória livre · Node ${sys.node}`
                  : 'Carregando…'} />
            </ListItem>
          </List>
        </Section>
      </DialogContent>
    </Dialog>
  );
}
