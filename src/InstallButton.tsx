import { useEffect, useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Tooltip, Typography } from '@mui/material';
import InstallMobileIcon from '@mui/icons-material/InstallMobile';
import IosShareIcon from '@mui/icons-material/IosShare';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// O evento chega cedo: captura no carregamento do modulo para nao perder.
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as BeforeInstallPromptEvent;
  listeners.forEach((l) => l());
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  listeners.forEach((l) => l());
});

const standalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** "Instalar app": prompt nativo no Android/PC; instrucoes no iPhone. */
export default function InstallButton({ label }: { label?: boolean }) {
  const [, force] = useState(0);
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);

  if (standalone()) return null;
  const ios = isIos();
  if (!deferred && !ios) return null;

  const install = async () => {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice.catch(() => null);
      deferred = null;
      force((n) => n + 1);
    } else {
      setIosHelp(true);
    }
  };

  return (
    <>
      {label ? (
        <Button color="inherit" startIcon={<InstallMobileIcon />} onClick={install}>Instalar app</Button>
      ) : (
        <Tooltip title="Instalar app">
          <IconButton color="inherit" onClick={install} aria-label="Instalar app na tela inicial" sx={{ width: 48, height: 48 }}>
            <InstallMobileIcon />
          </IconButton>
        </Tooltip>
      )}
      <Dialog open={iosHelp} onClose={() => setIosHelp(false)} aria-labelledby="ios-title">
        <DialogTitle id="ios-title">Instalar no iPhone</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            1. No Safari, toque em <IosShareIcon fontSize="small" sx={{ verticalAlign: 'middle' }} /> <b>Compartilhar</b>.
          </Typography>
          <Typography gutterBottom>2. Escolha <b>Adicionar à Tela de Início</b>.</Typography>
          <Typography>3. Toque em <b>Adicionar</b>. O ícone do Scanner aparece na tela inicial.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIosHelp(false)}>Entendi</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
