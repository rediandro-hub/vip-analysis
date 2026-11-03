/* VIP ANALYSIS — utilidades: rede (direto → servidor local), ArcGIS, WFS/GML, geometria, coordenadas, formatação. */
'use strict';

const VA = window.VA = window.VA || {};
VA.versao = '0.4.2';

/* ====================================================================== */
/* REDE
   Regra: tenta o acesso DIRETO primeiro (ANM, SGB, EPE, INDE, CAR, FUNAI, DNIT, INPE e IBGE liberam CORS).
   Se o navegador bloquear (CORS) e o servidor local estiver no ar, repete pelo proxy e memoriza o domínio.
   Fontes marcadas cors:'proxy' (SIGEL) vão direto ao proxy.
   O motivo de cada falha fica explícito — nunca mais "falha de rede" genérica. */
/* ====================================================================== */
VA.Net = {
  proxy: { ok: false, base: '', verificadoEm: 0 },
  hostModo: {},
  ouvintes: [],
  aoMudar(fn) { this.ouvintes.push(fn); },
  _avisar() { this.ouvintes.forEach(fn => { try { fn(this.proxy.ok); } catch (e) { } }); },

  async verificarProxy() {
    const bases = location.protocol.startsWith('http') ? [''] : [];
    bases.push('http://localhost:8766/', 'http://127.0.0.1:8766/');
    const antes = this.proxy.ok;
    for (const b of bases) {
      try {
        const r = await this._fetchComTempo(b + 'api/status', 3500, { cache: 'no-store' });
        const j = await r.json();
        if (j && j.app === 'vip-analysis') {
          this.proxy = { ok: true, base: b, verificadoEm: Date.now(), versao: j.versao, bases: j.bases || [], dados: j.dados || '' };
          if (!antes) this._avisar();
          return true;
        }
      } catch (e) { /* tenta o próximo */ }
    }
    this.proxy = { ok: false, base: '', verificadoEm: Date.now() };
    if (antes) this._avisar();
    return false;
  },
  iniciarMonitor() {
    this.verificarProxy().then(() => this._avisar());
    setInterval(() => this.verificarProxy(), 20000);
  },
  /* fontes em que vale o dado do momento (prioridade de protocolo na ANM): o servidor local não usa o cache */
  semCache: ['geo.anm.gov.br', 'app.anm.gov.br', 'sistemas.anm.gov.br'],
  urlProxy(u) { let h = ''; try { h = new URL(u).hostname; } catch (e) { } return this.proxy.base + 'proxy?url=' + encodeURIComponent(u) + (this.semCache.includes(h) ? '&fresco=1' : ''); },
  /* de onde veio cada resposta: direto do órgão, pelo servidor local ao vivo ou do cache dele (com a idade) */
  origens: new Map(),
  origemDe(url) { return this.origens.get(url) || null; },

  async _fetchComTempo(url, ms, opt = {}) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try { return await fetch(url, Object.assign({ signal: ctl.signal }, opt)); }
    finally { clearTimeout(t); }
  },

  /** GET com estratégia direto→proxy. Retorna {texto, tipo, via}. Erros trazem .motivo legível. */
  async obter(url, { timeout = 60000, cors = 'auto', binario = false } = {}) {
    let host = '';
    try { host = new URL(url).hostname; } catch (e) { }
    const preferirProxy = cors === 'proxy' || this.hostModo[host] === 'proxy';
    const tentativas = [];
    if (preferirProxy && this.proxy.ok) tentativas.push('proxy');
    if (cors !== 'proxy' || !this.proxy.ok) tentativas.push('direto');
    if (!tentativas.includes('proxy') && this.proxy.ok) tentativas.push('proxy');

    let ultimo = null;
    for (const via of tentativas) {
      const alvo = via === 'proxy' ? this.urlProxy(url) : url;
      let r;
      try {
        r = await this._fetchComTempo(alvo, timeout);
      } catch (e) {
        if (e.name === 'AbortError') { ultimo = this._erro('tempo', `${host} não respondeu em ${Math.round(timeout / 1000)} s`); break; }
        if (via === 'proxy') {
          this.proxy.ok = false; this._avisar();
          ultimo = this._erro('servidor', 'o servidor local parou de responder (a janela do iniciar.bat foi fechada?)');
        } else {
          ultimo = this._erro('cors', `o navegador bloqueou o acesso direto a ${host}`);
        }
        continue;
      }
      if (!r.ok) {
        let det = '';
        try { const t = await r.text(); try { const j = JSON.parse(t); det = j.erro || j.error && j.error.message || ''; } catch (e) { det = t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140); } } catch (e) { }
        ultimo = this._erro('http', `${host} respondeu HTTP ${r.status}${det ? ' — ' + det : ''}`);
        if (via === 'proxy' && r.status === 403) continue;
        break;
      }
      if (via === 'proxy' && cors !== 'proxy') this.hostModo[host] = 'proxy';
      const tipo = r.headers.get('content-type') || '';
      const deCache = via === 'proxy' && r.headers.get('X-VIP-Origem') === 'cache';
      if (this.origens.size > 4000) this.origens.clear();
      this.origens.set(url, { via, cache: deCache, idadeS: deCache ? +(r.headers.get('X-VIP-Idade') || 0) : 0, em: new Date().toISOString() });
      if (binario) return { blob: await r.blob(), tipo, via };
      return { texto: await r.text(), tipo, via };
    }
    if (ultimo && ultimo.motivo === 'cors' && !this.proxy.ok) {
      ultimo.message = `${ultimo.message}. Esta fonte precisa do servidor local: abra pela opção iniciar.bat e mantenha a janela dele aberta`;
    }
    throw ultimo || this._erro('desconhecido', 'falha desconhecida');
  },
  _erro(motivo, msg) { const e = new Error(msg); e.motivo = motivo; return e; },
  async texto(url, o) { return (await this.obter(url, o)).texto; },
  async json(url, o) {
    const t = await this.texto(url, o);
    try { return JSON.parse(t); }
    catch (e) { throw this._erro('formato', 'resposta não é JSON: ' + t.slice(0, 120).replace(/\s+/g, ' ')); }
  }
};

/* ====================================================================== */
/* ArcGIS REST                                                            */
/* ====================================================================== */
VA.ags = {
  env: b => b.map(v => (+v).toFixed(6)).join(','),
  /** Consulta uma camada e devolve GeoJSON (FeatureCollection) */
  async query(layerUrl, { bbox, ponto, where = '1=1', outFields = '*', returnGeometry = true, maxOffset, max = 1000, cors, distM } = {}) {
    const p = new URLSearchParams({ f: 'geojson', where, outFields, returnGeometry: String(returnGeometry), inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects' });
    if (max) p.set('resultRecordCount', String(max));
    if (ponto) { p.set('geometry', ponto[0] + ',' + ponto[1]); p.set('geometryType', 'esriGeometryPoint'); if (distM) { p.set('distance', String(distM)); p.set('units', 'esriSRUnit_Meter'); } }
    else if (bbox) { p.set('geometry', this.env(bbox)); p.set('geometryType', 'esriGeometryEnvelope'); }
    if (maxOffset) p.set('maxAllowableOffset', String(maxOffset));
    let url = layerUrl + '/query?' + p.toString();
    let j = await VA.Net.json(url, { cors });
    if (j.error && /resultRecordCount|pagination|Invalid query/i.test(JSON.stringify(j.error))) {
      p.delete('resultRecordCount');
      url = layerUrl + '/query?' + p.toString();
      j = await VA.Net.json(url, { cors });
    }
    if (j.error && /geojson|format/i.test(JSON.stringify(j.error))) {
      p.set('f', 'json');
      url = layerUrl + '/query?' + p.toString();
      j = await VA.Net.json(url, { cors });
    }
    if (j.error) throw VA.Net._erro('servico', 'ArcGIS: ' + (j.error.message || 'erro') + (j.error.details && j.error.details.length ? ' — ' + j.error.details.join('; ') : ''));
    if (j.type !== 'FeatureCollection') j = VA.esri.featureSetToGeoJSON(j);
    j._url = url;
    j._truncado = !!(j.exceededTransferLimit || (j.properties && j.properties.exceededTransferLimit));
    return j;
  },
  /** identify num serviço inteiro (para serviços em que não sabemos os ids das camadas) */
  async identify(serviceUrl, { geom, tipo, bbox, layers = 'all', tolerance = 0, returnGeometry = true, maxOffset, cors, layerDefs } = {}) {
    const p = new URLSearchParams({
      f: 'json', geometry: JSON.stringify(geom), geometryType: tipo, sr: '4326', layers, tolerance: String(tolerance),
      mapExtent: this.env(bbox), imageDisplay: '800,800,96', returnGeometry: String(returnGeometry)
    });
    if (maxOffset) p.set('maxAllowableOffset', String(maxOffset));
    if (layerDefs) p.set('layerDefs', JSON.stringify(layerDefs));
    const url = serviceUrl + '/identify?' + p.toString();
    const j = await VA.Net.json(url, { cors });
    if (j.error) throw VA.Net._erro('servico', 'ArcGIS: ' + (j.error.message || 'erro'));
    const fc = { type: 'FeatureCollection', features: (j.results || []).map(r => ({ type: 'Feature', properties: Object.assign({ _camada: r.layerName, _camadaId: r.layerId }, r.attributes), geometry: VA.esri.geom(r.geometry) })) };
    fc._url = url;
    fc._truncado = (j.results || []).length >= 1000;
    return fc;
  },
  async legenda(serviceUrl, cors) {
    const j = await VA.Net.json(serviceUrl + '/legend?f=json', { cors, timeout: 20000 });
    return (j.layers || []).map(l => ({ id: l.layerId, nome: l.layerName, itens: (l.legend || []).map(i => ({ rotulo: i.label, img: 'data:' + i.contentType + ';base64,' + i.imageData })) }));
  }
};

/* Esri JSON ↔ GeoJSON */
VA.esri = {
  horario(r) { let s = 0; for (let i = 0; i < r.length - 1; i++) s += (r[i + 1][0] - r[i][0]) * (r[i + 1][1] + r[i][1]); return s > 0; },
  geom(g) {
    if (!g) return null;
    if (g.x !== undefined) return isFinite(g.x) ? { type: 'Point', coordinates: [g.x, g.y] } : null;
    if (g.points) return { type: 'MultiPoint', coordinates: g.points };
    if (g.paths) return g.paths.length === 1 ? { type: 'LineString', coordinates: g.paths[0] } : { type: 'MultiLineString', coordinates: g.paths };
    if (g.rings) {
      const polys = [];
      g.rings.forEach(r => { if (this.horario(r) || !polys.length) polys.push([r]); else polys[polys.length - 1].push(r); });
      return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
    }
    return null;
  },
  featureSetToGeoJSON(fs) {
    return { type: 'FeatureCollection', features: (fs.features || []).map(f => ({ type: 'Feature', properties: f.attributes || {}, geometry: this.geom(f.geometry) })), exceededTransferLimit: fs.exceededTransferLimit };
  },
  daGeoJSON(geom) {
    const sr = { wkid: 4326 };
    if (geom.type === 'Point') return [{ x: geom.coordinates[0], y: geom.coordinates[1], spatialReference: sr }, 'esriGeometryPoint'];
    if (geom.type === 'MultiPoint') return [{ points: geom.coordinates, spatialReference: sr }, 'esriGeometryMultipoint'];
    if (geom.type === 'LineString') return [{ paths: [geom.coordinates], spatialReference: sr }, 'esriGeometryPolyline'];
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    const rings = [];
    polys.forEach(p => p.forEach((r, i) => { const cw = this.horario(r); rings.push((i === 0) === cw ? r : r.slice().reverse()); }));
    return [{ rings, spatialReference: sr }, 'esriGeometryPolygon'];
  }
};

/* ====================================================================== */
/* OGC WFS (GeoServer, MapServer)                                         */
/* ====================================================================== */
VA.wfs = {
  montar(base, params) { return base + (base.includes('?') ? '&' : '?') + new URLSearchParams(params).toString(); },
  async obter(base, typeName, bbox, { max = 500, cors } = {}) {
    const bb = bbox.map(n => (+n).toFixed(6)).join(',');
    const comum = { service: 'WFS', version: '1.0.0', request: 'GetFeature', typeName, bbox: bb, maxFeatures: String(max) };
    const tentativas = [Object.assign({ outputFormat: 'application/json' }, comum, { bbox: bb + ',EPSG:4326', srsName: 'EPSG:4326' }), Object.assign({ outputFormat: 'application/json' }, comum), comum];
    let ultimo;
    for (const params of tentativas) {
      const url = this.montar(base, params);
      let txt;
      try { txt = await VA.Net.texto(url, { cors }); } catch (e) { ultimo = e; if (e.motivo !== 'http') break; continue; }
      const t = txt.trim();
      if (t.startsWith('{')) {
        try { const j = JSON.parse(t); if (j.type === 'FeatureCollection') { j._url = url; j._truncado = j.features.length >= max; return VA.geo.corrigirEixos(j); } } catch (e) { ultimo = e; }
        continue;
      }
      if (t.startsWith('<')) {
        try { const fc = VA.gml.parse(t); fc._url = url; fc._truncado = fc.features.length >= max; return VA.geo.corrigirEixos(fc); }
        catch (e) { ultimo = e; continue; }
      }
      ultimo = VA.Net._erro('formato', 'resposta inesperada: ' + t.slice(0, 100));
    }
    throw ultimo || VA.Net._erro('servico', 'WFS sem resposta válida');
  },
  legendaUrl(base, layer) { return this.montar(base, { service: 'WMS', version: '1.1.1', request: 'GetLegendGraphic', format: 'image/png', layer, legend_options: 'fontAntiAliasing:true;fontSize:11' }); }
};

VA.gml = {
  GEOMS: new Set(['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon', 'MultiSurface', 'MultiCurve', 'Surface', 'Curve']),
  parse(xml) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw VA.Net._erro('formato', 'XML inválido');
    const exc = doc.getElementsByTagNameNS('*', 'ServiceException')[0] || doc.getElementsByTagNameNS('*', 'ExceptionText')[0];
    if (exc) throw VA.Net._erro('servico', 'WFS: ' + exc.textContent.trim().replace(/\s+/g, ' ').slice(0, 200));
    const elementos = [];
    [...doc.getElementsByTagNameNS('*', 'featureMember'), ...doc.getElementsByTagNameNS('*', 'member')].forEach(m => [...m.children].forEach(c => elementos.push(c)));
    [...doc.getElementsByTagNameNS('*', 'featureMembers')].forEach(m => [...m.children].forEach(c => elementos.push(c)));
    return {
      type: 'FeatureCollection', features: elementos.map(el => {
        const props = {}; let geometry = null;
        [...el.children].forEach(ch => {
          const g = [...ch.children].find(x => this.GEOMS.has(x.localName));
          if (g && !geometry) geometry = this.geom(g);
          else if (!ch.children.length) props[ch.localName] = ch.textContent.trim();
        });
        return { type: 'Feature', properties: props, geometry };
      })
    };
  },
  coords(el) {
    if (!el) return [];
    const c = el.getElementsByTagNameNS('*', 'coordinates')[0];
    if (c) { const cs = c.getAttribute('cs') || ','; return c.textContent.trim().split(/\s+/).filter(Boolean).map(p => p.split(cs).map(Number).slice(0, 2)); }
    const pl = el.getElementsByTagNameNS('*', 'posList')[0];
    if (pl) { const dim = parseInt(pl.getAttribute('srsDimension') || '2', 10); const n = pl.textContent.trim().split(/\s+/).map(Number); const o = []; for (let i = 0; i + 1 < n.length; i += dim) o.push([n[i], n[i + 1]]); return o; }
    return [...el.getElementsByTagNameNS('*', 'pos')].map(p => p.textContent.trim().split(/\s+/).map(Number).slice(0, 2));
  },
  aneis(p) {
    const ext = p.getElementsByTagNameNS('*', 'outerBoundaryIs')[0] || p.getElementsByTagNameNS('*', 'exterior')[0];
    const ints = [...p.getElementsByTagNameNS('*', 'innerBoundaryIs'), ...p.getElementsByTagNameNS('*', 'interior')];
    return [this.coords(ext || p), ...ints.map(i => this.coords(i))];
  },
  geom(el) {
    const n = el.localName;
    if (n === 'Point') return { type: 'Point', coordinates: this.coords(el)[0] };
    if (n === 'LineString' || n === 'Curve') return { type: 'LineString', coordinates: this.coords(el) };
    if (n === 'Polygon' || n === 'Surface') return { type: 'Polygon', coordinates: this.aneis(el.getElementsByTagNameNS('*', 'PolygonPatch')[0] || el) };
    if (n === 'MultiPolygon' || n === 'MultiSurface') { const ps = [...el.getElementsByTagNameNS('*', 'Polygon')]; return { type: 'MultiPolygon', coordinates: ps.map(p => this.aneis(p)) }; }
    if (n === 'MultiLineString' || n === 'MultiCurve') return { type: 'MultiLineString', coordinates: [...el.getElementsByTagNameNS('*', 'LineString')].map(l => this.coords(l)) };
    if (n === 'MultiPoint') return { type: 'MultiPoint', coordinates: [...el.getElementsByTagNameNS('*', 'Point')].map(p => this.coords(p)[0]) };
    return null;
  }
};

/* ====================================================================== */
/* GEOMETRIA                                                              */
/* ====================================================================== */
VA.geo = {
  corrigirEixos(fc) {
    let inv = 0, ok = 0;
    fc.features.slice(0, 30).forEach(f => {
      const c = f.geometry && this.primeiraCoord(f.geometry); if (!c) return;
      if (c[0] > -35 && c[0] < 6 && c[1] < -28 && c[1] > -75) inv++; else ok++;
    });
    if (inv > ok) fc.features.forEach(f => { if (f.geometry) this.trocar(f.geometry); });
    return fc;
  },
  primeiraCoord(g) { if (!g) return null; let c = g.coordinates; while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]; return Array.isArray(c) ? c : null; },
  trocar(g) { const sw = a => (typeof a[0] === 'number' ? [a[1], a[0]] : a.map(sw)); g.coordinates = sw(g.coordinates); },
  amostras(geom) {
    if (geom.type === 'Point') return [geom.coordinates];
    if (geom.type === 'MultiPoint') return geom.coordinates;
    let g = turf.feature(geom);
    try { g = turf.simplify(g, { tolerance: 0.0001, highQuality: false }); } catch (e) { }
    const pts = turf.coordAll(g), passo = Math.max(1, Math.floor(pts.length / 250));
    const out = pts.filter((_, i) => i % passo === 0);
    out.push(turf.centroid(geom).geometry.coordinates);
    return out;
  },
  /** Distância mínima (km) entre a área e uma feição (0 se sobrepõe). */
  distanciaKm(aoi, alvo) {
    if (!alvo || !alvo.geometry) return null;
    try { if (turf.booleanIntersects(aoi, alvo)) return 0; } catch (e) { }
    const amostras = this.amostras(aoi.geometry);
    let partes;
    try { partes = turf.flatten(alvo).features; } catch (e) { return null; }
    let min = Infinity;
    partes.forEach(p => {
      const t = p.geometry && p.geometry.type; if (!t) return;
      let linhas = null;
      if (t === 'Polygon') { const l = turf.polygonToLine(p); linhas = l.type === 'FeatureCollection' ? l.features : turf.flatten(l).features; }
      else if (t === 'LineString') linhas = [p];
      amostras.forEach(a => {
        const pt = turf.point(a);
        const d = t === 'Point' ? turf.distance(pt, p, { units: 'kilometers' }) : Math.min(...linhas.map(l => turf.pointToLineDistance(pt, l, { units: 'kilometers' })));
        if (d < min) min = d;
      });
      // pontos do alvo até o contorno da AOI (alvo pequeno ao lado de AOI grande)
      if (t === 'Point' && /Polygon/.test(aoi.geometry.type)) {
        const contorno = turf.flatten(turf.polygonToLine(aoi)).features;
        contorno.forEach(l => { const d = turf.pointToLineDistance(p, l, { units: 'kilometers' }); if (d < min) min = d; });
      }
    });
    return isFinite(min) ? min : null;
  },
  sobreposicaoHa(aoi, alvo) {
    const P = ['Polygon', 'MultiPolygon'];
    if (!P.includes(aoi.geometry.type) || !alvo.geometry || !P.includes(alvo.geometry.type)) return null;
    try { const i = turf.intersect(turf.featureCollection([aoi, alvo])); return i ? turf.area(i) / 10000 : 0; } catch (e) { return null; }
  },
  /* área (ha) da UNIÃO das partes de vários polígonos dentro da área — sem contar duas vezes onde eles se sobrepõem */
  uniaoSobreposicaoHa(aoi, feats) {
    const P = ['Polygon', 'MultiPolygon'];
    if (!P.includes(aoi.geometry.type)) return null;
    let u = null, n = 0;
    for (const f of feats.slice(0, 400)) {
      if (!f || !f.geometry || !P.includes(f.geometry.type)) continue;
      let i = null; try { i = turf.intersect(turf.featureCollection([aoi, f])); } catch (e) { i = null; }
      if (!i) continue; n++;
      try { u = u ? (turf.union(turf.featureCollection([u, i])) || u) : i; } catch (e) { /* geometria problemática: ignora a união dessa peça */ }
    }
    return n ? turf.area(u) / 10000 : 0;
  },
  bboxBuffer(geom, km) {
    const b = turf.bbox(geom);
    if (!km) return b;
    const dLat = km / 110.574, lat = (b[1] + b[3]) / 2, dLon = km / (111.320 * Math.cos(lat * Math.PI / 180));
    return [b[0] - dLon, b[1] - dLat, b[2] + dLon, b[3] + dLat];
  },
  simplificarAte(geom, maxV = 150) {
    if (geom.type === 'Point' || geom.type === 'MultiPoint') return geom;
    let f = turf.feature(geom), tol = 0.00005;
    while (turf.coordAll(f).length > maxV && tol < 0.05) { f = turf.simplify(turf.feature(geom), { tolerance: tol, highQuality: true }); tol *= 2; }
    return f.geometry;
  },
  centro(aoi) {
    const g = aoi.geometry;
    if (g.type === 'Point') return g.coordinates;
    if (/Polygon/.test(g.type)) { const c = turf.centroid(aoi).geometry.coordinates; return turf.booleanPointInPolygon(turf.point(c), aoi) ? c : turf.pointOnFeature(aoi).geometry.coordinates; }
    return turf.center(aoi).geometry.coordinates;
  },
  /** Mercator (EPSG:3857) */
  merc([lon, lat]) { const R = 6378137; return [R * lon * Math.PI / 180, R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))]; },
  rumo(a, b) { const az = turf.bearing(turf.point(a), turf.point(b)); return (az + 360) % 360; },
  rumoTxt(az) { return ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(az / 45) % 8]; }
};

/* ====================================================================== */
/* COORDENADAS — decimal, GMS e UTM (SIRGAS 2000 ≈ WGS 84)                 */
/* ====================================================================== */
VA.coord = {
  BANDAS: 'CDEFGHJKLMNPQRSTUVWX',
  utmDef(zona, sul = true) { return `+proj=utm +zone=${zona} ${sul ? '+south ' : ''}+ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`; },
  paraUTM(lon, lat) {
    const zona = Math.floor((lon + 180) / 6) + 1, sul = lat < 0;
    const [e, n] = proj4('EPSG:4326', this.utmDef(zona, sul), [lon, lat]);
    const banda = this.BANDAS[Math.max(0, Math.min(19, Math.floor((lat + 80) / 8)))];
    const mc = zona * 6 - 183;
    return { zona, hemis: sul ? 'S' : 'N', banda, e, n, mc };
  },
  deUTM(zona, e, n, sul = true) { return proj4(this.utmDef(zona, sul), 'EPSG:4326', [e, n]); },
  fmtUTM(lon, lat) { const u = this.paraUTM(lon, lat); return `${u.zona}${u.hemis} ${u.e.toFixed(0)} E ${u.n.toFixed(0)} N`; },
  fmtGMS(v, pos, neg) {
    const s = v < 0 ? neg : pos; v = Math.abs(v);
    let g = Math.floor(v), m = Math.floor((v - g) * 60), sec = (v - g - m / 60) * 3600;
    if (sec >= 59.995) { sec = 0; m++; } if (m >= 60) { m = 0; g++; }
    return `${g}°${String(m).padStart(2, '0')}'${sec.toFixed(2).padStart(5, '0')}"${s}`;
  },
  formatos(lon, lat) {
    const u = this.paraUTM(lon, lat);
    return {
      dec: `${lat.toFixed(6)}, ${lon.toFixed(6)}`,
      gms: `${this.fmtGMS(lat, 'N', 'S')} ${this.fmtGMS(lon, 'L', 'O')}`,
      utm: `${u.zona}${u.hemis} ${u.e.toFixed(0)} E ${u.n.toFixed(0)} N`,
      utmDet: `Fuso ${u.zona} (banda ${u.banda}) · MC ${u.mc}° · SIRGAS 2000`, u
    };
  },
  interpretar(txt) {
    const t = txt.trim().replace(/[−–]/g, '-').replace(/[′’‘´`]/g, "'").replace(/[″“”]/g, '"').replace(/º|˚/g, '°').toUpperCase();
    const mU = t.replace(/UTM|FUSO|ZONA|[EN]\s*[:=]?\s*(?=\d)/g, ' ').match(/^\s*(\d{1,2})\s*([C-X])?\s+(\d{5,7}(?:[.,]\d+)?)\s*[,;\s]\s*(\d{6,8}(?:[.,]\d+)?)\s*[EN]?\s*$/);
    if (mU) {
      const zona = +mU[1], letra = mU[2] || 'S', sul = letra === 'S' || letra < 'N';
      if (zona < 1 || zona > 60) throw new Error('Fuso UTM inválido');
      return this.deUTM(zona, +mU[3].replace(',', '.'), +mU[4].replace(',', '.'), sul);
    }
    const gs = [...t.matchAll(/(\d{1,3})\s*[°D]\s*(\d{1,2})?\s*['M]?\s*(\d{1,2}(?:[.,]\d+)?)?\s*"?\s*([NSLOWE])/g)];
    if (gs.length === 2) {
      const val = m => { const v = +m[1] + (+(m[2] || 0)) / 60 + (+((m[3] || '0').replace(',', '.'))) / 3600; return /[SOW]/.test(m[4]) ? -v : v; };
      let a = gs[0], b = gs[1];
      if (/[LOWE]/.test(a[4])) [a, b] = [b, a];
      return [val(b), val(a)];
    }
    const nums = t.replace(/(\d),(\d)/g, '$1.$2').match(/-?\d+(?:\.\d+)?/g);
    if (nums && nums.length === 2) {
      let lat = +nums[0], lon = +nums[1];
      if (Math.abs(lat) > 34 && Math.abs(lon) <= 34) [lat, lon] = [lon, lat];
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error('Coordenada fora do intervalo');
      return [lon, lat];
    }
    throw new Error('Formato não reconhecido. Exemplos: -7.0812, -36.8423 · 7°04\'52"S 36°50\'32"W · 24S 738594 9217959');
  }
};

/* ====================================================================== */
/* FORMATAÇÃO E UTILIDADES                                                */
/* ====================================================================== */
VA.fmt = {
  num(v, d = 2) { return v == null || isNaN(v) ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }); },
  km(v) { return v == null ? '—' : (v === 0 ? 'dentro' : (v < 1 ? VA.fmt.num(v * 1000, 0) + ' m' : VA.fmt.num(v, v < 10 ? 2 : 1) + ' km')); },
  /* distância de um registro respeitando a precisão da base (ex.: estruturas 1:1.000.000 ≈ 1 km) */
  kmItem(it) { if (!it || it.distancia_km == null) return '—'; if (it.distancia_km === 0) return 'dentro'; return it.menorQue ? 'menos de ' + VA.fmt.km(it.distancia_km) : (it.precisao_km ? 'cerca de ' : '') + VA.fmt.km(it.distancia_km); },
  ha(v) { return v == null ? '—' : VA.fmt.num(v, v < 10 ? 2 : 1) + ' ha'; },
  dataHora(d = new Date()) { return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }); },
  esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  semTags(s) { return String(s == null ? '' : s).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); },
  norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); },
  limpo(v) { if (v == null) return null; const s = String(v).trim(); return !s || /^(null|none|n\/a|-|sem informa[cç][aã]o)$/i.test(s) ? null : s; },
  /** "Salgadinho-PB" */
  munUF(m) { return m && m.municipio ? `${m.municipio}${m.uf ? '-' + m.uf : ''}` : (m && m.uf) || '—'; }
};

VA.attr = function (props, nomes) {
  if (!props) return undefined;
  const mapa = {}; Object.keys(props).forEach(k => { mapa[VA.fmt.norm(k)] = k; });
  for (const n of nomes) { const k = mapa[VA.fmt.norm(n)]; if (k !== undefined && VA.fmt.limpo(props[k]) != null) return props[k]; }
  return undefined;
};

VA.attrsLimpos = function (props, max = 16, aliases) {
  const tecnicos = /^(_camada|_camadaid|objectid(_\d+)?|fid|ogc_fid|gid|gml_?id|shape|shape[._].*|st_area|st_length|globalid|.*\(\)|msgeometry|geom|the_geom|boundedby|oid|symbolid|altmode|base|clamped|extruded|folderpath|haslabel|labelid|cdrestricao|id_?\d*|created_.*|last_edited_.*)$/i;
  const out = [];
  Object.entries(props || {}).forEach(([k, v]) => {
    if (tecnicos.test(k) || typeof v === 'object') return;
    let val = VA.fmt.limpo(v); if (val == null) return;
    if (/^(dt|data|date)/i.test(k) && /^\d{11,13}$/.test(String(v))) val = new Date(+v).toLocaleDateString('pt-BR');
    else if (/<[a-z][\s\S]*>/i.test(val)) val = VA.fmt.semTags(val);
    if (String(val).length > 260) val = String(val).slice(0, 260) + '…';
    out.push([(aliases && aliases[k]) || k.replace(/_/g, ' '), val]);
  });
  return out.slice(0, max);
};

VA.baixar = function (nome, conteudo, tipo = 'application/json') {
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
};

VA.armazem = {
  ler(k, padrao) { try { const v = localStorage.getItem('vip-analysis:' + k); return v == null ? padrao : JSON.parse(v); } catch (e) { return padrao; } },
  gravar(k, v) { try { localStorage.setItem('vip-analysis:' + k, JSON.stringify(v)); } catch (e) { } }
};

VA.limitar = async function (tarefas, n, aoTerminar) {
  const res = new Array(tarefas.length); let i = 0;
  async function trab() { while (i < tarefas.length) { const k = i++; try { res[k] = { ok: true, v: await tarefas[k]() }; } catch (e) { res[k] = { ok: false, e }; } if (aoTerminar) aoTerminar(k, res[k]); } }
  await Promise.all(Array.from({ length: Math.min(n, tarefas.length) }, trab));
  return res;
};

VA.UF_COD = { 11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO', 21: 'MA', 22: 'PI', 23: 'CE', 24: 'RN', 25: 'PB', 26: 'PE', 27: 'AL', 28: 'SE', 29: 'BA', 31: 'MG', 32: 'ES', 33: 'RJ', 35: 'SP', 41: 'PR', 42: 'SC', 43: 'RS', 50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF' };
VA.UFS = Object.values(VA.UF_COD).sort();
