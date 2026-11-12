#!/bin/bash
# Rodar na VPS (Ubuntu) com sudo. Cria dois usuarios restritos:
#   tunnel   -> so pode abrir as portas reversas do Pi (sem shell)
#   scansync -> so pode rodar rsync em /srv/scanner-files (rrsync)
# Uso: sudo bash setup-users.sh "<chave publica pi_tunnel>" "<chave publica pi_sync>"
set -e
TUNNEL_KEY=${1:?chave publica do tunel}
SYNC_KEY=${2:?chave publica do sync}

# --- tunnel ---
id tunnel >/dev/null 2>&1 || useradd -m -s /usr/sbin/nologin tunnel
install -d -m 700 -o tunnel -g tunnel /home/tunnel/.ssh
echo "restrict,port-forwarding,permitlisten=\"localhost:2222\",permitlisten=\"localhost:18080\" $TUNNEL_KEY" \
  > /home/tunnel/.ssh/authorized_keys
chown tunnel:tunnel /home/tunnel/.ssh/authorized_keys; chmod 600 /home/tunnel/.ssh/authorized_keys
cat > /etc/ssh/sshd_config.d/50-pitunnel.conf <<'EOF'
Match User tunnel
    PasswordAuthentication no
    AllowTcpForwarding remote
    PermitListen localhost:2222 localhost:18080
    GatewayPorts no
    X11Forwarding no
    AllowAgentForwarding no
    PermitTTY no
    ForceCommand /bin/false
EOF

# --- scansync ---
id scansync >/dev/null 2>&1 || useradd -m -s /bin/sh scansync
passwd -l scansync >/dev/null
install -d -m 755 -o scansync -g scansync /srv/scanner-files
install -d -m 700 -o scansync -g scansync /home/scansync/.ssh
echo "command=\"/usr/bin/rrsync /srv/scanner-files\",restrict $SYNC_KEY" > /home/scansync/.ssh/authorized_keys
chown scansync:scansync /home/scansync/.ssh/authorized_keys; chmod 600 /home/scansync/.ssh/authorized_keys
cat > /etc/ssh/sshd_config.d/51-scansync.conf <<'EOF'
Match User scansync
    PasswordAuthentication no
    AllowTcpForwarding no
    X11Forwarding no
    AllowAgentForwarding no
    PermitTTY no
EOF

sshd -t && systemctl reload ssh && echo "OK"
