/* VIP ANALYSIS — ficha do local.
   Tudo o que se sabe do lugar, para a capa do relatório: divisão territorial e dados do município (IBGE),
   clima da normal 1991–2020 (ERA5 via Open-Meteo, com classificação de Köppen calculada), situação especial
   (Amazônia Legal, faixa de fronteira) e distâncias — sede municipal, capital, rodovia federal, ferrovia,
   porto marítimo, terminal portuário e aeródromo —, em linha reta e, quando possível, por estrada (OSRM).
   Cada parte é independente: o que não responder vira lacuna, sem travar o resto. */
'use strict';

(function () {
  const VA = window.VA;
  const IBGE = 'https://servicodados.ibge.gov.br/api/';
  const N = s => VA.fmt.norm(s);

  /* capitais (sede municipal) */
  const CAPITAIS = {
    AC: ['Rio Branco', -67.8100, -9.9747], AL: ['Maceió', -35.7353, -9.6658], AP: ['Macapá', -51.0694, 0.0349], AM: ['Manaus', -60.0217, -3.1190],
    BA: ['Salvador', -38.5014, -12.9714], CE: ['Fortaleza', -38.5267, -3.7319], DF: ['Brasília', -47.8828, -15.7939], ES: ['Vitória', -40.3128, -20.3155],
    GO: ['Goiânia', -49.2648, -16.6869], MA: ['São Luís', -44.3068, -2.5307], MT: ['Cuiabá', -56.0979, -15.6014], MS: ['Campo Grande', -54.6201, -20.4697],
    MG: ['Belo Horizonte', -43.9345, -19.9167], PA: ['Belém', -48.4902, -1.4558], PB: ['João Pessoa', -34.8450, -7.1195], PR: ['Curitiba', -49.2733, -25.4284],
    PE: ['Recife', -34.8770, -8.0476], PI: ['Teresina', -42.8038, -5.0920], RJ: ['Rio de Janeiro', -43.1729, -22.9068], RN: ['Natal', -35.2110, -5.7945],
    RS: ['Porto Alegre', -51.2177, -30.0346], RO: ['Porto Velho', -63.9004, -8.7612], RR: ['Boa Vista', -60.6758, 2.8235], SC: ['Florianópolis', -48.5480, -27.5954],
    SP: ['São Paulo', -46.6333, -23.5505], SE: ['Aracaju', -37.0731, -10.9472], TO: ['Palmas', -48.3243, -10.2491]
  };
  /* portos marítimos de uso público (portos organizados e complexos estaduais) — coordenadas de referência do cais */
  const PORTOS_MAR = [
    ['Rio Grande', 'RS', -52.090, -32.040], ['São Francisco do Sul', 'SC', -48.637, -26.243], ['Itajaí', 'SC', -48.660, -26.905], ['Imbituba', 'SC', -48.652, -28.232],
    ['Paranaguá', 'PR', -48.521, -25.502], ['Santos', 'SP', -46.310, -23.950], ['São Sebastião', 'SP', -45.398, -23.808], ['Rio de Janeiro', 'RJ', -43.188, -22.890],
    ['Itaguaí', 'RJ', -43.838, -22.930], ['Angra dos Reis', 'RJ', -44.318, -23.012], ['Açu (São João da Barra)', 'RJ', -41.000, -21.820], ['Vitória', 'ES', -40.335, -20.322],
    ['Barra do Riacho', 'ES', -40.058, -19.841], ['Ilhéus', 'BA', -39.029, -14.781], ['Salvador', 'BA', -38.512, -12.966], ['Aratu-Candeias', 'BA', -38.497, -12.786],
    ['Maceió', 'AL', -35.727, -9.682], ['Suape', 'PE', -34.969, -8.392], ['Recife', 'PE', -34.868, -8.058], ['Cabedelo', 'PB', -34.838, -6.970],
    ['Natal', 'RN', -35.204, -5.776], ['Fortaleza (Mucuripe)', 'CE', -38.476, -3.716], ['Pecém', 'CE', -38.812, -3.537], ['Itaqui (São Luís)', 'MA', -44.367, -2.575],
    ['Vila do Conde (Barcarena)', 'PA', -48.752, -1.545], ['Belém', 'PA', -48.497, -1.448], ['Santana', 'AP', -51.178, -0.059]
  ];
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const SUPERFICIE = { PAV: 'pavimentada', DUP: 'duplicada', EOD: 'em obras de duplicação', EOP: 'em obras de pavimentação', IMP: 'implantada (sem pavimento)', LEN: 'leito natural', PLA: 'planejada', TRV: 'travessia' };

  const km = (a, b) => turf.distance(turf.point(a), turf.point(b), { units: 'kilometers' });
  const rumo = (a, b) => VA.geo.rumoTxt(VA.geo.rumo(a, b));
  const comTempo = (p, ms) => Promise.race([p, new Promise((_, n) => setTimeout(() => n(new Error('sem resposta em ' + Math.round(ms / 1000) + ' s')), ms))]);

  /* distância mínima de um ponto a linhas (GeoJSON) */
  function maisProximaLinha(c, fc) {
    let best = null;
    (fc.features || []).forEach(f => {
      if (!f.geometry) return;
      const linhas = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [];
      linhas.forEach(l => { if (l.length < 2) return; const d = turf.pointToLineDistance(turf.point(c), turf.lineString(l), { units: 'kilometers' }); if (!best || d < best.km) best = { km: d, f }; });
    });
    return best;
  }
  const maisProximoPonto = (c, lista) => lista.reduce((m, x) => { const d = km(c, x.c); return !m || d < m.km ? Object.assign({ km: d }, x) : m; }, null);
  const coordDe = f => { const g = f.geometry; if (!g) return null; if (g.type === 'Point') return g.coordinates; if (g.type === 'MultiPoint') return g.coordinates[0]; return turf.centroid(f).geometry.coordinates; };

  /* ---------------- divisão territorial e dados do município (IBGE) ---------------- */
  async function municipioIBGE(cod) {
    const j = await VA.Net.json(`${IBGE}v1/localidades/municipios/${cod}`, { timeout: 15000 });
    const mi = j.microrregiao, ri = j['regiao-imediata'];
    const uf = (mi && mi.mesorregiao.UF) || (ri && ri['regiao-intermediaria'].UF) || {};
    return { municipio: j.nome, codigo: String(j.id), uf: uf.sigla, ufNome: uf.nome, regiao: uf.regiao && uf.regiao.nome, regiaoSigla: uf.regiao && uf.regiao.sigla,
      intermediaria: ri && ri['regiao-intermediaria'].nome, intermediariaId: ri && ri['regiao-intermediaria'].id, imediata: ri && ri.nome, meso: mi && mi.mesorregiao.nome, mesoId: mi && mi.mesorregiao.id, micro: mi && mi.nome, fonte: 'IBGE — Localidades' };
  }
  async function agregado(tabela, periodos, variaveis, cod) {
    const j = await VA.Net.json(`${IBGE}v3/agregados/${tabela}/periodos/${periodos}/variaveis/${variaveis}?localidades=N6[${cod}]`, { timeout: 15000 });
    const out = {};
    (Array.isArray(j) ? j : []).forEach(v => {
      const serie = (((v.resultados || [])[0] || {}).series || [])[0];
      const s = serie ? serie.serie : {};
      out[v.id] = Object.entries(s).map(([ano, val]) => ({ ano: +ano, v: /^-?\d[\d.]*$/.test(String(val)) ? +val : null })).filter(x => Number.isFinite(x.v)).sort((a, b) => b.ano - a.ano);
    });
    return out;
  }
  async function dadosMunicipio(cod) {
    const [cen, pib] = await Promise.allSettled([agregado(4714, 2022, '93|6318|614', cod), agregado(5938, '-4', '37|513|517|6575|525', cod)]);
    const d = { fonte: 'IBGE — Censo 2022 e PIB dos Municípios' };
    if (cen.status === 'fulfilled') { const c = cen.value, ult = id => (c[id] || [])[0]; d.pop = ult('93') && ult('93').v; d.area_km2 = ult('6318') && ult('6318').v; d.densidade = ult('614') && ult('614').v; d.popAno = 2022; }
    if (pib.status === 'fulfilled') {
      const p = pib.value, ult = id => (p[id] || [])[0];
      if (ult('37')) { d.pib_mil = ult('37').v; d.pibAno = ult('37').ano; if (d.pop) d.pibPorHab = d.pib_mil * 1000 / d.pop; }
      /* composição da economia: ano mais recente com os quatro setores */
      const anos = (p['513'] || []).map(x => x.ano).filter(a => ['517', '6575', '525'].every(id => (p[id] || []).some(x => x.ano === a)));
      if (anos.length) {
        const a = anos[0], v = id => p[id].find(x => x.ano === a).v;
        const tot = v('513') + v('517') + v('6575') + v('525');
        if (tot > 0) d.vab = { ano: a, agro: v('513') / tot, industria: v('517') / tot, servicos: v('6575') / tot, publico: v('525') / tot };
      }
    }
    return d;
  }

  /* ---------------- clima: normal 1991–2020 (ERA5) e Köppen ---------------- */
  function koppen(T, P) {
    const tAn = T.reduce((a, b) => a + b, 0) / 12, pAn = P.reduce((a, b) => a + b, 0);
    const verao = [9, 10, 11, 0, 1, 2], inverno = [3, 4, 5, 6, 7, 8];   // hemisfério sul (out–mar / abr–set)
    const sul = (T[0] + T[1] + T[11]) >= (T[5] + T[6] + T[7]);
    const V = sul ? verao : inverno, I = sul ? inverno : verao;
    const pV = V.reduce((s, m) => s + P[m], 0), pI = I.reduce((s, m) => s + P[m], 0);
    const tMax = Math.max(...T), tMin = Math.min(...T), pMin = Math.min(...P);
    const lim = pI >= 0.7 * pAn ? 2 * tAn : pV >= 0.7 * pAn ? 2 * tAn + 28 : 2 * tAn + 14;
    if (pAn < 10 * lim) {
      const k = (pAn < 5 * lim ? 'BW' : 'BS') + (tAn >= 18 ? 'h' : 'k');
      return { k, nome: { BWh: 'árido quente', BWk: 'árido frio', BSh: 'semiárido quente', BSk: 'semiárido frio' }[k] };
    }
    if (tMin >= 18) {
      if (pMin >= 60) return { k: 'Af', nome: 'tropical úmido, sem estação seca' };
      if (pMin >= 100 - pAn / 25) return { k: 'Am', nome: 'tropical de monção' };
      const secoNoVerao = V.some(m => P[m] === pMin);
      return secoNoVerao ? { k: 'As', nome: 'tropical com verão seco' } : { k: 'Aw', nome: 'tropical com inverno seco' };
    }
    const pVmin = Math.min(...V.map(m => P[m])), pVmax = Math.max(...V.map(m => P[m])), pImin = Math.min(...I.map(m => P[m])), pImax = Math.max(...I.map(m => P[m]));
    let seg = 'f';
    if (pVmin < 40 && pVmin < pImax / 3) seg = 's'; else if (pImin < pVmax / 10) seg = 'w';
    const ter = tMax >= 22 ? 'a' : T.filter(t => t >= 10).length >= 4 ? 'b' : 'c';
    const k = (tMin > 0 ? 'C' : 'D') + seg + ter;
    const nomes = { s: 'com verão seco', w: 'com inverno seco', f: 'sem estação seca' }, nt = { a: 'verão quente', b: 'verão temperado', c: 'verão curto e fresco' };
    return { k, nome: `subtropical/temperado ${nomes[seg]}, ${nt[ter]}` };
  }
  function aridezClasse(ia) { return ia < 0.05 ? 'hiperárido' : ia < 0.2 ? 'árido' : ia < 0.5 ? 'semiárido' : ia < 0.65 ? 'subúmido seco' : ia < 1 ? 'subúmido úmido' : 'úmido'; }
  /* meses acima da média mensal, como faixa contínua (ex.: "dez–abr") */
  function estacaoChuvosa(P) {
    const med = P.reduce((a, b) => a + b, 0) / 12, acima = P.map(p => p > med);
    let melhor = null;
    for (let i = 0; i < 12; i++) {
      if (!acima[i] || acima[(i + 11) % 12]) continue;
      let n = 0; while (n < 12 && acima[(i + n) % 12]) n++;
      if (!melhor || n > melhor.n) melhor = { i, n };
    }
    if (!melhor) return null;
    const f = (melhor.i + melhor.n - 1) % 12, tot = Array.from({ length: melhor.n }, (_, k) => P[(melhor.i + k) % 12]).reduce((a, b) => a + b, 0);
    return { texto: melhor.n === 1 ? MESES[melhor.i] : `${MESES[melhor.i]}–${MESES[f]}`, meses: melhor.n, fracao: tot / P.reduce((a, b) => a + b, 0) };
  }
  async function clima(lon, lat) {
    const u = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&start_date=1991-01-01&end_date=2020-12-31&daily=temperature_2m_mean,precipitation_sum,shortwave_radiation_sum,et0_fao_evapotranspiration&timezone=auto`;
    const j = await VA.Net.json(u, { timeout: 45000 });
    if (!j.daily || !j.daily.time) throw new Error(j.reason || 'resposta sem série diária');
    const d = j.daily, tS = Array(12).fill(0), tN = Array(12).fill(0), pAno = {}, rS = Array(12).fill(0), rN = Array(12).fill(0), eAno = {};
    d.time.forEach((dia, i) => {
      const m = +dia.slice(5, 7) - 1, a = dia.slice(0, 4), k = a + '-' + m;
      if (d.temperature_2m_mean[i] != null) { tS[m] += d.temperature_2m_mean[i]; tN[m]++; }
      if (d.precipitation_sum[i] != null) pAno[k] = (pAno[k] || 0) + d.precipitation_sum[i];
      if (d.shortwave_radiation_sum[i] != null) { rS[m] += d.shortwave_radiation_sum[i]; rN[m]++; }
      if (d.et0_fao_evapotranspiration[i] != null) eAno[a] = (eAno[a] || 0) + d.et0_fao_evapotranspiration[i];
    });
    const anos = new Set(d.time.map(t => t.slice(0, 4))).size;
    const T = tS.map((s, m) => s / Math.max(1, tN[m]));
    const P = MESES.map((_, m) => Object.entries(pAno).filter(([k]) => +k.split('-')[1] === m).reduce((s, [, v]) => s + v, 0) / anos);
    const pAn = P.reduce((a, b) => a + b, 0), eto = Object.values(eAno).reduce((a, b) => a + b, 0) / anos;
    const rad = rS.reduce((a, b) => a + b, 0) / Math.max(1, rN.reduce((a, b) => a + b, 0)) / 3.6;  // MJ/m² → kWh/m²·dia
    const k = koppen(T, P), quente = T.indexOf(Math.max(...T)), frio = T.indexOf(Math.min(...T));
    const secos = P.filter((p, m) => p < 2 * T[m]).length;   // critério de Gaussen
    return {
      periodo: '1991–2020', anos, meses: MESES.map((nome, m) => ({ nome, t: +T[m].toFixed(1), p: +P[m].toFixed(0) })),
      tMedia: T.reduce((a, b) => a + b, 0) / 12, mesQuente: { nome: MESES[quente], t: T[quente] }, mesFrio: { nome: MESES[frio], t: T[frio] },
      chuvaAnual: pAn, chuvosa: estacaoChuvosa(P), mesesSecos: secos, eto, aridez: eto ? pAn / eto : null, aridezClasse: eto ? aridezClasse(pAn / eto) : null,
      irradiacao: rad, koppen: k.k, koppenNome: k.nome, elevacaoGrade: j.elevation,
      fonte: 'ERA5 (Copernicus/ECMWF) via Open-Meteo — médias de 1991 a 2020; Köppen e aridez (UNEP) calculados'
    };
  }

  /* ---------------- infraestrutura e distâncias ---------------- */
  async function sedes(c, cod) {
    const fc = await VA.ags.query(VA.URL.ANM + 'SIGMINE/estrutura_territorial/MapServer/5', { bbox: VA.geo.bboxBuffer({ type: 'Point', coordinates: c }, 60), outFields: 'NMSedeMunicipal,SGEstado,CDMunicipio', max: 400 });
    const l = fc.features.map(f => ({ nome: f.properties.NMSedeMunicipal, uf: f.properties.SGEstado, cod: String(f.properties.CDMunicipio), c: coordDe(f) })).filter(x => x.c);
    let propria = cod && l.find(x => x.cod === String(cod));
    if (!propria && cod) {
      const f2 = await VA.ags.query(VA.URL.ANM + 'SIGMINE/estrutura_territorial/MapServer/5', { where: `CDMunicipio='${cod}'`, outFields: 'NMSedeMunicipal,SGEstado,CDMunicipio', max: 1 });
      const f = f2.features[0]; if (f && coordDe(f)) propria = { nome: f.properties.NMSedeMunicipal, uf: f.properties.SGEstado, cod: String(cod), c: coordDe(f) };
    }
    return { propria, proxima: maisProximoPonto(c, l) };
  }
  const titulo = s => String(s || '').toLowerCase().replace(/(^|[\s\-(/])([a-zà-ú])/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos|E)\b/g, w => w.toLowerCase());
  async function rodovia(c) {
    for (const r of [40, 150, 400]) {
      const fc = await VA.ags.query(VA.URL.ANM + 'SIGMINE/transportes/MapServer/1', { bbox: VA.geo.bboxBuffer({ type: 'Point', coordinates: c }, r), outFields: 'NMRodovia', maxOffset: 0.002, max: 200 });
      const p = maisProximaLinha(c, fc);
      if (p) { const n = String(p.f.properties.NMRodovia || '').replace(/^BR\s*-?\s*(\d+)/i, 'BR-$1'); return { nome: n || 'Rodovia federal', km: p.km, fonte: 'IBGE/DNIT via ANM' }; }
    }
    return null;
  }
  /* a consulta (query) da camada de ferrovias devolve geometria nula; a busca (find) devolve as linhas inteiras */
  let cacheFerrovias = null;
  async function ferrovia(c) {
    if (!cacheFerrovias) {
      const base = VA.URL.ANM + 'SIGMINE/transportes/MapServer/find?layers=2&searchFields=NMFerrovia,NMLinha&returnGeometry=true&sr=4326&maxAllowableOffset=0.01&f=json&searchText=';
      const vistos = new Map();
      for (const t of ['a', 'o']) {
        const j = await VA.Net.json(base + t, { timeout: 30000 });
        (j.results || []).forEach(r => { const id = r.attributes.OBJECTID; if (!vistos.has(id) && r.geometry && r.geometry.paths) vistos.set(id, r); });
      }
      cacheFerrovias = { type: 'FeatureCollection', features: [...vistos.values()].map(r => ({ type: 'Feature', properties: { nome: r.attributes.Nome || r.attributes.NMFerrovia, linha: r.attributes.Linha || r.attributes.NMLinha || '' }, geometry: { type: 'MultiLineString', coordinates: r.geometry.paths } })) };
    }
    const p = maisProximaLinha(c, cacheFerrovias);
    return p ? { nome: p.f.properties.nome || 'Ferrovia', linha: p.f.properties.linha, km: p.km, fonte: 'ANTT via ANM' } : null;
  }
  let cachePortos = null;
  async function terminal(c) {
    if (!cachePortos) {
      const j = await VA.Net.json(VA.URL.ANM + 'SIGMINE/transportes/MapServer/find?searchText=Opera&layers=0&searchFields=DSSituacao&returnGeometry=true&sr=4326&f=json', { timeout: 30000 });
      cachePortos = (j.results || []).filter(r => r.geometry && /^(em )?opera/i.test(String(r.attributes['Situação'] || '').trim()) && !/estaleiro/i.test(r.attributes.Nome || ''))
        .map(r => ({ nome: String(r.attributes.Nome || '').replace(/\s+/g, ' ').trim(), cia: String(r.attributes.Companhia || '').trim(), c: [r.geometry.x, r.geometry.y] }));
    }
    const p = maisProximoPonto(c, cachePortos);
    return p ? Object.assign(p, { fonte: 'ANTAQ via ANM' }) : null;
  }
  async function aerodromos(c) {
    for (const r of [60, 200]) {
      const fc = await VA.wfs.obter(VA.URL.DNIT, 'vgeo:vw_aerodromos', VA.geo.bboxBuffer({ type: 'Point', coordinates: c }, r), { max: 800 });
      const l = fc.features.map(f => { const p = f.properties; return { nome: p.Nome, icao: p.Codigo_ICAO, municipio: p.Municipio, uf: p.Unidade_Federacao, pista: p.Extensao_m, largura: p.Largura_m, pavimento: p.Pavimento, publico: p.Uso === 'PUB', c: coordDe(f) }; }).filter(x => x.c);
      const pub = maisProximoPonto(c, l.filter(x => x.publico)), qualquer = maisProximoPonto(c, l);
      if (pub || r === 200) return { publico: pub, qualquer: qualquer && (!pub || qualquer.km < pub.km - 0.5) ? qualquer : null, fonte: 'ANAC via DNIT' };
    }
    return null;
  }
  /* rotas por estrada (servidor público do OSRM, malha do OpenStreetMap) */
  async function rotas(c, destinos) {
    if (!destinos.length) return null;
    const pts = [c].concat(destinos).map(p => p[0].toFixed(5) + ',' + p[1].toFixed(5)).join(';');
    const j = await VA.Net.json(`https://router.project-osrm.org/table/v1/driving/${pts}?sources=0&annotations=distance,duration`, { timeout: 20000 });
    if (j.code !== 'Ok') throw new Error('OSRM: ' + (j.message || j.code));
    return { km: j.distances[0].slice(1).map(v => v == null ? null : v / 1000), h: j.durations[0].slice(1).map(v => v == null ? null : v / 3600), acessoKm: j.sources && j.sources[0] ? j.sources[0].distance / 1000 : null };
  }

  /* ---------------- mapas de localização (Brasil e estado) ---------------- */
  function svgDe(fc, destacar, ponto, W) {
    const bb = turf.bbox(fc), latm = (bb[1] + bb[3]) / 2, kx = Math.cos(latm * Math.PI / 180);
    const w = (bb[2] - bb[0]) * kx, h = bb[3] - bb[1], s = W / Math.max(w, h), H = Math.round(h * s), Wr = Math.round(w * s);
    const P = ([x, y]) => (((x - bb[0]) * kx * s).toFixed(1) + ',' + ((bb[3] - y) * s).toFixed(1));
    const anel = r => 'M' + r.map(P).join('L') + 'Z';
    const caminho = g => g.type === 'Polygon' ? g.coordinates.map(anel).join('') : g.type === 'MultiPolygon' ? g.coordinates.map(p => p.map(anel).join('')).join('') : '';
    const partes = fc.features.map(f => ({ d: caminho(f.geometry), on: destacar(f) }));
    return { w: Wr, h: H, fundo: partes.filter(p => !p.on).map(p => p.d).join(''), destaque: partes.filter(p => p.on).map(p => p.d).join(''), ponto: ponto ? P(ponto).split(',').map(Number) : null };
  }
  /* estado com a mesorregião em destaque (em cima) e a mesorregião com o município em destaque (embaixo);
     sem mesorregião (municípios novos), usa a região geográfica intermediária */
  async function mapasLocalizacao(c, ufCod, munCod, admP) {
    const out = {};
    const adm = await Promise.resolve(admP).catch(() => null);
    const reg = adm && adm.mesoId ? { tipo: 'mesorregiao', nome: adm.meso, id: adm.mesoId, malha: 'mesorregioes', intra: 'mesorregiao' }
      : adm && adm.intermediariaId ? { tipo: 'intermediaria', nome: adm.intermediaria, id: adm.intermediariaId, malha: 'regioes-intermediarias', intra: 'regiao-intermediaria' } : null;
    const fmt = 'formato=application/vnd.geo+json';
    const [uf, rg] = await Promise.allSettled([
      ufCod ? VA.Net.json(`${IBGE}v3/malhas/estados/${ufCod}?${fmt}&intrarregiao=${reg ? reg.intra : 'municipio'}&qualidade=minima`, { timeout: 20000 }) : Promise.reject(new Error('sem UF')),
      reg ? VA.Net.json(`${IBGE}v3/malhas/${reg.malha}/${reg.id}?${fmt}&intrarregiao=municipio&qualidade=intermediaria`, { timeout: 20000 }) : Promise.reject(new Error('sem região'))
    ]);
    if (uf.status === 'fulfilled' && uf.value.features) out.estado = svgDe(uf.value, f => String(f.properties.codarea) === String(reg ? reg.id : munCod), c, 200);
    if (rg.status === 'fulfilled' && rg.value.features) out.regiao = Object.assign(svgDe(rg.value, f => String(f.properties.codarea) === String(munCod), c, 200), { tipo: reg.tipo, nome: reg.nome });
    return out;
  }

  /* ---------------- ficha completa ---------------- */
  VA.fichaLocal = async function (aoi, { municipio, aoProgresso } = {}) {
    const c = VA.geo.centro(aoi), [lon, lat] = c;
    const f = { centro: c, consultadoEm: new Date().toISOString(), erros: [], distancias: [] };
    const avisar = t => aoProgresso && aoProgresso(t);
    const mun = municipio || await VA.municipioEm(lon, lat).catch(() => null);
    const cod = mun && mun.codigo ? String(mun.codigo) : null;
    avisar('Montando a ficha do local (IBGE, clima, acessos)…');
    const guardar = (nome, p, ms) => comTempo(p, ms).catch(e => { f.erros.push(`${nome}: ${e.message}`); return null; });
    const ufCod = mun && mun.uf ? Object.keys(VA.UF_COD).find(k => VA.UF_COD[k] === mun.uf) : null;
    const admP = cod ? municipioIBGE(cod) : null;
    if (admP) admP.catch(() => null);
    const [adm, dm, cl, sd, rod, fer, ter, aer, amaz, fronteira, cota, mapas] = await Promise.all([
      cod ? guardar('IBGE localidades', admP, 20000) : null,
      cod ? guardar('IBGE dados do município', dadosMunicipio(cod), 25000) : null,
      guardar('Clima (Open-Meteo)', clima(lon, lat), 50000),
      guardar('Sedes municipais', sedes(c, cod), 25000),
      guardar('Rodovias federais', rodovia(c), 30000),
      guardar('Ferrovias', ferrovia(c), 30000),
      guardar('Terminais portuários', terminal(c), 30000),
      guardar('Aeródromos', aerodromos(c), 30000),
      guardar('Amazônia Legal', VA.ags.query(VA.URL.ANM + 'SIGMINE/estrutura_territorial/MapServer/0', { ponto: c, returnGeometry: false, outFields: 'OBJECTID', max: 1 }), 20000),
      guardar('Faixa de fronteira', VA.ags.query(VA.URL.ANM + 'SIGMINE/estrutura_territorial/MapServer/3', { ponto: c, returnGeometry: false, outFields: 'OBJECTID', max: 1 }), 20000),
      VA.cota ? guardar('Altitude', VA.cota(lon, lat), 20000) : null,
      guardar('Mapas de localização (IBGE)', mapasLocalizacao(c, ufCod, cod, admP), 30000)
    ]);
    if (mapas) f.mapas = mapas;
    f.adm = adm || (mun ? { municipio: mun.municipio, uf: mun.uf, codigo: cod, fonte: mun.fonte } : null);
    if (f.adm && !f.adm.regiao && f.adm.uf) { const cd = Object.keys(VA.UF_COD).find(k => VA.UF_COD[k] === f.adm.uf); const reg = { 1: ['Norte', 'N'], 2: ['Nordeste', 'NE'], 3: ['Sudeste', 'SE'], 4: ['Sul', 'S'], 5: ['Centro-Oeste', 'CO'] }[String(cd || '')[0]]; if (reg) { f.adm.regiao = reg[0]; f.adm.regiaoSigla = reg[1]; } }
    f.municipio = dm;
    f.clima = cl;
    f.cota = cota;
    f.territorio = { amazoniaLegal: amaz ? amaz.features.length > 0 : null, faixaFronteira: fronteira ? fronteira.features.length > 0 : null };

    /* destinos: linha reta e, para os pontos, rota por estrada */
    const uf = f.adm && f.adm.uf, destinos = [];
    const add = (o) => { f.distancias.push(o); if (o.c) destinos.push(o); };
    if (sd && sd.propria) add({ tipo: 'sede', rotulo: 'Sede do município', nome: `${titulo(sd.propria.nome)}-${sd.propria.uf}`, c: sd.propria.c, km: km(c, sd.propria.c), rumo: rumo(c, sd.propria.c), fonte: 'IBGE via ANM' });
    if (sd && sd.proxima && (!sd.propria || sd.proxima.cod !== sd.propria.cod) && sd.proxima.km < (sd.propria ? km(c, sd.propria.c) - 1 : 1e9)) add({ tipo: 'cidade', rotulo: 'Cidade mais próxima', nome: `${titulo(sd.proxima.nome)}-${sd.proxima.uf}`, c: sd.proxima.c, km: sd.proxima.km, rumo: rumo(c, sd.proxima.c), fonte: 'IBGE via ANM' });
    if (uf && CAPITAIS[uf]) { const [n, x, y] = CAPITAIS[uf]; add({ tipo: 'capital', rotulo: 'Capital do estado', nome: `${n}-${uf}`, c: [x, y], km: km(c, [x, y]), rumo: rumo(c, [x, y]), fonte: 'IBGE' }); }
    if (rod) f.distancias.push({ tipo: 'rodovia', rotulo: 'Rodovia federal mais próxima', nome: rod.nome, km: rod.km, fonte: rod.fonte });
    if (fer) f.distancias.push({ tipo: 'ferrovia', rotulo: 'Ferrovia mais próxima', nome: fer.nome + (fer.linha ? ` (${fer.linha})` : ''), km: fer.km, fonte: fer.fonte });
    const pm = maisProximoPonto(c, PORTOS_MAR.map(([nome, u, x, y]) => ({ nome: `Porto de ${nome}-${u}`, c: [x, y] })));
    if (pm) add({ tipo: 'porto', rotulo: 'Porto marítimo público mais próximo', nome: pm.nome, c: pm.c, km: pm.km, rumo: rumo(c, pm.c), fonte: 'portos organizados (ANTAQ) — coordenadas de referência' });
    if (ter && (!pm || ter.km < pm.km - 15)) add({ tipo: 'terminal', rotulo: 'Terminal portuário mais próximo', nome: ter.nome + (ter.cia ? ` — ${titulo(ter.cia)}` : ''), c: ter.c, km: ter.km, rumo: rumo(c, ter.c), fonte: ter.fonte });
    if (aer && aer.publico) { const a = aer.publico; add({ tipo: 'aerodromo', rotulo: 'Aeródromo público mais próximo', nome: `${a.nome}${a.icao ? ' (' + a.icao + ')' : ''} — ${a.municipio}-${a.uf}`, det: [a.pista ? `pista de ${VA.fmt.num(a.pista, 0)} m` : null, a.pavimento].filter(Boolean).join(', '), c: a.c, km: a.km, rumo: rumo(c, a.c), fonte: aer.fonte }); }
    if (aer && aer.qualquer) { const a = aer.qualquer; f.distancias.push({ tipo: 'pista', rotulo: 'Pista de pouso mais próxima (uso privado)', nome: `${a.nome}${a.icao ? ' (' + a.icao + ')' : ''}`, det: [a.pista ? `${VA.fmt.num(a.pista, 0)} m` : null, a.pavimento].filter(Boolean).join(', '), km: a.km, fonte: aer.fonte }); }
    if (destinos.length) {
      avisar('Calculando rotas por estrada…');
      const r = await guardar('Rotas por estrada (OSRM)', rotas(c, destinos.map(d => d.c)), 25000);
      if (r) { destinos.forEach((d, i) => { if (r.km[i] != null) { d.estradaKm = r.km[i]; d.estradaH = r.h[i]; } }); f.acessoKm = r.acessoKm; f.rotasFonte = 'OSRM sobre a malha viária do OpenStreetMap'; }
    }
    f.distancias.forEach(d => { delete d.c; });
    return f;
  };
})();
