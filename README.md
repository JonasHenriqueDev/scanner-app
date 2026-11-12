# Scanner — interface web para o scanservjs

Interface **mobile-first** (PWA instalável, React + Material UI) para digitalizar documentos em um scanner USB ligado a um Raspberry Pi, usando o [scanservjs](https://github.com/sbs20/scanservjs) como backend. Funciona no navegador do Android, do iPhone e do PC, de qualquer lugar, através de um servidor público (VPS) com túnel SSH reverso.

## Funcionalidades

- **Digitalizar** em PDF, JPG ou PNG, com cor (colorido / cinza / P&B), resolução e tamanho do papel
- **Várias páginas** em um único PDF (troca a folha e toca em "Próxima página")
- **Prévia** do vidro em moldura quadrada, que abre em tela cheia; a última prévia ou digitalização fica salva, com botão para limpar
- **Qualidade avançada**: resolução exata, compressão (alta / média / baixa / sem perdas), OCR (texto pesquisável) e filtros de imagem
- **Arquivos**: lista agrupada por dia com miniaturas; **visualizador de PDF embutido** (pdf.js — funciona até no Chrome do Android, que não abre PDF sozinho), compartilhar (menu nativo do celular), baixar e excluir
- **Configurações**: scanner conectado (driver, porta USB, capacidades), tema claro / escuro / automático, link de acesso, informações do sistema
- **PWA**: instala na tela inicial (Android, iPhone e PC), service worker para abrir rápido
- **Usabilidade**: botões na zona do polegar, alvos de toque ≥ 48 px, tela fica acesa durante a digitalização, aviso ao sair no meio, layout em duas colunas no PC, respeita notch/safe areas do iPhone

## Arquitetura

```
 Celular / PC ──HTTPS──▶ VPS (Caddy)
                          ├─ /              → app estático (/srv/scanner-app)
                          ├─ /api/v1/files/* → cópia local (/srv/scanner-files), se existir
                          └─ /api/*          → túnel SSH reverso ──▶ Raspberry Pi
                                                                     └─ scanservjs :8080 ──USB──▶ scanner
```

- **Túnel reverso** (`deploy/raspberry/pi-tunnel.service`): o Pi abre a conexão até a VPS — não precisa abrir portas no roteador nem ter IP fixo em casa. As portas ficam só em `localhost` na VPS.
- **Chave de acesso**: o link `https://seu-dominio/?k=CHAVE` libera a API. A chave fica na URL (o atalho/app instalado já a contém) e também é guardada no aparelho. A tela em si é pública (não contém dados), o que permite instalar o PWA.
- **Downloads rápidos** (`deploy/raspberry/scanner-sync.sh`): cada scan novo é espelhado na VPS via `rsync` assim que fica pronto; os downloads saem da VPS em vez do upload doméstico.
- **Busca instantânea do scanner** (`deploy/raspberry/config.local.js`): em vez de `scanimage -L` (~7 s, varre todos os drivers do SANE), detecta o Epson direto no USB (`/sys/bus/usb/devices`) e só renova o cache quando a porta USB muda — abrir o app leva ~35 ms e não conflita com uma digitalização em andamento.

## Desenvolvimento

```bash
npm install
echo "SCANSERV_URL=http://IP_DO_PI:8080" > .env.local   # scanservjs na rede local
npm run dev
```

Build de produção: `npm run build` (saída em `dist/`).

## Implantação

1. **Raspberry Pi** (com scanservjs instalado):
   - `sudo cp deploy/raspberry/config.local.js /etc/scanservjs/ && sudo systemctl restart scanservjs`
   - Gere as chaves: `ssh-keygen -t ed25519 -f ~/.ssh/pi_tunnel -N ""` e `ssh-keygen -t ed25519 -f ~/.ssh/pi_sync -N ""`
   - Copie `pi-tunnel.service` e `scanner-sync.service` para `~/.config/systemd/user/` (troque `SEU_SERVIDOR`), `scanner-sync.sh` para `~/bin/`, crie `~/.config/scanner-sync.env` com `SYNC_DEST=scansync@SEU_SERVIDOR:/`
   - `loginctl enable-linger $USER && systemctl --user enable --now pi-tunnel scanner-sync`
2. **VPS** (Ubuntu + Caddy):
   - `sudo bash deploy/servidor/setup-users.sh "$(cat pi_tunnel.pub)" "$(cat pi_sync.pub)"`
   - Adicione o bloco de `deploy/servidor/Caddyfile.example` ao Caddyfile (com seu domínio e uma chave aleatória) e recarregue o Caddy
   - Copie o `dist/` para `/srv/scanner-app`

> Dica: se o scanservjs for instalado por `apt`, use `sudo apt-mark hold scanservjs` para evitar que uma atualização mude a API.

## Licença

[MIT](LICENSE)
