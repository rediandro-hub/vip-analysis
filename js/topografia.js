/* VIP ANALYSIS — topografia calculada no navegador a partir do modelo de elevação (Mapzen/AWS Terrain Tiles, formato Terrarium):
   curvas de nível com cota, relevo sombreado e declividade em classes (%). E a cota de um ponto
   (Copernicus DEM GLO-90 via Open-Meteo; se não responder, o próprio Terrain Tiles). Valores estimados, não substituem topografia de campo. */
'use strict';

(function () {
  const VA = window.VA;
  const URL_DEM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/';
  const cache = new Map();

  function dem(z, x, y) {
    const n = 2 ** z; x = ((x % n) + n) % n; y = Math.max(0, Math.min(n - 1, y));
    const k = z + '/' + x + '/' + y;
    if (cache.has(k)) return cache.get(k);
    const p = new Promise((ok, falha) => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      const t = setTimeout(() => { img.src = ''; falha(new Error('tempo esgotado')); }, 15000);
      img.onload = () => {
        clearTimeout(t);
        try {
          const c = document.createElement('canvas'); c.width = c.height = 256;
          const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
          const d = ctx.getImageData(0, 0, 256, 256).data, h = new Float32Array(65536);
          for (let i = 0; i < 65536; i++) h[i] = d[4 * i + 3] ? d[4 * i] * 256 + d[4 * i + 1] + d[4 * i + 2] / 256 - 32768 : NaN;
          ok(h);
        } catch (e) { falha(e); }
      };
      img.onerror = () => { clearTimeout(t); falha(new Error('modelo de elevação indisponível')); };
      img.src = URL_DEM + k + '.png';
    });
    cache.set(k, p); p.catch(() => cache.delete(k));
    while (cache.size > 120) cache.delete(cache.keys().next().value);
    return p;
  }

  const T = VA.topo = { intervalo: VA.armazem.ler('topoIntervalo', 20), opacidade: VA.armazem.ler('topoOpacidade', 0.7), pendentes: 0, falhas: 0, camadas: {}, ouvinte: null };
  const avisar = () => { if (T.ouvinte) T.ouvinte(); };

  const Terreno = L.GridLayer.extend({
    createTile(c, pronto) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 256;
      T.pendentes++; avisar();
      Promise.all([dem(c.z, c.x, c.y), dem(c.z, c.x + 1, c.y), dem(c.z, c.x, c.y + 1), dem(c.z, c.x + 1, c.y + 1)]).then(d => {
        const h = (x, y) => d[(y >= 256 ? 2 : 0) + (x >= 256 ? 1 : 0)][(y % 256) * 256 + (x % 256)];
        const ctx = cv.getContext('2d');
        if (this.options.tipo === 'curvas') curvas(ctx, h, T.intervalo); else relevo(ctx, h, c, this.options.tipo);
        pronto(null, cv);
      }).catch(e => { T.falhas++; pronto(e, cv); }).finally(() => { T.pendentes--; avisar(); });
      return cv;
    }
  });

  function curvas(ctx, h, iv) {
    const seg = [], rot = [];
    for (let y = 0; y < 256; y += 2) for (let x = 0; x < 256; x += 2) {
      const v = [h(x, y), h(x + 2, y), h(x + 2, y + 2), h(x, y + 2)];
      if (!v.every(Number.isFinite)) continue;
      const lo = Math.min(...v), hi = Math.max(...v), p = [[x, y], [x + 2, y], [x + 2, y + 2], [x, y + 2]];
      for (let nv = Math.ceil(lo / iv) * iv; nv < hi; nv += iv) {
        const cr = [];
        for (let k = 0; k < 4; k++) {
          const j = (k + 1) % 4, a = v[k], b = v[j];
          if ((a <= nv && b > nv) || (b <= nv && a > nv)) { const t = (nv - a) / (b - a); cr.push([p[k][0] + t * (p[j][0] - p[k][0]), p[k][1] + t * (p[j][1] - p[k][1])]); }
        }
        if (cr.length === 4 && v.reduce((s, z) => s + z, 0) / 4 > nv) cr.push(cr.shift());
        for (let i = 0; i + 1 < cr.length; i += 2) seg.push([cr[i], cr[i + 1]]);
        if (cr.length && x > 30 && x < 226 && y > 24 && y < 232 && !rot.some(r => r[2] === nv || Math.hypot(r[0] - x, r[1] - y) < 60)) rot.push([x, y, nv]);
      }
    }
    const tracar = () => { ctx.beginPath(); seg.forEach(([a, b]) => { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }); ctx.stroke(); };
    ctx.strokeStyle = 'rgba(255,248,214,.9)'; ctx.lineWidth = 2.4; tracar();
    ctx.strokeStyle = '#7a4a14'; ctx.lineWidth = 0.9; tracar();
    ctx.font = 'bold 11px Inter, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3;
    rot.slice(0, 10).forEach(([x, y, nv]) => { ctx.strokeStyle = '#fff'; ctx.strokeText(nv + ' m', x, y); ctx.fillStyle = '#5c3209'; ctx.fillText(nv + ' m', x, y); });
  }

  const CLASSES = [[3, [40, 124, 80]], [8, [128, 179, 91]], [20, [209, 181, 50]], [45, [223, 135, 57]], [75, [201, 83, 72]], [Infinity, [124, 60, 120]]];
  T.CLASSES = [['0–3%', 'plano'], ['3–8%', 'suave ondulado'], ['8–20%', 'ondulado'], ['20–45%', 'forte ondulado'], ['45–75%', 'montanhoso'], ['≥ 75%', 'escarpado']].map((r, i) => r.concat(['rgb(' + CLASSES[i][1].join(',') + ')']));
  function relevo(ctx, h, c, tipo) {
    const out = ctx.createImageData(256, 256);
    for (let y = 0; y < 256; y++) {
      const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (c.y + (y + 0.5) / 256) / 2 ** c.z)));
      const m = 40075016.686 * Math.cos(lat) / (256 * 2 ** c.z);
      for (let x = 0; x < 256; x++) {
        const xl = Math.max(0, x - 1), yt = Math.max(0, y - 1);
        const gx = (h(x + 1, y) - h(xl, y)) / ((x + 1 - xl) * m), gy = (h(x, y + 1) - h(x, yt)) / ((y + 1 - yt) * m);
        const dec = Math.hypot(gx, gy); if (!Number.isFinite(dec)) continue;
        const i = 4 * (y * 256 + x);
        if (tipo === 'declividade') { const pct = dec * 100; const cor = CLASSES.find(k => pct < k[0])[1]; out.data.set([cor[0], cor[1], cor[2], 190], i); }
        else { const luz = Math.max(0, (gx * 0.5 + gy * 0.5 + 0.7071) / Math.sqrt(gx * gx + gy * gy + 1)); const v = Math.round(255 * luz); out.data.set([v, v, v, 170], i); }
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  const OPC = { pane: 'camadas', tileSize: 256, minZoom: 10, maxNativeZoom: 14, maxZoom: 21, updateWhenIdle: true, keepBuffer: 1, attribution: 'Relevo: Mapzen Terrain Tiles / USGS e outras fontes (AWS Open Data)' };
  T.ligar = function (tipo, on) {
    const map = VA.mapa.L;
    if (on) {
      T.falhas = 0;
      if (!T.camadas[tipo]) T.camadas[tipo] = new Terreno(Object.assign({}, OPC, { tipo, opacity: T.opacidade, zIndex: tipo === 'curvas' ? 450 : tipo === 'declividade' ? 412 : 410 }));
      T.camadas[tipo].addTo(map);
    } else if (T.camadas[tipo]) map.removeLayer(T.camadas[tipo]);
    avisar();
  };
  T.definirIntervalo = function (v) { T.intervalo = +v || 20; VA.armazem.gravar('topoIntervalo', T.intervalo); if (T.camadas.curvas) T.camadas.curvas.redraw(); };
  T.definirOpacidade = function (v) { T.opacidade = +v; VA.armazem.gravar('topoOpacidade', T.opacidade); Object.values(T.camadas).forEach(l => l.setOpacity(T.opacidade)); };
  T.ativas = () => Object.entries(T.camadas).filter(([, l]) => VA.mapa.L.hasLayer(l)).map(([k]) => k);
  T.situacao = function () {
    const map = VA.mapa.L, at = T.ativas();
    if (!at.length) return 'Ligue uma das opções e aproxime o mapa (zoom 10 ou mais).';
    if (map.getZoom() < 10) return 'Aproxime até o zoom 10 para calcular o relevo.';
    if (T.pendentes) return 'Calculando o relevo…';
    if (T.falhas) return 'Alguns trechos não carregaram; desligue e ligue de novo.';
    return 'Topografia ativa — valores estimados do modelo de elevação.';
  };

  /* ---------- cota de um ponto ---------- */
  const cacheCota = new Map();
  async function cotaTerrarium(lon, lat) {
    const z = 14, n = 2 ** z, xf = (lon + 180) / 360 * n, s = Math.sin(lat * Math.PI / 180), yf = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
    const x = Math.floor(xf), y = Math.floor(yf), h = await dem(z, x, y);
    const v = h[Math.min(255, Math.floor((yf - y) * 256)) * 256 + Math.min(255, Math.floor((xf - x) * 256))];
    if (!Number.isFinite(v)) throw new Error('sem cota no modelo');
    return { m: v, fonte: 'Mapzen Terrain Tiles (AWS) — ~30 m', resolucao: 30 };
  }
  VA.cota = async function (lon, lat) {
    const k = lon.toFixed(5) + ',' + lat.toFixed(5);
    if (cacheCota.has(k)) return cacheCota.get(k);
    let r = null;
    try {
      const j = await VA.Net.json(`https://api.open-meteo.com/v1/elevation?latitude=${lat.toFixed(6)}&longitude=${lon.toFixed(6)}`, { timeout: 12000 });
      const m = j && j.elevation && j.elevation[0];
      if (typeof m === 'number' && Number.isFinite(m)) r = { m, fonte: 'Copernicus DEM GLO-90 (2021) via Open-Meteo — 90 m', resolucao: 90 };
    } catch (e) { /* tenta o Terrain Tiles */ }
    if (!r) r = await cotaTerrarium(lon, lat);
    r.consultadoEm = new Date().toISOString();
    cacheCota.set(k, r);
    return r;
  };
})();
