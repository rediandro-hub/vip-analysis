/* VIP ANALYSIS — mapa: bases, camadas do catálogo, ficha do ponto (clique), régua, área de interesse e resultados. */
'use strict';

(function () {
  const VA = window.VA;
  const esc = s => VA.fmt.esc(s);
  const M = VA.mapa = { modo: null, ativas: {}, uf: VA.armazem.ler('uf', 'PB'), filtrarUF: VA.armazem.ler('filtrarUF', true), avisos: {} };

  /* ---------------- camada dinâmica ArcGIS (uma imagem por enquadramento) ---------------- */
  const AgsDynamic = L.Layer.extend({
    initialize(url, opt) { this.url = url; L.setOptions(this, Object.assign({ opacity: 0.8, image: false, layers: null, layerDefs: null, minZoom: 0, attribution: '', aoErro: null, aoCarregar: null, pane: 'camadas' }, opt)); },
    onAdd(map) { this._map = map; map.on('moveend', this._atualizar, this); this._atualizar(); },
    onRemove(map) { map.off('moveend', this._atualizar, this); if (this._ov) map.removeLayer(this._ov); this._ov = null; },
    setOpacity(o) { this.options.opacity = o; if (this._ov) this._ov.setOpacity(o); },
    getAttribution() { return this.options.attribution; },
    redesenhar() { this._atualizar(); },
    _atualizar() {
      const map = this._map; if (!map) return;
      if (map.getZoom() < this.options.minZoom) { if (this._ov) { map.removeLayer(this._ov); this._ov = null; } return; }
      const b = map.getBounds(), s = map.getSize();
      const sw = L.CRS.EPSG3857.project(b.getSouthWest()), ne = L.CRS.EPSG3857.project(b.getNorthEast());
      const bbox = [sw.x, sw.y, ne.x, ne.y].map(v => v.toFixed(1)).join(',');
      const p = this.options.image
        ? { f: 'image', bbox, bboxSR: 3857, imageSR: 3857, size: `${s.x},${s.y}`, format: 'png', interpolation: 'RSP_BilinearInterpolation' }
        : { f: 'image', bbox, bboxSR: 3857, imageSR: 3857, size: `${s.x},${s.y}`, format: 'png32', transparent: 'true', dpi: 96 };
      if (!this.options.image && this.options.layers) p.layers = this.options.layers;
      if (!this.options.image && this.options.layerDefs) p.layerDefs = JSON.stringify(this.options.layerDefs);
      const url = this.url + (this.options.image ? '/exportImage?' : '/export?') + new URLSearchParams(p).toString();
      const ov = L.imageOverlay(url, b, { opacity: this.options.opacity, interactive: false, zIndex: 5, pane: this.options.pane });
      const old = this._ov;
      ov.once('load', () => { if (old && map.hasLayer(old)) map.removeLayer(old); if (this.options.aoCarregar) this.options.aoCarregar(); });
      ov.once('error', () => { if (old && map.hasLayer(old)) map.removeLayer(old); if (this.options.aoErro) this.options.aoErro(); });
      ov.addTo(map);
      this._ov = ov;
    }
  });

  /* ---------------- camada OpenStreetMap (Overpass) — redes elétricas ---------------- */
  VA.osm = {
    servidores: ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'],
    cache: {},
    async rede(bbox) {
      const b = [bbox[1], bbox[0], bbox[3], bbox[2]].map(v => v.toFixed(4)).join(',');
      if (this.cache[b]) return this.cache[b];
      const q = `[out:json][timeout:40];(way["power"~"^(line|minor_line|cable)$"](${b});way["power"="substation"](${b});node["power"="substation"](${b}););out geom tags;`;
      let ultimo;
      for (const s of this.servidores) {
        try {
          const j = await VA.Net.json(s + '?data=' + encodeURIComponent(q), { timeout: 50000 });
          const fc = { type: 'FeatureCollection', features: [] };
          (j.elements || []).forEach(e => {
            const t = e.tags || {};
            let geometry = null;
            if (e.type === 'node') geometry = { type: 'Point', coordinates: [e.lon, e.lat] };
            else if (e.geometry) {
              const c = e.geometry.map(p => [p.lon, p.lat]);
              geometry = t.power === 'substation' && c.length > 3 && c[0][0] === c[c.length - 1][0] ? { type: 'Polygon', coordinates: [c] } : { type: 'LineString', coordinates: c };
            }
            if (geometry) fc.features.push({ type: 'Feature', properties: Object.assign({ osm_id: e.type + '/' + e.id }, t), geometry });
          });
          fc._url = s + '?data=' + encodeURIComponent(q);
          this.cache[b] = fc;
          return fc;
        } catch (e) { ultimo = e; }
      }
      throw ultimo;
    },
    classe(p) {
      if (p.power === 'substation') return 'subestação';
      const v = Math.max(...String(p.voltage || '').split(/[;,]/).map(x => +x || 0));
      if (p.power === 'line' && (v >= 69000 || !v)) return v ? `alta tensão (${Math.round(v / 1000)} kV)` : 'linha (tensão não informada)';
      if (v >= 1000 || p.power === 'minor_line' || p.power === 'line') return v ? `média tensão (${(v / 1000).toLocaleString('pt-BR')} kV)` : 'distribuição (tensão não informada)';
      return v ? `baixa tensão (${v} V)` : 'rede';
    }
  };
  const CamadaOSM = L.LayerGroup.extend({
    onAdd(map) { L.LayerGroup.prototype.onAdd.call(this, map); this._m = map; map.on('moveend', this._agendar, this); this._agendar(); },
    onRemove(map) { map.off('moveend', this._agendar, this); L.LayerGroup.prototype.onRemove.call(this, map); },
    setOpacity() { },
    _agendar() { clearTimeout(this._t); this._t = setTimeout(() => this._carregar(), 900); },
    async _carregar() {
      const map = this._m; if (!map) return;
      if (map.getZoom() < 12) { this.clearLayers(); M.aviso('osm_rede', 'aproxime o mapa (zoom 12+) para ver a rede'); return; }
      const b = map.getBounds();
      try {
        const fc = await VA.osm.rede([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
        this.clearLayers();
        L.geoJSON(fc, {
          pane: 'camadas',
          style: f => { const c = VA.osm.classe(f.properties); return { color: /alta/.test(c) ? '#d62828' : /média/.test(c) ? '#f77f00' : /sub/.test(c) ? '#6a4c93' : '#999', weight: /alta/.test(c) ? 3 : 2, opacity: 0.9 }; },
          pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 6, color: '#6a4c93', fillOpacity: 0.8, pane: 'camadas' }),
          onEachFeature: (f, l) => l.bindTooltip(`${VA.osm.classe(f.properties)}${f.properties.operator ? ' · ' + esc(f.properties.operator) : ''}${f.properties.name ? ' · ' + esc(f.properties.name) : ''}`, { sticky: true })
        }).addTo(this);
        M.aviso('osm_rede', null);
      } catch (e) { M.aviso('osm_rede', e.message); }
    }
  });

  /* ---------------- camada de base local (SIGEF/SNCI por UF e BDGD no servidor local) ---------------- */
  const CamadaLocal = L.LayerGroup.extend({
    initialize(id, opt) { L.LayerGroup.prototype.initialize.call(this); this.id = id; this.opt = opt || {}; this.fonte = this.opt.fonte || id; this._n = 0; },
    onAdd(map) { L.LayerGroup.prototype.onAdd.call(this, map); this._m = map; map.on('moveend', this._agendar, this); this._agendar(); },
    onRemove(map) { map.off('moveend', this._agendar, this); L.LayerGroup.prototype.onRemove.call(this, map); },
    setOpacity() { },
    _agendar() { clearTimeout(this._t); this._t = setTimeout(() => this._carregar(), 500); },
    async _carregar() {
      const map = this._m; if (!map) return;
      const id = this.id, bd = this.opt.bdgd, zMin = this.opt.minZoom || 11;
      if (!VA.Net.proxy.ok) { this.clearLayers(); M.aviso(id, 'precisa do servidor local (iniciar.bat)'); return; }
      if (map.getZoom() < zMin) { this.clearLayers(); M.aviso(id, `aproxime o mapa (zoom ${zMin}+)`); return; }
      const b = map.getBounds(), n = ++this._n;
      try {
        const tol = (b.getEast() - b.getWest()) / map.getSize().x;
        const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
        let fc = bd ? await VA.bdgd.consultar(bd, bbox, 4000, tol) : await VA.bases.consultar(this.fonte, M.uf, bbox, 1500, tol);
        if (n !== this._n) return;
        if (VA.filtros && VA.filtros.ativo(id)) fc = Object.assign({}, fc, { features: fc.features.filter(f => VA.filtros.passa(id, f.properties)) });
        this.clearLayers();
        const r = this._r || (this._r = L.canvas({ padding: 0.3, pane: 'camadas' }));
        const c = VA.camada(id), clique = (f, l, titulo) => { l.options.bubblingMouseEvents = false; l.on('click', e => { L.DomEvent.stopPropagation(e); if (!M.modo) M.fichaFeicao(c, f.properties, e.latlng, titulo); }); };
        if (bd) L.geoJSON(fc, { renderer: r, style: VA.bdgd.estilo(bd), pointToLayer: (f, ll) => L.circleMarker(ll, { renderer: r, radius: 3.5, color: '#7a4a00', weight: 1, fillColor: '#ffc107', fillOpacity: 0.95 }), onEachFeature: (f, l) => { const t = VA.bdgd.rotulo(f.properties, bd); l.bindTooltip(esc(t), { sticky: true }); clique(f, l, t); } }).addTo(this);
        else L.geoJSON(fc, { renderer: r, style: { color: this.fonte === 'sigef' ? '#1d4ed8' : '#7c3aed', weight: 1.2, fillOpacity: 0.06 }, onEachFeature: (f, l) => { const t = VA.attr(f.properties, ['nome_area', 'denominacao', 'nome_imove', 'parcela_co']) || 'parcela'; l.bindTooltip(esc(t), { sticky: true }); clique(f, l, t); } }).addTo(this);
        M.aviso(id, fc._aviso || null);
      } catch (e) { if (n === this._n) { this.clearLayers(); M.aviso(id, e.message); } }
    }
  });

  /* ---------------- inicialização ---------------- */
  M.init = function () {
    const map = M.L = L.map('mapa', { zoomControl: true, worldCopyJump: true, preferCanvas: false, doubleClickZoom: true }).setView([-7.075, -36.85], 12);
    /* painel próprio das camadas do catálogo: fica entre o mapa-base e a área/resultados e pode ser recortado pelo estado */
    map.createPane('camadas').style.zIndex = 350;
    map.on('zoomanim', e => recortar(e));
    map.on('zoomend viewreset', () => recortar());
    M.atualizarRecorte();
    L.control.scale({ imperial: false, position: 'bottomright', maxWidth: 160 }).addTo(map);
    M.resultados = L.layerGroup().addTo(map);
    M.medidas = L.layerGroup().addTo(map);
    M.basePronta = M.setBase(VA.armazem.ler('base', 'esri_sat'), true).then(ok => ok || M.setBase('esri_sat', true));
    const salvas = VA.armazem.ler('camadas', null) || VA.CATALOGO.filter(c => c.padrao).map(c => c.id);
    salvas.forEach(id => { if (VA.camada(id)) M.ligar(id, true, true); });
    map.on('click', e => { if (M.modo) return; M.ficha(e.latlng); });
    map.on('mousemove', e => { if (M.aoMover) M.aoMover(e.latlng); });
    map.pm.setLang('pt_br');
  };

  /* ---------------- mapas-base ---------------- */
  M.setBase = async function (id, silencioso) {
    const def = VA.BASES.find(b => b.id === id) || VA.BASES[0];
    let camada;
    if (def.google) {
      try { camada = await VA.google.camada(def); }
      catch (e) {
        if (e.teto) { if (!silencioso && VA.app) VA.app.aviso(e.message, true, 9000); return false; }
        if (!silencioso) VA.app && VA.app.pedirChaveGoogle(def.id, e.semChave ? null : e.message); return false;
      }
    } else {
      const t = L.tileLayer(def.url, { maxZoom: 21, maxNativeZoom: def.max, subdomains: 'abc', attribution: def.attr, detectRetina: false });
      let errosBase = 0; t.on('tileerror', () => { if (++errosBase === 6 && VA.app && VA.app.aviso) VA.app.aviso('Este mapa-base não carregou em parte da região. Experimente outro em Camadas › Mapa-base.', true); });
      if (def.esriAuto) esriAuto(t, def.esriAuto, def.max);
      camada = L.layerGroup([t]);
      if (def.rotulos) camada.addLayer(L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 21, maxNativeZoom: 19, opacity: 0.9 }));
    }
    if (M.base) M.L.removeLayer(M.base);
    M.base = camada; M.baseId = def.id;
    camada.addTo(M.L);
    if (camada.bringToBack) camada.bringToBack(); else camada.eachLayer && camada.eachLayer(l => l.bringToBack && l.bringToBack());
    VA.armazem.gravar('base', def.id);
    return true;
  };

  /* Esri World Imagery: onde não há imagem no zoom pedido o Esri devolve um bloco cinza "Map data not yet available".
     Antes de cada vista, consulta o mapa de blocos do serviço (tilemap) e usa o zoom mais detalhado que existe para
     toda a área visível; acima dele, o Leaflet amplia essa imagem em vez de mostrar o cinza. */
  function esriAuto(t, servico, maxPadrao) {
    const cache = new Map(); let n = 0, timer = null;
    const avaliar = async () => {
      const map = t._map; if (!map) return;
      const z = Math.round(map.getZoom()), id = ++n;
      let alvo = maxPadrao;
      // true = todos os blocos da vista existem no nível zz; null = não deu para saber
      const existe = async (zz) => {
        const pb = map.getPixelBounds(), f = Math.pow(2, zz - z);
        const x0 = Math.floor(pb.min.x * f / 256), x1 = Math.floor((pb.max.x - 1) * f / 256), y0 = Math.floor(pb.min.y * f / 256), y1 = Math.floor((pb.max.y - 1) * f / 256);
        const w = Math.min(32, x1 - x0 + 1), h = Math.min(32, y1 - y0 + 1), k = `${zz}/${y0}/${x0}/${w}/${h}`;
        let j = cache.get(k);
        if (!j) {
          try { j = await fetch(`${servico}/tilemap/${k}`).then(r => r.json()); } catch (e) { return null; }
          cache.set(k, j); if (cache.size > 400) cache.delete(cache.keys().next().value);
        }
        if (!j || !j.valid || !Array.isArray(j.data)) return null;
        const lc = j.location || { left: x0, top: y0, width: w, height: h };
        for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (j.data[(y - lc.top) * lc.width + (x - lc.left)] !== 1) return false;
        return true;
      };
      if (z >= 15) {
        alvo = null;
        for (let zz = Math.min(z, maxPadrao); zz >= Math.max(12, z - 7) && alvo == null; zz--) {
          const r = await existe(zz); if (id !== n) return;
          if (r === null) return;
          if (r) alvo = zz;
        }
        if (alvo == null) alvo = maxPadrao;
        // há imagem no nível atual: já libera o próximo, se existir, para aproximar sem borrão
        if (alvo === z && z < maxPadrao) { const r = await existe(z + 1); if (id !== n) return; if (r) alvo = z + 1; }
      }
      if (t.options.maxNativeZoom !== alvo) { t.options.maxNativeZoom = alvo; t.redraw(); }
    };
    const agendar = () => { clearTimeout(timer); timer = setTimeout(avaliar, 120); };
    t.on('add', () => { t._map.on('moveend', agendar); agendar(); });
    t.on('remove', () => { if (M.L) M.L.off('moveend', agendar); clearTimeout(timer); });
  }

  /* Google Map Tiles API (mesma abordagem da Bateia: chave do próprio usuário) */
  /* Teto de uso: a cota grátis da Map Tiles API (2D) é de 100.000 blocos por mês. A plataforma conta cada bloco
     pedido neste navegador e, ao atingir o teto mensal ou o diário, para de usar o Google e volta para o Esri. */
  const hoje = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  VA.google = {
    PADRAO: { mensal: 90000, diario: 6000 },
    chave() { return String(VA.armazem.ler('googleKey', '') || '').trim(); },
    definirChave(k) { VA.armazem.gravar('googleKey', (k || '').trim()); VA.armazem.gravar('googleSess', {}); },
    tetos() { return Object.assign({}, this.PADRAO, VA.armazem.ler('googleTeto', {}) || {}); },
    definirTetos(t) { VA.armazem.gravar('googleTeto', { mensal: Math.max(0, Math.round(+t.mensal || 0)), diario: Math.max(0, Math.round(+t.diario || 0)) }); this._avisar(); },
    uso() {
      const u = VA.armazem.ler('googleUso', {}) || {}, d = hoje(), m = d.slice(0, 7);
      return { dia: d, mes: m, nDia: u.dia === d ? u.nDia || 0 : 0, nMes: u.mes === m ? u.nMes || 0 : 0 };
    },
    excedido() {
      const u = this.uso(), t = this.tetos();
      if (t.mensal && u.nMes >= t.mensal) return `Teto mensal do Google atingido (${VA.fmt.num(u.nMes, 0)} de ${VA.fmt.num(t.mensal, 0)} blocos em ${u.mes}). O mapa volta para o Esri até o mês que vem — ou aumente o teto em Camadas › Mapa-base.`;
      if (t.diario && u.nDia >= t.diario) return `Teto diário do Google atingido (${VA.fmt.num(u.nDia, 0)} de ${VA.fmt.num(t.diario, 0)} blocos hoje). O mapa volta para o Esri até amanhã — ou aumente o teto em Camadas › Mapa-base.`;
      return null;
    },
    _pend: 0, _t: null,
    contar() {  // registra um bloco; false = teto atingido (o bloco não é pedido)
      const u = this.uso(), t = this.tetos();
      if ((t.mensal && u.nMes + this._pend >= t.mensal) || (t.diario && u.nDia + this._pend >= t.diario)) return false;
      this._pend++;
      if (!this._t) this._t = setTimeout(() => this._gravar(), 1500);
      return true;
    },
    _gravar() {
      this._t = null; if (!this._pend) return;
      const u = this.uso();
      VA.armazem.gravar('googleUso', { dia: u.dia, nDia: u.nDia + this._pend, mes: u.mes, nMes: u.nMes + this._pend });
      this._pend = 0; this._avisar();
    },
    ouvinte: null, _avisar() { if (this.ouvinte) this.ouvinte(); },
    async sessao(def) {
      const key = this.chave();
      if (!key) { const e = new Error('falta a chave'); e.semChave = true; throw e; }
      const todas = VA.armazem.ler('googleSess', {}) || {};
      let s = todas[def.id];
      if (!s || s.k !== key.slice(-6) || +s.expiry * 1000 < Date.now() + 3600e3) {
        const corpo = Object.assign({ language: 'pt-BR', region: 'BR' }, def.google);
        const r = await fetch('https://tile.googleapis.com/v1/createSession?key=' + encodeURIComponent(key), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j || !j.session) {
          const m = (j && j.error && j.error.message) || ('erro ' + r.status);
          throw new Error(/API key not valid/i.test(m) ? 'a chave não é válida' : /not enabled|disabled|has not been used/i.test(m) ? 'a Map Tiles API não está ativada no projeto' : /billing/i.test(m) ? 'faturamento do Google Cloud inativo' : /referer|blocked/i.test(m) ? 'a chave está restrita a outro endereço' : m);
        }
        s = { session: j.session, expiry: j.expiry, k: key.slice(-6) };
        todas[def.id] = s; VA.armazem.gravar('googleSess', todas);
      }
      return s;
    },
    async camada(def) {
      const ex = this.excedido(); if (ex) { const e = new Error(ex); e.teto = true; throw e; }
      const s = await this.sessao(def);
      const G = this, VAZIO = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
      let parado = false;
      // cada bloco passa pela contagem antes de ser pedido: acima do teto, nada é pedido ao Google
      const Camada = L.TileLayer.extend({
        getTileUrl(coords) {
          if (G.contar()) return L.TileLayer.prototype.getTileUrl.call(this, coords);
          if (!parado) {
            parado = true; G._gravar();
            setTimeout(async () => { await M.setBase('esri_sat', true); if (VA.app) { VA.app.aviso(G.excedido() || 'Teto do Google atingido.', true, 10000); VA.app.baseMudou && VA.app.baseMudou(); } }, 0);
          }
          return VAZIO;
        }
      });
      const t = new Camada(`https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${encodeURIComponent(s.session)}&key=${encodeURIComponent(this.chave())}`, { maxZoom: 21, maxNativeZoom: 20, attribution: 'Google Maps' });
      window.addEventListener('beforeunload', () => this._gravar());
      return t;
    }
  };

  /* ---------------- camadas do catálogo ---------------- */
  M.avisos = {};
  M.aviso = function (id, msg) { M.avisos[id] = msg; if (VA.app && VA.app.atualizarAvisoCamada) VA.app.atualizarAvisoCamada(id, msg); };

  function criar(c) {
    const v = c.view; if (!v) return null;
    const uf = M.uf.toLowerCase();
    const op = VA.armazem.ler('op:' + c.id, v.tipo === 'img' ? 0.65 : 0.8);
    if (v.tipo === 'ags') {
      const opt = { layers: v.layers, opacity: op, minZoom: c.minZoom || 0, attribution: c.fonte, aoErro: () => M.aviso(c.id, 'o serviço não devolveu a imagem (fora do ar ou lento)'), aoCarregar: () => M.aviso(c.id, null) };
      const idDef = String(v.layers || '').replace('show:', '').split(',')[0];
      const defs = [c.ufCampo && M.filtrarUF ? `${c.ufCampo}='${M.uf}'` : '', VA.filtros ? VA.filtros.whereAgs(c) : ''].filter(Boolean);
      if (idDef !== '' && defs.length) opt.layerDefs = { [idDef]: defs.map(d => '(' + d + ')').join(' AND ') };
      return new AgsDynamic(v.url, opt);
    }
    if (v.tipo === 'img') return new AgsDynamic(v.url, { image: true, opacity: op, attribution: c.fonte, aoErro: () => M.aviso(c.id, 'o serviço não devolveu a imagem'), aoCarregar: () => M.aviso(c.id, null) });
    if (v.tipo === 'wms') {
      const opW = { layers: v.layers.replace('{uf}', uf), format: 'image/png', transparent: true, version: '1.1.1', opacity: op, maxZoom: 21, minZoom: c.minZoom || 0, attribution: c.fonte, tiled: true, pane: 'camadas' };
      const cql = VA.filtros && VA.filtros.cql(c); if (cql) opW.CQL_FILTER = cql;
      const t = L.tileLayer.wms(v.url, opW);
      let erros = 0; t.on('tileerror', () => { if (++erros === 4) M.aviso(c.id, 'o servidor de mapas não respondeu'); }); t.on('tileload', () => { if (erros) { erros = 0; M.aviso(c.id, null); } });
      return t;
    }
    if (v.tipo === 'xyz') return L.tileLayer(v.url, { maxZoom: 21, maxNativeZoom: v.maxNativeZoom || 19, opacity: op, attribution: c.fonte, pane: 'camadas' });
    if (v.tipo === 'overpass') return new CamadaOSM();
    if (v.tipo === 'local') return new CamadaLocal(c.id, { fonte: v.fonte, minZoom: c.minZoom });
    if (v.tipo === 'bdgd') return new CamadaLocal(c.id, { bdgd: v.camada, minZoom: c.minZoom || 12 });
    return null;
  }
  M.ligar = function (id, on, silencioso) {
    const c = VA.camada(id); if (!c) return;
    if (on && !M.ativas[id]) { const l = criar(c); if (!l) return; M.ativas[id] = l; l.addTo(M.L); if (M.resultados) M.resultados.eachLayer(x => x.bringToFront && x.bringToFront()); }
    else if (!on && M.ativas[id]) { M.L.removeLayer(M.ativas[id]); delete M.ativas[id]; M.aviso(id, null); }
    if (!silencioso) VA.armazem.gravar('camadas', Object.keys(M.ativas));
  };
  M.opacidade = function (id, v) { const l = M.ativas[id]; if (l && l.setOpacity) l.setOpacity(v); VA.armazem.gravar('op:' + id, v); };
  M.recriar = function (filtro) { Object.keys(M.ativas).forEach(id => { const c = VA.camada(id); if (!filtro || filtro(c)) { M.ligar(id, false, true); M.ligar(id, true, true); } }); };
  M.definirUF = function (uf) { if (!uf || uf === M.uf) return; M.uf = uf; VA.armazem.gravar('uf', uf); M.recriar(c => c.uf || c.ufCampo); M.atualizarRecorte(); if (VA.app && VA.app.ufMudou) VA.app.ufMudou(uf); };

  /* ---------------- “mostrar só este estado”: recorta todas as camadas no limite da UF ----------------
     As camadas com campo de UF já vêm filtradas do servidor (mais leves); as demais (WMS, imagens, bases locais,
     topografia) são recortadas no navegador com um clip-path no painel “camadas”, refeito a cada zoom. */
  const cacheLimite = {};
  M.limiteUF = function (uf) {
    if (!cacheLimite[uf]) cacheLimite[uf] = VA.ags.query(VA.URL.ANM + 'SIGMINE/estrutura_territorial/MapServer/1', { where: `SGEstado='${uf}'`, outFields: 'SGEstado', maxOffset: 0.003, max: 5 })
      .catch(e => { delete cacheLimite[uf]; throw e; });
    return cacheLimite[uf];
  };
  function recortar(ev) {
    const map = M.L, pane = map && map.getPane('camadas'); if (!pane) return;
    const fc = M.filtrarUF && M._limite && M._limite.uf === M.uf ? M._limite.fc : null;
    if (!fc || !fc.features.length) { pane.style.clipPath = ''; return; }
    const z = ev && ev.zoom != null ? ev.zoom : map.getZoom(), c = ev && ev.center;
    const proj = (lon, lat) => (c ? map._latLngToNewLayerPoint(L.latLng(lat, lon), z, c) : map.latLngToLayerPoint([lat, lon]));
    let d = '';
    fc.features.forEach(f => {
      const g = f.geometry || {}, polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      polys.forEach(p => p.forEach(anel => {
        let ult = null, seg = '';
        anel.forEach(([lon, lat], i) => {
          const pt = proj(lon, lat);
          if (ult && i < anel.length - 1 && Math.abs(pt.x - ult.x) < 1 && Math.abs(pt.y - ult.y) < 1) return;
          seg += (seg ? 'L' : 'M') + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1); ult = pt;
        });
        if (seg) d += seg + 'Z';
      }));
    });
    pane.style.clipPath = d ? `path(evenodd, '${d}')` : '';
  }
  M.atualizarRecorte = async function () {
    if (!M.filtrarUF) { recortar(); return; }
    const uf = M.uf;
    try { const fc = await M.limiteUF(uf); if (uf === M.uf) { M._limite = { uf, fc }; recortar(); } }
    catch (e) { M._limite = null; recortar(); if (VA.app && VA.app.aviso) VA.app.aviso('Não foi possível obter o limite do estado para recortar as camadas: ' + e.message, true); }
  };

  /* ---------------- consulta genérica de uma camada (ficha, análise) ---------------- */
  /* filtrar = aplica o filtro do operador (Filtros); a análise só filtra quando ele marca "também à análise" */
  VA.consultarCamada = async function (c, o = {}) {
    const filtrar = o.filtrar !== false && VA.filtros && VA.filtros.ativo(c.id);
    const fc = await consultaBruta(c, o, filtrar);
    if (filtrar) { fc.features = fc.features.filter(f => VA.filtros.passa(c.id, f.properties)); fc._filtro = VA.filtros.descricao(c.id); }
    return fc;
  };
  async function consultaBruta(c, { bbox, ponto, tolPx = 0, max = 500, maxOffset, returnGeometry = true } = {}, filtrar) {
    const q = c.q; if (!q) throw new Error('camada sem consulta');
    const uf = M.uf.toLowerCase();
    if (q.tipo === 'query') {
      const w = [c.ufCampo && M.filtrarUF && c.id !== 'anm_proc' ? `${c.ufCampo}='${M.uf}'` : '', filtrar ? VA.filtros.whereAgs(c) : ''].filter(Boolean).map(s => '(' + s + ')').join(' AND ') || '1=1';
      return VA.ags.query(q.url, { bbox, max, maxOffset, cors: c.cors, returnGeometry, where: w });
    }
    if (q.tipo === 'identify') {
      const g = bbox ? { xmin: bbox[0], ymin: bbox[1], xmax: bbox[2], ymax: bbox[3], spatialReference: { wkid: 4326 } } : null;
      return VA.ags.identify(q.url, { geom: g, tipo: 'esriGeometryEnvelope', bbox, layers: q.layers || 'all', tolerance: tolPx, returnGeometry, maxOffset, cors: c.cors });
    }
    if (q.tipo === 'wfs') return VA.wfs.obter(q.url, q.typeName.replace('{uf}', uf), bbox, { max, cors: c.cors });
    if (q.tipo === 'pans') {
      /* abrangência dos PANs: só os atributos (sem geometria), filtrados pela caixa da área no próprio servidor */
      const url = VA.wfs.montar(q.url, { service: 'WFS', version: '1.0.0', request: 'GetFeature', typeName: q.typeName, outputFormat: 'application/json', srsName: 'EPSG:4326', maxFeatures: String(Math.min(max, 200)), propertyName: q.campos, bbox: bbox.map(n => (+n).toFixed(6)).join(',') + ',EPSG:4326' });
      const j = JSON.parse(await VA.Net.texto(url, { cors: c.cors, timeout: 60000 }));
      if (j.type !== 'FeatureCollection') throw VA.Net._erro('servico', 'WFS sem resposta válida');
      j.features.forEach(f => { f.geometry = null; }); j._url = url;
      return j;
    }
    if (q.tipo === 'overpass') return VA.osm.rede(bbox);
    if (q.tipo === 'local') return VA.bases.consultar(q.fonte, M.uf, bbox, max);
    if (q.tipo === 'carponto') return VA.carPonto((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2);
    if (q.tipo === 'bdgd') return VA.bdgd.consultar(q.camada, bbox, max, tolPx ? (bbox[2] - bbox[0]) / 200 : 0);
    throw new Error('tipo de consulta desconhecido');
  }

  /* apelidos (alias) dos campos de camadas ArcGIS — mostram "Previsão de operação" em vez de "ano_prev" */
  const cacheAlias = {};
  VA.aliasesCamada = function (c) {
    const u = c.q && c.q.url; if (!u || c.q.tipo !== 'query') return Promise.resolve(null);
    if (!cacheAlias[u]) cacheAlias[u] = VA.Net.json(u + '?f=json', { cors: c.cors, timeout: 15000 }).then(j => { const m = {}; (j.fields || []).forEach(f => { if (f.alias && f.alias !== f.name) m[f.name] = f.alias; }); return m; }).catch(() => null);
    return cacheAlias[u];
  };

  /* CAR nacional: consulta oficial do SICAR por coordenada (o SICAR bloqueia o navegador: vai pelo servidor local) */
  const cacheCar = {};
  VA.carPonto = async function (lon, lat) {
    const k = lon.toFixed(5) + ',' + lat.toFixed(5);
    if (cacheCar[k]) return cacheCar[k];
    const url = `https://consulta.car.gov.br/api/totalizer/getDetailsByCoordinates?lat=${lat.toFixed(6)}&lng=${lon.toFixed(6)}`;
    const j = await VA.Net.json(url, { cors: 'proxy', timeout: 30000 });
    const fc = { type: 'FeatureCollection', features: [], _url: url };
    if (j && j.codeProperty) {
      let geometry = { type: 'Point', coordinates: [lon, lat] };
      const m = /POLYGON\s*\(\((.+)\)\)/i.exec(j.bounderBox || '');
      if (m) geometry = { type: 'Polygon', coordinates: [m[1].split(',').map(p => p.trim().split(/\s+/).map(Number))] };
      const props = Object.assign({}, j, { bounderBox: undefined, observacao: 'Caixa envolvente do imóvel informada pelo SICAR — não é o limite do imóvel.' });
      delete props.bounderBox;
      fc.features.push({ type: 'Feature', properties: props, geometry });
    }
    cacheCar[k] = fc;
    return fc;
  };

  /* ---------------- bases locais por UF (servidor) ---------------- */
  VA.bases = {
    async lista() { if (!VA.Net.proxy.ok) return []; const r = await fetch(VA.Net.proxy.base + 'api/bases', { cache: 'no-store' }); return (await r.json()).bases || []; },
    async consultar(fonte, uf, bbox, max = 500, tol = 0) {
      if (!VA.Net.proxy.ok) throw VA.Net._erro('servidor', 'a base ' + fonte.toUpperCase() + ' por UF fica no servidor local — abra pelo iniciar.bat');
      const u = VA.Net.proxy.base + `api/bases/consulta?fonte=${fonte}&uf=${uf.toLowerCase()}&bbox=${bbox.map(v => (+v).toFixed(6)).join(',')}&max=${max}${tol ? '&tol=' + tol.toFixed(8) : ''}`;
      const r = await fetch(u, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw VA.Net._erro(j.codigo === 'sem_base' ? 'sem_base' : 'servidor', j.erro || ('HTTP ' + r.status));
      j._url = 'servidor local: ' + fonte + ' ' + uf.toUpperCase();
      return j;
    },
    async baixar(fonte, uf) {
      const r = await fetch(VA.Net.proxy.base + `api/bases/baixar?fonte=${fonte}&uf=${uf.toLowerCase()}`, { method: 'POST' });
      const j = await r.json(); if (!r.ok) throw new Error(j.erro || 'falha'); return j;
    },
    async estado(fonte, uf) { const r = await fetch(VA.Net.proxy.base + `api/bases/estado?fonte=${fonte}&uf=${uf.toLowerCase()}`, { cache: 'no-store' }); return r.json(); },
    async importar(fonte, uf, arquivo) {
      const r = await fetch(VA.Net.proxy.base + `api/bases/importar?fonte=${fonte}&uf=${uf.toLowerCase()}`, { method: 'POST', body: arquivo });
      const j = await r.json(); if (!r.ok) throw new Error(j.erro || 'falha'); return j;
    }
  };

  /* ---------------- município pelo ponto ---------------- */
  const cacheMun = {};
  VA.municipioEm = async function (lon, lat) {
    const k = lon.toFixed(3) + ',' + lat.toFixed(3);
    if (cacheMun[k]) return cacheMun[k];
    let r = null;
    try {
      const fc = await VA.ags.query(VA.URL.ANM + 'SIGMINE/estrutura_territorial/MapServer/2', { ponto: [lon, lat], outFields: 'NMMunicipio,SGEstado,CDMunicipio', returnGeometry: false, max: 1 });
      const p = fc.features[0] && fc.features[0].properties;
      if (p) r = { municipio: p.NMMunicipio, uf: p.SGEstado, codigo: p.CDMunicipio, fonte: 'IBGE (malha municipal via ANM)' };
    } catch (e) { /* tenta o IBGE */ }
    if (!r) {
      try {
        const j = await VA.Net.json(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2&zoom=10&accept-language=pt-BR`, { timeout: 15000 });
        const a = j.address || {};
        const ufs = { 'Paraíba': 'PB', 'Pernambuco': 'PE', 'Bahia': 'BA', 'Ceará': 'CE', 'Rio Grande do Norte': 'RN', 'Piauí': 'PI', 'Alagoas': 'AL', 'Sergipe': 'SE', 'Maranhão': 'MA', 'Minas Gerais': 'MG' };
        r = { municipio: a.city || a.town || a.village || a.municipality, uf: (a['ISO3166-2-lvl4'] || '').replace('BR-', '') || ufs[a.state] || a.state, fonte: 'OpenStreetMap' };
      } catch (e) { r = null; }
    }
    if (r) cacheMun[k] = r;
    return r;
  };

  /* ---------------- ficha do ponto (clique no mapa) ---------------- */
  M.ficha = async function (ll) {
    const lon = ((ll.lng + 540) % 360) - 180, lat = ll.lat;
    const f = VA.coord.formatos(lon, lat);
    if (M._marcaFicha) M.L.removeLayer(M._marcaFicha);
    M._marcaFicha = L.circleMarker(ll, { radius: 7, color: '#1665d8', weight: 3, fillColor: '#fff', fillOpacity: 0.9 }).addTo(M.L);
    const painel = VA.app.abrirFicha(`<div class="ficha-coords">
        <div class="kv"><div class="k">Decimal</div><div class="v mono">${f.dec} <button class="mini copiar" data-copiar="${f.dec}">copiar</button></div>
        <div class="k">GMS</div><div class="v mono">${f.gms} <button class="mini copiar" data-copiar="${f.gms}">copiar</button></div>
        <div class="k">UTM</div><div class="v mono">${f.utm} <button class="mini copiar" data-copiar="${f.utm}">copiar</button></div>
        <div class="k"></div><div class="v pequeno">${f.utmDet}</div>
        <div class="k">Município</div><div class="v" id="fichaMun">consultando…</div>
        <div class="k">Cota</div><div class="v" id="fichaCota">consultando…</div>
        <div class="k">CAR</div><div class="v" id="fichaCar">${VA.Net.proxy.ok ? 'consultando o SICAR…' : '<span class="muted">consulta por ponto precisa do servidor local</span>'}</div></div>
        <div class="ficha-acoes">
          <button class="btn" data-acao="regua">Medir a partir daqui</button>
          <a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}">Google Maps</a>
          <a class="btn" target="_blank" rel="noopener" href="https://mapa.onr.org.br/" title="Registro de imóveis: abre o Mapa do ONR (exige cadastro gratuito)">Mapa do ONR</a>
        </div></div><div id="fichaCamadas"><div class="vazio-msg">Consultando as camadas ligadas…</div></div>`, { lon, lat, f });
    VA.municipioEm(lon, lat).then(m => { const el = document.getElementById('fichaMun'); if (el) el.textContent = m ? VA.fmt.munUF(m) : 'não identificado'; });
    VA.cota(lon, lat).then(c => { const el = document.getElementById('fichaCota'); if (el) el.innerHTML = `${VA.fmt.num(c.m, 0)} m <span class="muted">· estimada (${esc(c.fonte)})</span>`; }).catch(() => { const el = document.getElementById('fichaCota'); if (el) el.textContent = 'indisponível'; });
    if (VA.Net.proxy.ok) VA.carPonto(lon, lat).then(fc => {
      const el = document.getElementById('fichaCar'); if (!el) return;
      const p = fc.features[0] && fc.features[0].properties;
      el.innerHTML = p ? `<b class="mono">${esc(p.codeProperty)}</b> <button class="mini copiar" data-copiar="${esc(p.codeProperty)}">copiar</button><br><span class="pequeno">${esc(p.nameCity || '')}${p.idState ? '-' + esc(p.idState) : ''} · ${VA.fmt.num(+p.haRegisteredArea)} ha declarados · ${VA.fmt.num(+p.fiscalModules)} módulos fiscais · inscrito em ${esc(p.createdAt || '—')}</span>` : '<span class="muted">nenhum imóvel do CAR neste ponto</span>';
      if (p && fc.features[0].geometry.type === 'Polygon') { if (M._caixaCar) M.L.removeLayer(M._caixaCar); M._caixaCar = L.geoJSON(fc.features[0], { interactive: false, style: { color: '#2f855a', weight: 2, dashArray: '4 4', fill: false } }).addTo(M.L); }
    }).catch(e => { const el = document.getElementById('fichaCar'); if (el) el.innerHTML = `<span class="erro-txt">${esc(e.message)}</span>`; });
    // camadas ligadas com consulta
    const ativas = Object.keys(M.ativas).map(VA.camada).filter(c => c && c.q && c.q.tipo !== 'overpass');
    const sempre = ['anm_proc', 'sgb_ocorr'].map(VA.camada).filter(c => !ativas.includes(c));
    const lista = ativas.concat(sempre);
    const alvo = document.getElementById('fichaCamadas');
    if (!lista.length) { alvo.innerHTML = '<div class="vazio-msg">Ligue camadas em “Camadas” para ver as informações delas aqui.</div>'; return; }
    const tamPx = (M.L.getBounds().getEast() - M.L.getBounds().getWest()) / M.L.getSize().x;
    alvo.innerHTML = '';
    await VA.limitar(lista.map(c => async () => {
      const ponto = c.tipoGeom === 'ponto' || c.tipoGeom === 'linha';
      const tol = (ponto ? 8 : 1) * tamPx;
      const bbox = [lon - tol, lat - tol, lon + tol, lat + tol];
      const div = document.createElement('div'); div.className = 'ficha-camada';
      div.innerHTML = `<div class="fc-cab"><span class="fc-nome">${esc(c.nome)}</span><span class="fc-fonte">${esc(c.fonte)}</span></div><div class="fc-corpo pequeno">consultando…</div>`;
      alvo.appendChild(div);
      try {
        const fc = await VA.consultarCamada(c, { bbox, tolPx: ponto ? 8 : 1, max: 10, returnGeometry: true });
        const pt = turf.point([lon, lat]);
        let feats = fc.features;
        if (!ponto) feats = feats.filter(x => { try { return x.geometry && /Polygon/.test(x.geometry.type) ? turf.booleanPointInPolygon(pt, x) : true; } catch (e) { return true; } });
        if (!feats.length) { div.querySelector('.fc-corpo').innerHTML = '<span class="muted">nada neste ponto</span>'; div.classList.add('vazio'); return; }
        div.querySelector('.fc-corpo').innerHTML = feats.slice(0, 5).map(x => {
          const at = VA.attrsLimpos(x.properties, c.id === 'sgb_ocorr' ? 40 : 18);
          const tit = VA.fmt.semTags(VA.attr(x.properties, c.rotulo || ['nome', 'NOME', 'Name']) || x.properties._camada || '');
          return `<div class="fc-item">${tit ? `<b>${esc(tit)}</b>` : ''}<table>${at.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table></div>`;
        }).join('') + (feats.length > 5 ? `<div class="pequeno muted">+ ${feats.length - 5} registro(s)</div>` : '');
        if (c.id === 'anm_proc') feats.slice(0, 3).forEach(x => { const p = x.properties.PROCESSO; if (p) div.querySelector('.fc-corpo').insertAdjacentHTML('beforeend', `<div class="mini-link">Processo ${esc(p)} <button class="mini copiar" data-copiar="${esc(p)}">copiar nº</button> <a target="_blank" rel="noopener" href="https://sdm.anm.gov.br" title="Sistema de Dados Minerários da ANM (login gov.br): situação, eventos e prazos do processo">abrir o SDM da ANM</a></div>`); });
      } catch (e) { div.querySelector('.fc-corpo').innerHTML = `<span class="erro-txt">${esc(e.message)}</span>`; }
    }), 4);
  };

  /* ---------------- ficha de um elemento vetorial clicado (camadas desenhadas pelo navegador) ---------------- */
  M.fichaFeicao = function (c, props, ll, titulo) {
    const lon = ((ll.lng + 540) % 360) - 180, lat = ll.lat, f = VA.coord.formatos(lon, lat);
    if (M._marcaFicha) M.L.removeLayer(M._marcaFicha);
    M._marcaFicha = L.circleMarker(ll, { radius: 6, color: '#1665d8', weight: 3, fillColor: '#fff', fillOpacity: 0.9, interactive: false }).addTo(M.L);
    const at = VA.attrsLimpos(props, 60);
    VA.app.abrirFicha(`<div class="elem"><div class="elem-cab"><span class="elem-cam">${esc(c ? c.nome : 'Camada')}</span><span class="elem-fonte">${esc(c ? c.fonte : '')}</span></div>
      <div class="elem-tit">${esc(titulo || '')}</div>
      <table class="elem-attr">${at.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table></div>
      <div class="pequeno muted mt">Clique em <span class="mono">${f.dec}</span> <button class="mini copiar" data-copiar="${f.dec}">copiar</button></div>`, { lon, lat, f, titulo: 'Informações do elemento' });
  };

  /* ---------------- régua: distância, rumo, área e perímetro ---------------- */
  VA.regua = {
    pontos: [], fechado: false,
    iniciar(origem) {
      this.parar(true);
      M.modo = 'regua';
      this.pontos = origem ? [[origem.lng, origem.lat]] : []; this.fechado = false;
      M.L.getContainer().classList.add('cursor-regua');
      M.L.doubleClickZoom.disable();
      this._g = L.layerGroup().addTo(M.medidas);
      this._clique = e => this._add(e);
      this._dbl = e => { L.DomEvent.stop(e); this.concluir(); };
      M.L.on('click', this._clique); M.L.on('dblclick', this._dbl);
      M.aoMover = ll => this._desenhar(ll);
      this._tecla = ev => { if (ev.key === 'Escape') this.parar(); if (ev.key === 'Enter') this.concluir(); if (ev.key === 'Backspace' && this.pontos.length) { ev.preventDefault(); this.pontos.pop(); this._desenhar(); } };
      document.addEventListener('keydown', this._tecla);
      VA.app.painelRegua(this.resumo(), true);
      this._desenhar();
    },
    _add(e) {
      const p = [e.latlng.lng, e.latlng.lat];
      if (this.pontos.length >= 3) {
        const a = M.L.latLngToContainerPoint([this.pontos[0][1], this.pontos[0][0]]), b = M.L.latLngToContainerPoint(e.latlng);
        if (a.distanceTo(b) < 12) { this.fechado = true; return this.concluir(); }
      }
      if (this.pontos.length) {
        const u = this.pontos[this.pontos.length - 1];
        if (M.L.latLngToContainerPoint([u[1], u[0]]).distanceTo(M.L.latLngToContainerPoint(e.latlng)) < 4) return;
      }
      this.pontos.push(p); this._desenhar();
    },
    resumo(cursor) {
      const pts = this.pontos.slice(); if (cursor) pts.push(cursor);
      let total = 0; const seg = [];
      for (let i = 1; i < pts.length; i++) { const d = turf.distance(turf.point(pts[i - 1]), turf.point(pts[i]), { units: 'kilometers' }); total += d; seg.push(d); }
      const r = { total, seg, n: this.pontos.length, ultimo: seg.length ? seg[seg.length - 1] : 0, rumo: pts.length > 1 ? VA.geo.rumo(pts[pts.length - 2], pts[pts.length - 1]) : null };
      if (this.fechado && this.pontos.length >= 3) {
        const anel = this.pontos.concat([this.pontos[0]]);
        const pol = turf.polygon([anel]);
        r.area_ha = turf.area(pol) / 10000; r.perimetro = total + turf.distance(turf.point(this.pontos[this.pontos.length - 1]), turf.point(this.pontos[0]), { units: 'kilometers' });
        r.poligono = pol;
      }
      return r;
    },
    _desenhar(cursorLL) {
      if (!this._g) return;
      this._g.clearLayers();
      const cursor = cursorLL && M.modo === 'regua' ? [cursorLL.lng, cursorLL.lat] : null;
      const pts = this.pontos.map(p => [p[1], p[0]]);
      if (this.fechado && pts.length >= 3) L.polygon(pts, { color: '#ff3b6b', weight: 2.5, fillOpacity: 0.12, dashArray: '6 4' }).addTo(this._g);
      else if (pts.length) L.polyline(cursor ? pts.concat([[cursor[1], cursor[0]]]) : pts, { color: '#ff3b6b', weight: 2.5, dashArray: '6 4' }).addTo(this._g);
      let acc = 0;
      this.pontos.forEach((p, i) => {
        if (i) acc += turf.distance(turf.point(this.pontos[i - 1]), turf.point(p), { units: 'kilometers' });
        L.circleMarker([p[1], p[0]], { radius: 4, color: '#ff3b6b', fillColor: '#fff', fillOpacity: 1, weight: 2 }).addTo(this._g)
          .bindTooltip(i ? VA.fmt.km(acc).replace('dentro', '0 m') : 'início', { permanent: true, direction: 'top', className: 'rotulo-regua', offset: [0, -6] });
      });
      const r = this.resumo(cursor);
      VA.app.painelRegua(r, M.modo === 'regua');
    },
    concluir() {
      if (this.pontos.length < 2) { this.parar(); return; }
      this._sair();
      this._desenhar();
      VA.app.painelRegua(this.resumo(), false);
    },
    _sair() {
      M.modo = null; M.aoMover = null;
      M.L.off('click', this._clique); M.L.off('dblclick', this._dbl);
      document.removeEventListener('keydown', this._tecla);
      M.L.getContainer().classList.remove('cursor-regua');
      setTimeout(() => M.L.doubleClickZoom.enable(), 300);
    },
    parar(semPainel) {
      if (M.modo === 'regua') this._sair();
      M.medidas.clearLayers(); this._g = null; this.pontos = []; this.fechado = false;
      if (!semPainel) VA.app.painelRegua(null);
    }
  };

  /* ---------------- resultados da análise no mapa ---------------- */
  const COR = { impeditivo: '#d62828', alerta: '#e76f51', atencao: '#e9a23b', oportunidade: '#2a9d8f', informativo: '#1665d8', dentro: '#d62828', proximo: '#e9a23b' };
  /* peso para ordenar: pontos (0) e linhas (1) por cima; polígonos (2 + área em m²) por baixo, os maiores no fundo */
  M.pesoFeicao = function (f) {
    const t = f && f.geometry && f.geometry.type || '';
    if (/Point/.test(t)) return 0;
    if (/Line/.test(t)) return 1;
    try { return 2 + turf.area(f); } catch (e) { return 3; }
  };
  M.desenharResultados = function (analise, aoClicar) {
    M.resultados.clearLayers();
    let areaAOI = 0; try { if (/Polygon/.test(analise.ctx.aoi.geometry.type)) areaAOI = turf.area(analise.ctx.aoi); } catch (e) { }
    const lista = [];
    analise.ordem.forEach(id => (analise.resultados[id].itens || []).forEach(it => { if (it.feature && it.feature.geometry) lista.push({ r: analise.resultados[id], it, peso: M.pesoFeicao(it.feature) }); }));
    if (analise.alvo) {
      const r = { camada: { nome: 'Alvo: ' + analise.alvo.mineral } };
      analise.alvo.ocorrencias.concat(analise.alvo.processos).forEach(it => { if (it.feature && it.feature.geometry) lista.push({ r, it, peso: M.pesoFeicao(it.feature), alvo: true }); });
    }
    lista.sort((a, b) => b.peso - a.peso);
    lista.forEach(({ r, it, peso, alvo }) => {
      {
        const cor = alvo ? (/Point/.test(it.feature.geometry.type) ? '#8e2bd6' : '#b26df0') : it.incide ? COR.dentro : COR.proximo;
        // polígonos muito maiores que a área (município, bioma, bacia…) ficam só com o contorno, para não tingir o mapa
        const grande = peso > 2 && peso - 2 > Math.max(areaAOI * 25, 4e6);
        const l = L.geoJSON(it.feature, {
          bubblingMouseEvents: false,
          style: { color: cor, weight: it.incide ? 2.4 : 1.4, fillOpacity: grande ? 0 : it.incide ? 0.15 : 0.04, dashArray: it.incide ? null : '5 4', bubblingMouseEvents: false },
          pointToLayer: (f, ll) => L.circleMarker(ll, { radius: it.incide ? 7 : 5, color: '#fff', weight: 1.5, fillColor: cor, fillOpacity: 0.95, bubblingMouseEvents: false })
        });
        l.bindTooltip(`${esc(it.evid)} · ${esc(r.camada.nome)}<br>${esc(it.titulo)}`, { sticky: true });
        l.on('click', e => { L.DomEvent.stopPropagation(e); if (M.modo) return; if (aoClicar) aoClicar(e.latlng, it.evid); });
        l.addTo(M.resultados);
      }
    });
  };
})();
