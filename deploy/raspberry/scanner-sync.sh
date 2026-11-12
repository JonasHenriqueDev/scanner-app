#!/bin/bash
# Espelha os arquivos digitalizados no servidor publico (VPS), para os downloads
# sairem direto de la, sem passar pelo upload da internet de casa.
# Roda como servico de usuario (scanner-sync.service).
#
# Configure em ~/.config/scanner-sync.env:
#   SYNC_DEST=scansync@SEU_SERVIDOR:/
#   SYNC_KEY=$HOME/.ssh/pi_sync
[ -f "$HOME/.config/scanner-sync.env" ] && . "$HOME/.config/scanner-sync.env"
SRC=${SYNC_SRC:-/var/lib/scanservjs/output/}
DEST=${SYNC_DEST:?defina SYNC_DEST em ~/.config/scanner-sync.env}
KEY=${SYNC_KEY:-$HOME/.ssh/pi_sync}
SSH="ssh -i $KEY -o BatchMode=yes -o StrictHostKeyChecking=yes -o ServerAliveInterval=30"

sync_now() {
  # --delete: apagar no app tambem apaga a copia. rsync grava em arquivo temporario
  # e renomeia, entao o servidor nunca entrega um arquivo pela metade.
  rsync -a --delete --chmod=D755,F644 -e "$SSH" "$SRC" "$DEST" \
    && echo "$(date '+%F %T') sincronizado" \
    || echo "$(date '+%F %T') falhou (tenta de novo no proximo evento)"
}

sync_now
# A cada mudanca na pasta (com pequena espera para juntar eventos) e, por garantia, a cada 5 min.
while true; do
  inotifywait -q -t 300 -e close_write,moved_to,delete,moved_from "$SRC" >/dev/null 2>&1
  sleep 2
  sync_now
done
