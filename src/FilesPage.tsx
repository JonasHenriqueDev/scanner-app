import { useCallback, useEffect, useState } from 'react';
import {
  Avatar, Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Drawer, List, ListItemAvatar, ListItemButton, ListItemIcon, ListItemText, Skeleton, Stack,
  Typography, ListSubheader, ListItem, IconButton, Tooltip, Paper
} from '@mui/material';
import ShareIcon from '@mui/icons-material/Share';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import VisibilityIcon from '@mui/icons-material/Visibility';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import DescriptionIcon from '@mui/icons-material/Description';
import { api, ApiError, download, kind, prettyName, shareOrDownload, type ScanFile } from './api';

interface Props {
  reloadKey: number;
  desktop: boolean;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
  onGoScan: () => void;
  onOpen: (f: ScanFile) => void;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Hoje';
  if (same(d, y)) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function FilesPage({ reloadKey, desktop, onMessage, onError, onGoScan, onOpen }: Props) {
  const [files, setFiles] = useState<ScanFile[] | null>(null);
  const [selected, setSelected] = useState<ScanFile | null>(null);
  const [confirm, setConfirm] = useState<ScanFile | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await api.files();
      list.sort((a, b) => +new Date(b.lastModified) - +new Date(a.lastModified));
      setFiles(list);
    } catch (e) {
      setFiles([]);
      onError(e instanceof ApiError ? e.message : 'Não foi possível carregar os arquivos.');
    }
  }, [onError]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  async function share(f: ScanFile) {
    setSelected(null);
    const r = await shareOrDownload(f);
    if (r === 'downloaded') onMessage('Download iniciado.');
  }

  async function remove(f: ScanFile) {
    setConfirm(null);
    try {
      await api.deleteFile(f.name);
      setFiles((l) => l?.filter((x) => x.name !== f.name) ?? null);
      onMessage('Arquivo excluído.');
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Não foi possível excluir.');
    }
  }

  if (files === null) {
    return (
      <Stack sx={{ p: 2 }} spacing={2} aria-busy="true" aria-label="Carregando arquivos">
        {[0, 1, 2, 3].map((i) => (
          <Stack key={i} direction="row" spacing={2} alignItems="center">
            <Skeleton variant="rounded" width={56} height={72} />
            <Box sx={{ flex: 1 }}><Skeleton width="60%" /><Skeleton width="35%" /></Box>
          </Stack>
        ))}
      </Stack>
    );
  }

  if (files.length === 0) {
    return (
      <Stack alignItems="center" spacing={2} sx={{ p: 4, pt: 10, textAlign: 'center' }}>
        <FolderOpenIcon sx={{ fontSize: 64, color: 'text.disabled' }} />
        <Typography variant="h6">Nenhum arquivo ainda</Typography>
        <Typography color="text.secondary">Seus documentos digitalizados aparecem aqui.</Typography>
        <Button variant="contained" size="large" onClick={onGoScan}>Digitalizar agora</Button>
      </Stack>
    );
  }

  // Agrupa por dia
  const groups: Array<{ label: string; items: ScanFile[] }> = [];
  for (const f of files) {
    const label = dayLabel(f.lastModified);
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push(f);
    else groups.push({ label, items: [f] });
  }

  return (
    <Box sx={{ pb: desktop ? 4 : 'calc(72px + env(safe-area-inset-bottom))', pt: desktop ? 3 : 0, px: desktop ? 3 : 0 }}>
      <Paper variant={desktop ? 'outlined' : 'elevation'} elevation={0}
        sx={desktop ? { borderRadius: 1.5, overflow: 'hidden' } : { bgcolor: 'transparent' }}>
      <List disablePadding>
        {groups.map((g) => (
          <li key={g.label}>
            <ul style={{ padding: 0 }}>
              <ListSubheader sx={{ lineHeight: '40px', top: 0 }}>{g.label}</ListSubheader>
              {g.items.map((f) => desktop ? (
                // PC: clicar abre o arquivo; acoes ficam visiveis na linha
                <ListItem key={f.name} disablePadding secondaryAction={
                  <Stack direction="row" spacing={0.5}>
                    <Tooltip title="Compartilhar"><IconButton onClick={() => share(f)} aria-label={`Compartilhar ${prettyName(f)}`}><ShareIcon /></IconButton></Tooltip>
                    <Tooltip title="Baixar"><IconButton onClick={() => download(f)} aria-label={`Baixar ${prettyName(f)}`}><DownloadIcon /></IconButton></Tooltip>
                    <Tooltip title="Excluir"><IconButton onClick={() => setConfirm(f)} aria-label={`Excluir ${prettyName(f)}`}
                      sx={{ '&:hover': { color: 'error.main' } }}><DeleteOutlineIcon /></IconButton></Tooltip>
                  </Stack>
                } sx={{ '& .MuiListItemSecondaryAction-root': { right: 16 } }}>
                  <ListItemButton onClick={() => onOpen(f)}
                    sx={{ minHeight: 88, pr: 22 }} aria-label={`Visualizar ${prettyName(f)}, ${kind(f)}, ${f.sizeString}`}>
                    <ListItemAvatar sx={{ mr: 1 }}>
                      <Avatar variant="rounded" src={f.extension === '.zip' ? undefined : api.thumbUrl(f.name)}
                        alt="" sx={{ width: 56, height: 72, bgcolor: 'action.hover', color: 'text.secondary' }}
                        imgProps={{ loading: 'lazy' }}>
                        <DescriptionIcon />
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText primary={prettyName(f)} secondary={`${kind(f)} · ${f.sizeString}`}
                      slotProps={{ primary: { noWrap: true } }} />
                  </ListItemButton>
                </ListItem>
              ) : (
                <ListItem key={f.name} disablePadding secondaryAction={
                  <IconButton edge="end" onClick={() => setSelected(f)} aria-label={`Mais opções para ${prettyName(f)}`}
                    sx={{ width: 48, height: 48 }}>
                    <MoreVertIcon />
                  </IconButton>
                }>
                  <ListItemButton onClick={() => onOpen(f)} sx={{ minHeight: 88, pr: 8 }}
                    aria-label={`Visualizar ${prettyName(f)}, ${kind(f)}, ${f.sizeString}`}>
                    <ListItemAvatar sx={{ mr: 1 }}>
                      <Avatar variant="rounded" src={f.extension === '.zip' ? undefined : api.thumbUrl(f.name)}
                        alt="" sx={{ width: 56, height: 72, bgcolor: 'action.hover', color: 'text.secondary' }}
                        imgProps={{ loading: 'lazy' }}>
                        <DescriptionIcon />
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={prettyName(f)}
                      secondary={`${kind(f)} · ${f.sizeString}`}
                      slotProps={{ primary: { noWrap: true } }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </ul>
          </li>
        ))}
      </List>
      </Paper>

      {/* Folha de acoes (bottom sheet) */}
      <Drawer anchor="bottom" open={!!selected} onClose={() => setSelected(null)}
        slotProps={{ paper: { sx: { borderTopLeftRadius: 12, borderTopRightRadius: 12, pb: 'env(safe-area-inset-bottom)' } } }}>
        {selected && (
          <Box role="dialog" aria-label="Opções do arquivo">
            <Box sx={{ width: 32, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', mt: 1.5 }} />
            <Typography sx={{ px: 3, pt: 2, pb: 1 }} variant="subtitle1" noWrap>
              {prettyName(selected)} · {kind(selected)}
            </Typography>
            <List>
              <ListItemButton sx={{ minHeight: 56 }} onClick={() => share(selected)}>
                <ListItemIcon><ShareIcon /></ListItemIcon>
                <ListItemText primary="Compartilhar" secondary="WhatsApp, e-mail, Drive…" />
              </ListItemButton>
              <ListItemButton sx={{ minHeight: 56 }} onClick={() => { onOpen(selected); setSelected(null); }}>
                <ListItemIcon><VisibilityIcon /></ListItemIcon>
                <ListItemText primary="Visualizar" secondary="Abre aqui, sem baixar" />
              </ListItemButton>
              <ListItemButton sx={{ minHeight: 56 }} onClick={() => { download(selected); setSelected(null); }}>
                <ListItemIcon><DownloadIcon /></ListItemIcon>
                <ListItemText primary="Baixar" />
              </ListItemButton>
              <ListItemButton sx={{ minHeight: 56, color: 'error.main' }}
                onClick={() => { setConfirm(selected); setSelected(null); }}>
                <ListItemIcon sx={{ color: 'inherit' }}><DeleteOutlineIcon /></ListItemIcon>
                <ListItemText primary="Excluir" />
              </ListItemButton>
            </List>
          </Box>
        )}
      </Drawer>

      <Dialog open={!!confirm} onClose={() => setConfirm(null)} aria-labelledby="del-title">
        <DialogTitle id="del-title">Excluir arquivo?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirm && `${prettyName(confirm)} (${kind(confirm)}) será apagado do scanner. Isso não pode ser desfeito.`}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Cancelar</Button>
          <Button color="error" onClick={() => confirm && remove(confirm)}>Excluir</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
