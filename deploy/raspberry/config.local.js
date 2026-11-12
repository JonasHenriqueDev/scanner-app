// /etc/scanservjs/config.local.js
// Busca rapida do scanner: em vez de "scanimage -L" (~7 s, varre todos os
// drivers do SANE), le o USB direto em /sys e monta o ID do epson2
// (epson2:libusb:BBB:DDD). So cai no "scanimage -L" se nao achar Epson no USB.
const fs = require('fs');
const path = require('path');

const USB = '/sys/bus/usb/devices';
const EPSON_VENDOR = '04b8';

function ler(dir, nome) {
  try {
    return fs.readFileSync(path.join(dir, nome), 'utf8').trim();
  } catch (e) {
    return null;
  }
}

function epsonIds() {
  let entradas = [];
  try {
    entradas = fs.readdirSync(USB);
  } catch (e) {
    return [];
  }
  const ids = [];
  for (const nome of entradas) {
    const dir = path.join(USB, nome);
    if (ler(dir, 'idVendor') !== EPSON_VENDOR) continue;
    const bus = ler(dir, 'busnum');
    const dev = ler(dir, 'devnum');
    if (!bus || !dev) continue;
    const pad = (n) => String(n).padStart(3, '0');
    ids.push(`epson2:libusb:${pad(bus)}:${pad(dev)}`);
  }
  return ids;
}

/**
 * Apaga o cache (devices.json) so quando o scanner mudou de porta USB ou foi
 * desconectado. Sem mudanca, a pagina abre na hora, sem rodar scanimage, e nao
 * conflita com uma digitalizacao em andamento ("Device busy").
 */
function validarCache(arquivo) {
  try {
    if (!fs.existsSync(arquivo)) return;
    const conteudo = fs.readFileSync(arquivo, 'utf8');
    const ids = epsonIds();
    const desatualizado = ids.length > 0
      ? !ids.every((id) => conteudo.includes(id))
      : conteudo.includes('epson2:');
    if (desatualizado) fs.unlinkSync(arquivo);
  } catch (e) {
    /* sem permissao/corrida: segue com o que houver */
  }
}

module.exports = {
  afterConfig(config) {
    const caminho = config.devicesPath;
    // scanservjs le config.devicesPath toda vez que precisa da lista
    Object.defineProperty(config, 'devicesPath', {
      get: () => {
        validarCache(caminho);
        return caminho;
      },
      set: () => {},
      enumerable: true,
      configurable: true
    });
    Object.defineProperty(config, 'devices', {
      get: () => epsonIds(),
      set: () => {},
      enumerable: true,
      configurable: true
    });
    // So o Epson USB: nao varre rede/outros drivers (scanimage -L leva ~7 s).
    Object.defineProperty(config, 'devicesFind', {
      get: () => false,
      set: () => {},
      enumerable: true,
      configurable: true
    });
  }
};
