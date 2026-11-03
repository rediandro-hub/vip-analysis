/* VIP ANALYSIS — interface: área de interesse, parâmetros por setor, análise, quadro dentro/fora,
   camadas por setor e por UF, ficha do ponto, régua, módulo Mineração · Bateia e saídas. */
'use strict';

(function () {
  const VA = window.VA;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => VA.fmt.esc(s);
  const APP = VA.app = {};
  const estado = { aoi: null, origem: '', notas: [], municipios: null, cota: null, analise: null, avaliacao: null, sessao: null, porEvid: {}, rodando: false, bateiaVip: null };

  /* =============================== tema =============================== */
  function aplicarTema(t) { document.documentElement.dataset.theme = t; VA.armazem.gravar('tema', t); }
  aplicarTema(VA.armazem.ler('tema', 'claro'));
  $('#btnTema').addEventListener('click', () => aplicarTema(document.documentElement.dataset.theme === 'escuro' ? 'claro' : 'escuro'));

  /* ============================ utilidades ============================ */
  let tAviso;
  function aviso(msg, erro = false, ms) {
    const el = $('#aviso'); el.textContent = msg; el.className = 'aviso-flutuante' + (erro ? ' erro' : ''); el.hidden = false;
    clearTimeout(tAviso); tAviso = setTimeout(() => { el.hidden = true; }, ms || (erro ? 8000 : 3500));
  }
  APP.aviso = aviso;
  function copiar(txt, msg = 'Copiado.', alternativa) {
    const ok = () => aviso(msg);
    const velho = () => {
      const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      let feito = false; try { feito = document.execCommand('copy'); } catch (e) { }
      ta.remove(); feito ? ok() : (alternativa ? alternativa() : aviso('Não foi possível copiar.', true));
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(ok, velho); else velho();
  }
  const carimbo = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
  document.addEventListener('click', e => { const b = e.target.closest('.copiar[data-copiar]'); if (b) { e.preventDefault(); copiar(b.dataset.copiar, 'Copiado: ' + b.dataset.copiar); } });

  function modal(html, aoMontar) {
    $('#modalCorpo').innerHTML = html; $('#modal').hidden = false;
    const fechar = () => { $('#modal').hidden = true; $('#modalCorpo').innerHTML = ''; };
    $('#modal').onclick = e => { if (e.target.id === 'modal' || e.target.closest('[data-fechar]')) fechar(); };
    if (aoMontar) aoMontar(fechar);
    return fechar;
  }
  APP.modal = modal;

  /* ============================== mapa ============================== */
  VA.mapa.init();
  const M = VA.mapa, mapa = M.L;
  const COR_AOI = '#1665d8';
  const estiloAOI = { color: COR_AOI, weight: 3, fillColor: COR_AOI, fillOpacity: 0.08 };
  mapa.pm.setGlobalOptions({ snappable: false, pathOptions: estiloAOI, templineStyle: { color: COR_AOI }, hintlineStyle: { color: COR_AOI, dashArray: '5,5' } });
  let camadaAOI = null, circuloRaio = null;

  /* rodapé: cursor em três formatos */
  mapa.on('mousemove', e => {
    const lon = ((e.latlng.lng + 540) % 360) - 180, lat = e.latlng.lat;
    try {
      const f = VA.coord.formatos(lon, lat);
      $('#cursorDec').textContent = f.dec; $('#cursorGMS').textContent = f.gms; $('#cursorUTM').textContent = 'UTM ' + f.utm;
    } catch (err) { }
  });
  const atualizarZoom = () => { $('#zoomInfo').textContent = 'zoom ' + mapa.getZoom(); };
  mapa.on('zoomend', atualizarZoom); atualizarZoom();

  /* ========================= área de interesse ========================= */
  function normalizarAOI(gj) {
    const feats = gj.type === 'FeatureCollection' ? gj.features : gj.type === 'Feature' ? [gj] : [{ type: 'Feature', properties: {}, geometry: gj }];
    const polys = [], pts = [], notas = [];
    const d2 = c => (typeof c[0] === 'number' ? [c[0], c[1]] : c.map(d2));
    turf.flatten(turf.featureCollection(feats.filter(f => f && f.geometry))).features.forEach(f => {
      const g = f.geometry, c = d2(g.coordinates);
      if (g.type === 'Polygon') polys.push(c);
      else if (g.type === 'Point') pts.push(c);
      else if (g.type === 'LineString') {
        const fechada = c.length >= 4 && c[0][0] === c[c.length - 1][0] && c[0][1] === c[c.length - 1][1];
        if (fechada) { polys.push([c]); notas.push('Linha fechada convertida em polígono.'); }
        else { polys.push(turf.buffer(turf.lineString(c), 10, { units: 'meters' }).geometry.coordinates); notas.push('Linha aberta convertida em faixa de 20 m.'); }
      }
    });
    let geometry;
    if (polys.length) {
      geometry = polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
      if (pts.length) notas.push(`${pts.length} ponto(s) do arquivo ignorado(s): a análise usa os polígonos.`);
    } else if (pts.length === 1) geometry = { type: 'Point', coordinates: pts[0] };
    else if (pts.length > 1) { geometry = { type: 'MultiPoint', coordinates: pts }; notas.push(`${pts.length} pontos analisados em conjunto.`); }
    else throw new Error('Nenhuma geometria utilizável (ponto, linha ou polígono) foi encontrada.');
    const c0 = VA.geo.primeiraCoord(geometry);
    if (Math.abs(c0[0]) > 180 || Math.abs(c0[1]) > 90) throw new Error('As coordenadas parecem projetadas (UTM). Exporte o arquivo em coordenadas geográficas (WGS 84 ou SIRGAS 2000).');
    if (c0[0] > -34 && c0[0] < 6 && c0[1] < -30) { VA.geo.trocar(geometry); notas.push('Eixos lat/lon invertidos no arquivo foram corrigidos.'); }
    return { feature: { type: 'Feature', properties: {}, geometry }, notas };
  }

  function definirAOI(feature, origem, notas = [], enquadrar = true) {
    sairEdicao();
    estado.aoi = feature; estado.origem = origem; estado.notas = notas; estado.municipios = null; estado.cota = null;
    if (camadaAOI) mapa.removeLayer(camadaAOI);
    camadaAOI = L.geoJSON(feature, {
      style: estiloAOI,
      pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 8, color: COR_AOI, weight: 3, fillColor: '#ffffff', fillOpacity: 0.95 })
    }).addTo(mapa);
    camadaAOI.on('pm:edit pm:dragend', () => {
      try { const n = normalizarAOI(camadaAOI.toGeoJSON()); if (/Polygon/.test(n.feature.geometry.type) && turf.kinks(n.feature).features.length) aviso('Atenção: o polígono editado se cruza; corrija os vértices.', true); estado.aoi = n.feature; estado.municipios = null; estado.cota = null; mostrarAOI(); desenharRaio(); buscarMunicipios(); buscarCota(); } catch (e) { aviso(e.message, true); }
    });
    if (enquadrar) {
      if (feature.geometry.type === 'Point') mapa.setView([feature.geometry.coordinates[1], feature.geometry.coordinates[0]], Math.max(mapa.getZoom(), 14));
      else mapa.fitBounds(camadaAOI.getBounds(), { padding: [40, 40], maxZoom: 17 });
    }
    desenharRaio();
    mostrarAOI();
    botaoAnalisar();
    $('#enviarBateia').disabled = false;
    mostrarAba('analise');
    buscarMunicipios();
    buscarCota();
  }
  APP.definirAOI = definirAOI;

  async function buscarCota() {
    const aoi = estado.aoi; if (!aoi) return;
    const [lon, lat] = VA.geo.centro(aoi);
    let txt;
    try { const c = await VA.cota(lon, lat); if (estado.aoi !== aoi) return; estado.cota = c; if (estado.sessao && estado.sessao.aoi === aoi) estado.sessao.cota = c; txt = `${VA.fmt.num(c.m, 0)} m <span class="muted">· estimada (${esc(c.fonte)})</span>`; }
    catch (e) { if (estado.aoi !== aoi) return; txt = '<span class="muted">indisponível</span>'; }
    const el = $('#aoiCota'); if (el) el.innerHTML = txt;
  }

  function desenharRaio() {
    if (circuloRaio) { mapa.removeLayer(circuloRaio); circuloRaio = null; }
    const r = +$('#pRaioPonto').value || 0;
    if (estado.aoi && estado.aoi.geometry.type === 'Point' && r > 0) {
      const [lon, lat] = estado.aoi.geometry.coordinates;
      circuloRaio = L.circle([lat, lon], { radius: r, color: COR_AOI, weight: 2, dashArray: '6 5', fillOpacity: 0.04, interactive: false }).addTo(mapa);
    }
  }

  async function buscarMunicipios() {
    const aoi = estado.aoi; if (!aoi) return;
    let lista = [];
    const c = VA.geo.centro(aoi);
    const doCentro = await VA.municipioEm(c[0], c[1]).catch(() => null);
    if (doCentro) lista.push(doCentro);
    if (/Polygon/.test(aoi.geometry.type)) {
      try {
        const fc = await VA.ags.query(VA.URL.ANM + 'SIGMINE/estrutura_territorial/MapServer/2', { bbox: turf.bbox(aoi), outFields: 'NMMunicipio,SGEstado,CDMunicipio', returnGeometry: true, maxOffset: 0.001, max: 60 });
        fc.features.forEach(f => {
          const p = f.properties; let toca = false;
          try { toca = !!f.geometry && turf.booleanIntersects(aoi, f); } catch (e) { }
          if (toca && !lista.some(m => m.municipio === p.NMMunicipio && m.uf === p.SGEstado)) lista.push({ municipio: p.NMMunicipio, uf: p.SGEstado, codigo: p.CDMunicipio, fonte: 'IBGE (malha municipal via ANM)' });
        });
      } catch (e) { /* fica só o do centro */ }
    }
    if (estado.aoi !== aoi) return;
    estado.municipios = lista;
    const el = $('#aoiMun'); if (el) el.textContent = lista.length ? lista.map(VA.fmt.munUF).join(', ') : 'não identificado';
    if (estado.sessao && estado.sessao.aoi === aoi) estado.sessao.municipios = lista;
    const uf = lista[0] && lista[0].uf;
    if (uf && /^[A-Z]{2}$/.test(uf)) M.definirUF(uf);
    contarFontes();   // camadas estaduais (ex.: INEA no RJ) dependem do estado da área
  }

  function aoiParaAnalise(p) {
    const a = estado.aoi;
    if (p.requerimento && a.geometry.type === 'Point') {
      const lim = VA.limiteRequerimento(p.reqSubstancia, false);
      const ha = p.reqHa > 0 ? p.reqHa : lim.ha > 0 ? lim.ha : 50;
      p.reqPonto = true; p.reqHaUsado = ha;
      return { aoi: VA.quadradoNSLO(a.geometry.coordinates[0], a.geometry.coordinates[1], ha), origem: `${estado.origem} + quadrado N-S/L-O de ${VA.fmt.num(ha, 0)} ha (área pretendida)` };
    }
    if (a.geometry.type === 'Point' && p.raioPontoM > 0) {
      const c = turf.circle(a.geometry.coordinates, p.raioPontoM / 1000, { steps: 72, units: 'kilometers' });
      c.properties = {};
      return { aoi: c, origem: `${estado.origem} + raio de ${VA.fmt.num(p.raioPontoM, 0)} m` };
    }
    return { aoi: a, origem: estado.origem };
  }

  function mostrarAOI() {
    const el = $('#infoAOI');
    $('#cartaoAOI').hidden = !estado.aoi;
    if (!estado.aoi) {
      el.innerHTML = `<div class="vazio-msg">Para analisar, defina a área pelas ferramentas do topo: <b>Ponto</b>, <b>Polígono</b>, <b>Retângulo</b>, <b>Círculo</b>, <b>Importar</b> (KML/KMZ/GeoJSON/shapefile) ou uma coordenada digitada (decimal, GMS ou UTM). Aí os botões <b>Analisar área</b> e <b>Gerar relatório</b> acendem.<br>Clique em qualquer elemento do mapa para ver as informações dele.</div>`;
      return;
    }
    const m = VA.metricasAOI(estado.aoi), f = m.f, g = estado.aoi.geometry;
    const mun = estado.municipios;
    el.innerHTML = `<div class="kv">
      <div class="k">Tipo</div><div class="v">${esc(m.tipo)} <span class="muted">· ${esc(estado.origem)}</span></div>
      ${m.area_ha != null ? `<div class="k">Área</div><div class="v"><b>${VA.fmt.ha(m.area_ha)}</b> <span class="muted">· perímetro ${VA.fmt.num(m.perimetro_km, 3)} km · ${m.vertices} vértices</span></div>` : ''}
      <div class="k">Município</div><div class="v" id="aoiMun">${mun ? esc(mun.length ? mun.map(VA.fmt.munUF).join(', ') : 'não identificado') : '<span class="muted">consultando…</span>'}</div>
      <div class="k">${m.area_ha != null ? 'Cota centro' : 'Cota'}</div><div class="v" id="aoiCota">${estado.cota ? `${VA.fmt.num(estado.cota.m, 0)} m <span class="muted">· estimada (${esc(estado.cota.fonte)})</span>` : '<span class="muted">consultando…</span>'}</div>
      <div class="k">${m.area_ha != null ? 'Centro' : 'Decimal'}</div><div class="v mono">${f.dec} <button class="mini copiar" data-copiar="${f.dec}">copiar</button></div>
      <div class="k">GMS</div><div class="v mono">${f.gms} <button class="mini copiar" data-copiar="${f.gms}">copiar</button></div>
      <div class="k">UTM</div><div class="v mono">${f.utm} <button class="mini copiar" data-copiar="${f.utm}">copiar</button></div>
      <div class="k"></div><div class="v pequeno muted">${f.utmDet}</div>
    </div>
    ${estado.notas.length ? `<div class="notas-aoi">${estado.notas.map(esc).join('<br>')}</div>` : ''}
    <div class="mini-acoes">
      <button class="btn" data-aoi="ver">Ver no mapa</button>
      ${/Polygon/.test(g.type) ? '<button class="btn" data-aoi="vertices">Vértices (UTM e GMS)</button>' : ''}
      ${g.type === 'MultiPoint' && g.coordinates.length >= 3 ? '<button class="btn" data-aoi="ligar">Ligar pontos em polígono</button>' : ''}
      <button class="btn" data-aoi="kml">Baixar KML</button>
      <button class="btn" data-aoi="geojson">Baixar GeoJSON</button>
      <button class="btn" data-aoi="salvar">Salvar estudo</button>
    </div>`;
  }
  $('#infoAOI').addEventListener('click', e => {
    const b = e.target.closest('[data-aoi]'); if (!b || !estado.aoi) return;
    const acao = b.dataset.aoi, g = estado.aoi.geometry;
    if (acao === 'ver' && camadaAOI) { if (g.type === 'Point') mapa.setView(camadaAOI.getBounds().getCenter(), Math.max(mapa.getZoom(), 14)); else mapa.fitBounds(camadaAOI.getBounds(), { padding: [40, 40], maxZoom: 17 }); mostrarVista('mapa'); }
    if (acao === 'ligar') { const c = g.coordinates.slice(); c.push(c[0]); definirAOI({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [c] } }, estado.origem + ' (pontos ligados na ordem do arquivo)'); }
    if (acao === 'kml') VA.baixar(`area-${carimbo()}.kml`, kmlDaArea(estado.aoi, estado.origem), 'application/vnd.google-earth.kml+xml');
    if (acao === 'vertices') mostrarVertices();
    if (acao === 'geojson') VA.baixar(`area-${carimbo()}.geojson`, JSON.stringify(Object.assign({}, estado.aoi, { properties: { nome: estado.origem } }), null, 1), 'application/geo+json');
    if (acao === 'salvar') salvarEstudo();
  });

  function kmlDaArea(aoi, nome) {
    const anel = r => `<LinearRing><coordinates>${r.map(c => c[0].toFixed(7) + ',' + c[1].toFixed(7) + ',0').join(' ')}</coordinates></LinearRing>`;
    const poli = p => `<Polygon><outerBoundaryIs>${anel(p[0])}</outerBoundaryIs>${p.slice(1).map(r => `<innerBoundaryIs>${anel(r)}</innerBoundaryIs>`).join('')}</Polygon>`;
    const g = aoi.geometry;
    let geo = '';
    if (g.type === 'Point') geo = `<Point><coordinates>${g.coordinates[0]},${g.coordinates[1]},0</coordinates></Point>`;
    else if (g.type === 'MultiPoint') geo = `<MultiGeometry>${g.coordinates.map(c => `<Point><coordinates>${c[0]},${c[1]},0</coordinates></Point>`).join('')}</MultiGeometry>`;
    else if (g.type === 'Polygon') geo = poli(g.coordinates);
    else geo = `<MultiGeometry>${g.coordinates.map(poli).join('')}</MultiGeometry>`;
    return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>VIP ANALYSIS — área de interesse</name><Style id="a"><LineStyle><color>ffd86516</color><width>3</width></LineStyle><PolyStyle><color>33d86516</color></PolyStyle></Style><Placemark><name>${esc(nome)}</name><styleUrl>#a</styleUrl>${geo}</Placemark></Document></kml>`;
  }

  function mostrarVertices() {
    const g = estado.aoi.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    const linhas = []; let n = 0;
    polys.forEach((p, k) => p[0].slice(0, -1).forEach(([lon, lat], i) => {
      const u = VA.coord.paraUTM(lon, lat);
      linhas.push({ p: k, i, v: (polys.length > 1 ? `P${k + 1}-` : '') + 'V' + (++n), zona: u.zona, hemis: u.hemis, e: u.e, n: u.n, lat, lon, gms: VA.coord.fmtGMS(lat, 'N', 'S') + ' ' + VA.coord.fmtGMS(lon, 'L', 'O') });
    }));
    const csv = 'vertice;fuso;E (m);N (m);latitude;longitude;GMS\n' + linhas.map(l => [l.v, l.zona + l.hemis, l.e.toFixed(3), l.n.toFixed(3), l.lat.toFixed(8), l.lon.toFixed(8), l.gms].join(';')).join('\n');
    modal(`<div class="modal-cab"><b>Vértices da área — SIRGAS 2000</b><button class="x" data-fechar>×</button></div>
      <p class="pequeno muted">Edite as coordenadas de qualquer vértice — em UTM (E/N) ou em graus decimais — e clique em “Aplicar alterações”. O polígono não pode se cruzar.</p>
      <div class="tab-rolagem"><table class="tab vert"><thead><tr><th>Vértice</th><th>Fuso</th><th>E (m)</th><th>N (m)</th><th>Latitude</th><th>Longitude</th><th>GMS</th></tr></thead><tbody>
      ${linhas.map((l, j) => `<tr data-j="${j}"><td>${l.v}</td><td>${l.zona}${l.hemis}</td><td><input class="mono" data-c="e" value="${l.e.toFixed(2)}"></td><td><input class="mono" data-c="n" value="${l.n.toFixed(2)}"></td><td><input class="mono" data-c="lat" value="${l.lat.toFixed(7)}"></td><td><input class="mono" data-c="lon" value="${l.lon.toFixed(7)}"></td><td class="mono pequeno">${l.gms}</td></tr>`).join('')}</tbody></table></div>
      <div class="mini-acoes"><button class="btn btn-pri" id="vAplicar">Aplicar alterações</button><button class="btn" id="vCopiar">Copiar tabela</button><button class="btn" id="vCsv">Baixar CSV</button></div>`, fechar => {
      const tab = $('#modalCorpo .vert');
      tab.addEventListener('input', e => { const tr = e.target.closest('tr'); if (tr) tr.dataset.fonte = /^(e|n)$/.test(e.target.dataset.c) ? 'utm' : 'geo'; });
      $('#vCopiar').onclick = () => copiar(csv.replace(/;/g, '\t'), 'Tabela de vértices copiada (cole no Excel).');
      $('#vCsv').onclick = () => VA.baixar(`vertices-${carimbo()}.csv`, '﻿' + csv, 'text/csv');
      $('#vAplicar').onclick = () => {
        const novo = JSON.parse(JSON.stringify(polys));
        try {
          [...tab.querySelectorAll('tr[data-j]')].forEach(tr => {
            const l = linhas[+tr.dataset.j], val = c => +String(tr.querySelector(`[data-c="${c}"]`).value).replace(',', '.');
            let lon = l.lon, lat = l.lat;
            if (tr.dataset.fonte === 'utm') [lon, lat] = VA.coord.deUTM(l.zona, val('e'), val('n'), l.hemis === 'S');
            else if (tr.dataset.fonte === 'geo') { lat = val('lat'); lon = val('lon'); }
            if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error(`coordenada inválida no vértice ${l.v}`);
            novo[l.p][0][l.i] = [lon, lat];
          });
          novo.forEach(p => { p[0][p[0].length - 1] = p[0][0].slice(); });
          const f = { type: 'Feature', properties: {}, geometry: novo.length === 1 ? { type: 'Polygon', coordinates: novo[0] } : { type: 'MultiPolygon', coordinates: novo } };
          if (turf.kinks(f).features.length) throw new Error('com essas coordenadas o polígono se cruza');
          fechar(); definirAOI(f, estado.origem.replace(/ \(vértices editados\)$/, '') + ' (vértices editados)', estado.notas, false);
          aviso('Vértices atualizados.');
        } catch (err) { aviso('Não apliquei: ' + err.message, true); }
      };
    });
  }

  /* desenho (Geoman) */
  function sairDesenho() {
    $$('[data-desenho]').forEach(x => x.classList.remove('ativo'));
    if (mapa.pm.globalDrawModeEnabled()) mapa.pm.disableDraw();
    if (M.modo === 'desenho') M.modo = null;
  }
  function sairEdicao() {
    if (camadaAOI) camadaAOI.eachLayer(l => { if (l.pm && l.pm.enabled && l.pm.enabled()) l.pm.disable(); });
    $('#btnEditar').classList.remove('ativo');
    if (M.modo === 'edicao') M.modo = null;
  }
  $$('[data-desenho]').forEach(b => b.addEventListener('click', () => {
    const forma = b.dataset.desenho;
    const jaAtivo = b.classList.contains('ativo');
    sairDesenho(); sairEdicao();
    if (jaAtivo) return;
    if (M.modo === 'regua') VA.regua.parar();
    b.classList.add('ativo'); M.modo = 'desenho';
    mapa.pm.enableDraw(forma, { continueDrawing: false });
    mostrarVista('mapa');
  }));
  mapa.on('pm:drawend', () => { $$('[data-desenho]').forEach(x => x.classList.remove('ativo')); setTimeout(() => { if (M.modo === 'desenho') M.modo = null; }, 60); });
  mapa.on('pm:create', e => {
    let gj = e.layer.toGeoJSON();
    let origem = { CircleMarker: 'Ponto marcado no mapa', Marker: 'Ponto marcado no mapa', Polygon: 'Polígono desenhado', Rectangle: 'Retângulo desenhado', Circle: 'Círculo desenhado' }[e.shape] || 'Desenho';
    if (e.shape === 'Circle') { const r = e.layer.getRadius(); gj = turf.circle(gj.geometry.coordinates, r / 1000, { steps: 72, units: 'kilometers' }); origem += ` (raio ${VA.fmt.num(r, 0)} m)`; }
    mapa.removeLayer(e.layer);
    if (e.shape === 'Polygon' && turf.kinks(gj).features.length) return aviso('O polígono se cruza. Desenhe de novo, sem cruzar as linhas.', true);
    try { const n = normalizarAOI(gj); definirAOI(n.feature, origem, n.notas, false); } catch (err) { aviso(err.message, true); }
  });
  $('#btnEditar').addEventListener('click', () => {
    if (!camadaAOI) return aviso('Defina uma área primeiro.');
    const ligar = !$('#btnEditar').classList.contains('ativo');
    sairDesenho(); if (M.modo === 'regua') VA.regua.parar();
    if (!ligar) return sairEdicao();
    camadaAOI.eachLayer(l => { if (l.pm) l.pm.enable({ snappable: false, draggable: true }); });
    $('#btnEditar').classList.add('ativo'); M.modo = 'edicao';
    aviso('Arraste os vértices. Clique em “Editar” de novo para terminar.');
  });
  $('#btnLimpar').addEventListener('click', () => {
    sairDesenho(); sairEdicao();
    if (camadaAOI) mapa.removeLayer(camadaAOI); camadaAOI = null;
    if (circuloRaio) mapa.removeLayer(circuloRaio); circuloRaio = null;
    if (M._marcaFicha) { mapa.removeLayer(M._marcaFicha); M._marcaFicha = null; }
    VA.regua.parar(); M.resultados.clearLayers(); mapa.closePopup(); fecharFicha();
    Object.assign(estado, { aoi: null, municipios: null, analise: null, avaliacao: null, sessao: null, porEvid: {} });
    mostrarAOI(); $('#resultados').innerHTML = ''; $('#acoesSaida').hidden = true; botaoAnalisar(); $('#enviarBateia').disabled = true;
  });

  /* coordenada digitada */
  $('#formBusca').addEventListener('submit', e => {
    e.preventDefault();
    const txt = $('#campoCoord').value.trim(); if (!txt) return;
    let lon, lat;
    try { [lon, lat] = VA.coord.interpretar(txt); }
    catch (err) { if (VA.busca && /[a-zà-ú]{2}/i.test(txt.replace(/\b[NSLOEW]\b/g, ''))) return VA.busca.texto(txt); return aviso(err.message, true); }
    definirAOI({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [lon, lat] } }, 'Coordenada digitada: ' + txt);
    mostrarVista('mapa');
  });

  /* importação */
  $('#arquivo').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const nome = f.name.toLowerCase();
      let gj;
      if (nome.endsWith('.kmz')) {
        const zip = await JSZip.loadAsync(await f.arrayBuffer());
        const kml = Object.values(zip.files).find(z => z.name.toLowerCase().endsWith('.kml'));
        if (!kml) throw new Error('KMZ sem arquivo .kml interno.');
        gj = toGeoJSON.kml(new DOMParser().parseFromString(await kml.async('string'), 'text/xml'));
      } else if (nome.endsWith('.kml')) gj = toGeoJSON.kml(new DOMParser().parseFromString(await f.text(), 'text/xml'));
      else if (nome.endsWith('.zip')) { let r = await shp(await f.arrayBuffer()); if (Array.isArray(r)) r = { type: 'FeatureCollection', features: r.flatMap(x => x.features) }; gj = r; }
      else gj = JSON.parse(await f.text());
      const feats = (gj.type === 'FeatureCollection' ? gj.features : [gj]).filter(x => x && (x.geometry || x.type !== 'Feature'));
      const usar = (geo, rotulo) => { const n = normalizarAOI(geo); definirAOI(n.feature, rotulo, n.notas); mostrarVista('mapa'); };
      if (feats.length <= 1) return usar(gj, 'Arquivo ' + f.name);
      const nomeF = (x, i) => (x.properties && (x.properties.name || x.properties.Name || x.properties.nome || x.properties.NOME)) || `Geometria ${i + 1}`;
      modal(`<div class="modal-cab"><b>${esc(f.name)}: ${feats.length} geometrias</b><button class="x" data-fechar>×</button></div>
        <p class="pequeno">Analise todas juntas como uma só área, ou escolha uma delas.</p>
        <button class="btn btn-pri largo" data-imp="todas">Usar todas juntas</button>
        <div class="lista-imp">${feats.map((x, i) => `<button class="btn" data-imp="${i}">${esc(nomeF(x, i))} <span class="muted">· ${esc((x.geometry || x).type)}</span></button>`).join('')}</div>`, fechar => {
        $('#modalCorpo').addEventListener('click', ev => {
          const b = ev.target.closest('[data-imp]'); if (!b) return;
          fechar();
          try { if (b.dataset.imp === 'todas') usar(gj, 'Arquivo ' + f.name); else { const i = +b.dataset.imp; usar(feats[i], `Arquivo ${f.name} — ${nomeF(feats[i], i)}`); } }
          catch (err) { aviso('Não foi possível importar: ' + err.message, true); }
        });
      });
    } catch (err) { aviso('Não foi possível importar: ' + err.message, true); }
  });

  /* =========================== parâmetros =========================== */
  const PADRAO = { alvoModo: '', alvoMineral: '', raioAlvoKm: 30, reqSubstancia: '', reqHa: 0, finalidade: 'mineracao', setores: { energia: true, mineracao: true, fundiario: true, ambiental: true }, raioEnergiaKm: 30, osm: false, raioAnmKm: 2, raioOcorrenciasKm: 10, titulares: '', bateia: true, raioBateiaKm: 2, raioAmbientalKm: 10, raioPontoM: 0, responsavel: '', entornoKm: 2, extrasLigadas: true, extrasEscolhidas: [], finalidadeTexto: '', varredura: false };
  const prefs = Object.assign({}, PADRAO, VA.armazem.ler('parametros2', {}));
  prefs.setores = Object.assign({}, PADRAO.setores, prefs.setores);
  const CAMPOS = { pRaioEnergia: 'raioEnergiaKm', pRaioAnm: 'raioAnmKm', pRaioOc: 'raioOcorrenciasKm', pTitulares: 'titulares', pRaioBateia: 'raioBateiaKm', pRaioAmb: 'raioAmbientalKm', pRaioPonto: 'raioPontoM', pResponsavel: 'responsavel', pEntorno: 'entornoKm', pFinalidadeTexto: 'finalidadeTexto', pAlvo: 'alvoMineral', pRaioAlvo: 'raioAlvoKm', pReqSubs: 'reqSubstancia', pReqHa: 'reqHa' };
  const CHECKS = { pOSM: 'osm', pBateia: 'bateia', pExtrasLigadas: 'extrasLigadas', pVarredura: 'varredura' };
  let extrasEscolhidas = Array.isArray(prefs.extrasEscolhidas) ? prefs.extrasEscolhidas.filter(id => VA.camada(id)) : [];
  const curada = c => !!(c && c.analise && !c.analise.extra);
  const analisavel = c => !!(c && c.q && !c.soMapa && !curada(c));
  function calcularExtras(p) {
    const s = new Set(extrasEscolhidas);
    // camadas ligadas no mapa entram na análise; as de referência (municípios, UF, BC250…) só se escolhidas
    if (p.extrasLigadas) Object.keys(M.ativas).forEach(id => { const c = VA.camada(id); if (analisavel(c) && c.setor !== 'referencia') s.add(id); });
    return [...s];
  }
  $('#finalidade').innerHTML = Object.entries(VA.FINALIDADES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
  $('#finalidade').value = prefs.finalidade;
  Object.entries(CAMPOS).forEach(([id, k]) => { $('#' + id).value = id === 'pReqHa' && !prefs[k] ? '' : prefs[k]; });
  Object.entries(CHECKS).forEach(([id, k]) => { $('#' + id).checked = !!prefs[k]; });
  $$('[data-setor-on]').forEach(i => { i.checked = prefs.setores[i.dataset.setorOn] !== false; });

  function lerParametros() {
    const p = { finalidade: $('#finalidade').value, setores: { referencia: false } };
    const rm = document.querySelector('input[name="alvoModo"]:checked'); p.alvoModo = rm ? rm.value : '';
    $$('[data-setor-on]').forEach(i => { p.setores[i.dataset.setorOn] = i.checked; });
    Object.entries(CAMPOS).forEach(([id, k]) => { const el = $('#' + id); p[k] = el.type === 'number' || el.dataset.num ? Math.max(0, +String(el.value).replace(',', '.') || 0) : el.value.trim(); });
    Object.entries(CHECKS).forEach(([id, k]) => { p[k] = $('#' + id).checked; });
    if (!p.raioEnergiaKm) p.raioEnergiaKm = PADRAO.raioEnergiaKm;
    if (!p.raioOcorrenciasKm) p.raioOcorrenciasKm = PADRAO.raioOcorrenciasKm;
    if (!p.raioAmbientalKm) p.raioAmbientalKm = PADRAO.raioAmbientalKm;
    if (!p.raioBateiaKm) p.raioBateiaKm = PADRAO.raioBateiaKm;
    if (!p.raioAlvoKm) p.raioAlvoKm = PADRAO.raioAlvoKm;
    if (p.alvoModo !== 'alvo' || p.finalidade !== 'mineracao') p.alvoAtivo = ''; else p.alvoAtivo = p.alvoMineral;
    p.extrasEscolhidas = extrasEscolhidas.slice();
    p.filtrosNaAnalise = VA.filtros.naAnalise;
    p.filtrosChave = VA.filtros.naAnalise ? JSON.stringify(VA.filtros.ativos().map(id => [id, VA.filtros.conds(id)])) : '';
    VA.armazem.gravar('parametros2', p);
    p.extras = calcularExtras(p);
    /* local para requerimento: todos os setores e todas as camadas com regra de restrição */
    p.requerimento = p.finalidade === 'mineracao' && p.alvoModo === 'requerimento';
    if (p.requerimento) {
      p.setores = { referencia: false, energia: true, mineracao: true, fundiario: true, ambiental: true };
      p.alvoAtivo = p.reqSubstancia;
      p.extras = [...new Set(p.extras.concat(VA.CATALOGO.filter(c => c.q && !c.soMapa && c.regra && c.regra.incide && c.regra.incide.mineracao && !curada(c) && c.setor !== 'referencia').map(c => c.id)))];
    }
    return p;
  }
  function contarFontes() {
    const p = lerParametros();
    $$('.setor[data-setor]').forEach(div => {
      const id = div.dataset.setor; const n = div.querySelector('.setor-n'); if (!n) return;
      if (id === 'geral') { n.textContent = ''; return; }
      if (id === 'extras') { const k = VA.composicaoFontes(p, ufDaArea()), m = k.pacote.length + k.estado.length + k.escolhidas.length + k.varredura.length; n.textContent = m ? `${m} camada(s)` : 'nenhuma'; $('#resumoExtras').textContent = `${extrasEscolhidas.length} escolhida(s)${p.extrasLigadas ? ' + as ligadas no mapa' : ''}`; return; }
      const total = VA.CATALOGO.filter(c => c.setor === id && curada(c) && c.q && !(c.analise.opcional === 'osm' && !p.osm)).length;
      n.textContent = p.setores[id] ? `${total} fontes` : 'fora da análise';
      div.classList.toggle('desligado', !p.setores[id]);
    });
    botaoAnalisar(p);
  }
  /* o botão vale para a área definida ou, se ainda não há área, para o ponto clicado no mapa */
  /* os botões só acendem com a área definida pelas ferramentas do topo (Ponto, Polígono, Retângulo, Círculo, Importar) */
  /* estado da área: o do município identificado; antes disso, o estado de trabalho do mapa */
  const ufDaArea = () => (estado.municipios && estado.municipios[0] && estado.municipios[0].uf) || VA.mapa.uf;
  /* "102 fixas + 18 do pacote de pesquisa mineral + …": deixa claro de onde vem o número de fontes */
  function resumoFontes(p) {
    const el = $('#resumoFontes'); if (!el) return;
    const k = VA.composicaoFontes(p, ufDaArea());
    const partes = [`<b>${k.fixas.length}</b> fixas`];
    if (k.pacote.length) partes.push(`<b>${k.pacote.length}</b> do pacote de ${esc(k.pacoteNome)} <span class="muted">(${esc(k.pacoteDescricao)})</span>`);
    if (k.estado.length) partes.push(`<b>${k.estado.length}</b> do estado (${esc(k.uf)})`);
    if (k.escolhidas.length) partes.push(`<b>${k.escolhidas.length}</b> escolhida(s) por você`);
    if (k.varredura.length) partes.push(`<b>${k.varredura.length}</b> da varredura completa`);
    el.innerHTML = `Fontes desta análise: ${partes.join(' + ')} = <b>${k.total}</b>.`;
    const pv = $('#resumoPacote'); if (pv) pv.innerHTML = k.pacote.length ? `A finalidade escolhida já soma <b>${k.pacote.length}</b> camada(s) do pacote de ${esc(k.pacoteNome)}: ${esc(k.pacoteDescricao)}.` : 'Esta finalidade não tem pacote de camadas opcionais; use a escolha manual ou a varredura completa.';
  }
  function botaoAnalisar(p = lerParametros()) {
    const b = $('#btnAnalisar'), tot = VA.tarefasAnalise(p, ufDaArea()).length;
    resumoFontes(p);
    b.disabled = estado.rodando || !estado.aoi;
    b.textContent = estado.rodando ? 'Analisando…' : p.requerimento ? `Verificar requerimento · ${tot} fontes${p.reqSubstancia ? ' · ' + p.reqSubstancia : ''}` : `Analisar área · ${tot} fontes${p.bateia && p.setores.mineracao ? ' + Bateia' : ''}${p.alvoAtivo ? ' · alvo: ' + p.alvoAtivo : ''}`;
    $('#btnRelatorioNovo').disabled = !estado.aoi;
    $('#dicaArea').hidden = !!estado.aoi;
  }
  APP.botaoAnalisar = () => botaoAnalisar();
  $('#setores').addEventListener('click', e => {
    const cab = e.target.closest('.setor-cab'); if (!cab || e.target.closest('label')) return;
    cab.parentElement.classList.toggle('aberto');
  });
  $('#setores').addEventListener('change', contarFontes);
  $('#setores').addEventListener('input', e => { if (e.target.id === 'pRaioPonto') desenharRaio(); });
  $('#finalidade').addEventListener('change', () => { mostrarAlvo(); contarFontes(); });
  /* alvo da pesquisa mineral: varredura geral ou um bem específico */
  if (prefs.alvoModo) { const r = document.querySelector(`input[name="alvoModo"][value="${prefs.alvoModo}"]`); if (r) r.checked = true; }
  function mostrarAlvo() {
    const min = $('#finalidade').value === 'mineracao';
    $('#alvoBox').hidden = !min;
    const modo = (document.querySelector('input[name="alvoModo"]:checked') || {}).value;
    $('#alvoCampo').hidden = modo !== 'alvo';
    $('#reqCampo').hidden = modo !== 'requerimento';
    $('#alvoBox').classList.toggle('pendente', min && !modo);
    if (min && (modo === 'alvo' || modo === 'requerimento')) carregarListaMinerais();
  }
  let listaMineraisUF = null;
  async function carregarListaMinerais() {
    if (listaMineraisUF === M.uf) return; listaMineraisUF = M.uf;
    const l = await VA.alvo.lista();
    $('#listaMinerais').innerHTML = l.todos.map(s => `<option value="${esc(s)}">${l.doGeobank.has(VA.fmt.norm(s)) ? 'no GEOBANK de ' + esc(M.uf) : ''}</option>`).join('');
  }
  $('#alvoBox').addEventListener('change', () => { mostrarAlvo(); contarFontes(); });
  mostrarAlvo();
  /* pergunta antes de analisar, quando a finalidade é mineral e o operador ainda não escolheu */
  function precisaPerguntarAlvo(p) { return p.finalidade === 'mineracao' && p.setores.mineracao && (!p.alvoModo || (p.alvoModo === 'alvo' && !p.alvoMineral)); }
  function perguntarAlvo() {
    return new Promise(ok => {
      let resolvido = false;
      const fim = v => { if (!resolvido) { resolvido = true; ok(v); } };
      const atual = (document.querySelector('input[name="alvoModo"]:checked') || {}).value;
      modal(`<div class="modal-cab"><b>Pesquisa / lavra mineral — o que você procura?</b><button class="x" data-fechar>×</button></div>
        <p class="pequeno muted">Com um bem específico, o relatório fica mais objetivo: busca as ocorrências dele num raio maior, os processos da ANM com essa substância e mostra um mapa só com esses pontos.</p>
        <div class="alvo-escolha">
          <button class="alvo-card" data-modo="geral"><b>Varredura geral</b><span>Tudo o que existe na área: processos, ocorrências de qualquer bem, geologia e restrições.</span></button>
          <div class="alvo-card ${atual === 'alvo' ? 'ativo' : ''}" data-modo-alvo><b>Um bem específico</b><span>Mineral, minério ou gema.</span>
            <input type="text" id="mAlvo" list="listaMinerais" placeholder="ex.: turmalina, ouro, lítio" value="${esc($('#pAlvo').value)}" autocomplete="off">
            <button class="btn btn-pri" id="mAlvoOk">Pesquisar este bem</button></div>
          <div class="alvo-card alvo-card-larga" data-modo-req><b>Local para requerimento</b><span>Verifica todos os impedimentos em todas as camadas e diz se dá para requerer a área na ANM: área livre, limite de área da substância, poligonal N-S/L-O e condicionantes.</span>
            <input type="text" id="mReq" list="listaMinerais" placeholder="substância (opcional), ex.: turmalina" value="${esc($('#pReqSubs').value)}" autocomplete="off">
            <button class="btn btn-pri" id="mReqOk">Verificar o requerimento</button></div>
        </div>`, fechar => {
        carregarListaMinerais();
        const corpo = $('#modalCorpo');
        corpo.querySelector('[data-modo="geral"]').onclick = () => { document.querySelector('input[name="alvoModo"][value="geral"]').checked = true; mostrarAlvo(); contarFontes(); fechar(); fim(true); };
        const confirmar = () => {
          const v = $('#mAlvo').value.trim(); if (!v) { $('#mAlvo').focus(); return aviso('Digite ou escolha o mineral, minério ou gema.', true); }
          document.querySelector('input[name="alvoModo"][value="alvo"]').checked = true; $('#pAlvo').value = v; mostrarAlvo(); contarFontes(); fechar(); fim(true);
        };
        $('#mAlvoOk').onclick = confirmar;
        $('#mReqOk').onclick = () => { document.querySelector('input[name="alvoModo"][value="requerimento"]').checked = true; $('#pReqSubs').value = $('#mReq').value.trim(); mostrarAlvo(); contarFontes(); fechar(); fim(true); };
        $('#mAlvo').addEventListener('keydown', e => { if (e.key === 'Enter') confirmar(); });
        setTimeout(() => $('#mAlvo').focus(), 50);
        const obs = new MutationObserver(() => { if ($('#modal').hidden) { obs.disconnect(); fim(false); } });
        obs.observe($('#modal'), { attributes: true, attributeFilter: ['hidden'] });
      });
    });
  }
  APP.contarFontes = () => contarFontes();

  /* escolher camadas extras para a análise */
  $('#btnEscolherExtras').addEventListener('click', () => {
    const cand = VA.CATALOGO.filter(analisavel);
    const marcadas = new Set(extrasEscolhidas);
    const linha = c => `<label class="chk ex-l" data-busca="${esc(VA.fmt.norm(c.nome + ' ' + c.fonte + ' ' + c.grupo))}"><input type="checkbox" value="${c.id}" ${marcadas.has(c.id) ? 'checked' : ''}> ${esc(c.nome)} <span class="muted">· ${esc(c.fonte)}</span></label>`;
    const html = VA.SETORES.map(st => { const l = cand.filter(c => c.setor === st.id); return l.length ? `<details class="ex-setor"><summary><b>${esc(st.nome)}</b> <span class="muted">${l.length}</span></summary>${[...new Set(l.map(c => c.grupo))].map(g => `<div class="cam-grupo">${esc(g)}</div>${l.filter(c => c.grupo === g).map(linha).join('')}`).join('')}</details>` : ''; }).join('');
    modal(`<div class="modal-cab"><b>Camadas extras na análise</b><button class="x" data-fechar>×</button></div>
      <p class="pequeno muted">${cand.length} camadas além das que a análise já usa. As marcadas entram no quadro dentro / entorno / fora, com o entorno escolhido. Consultas grandes podem demorar.</p>
      <input type="search" id="exBusca" placeholder="Procurar camada, órgão ou tema…">
      <div class="ex-lista">${html}</div>
      <div class="mini-acoes"><button class="btn btn-pri" id="exAplicar">Aplicar</button><button class="btn" id="exLimpar">Desmarcar todas</button><span class="pequeno muted" id="exConta"></span></div>`, fechar => {
      const corpo = $('#modalCorpo');
      const contar = () => { $('#exConta').textContent = corpo.querySelectorAll('.ex-lista input:checked').length + ' marcada(s)'; };
      corpo.addEventListener('change', contar); contar();
      $('#exBusca').addEventListener('input', e => { const t = VA.fmt.norm(e.target.value); corpo.querySelectorAll('.ex-l').forEach(l => { l.hidden = t && !l.dataset.busca.includes(t); }); corpo.querySelectorAll('.ex-setor').forEach(d => { d.open = !!t; }); });
      $('#exLimpar').onclick = () => { corpo.querySelectorAll('.ex-lista input').forEach(i => { i.checked = false; }); contar(); };
      $('#exAplicar').onclick = () => { extrasEscolhidas = [...corpo.querySelectorAll('.ex-lista input:checked')].map(i => i.value); fechar(); contarFontes(); aviso(`${extrasEscolhidas.length} camada(s) extra(s) escolhida(s).`); };
    });
  });
  contarFontes();

  /* ============================== análise ============================== */
  const ROT_STATUS = { aguardando: 'aguardando', executando: 'consultando…', dentro: 'Dentro', proximo: 'Próximo', fora: 'Fora', info: 'Informação', falha: 'Falha', sem_base: 'Sem base' };
  $('#btnAnalisar').addEventListener('click', () => analisar());

  async function analisar() {
    if (estado.rodando) return;
    if (!estado.aoi) return aviso('Defina a área pelas ferramentas do topo: Ponto, Polígono, Retângulo, Círculo ou Importar.', true);
    sairDesenho(); sairEdicao();
    if (precisaPerguntarAlvo(lerParametros())) { const ok = await perguntarAlvo(); if (!ok) { Object.values(relAbas).forEach(j => { j.erro = 'Escolha se a pesquisa é geral ou de um bem específico e gere o relatório de novo.'; }); atualizarRelatorios(); return; } }
    const p = lerParametros();
    if (!['energia', 'mineracao', 'fundiario', 'ambiental'].some(s => p.setores[s])) return aviso('Ligue pelo menos um setor em “Parâmetros por setor”.', true);
    const { aoi, origem } = aoiParaAnalise(p);
    estado.rodando = true; contarFontes();
    $('#acoesSaida').hidden = true;
    M.resultados.clearLayers(); mapa.closePopup();
    estado.porEvid = {}; estado.analise = estado.avaliacao = estado.sessao = null;
    $('#resultados').innerHTML = `<div id="resSintese"></div><div id="resReq"></div><div id="resAlvo"></div><div id="resFav"></div><div id="resQuadro"></div><div id="resAchados"></div><div id="resBateia"></div>
      <div class="cartao"><div class="titulo-cartao">Fontes consultadas <span class="muted" id="resFontesCont"></span></div><div id="resFontes"></div></div>`;
    $('#resSintese').innerHTML = '<div class="sintese s-rodando"><div class="t">Consultando as fontes oficiais…</div><div class="pequeno">Os resultados aparecem abaixo à medida que cada órgão responde.</div></div>';
    $('#resultados').scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (p.bateia && p.setores.mineracao) iniciarBateia(aoi, p);
    else estado.bateiaVip = null;
    /* ficha do local (IBGE, clima, acessos) corre em paralelo com as fontes */
    if (!estado.local || estado.local.aoi !== estado.aoi || !estado.local.ok) estado.local = { aoi: estado.aoi, p: VA.fichaLocal(aoi, { municipio: estado.municipios && estado.municipios[0] }).then(l => { if (estado.local && estado.local.aoi === estado.aoi) estado.local.ok = !!(l && l.erros.length < 4); return l; }).catch(() => null) };
    const pLocal = estado.local.p;
    let feitas = 0, total = 0;
    try {
      const analise = await VA.analisar(aoi, p, ev => {
        if (ev.tipo === 'inicio') { total = ev.total; montarListaFontes(ev.tarefas || VA.tarefasAnalise(p, ev.ctx && ev.ctx.uf)); progresso(0, total); relProgresso({ feitos: 0, total }); }
        else if (ev.tipo === 'camada') {
          atualizarFonte(ev.id, ev.estado, ev.resultado);
          if (ev.resultado) { progresso(++feitas, total); const r = ev.resultado; relProgresso({ feitos: feitas, total, linha: { nome: r.camada.nome, status: r.status, resumo: r.resumo } }); }
        }
      });
      if (estado.bateiaVip && estado.bateiaVip.aoi === aoi && estado.bateiaVip.resumo) analise.bateia = estado.bateiaVip.resumo;
      if (p.alvoAtivo && p.setores.mineracao) {
        $('#resSintese').innerHTML = `<div class="sintese s-rodando"><div class="t">Buscando ${esc(p.alvoAtivo)}…</div><div class="pequeno">Ocorrências no GEOBANK e processos da ANM até ${VA.fmt.km(p.raioAlvoKm)}.</div></div>`;
        analise.alvo = await VA.analisarAlvo(aoi, p, txt => relProgresso({ feitos: total, total, linha: { nome: txt, status: 'info', resumo: '' } }));
      }
      if (p.alvoAtivo && p.setores.mineracao && VA.favorabilidade) {
        $('#resSintese').innerHTML = `<div class="sintese s-rodando"><div class="t">Cruzando geofísica, geologia e geoquímica…</div><div class="pequeno">Mapa de favorabilidade para ${esc(p.alvoAtivo)}.</div></div>`;
        try { analise.favorab = await VA.favorabilidade(aoi, analise, p, txt => relProgresso({ feitos: total, total, linha: { nome: txt, status: 'info', resumo: '' } })); }
        catch (e) { analise.favorab = { erro: e.message }; }
      }
      const local = await Promise.race([pLocal, new Promise(ok => setTimeout(() => ok(undefined), 20000))]);
      if (local !== undefined) analise.local = local;
      else { relProgresso({ feitos: total, total, linha: { nome: 'Ficha do local', status: 'info', resumo: 'ainda consultando — o relatório sai sem ela se demorar' } }); pLocal.then(l => { analise.local = l; }); }
      if (p.requerimento) { try { analise.requerimento = VA.avaliarRequerimento(analise, aoi, p); } catch (e) { analise.requerimento = { erro: e.message }; } }
      estado.analise = analise;
      const rd = analise.resultados.sigel_dist; if (rd && rd.dados && rd.dados.distribuidora) VA.bdgd.sugestao = rd.dados.distribuidora;
      concluir(p, aoi, origem);
    } catch (e) {
      $('#resSintese').innerHTML = `<div class="sintese s-impeditivo"><div class="t">A análise foi interrompida</div><div class="pequeno">${esc(e.message)}</div></div>`;
      Object.values(relAbas).forEach(j => { j.erro = 'A análise foi interrompida: ' + e.message; });
    } finally {
      estado.rodando = false; $('#progresso').hidden = true; contarFontes();
      atualizarRelatorios();
    }
  }
  APP.analisar = analisar;

  function progresso(n, total) {
    estado.progresso = { n, total };
    const el = $('#progresso'); el.hidden = n >= total;
    el.querySelector('i').style.width = (total ? 100 * n / total : 0) + '%';
    el.querySelector('span').textContent = `${n} de ${total} fontes`;
    const c = $('#resFontesCont'); if (c) c.textContent = `· ${n}/${total}`;
  }

  function concluir(p, aoi, origem) {
    const analise = estado.analise;
    estado.avaliacao = VA.avaliar(analise, p.finalidade);
    estado.sessao = { aoi, aoiBase: estado.aoi, chave: chaveAnalise(p), analise, avaliacao: estado.avaliacao, finalidade: p.finalidade, finalidadeTexto: p.finalidadeTexto, origem, responsavel: p.responsavel, municipios: estado.municipios, cota: estado.cota };
    indexarEvidencias();
    renderTudo();
    M.desenharResultados(analise, mostrarElementos); desenharExtras();
    $('#acoesSaida').hidden = false;
    const nf = Object.values(analise.resultados).filter(r => r.status === 'falha').length;
    aviso(`Análise concluída: ${analise.ordem.length} fontes${nf ? `, ${nf} sem resposta` : ''}.`, false, 4000);
  }
  function reavaliar() {
    const s = estado.sessao; if (!s) return;
    s.avaliacao = estado.avaliacao = VA.avaliar(s.analise, s.finalidade);
    if (s.analise.params && s.analise.params.requerimento) { try { s.analise.requerimento = VA.avaliarRequerimento(s.analise, s.aoi, s.analise.params); } catch (e) { } }
    indexarEvidencias();
    renderTudo();
    M.desenharResultados(s.analise, mostrarElementos); desenharExtras();
  }
  function indexarEvidencias() {
    estado.porEvid = {};
    const a = estado.analise;
    a.ordem.forEach(id => (a.resultados[id].itens || []).forEach(it => { estado.porEvid[it.evid] = { id, it, r: a.resultados[id] }; }));
    if (a.alvo) {
      const pseudo = (nome, fonte) => ({ camada: { nome, fonte, setor: 'mineracao' } });
      a.alvo.ocorrencias.forEach(it => { estado.porEvid[it.evid] = { id: 'alvo', it, r: pseudo(`Ocorrências de ${a.alvo.mineral}`, 'SGB — GEOBANK') }; });
      a.alvo.processos.forEach(it => { estado.porEvid[it.evid] = { id: 'alvo', it, r: pseudo(`Processos ANM com ${a.alvo.mineral}`, 'ANM — SIGMINE') }; });
    }
  }
  function renderTudo() { renderSintese(); renderRequerimento(); renderAlvo(); renderFavorab(); renderQuadro(); renderAchados(); renderBateiaRes(); renderFontes(); }
  /* ---------- local para requerimento ---------- */
  const COR_REQ = { impede: '#b3121d', ajuste: '#d4521a', condiciona: '#b7800f', livre: '#187a5e', inconclusivo: '#6d28d9' };
  function renderRequerimento() {
    const el = $('#resReq'); if (!el) return;
    const Q = estado.analise && estado.analise.requerimento;
    if (!Q) { el.innerHTML = ''; return; }
    if (Q.erro) { el.innerHTML = `<div class="cartao"><div class="erro-txt">Falha ao avaliar o requerimento: ${esc(Q.erro)}</div></div>`; return; }
    const pg = Q.poligonal, LI = VA.livreInfo(Q);
    el.innerHTML = `<div class="cartao req-res"><div class="titulo-cartao">Local para requerimento${Q.substancia ? ' · ' + esc(Q.substancia) : ''}</div>
      <div class="req-ver" style="--c:${COR_REQ[Q.classe] || '#6b7280'}">${esc(Q.texto)}</div>
      <div class="req-nums"><div><b>${VA.fmt.ha(Q.area_ha)}</b><small>${Q.ponto ? 'quadrado pretendido' : 'área analisada'}</small></div><div class="${LI.status === 'confirmada' ? '' : 'nao-def'}"><b>${LI.ha != null ? VA.fmt.ha(LI.ha) : '—'}</b><small>${esc(LI.rotulo)}</small></div><div><b>${Q.limite && Q.limite.ha ? VA.fmt.num(Q.limite.ha, 0) + ' ha' : '—'}</b><small>limite da substância</small></div></div>
      ${LI.nota ? `<div class="req-aviso">${LI.status === 'potencial' ? 'Área livre potencial, não definitiva' : 'Área livre não calculada'}: ${esc(LI.nota)}.</div>` : ''}
      ${Q.itens.map(i => `<div class="req-item"><span class="sit sit-${i.situacao}">${esc(VA.SIT_REQ[i.situacao])}</span><span class="det"><b>${esc(i.criterio)}</b> — ${esc(i.detalhe)}${i.evid.length ? ' ' + i.evid.map(e => `<span class="ev" data-ev="${e}" title="Localizar no mapa">${e}</span>`).join(' ') : ''}${i.acao ? `<small>${esc(i.acao)}</small>` : ''}</span></div>`).join('')}
      ${pg ? `<div class="pequeno mt">Poligonal N-S/L-O sugerida: <b>${VA.fmt.ha(pg.ha)}</b>, ${pg.vertices} vértices${pg.excedeLimite ? ` — <span class="erro-txt">passa do limite de ${VA.fmt.num(Q.limite.ha, 0)} ha; reduza antes de protocolar</span>` : ''}${pg.buracosPreenchidos_ha > 0.05 ? ` — inclui ${VA.fmt.ha(pg.buracosPreenchidos_ha)} de terceiros cercados pela área (o SIGAREAS os exclui)` : ''}.</div>
      <div class="mini-acoes"><button class="btn" id="reqVer">Ver no mapa</button><button class="btn" id="reqKml">Baixar KML</button><button class="btn" id="reqCsv">Memorial (CSV)</button></div>` : Q.poligonalBloqueada ? `<div class="pequeno mt"><b>Poligonal N-S/L-O não gerada:</b> ${esc(Q.poligonalBloqueada)}. Ela só é desenhada sobre área livre confirmada — repita as fontes pendentes.</div>` : ''}
      <p class="pequeno muted">Triagem nas bases públicas do momento. A prioridade é de quem protocola primeiro: confirme no SIGMINE e no Cadastro Mineiro no dia do protocolo.</p></div>`;
    const nome = () => `requerimento-${(estado.municipios && estado.municipios[0] ? VA.fmt.norm(estado.municipios[0].municipio).replace(/[^a-z0-9]+/g, '-') : 'area')}`;
    const v = $('#reqVer'); if (v) v.onclick = () => { try { mapa.fitBounds(L.geoJSON(pg.feature).getBounds(), { padding: [40, 40] }); mostrarVista('mapa'); } catch (e) { } };
    const k = $('#reqKml'); if (k) k.onclick = () => VA.baixar(nome() + '.kml', VA.kmlPoligonos([{ nome: 'Poligonal N-S/L-O sugerida', estilo: 'nslo', feature: pg.feature }, { nome: LI.status === 'confirmada' ? 'Área sem interferência nas bases' : 'Área livre potencial (não definitiva)', estilo: 'livre', feature: Q.livre && Q.livre.feature }].concat(Q.bloqueios.map(b => ({ nome: 'Impedimento: ' + b.properties.titulo, estilo: 'onerada', feature: b }))), 'VIP ANALYSIS — requerimento'), 'application/vnd.google-earth.kml+xml');
    const c = $('#reqCsv'); if (c) c.onclick = () => VA.baixar(nome() + '-memorial.csv', VA.memorialCSV(pg.feature, `Poligonal N-S/L-O sugerida — ${VA.fmt.ha(pg.ha)}${Q.substancia ? ' — ' + Q.substancia : ''}`), 'text/csv');
  }
  /* camadas calculadas desenhadas sobre o mapa: área livre, impedimentos, poligonal e favorabilidade */
  function desenharExtras() {
    const a = estado.analise; if (!a) return;
    const Q = a.requerimento;
    if (Q && !Q.erro) {
      Q.bloqueios.forEach(b => L.geoJSON(b, { interactive: false, style: { color: '#b3121d', weight: 1.5, fillColor: '#b3121d', fillOpacity: 0.18, dashArray: '4 3' } }).addTo(M.resultados));
      /* área livre confirmada em verde; potencial (fonte pendente) em roxo tracejado, para não parecer definitiva */
      if (Q.livre && Q.livre.feature) L.geoJSON(Q.livre.feature, { interactive: false, style: Q.livre.status === 'confirmada' ? { color: '#187a5e', weight: 1.5, fillColor: '#2e9d3a', fillOpacity: 0.16 } : { color: '#6d28d9', weight: 1.5, dashArray: '6 4', fillColor: '#6d28d9', fillOpacity: 0.08 } }).addTo(M.resultados);
      if (Q.poligonal) L.geoJSON(Q.poligonal.feature, { style: { color: '#0b1730', weight: 2.5, dashArray: '8 5', fill: false } }).bindTooltip(`Poligonal N-S/L-O sugerida · ${VA.fmt.ha(Q.poligonal.ha)}`).addTo(M.resultados);
    }
    const F = a.favorab;
    if (F && F.grade && VA.favImagem) {
      const g = F.grade, url = VA.favImagem(F, 'fav');
      if (url) L.imageOverlay(url, [[g.bbox[1], g.bbox[0]], [g.bbox[3], g.bbox[2]]], { opacity: 0.75, interactive: false }).addTo(M.resultados);
      /* processos da ANM na janela da favorabilidade (requerimentos e títulos), por fase */
      const COR_P = { pesquisa: '#ffb020', lavra: '#ff4d5e', disponibilidade: '#c3c9d2', outro: '#ffb020' };
      if ((F.processos || []).length) L.geoJSON({ type: 'FeatureCollection', features: F.processos }, {
        style: f => { const c = COR_P[f.properties.classe] || COR_P.outro; return { color: c, weight: 1.4, fillColor: c, fillOpacity: 0.05 }; },
        onEachFeature: (f, l) => { const q = f.properties; l.bindPopup(`<b>${esc(q.processo)}</b><br>${esc(q.fase || '')}<br>${esc(q.titular || '')}<br>${esc(q.subs || '')}${q.ha ? '<br>' + VA.fmt.ha(q.ha) : ''}`); }
      }).addTo(M.resultados);
      F.alvos.forEach(t => L.marker([t.c[1], t.c[0]], { icon: L.divIcon({ className: 'fav-marca' + (t.categoria === 'Novo requerimento possível' ? '' : ' onerada'), html: `<span>${t.id}</span>`, iconSize: [26, 26] }) }).bindTooltip(`${t.id} · favorabilidade ${Math.round(t.nota * 100)} · confiabilidade ${Math.round(t.conf * 100)} · ${t.categoria}`).addTo(M.resultados));
    }
  }
  function renderFavorab() {
    const el = $('#resFav'); if (!el) return;
    const F = estado.analise && estado.analise.favorab;
    if (!F) { el.innerHTML = ''; return; }
    if (F.erro || !F.grade) { el.innerHTML = `<div class="cartao"><div class="titulo-cartao">Inteligência mineral</div><div class="pequeno muted">${esc(F.erro || 'Sem dados suficientes para o mapa de favorabilidade.')}</div></div>`; return; }
    const nivel = v => v >= 0.6 ? 'alta' : v >= 0.4 ? 'média' : v >= 0.25 ? 'baixa' : 'muito baixa';
    const Gq = F.geoquimica || {}, Gl = F.geologia || {};
    el.innerHTML = `<div class="cartao fav-res"><div class="titulo-cartao">Oportunidades para ${esc(F.mineral.toLowerCase())}</div>
      <div class="pequeno muted">${esc(F.sistema.nome)} · ${F.camadas.filter(c => c.ok).map(c => esc(c.nome)).join(', ')}</div>
      <div class="pequeno mt">Área: percentil ${F.favAoiPct != null ? Math.round(F.favAoiPct * 100) : '—'} de favorabilidade na janela · confiabilidade ${F.confAoi != null ? nivel(F.confAoi) : '—'}${Gl.melhorEscala ? ` · geologia ${esc(Gl.melhorEscala)}` : ''}${Gq.insuficiente ? ' · geoquímica pública insuficiente' : ''}</div>
      ${F.disponibilidade && F.disponibilidade.aviso ? `<div class="req-aviso">${esc(F.disponibilidade.aviso)}</div>` : ''}
      ${(F.erros || []).length ? `<div class="pequeno erro-txt mt">Não responderam: ${esc(F.erros.map(e => e.split(': ')[0]).join('; '))}</div>` : ''}
      ${F.alvos.map(t => `<div class="fav-alvo" data-fav="${t.id}"><span class="fav-rot">${t.id}</span><span>${esc(t.motivos.slice(0, 2).join('; ') || 'convergência de evidências')}</span><span class="fav-nota" title="favorabilidade">${Math.round(t.nota * 100)}</span><small><b>${esc(t.categoria)}</b> · confiabilidade ${nivel(t.conf)} · ${t.dist_km === 0 ? 'dentro da área' : 'a ' + VA.fmt.km(t.dist_km)} · ${esc(t.situacao)}</small></div>`).join('') || '<div class="pequeno muted">Nenhum ponto se destacou com confiabilidade mínima na janela.</div>'}
      <p class="pequeno muted">Ranking por favorabilidade × acesso ao direito, numa janela de ${VA.fmt.num(F.janelaKm, 0)} km. Aponta onde as evidências convergem, não teor nem reserva. A interpretação completa sai no relatório.</p></div>`;
    el.querySelectorAll('[data-fav]').forEach(d => d.onclick = () => { const t = F.alvos.find(x => x.id === d.dataset.fav); mapa.setView([t.c[1], t.c[0]], 15); mostrarVista('mapa'); });
  }
  function renderAlvo() {
    const el = $('#resAlvo'); if (!el) return;
    const A = estado.analise && estado.analise.alvo;
    if (!A) { el.innerHTML = ''; return; }
    const s = A.resumo || {}, item = it => `<div class="item-alvo"><span class="ev" data-ev="${it.evid}" title="Localizar no mapa">${it.evid}</span><span><b>${esc(it.titulo)}</b><small>${esc(it.subtitulo || '')}</small></span><span class="it-d">${it.incide ? 'dentro' : VA.fmt.km(it.distancia_km)}</span></div>`;
    el.innerHTML = `<div class="cartao alvo-res"><div class="titulo-cartao">Alvo da pesquisa: ${esc(A.mineral)}</div>
      <div class="alvo-kpis"><div><b>${s.ocDentro || 0}</b><small>ocorrência(s) dentro da área</small></div><div><b>${s.ocTotal || 0}</b><small>até ${VA.fmt.km(A.raioKm)}</small></div><div><b>${s.ocMin != null ? VA.fmt.km(s.ocMin) : '—'}</b><small>mais próxima</small></div><div><b>${s.procTotal || 0}</b><small>processo(s) ANM com o bem</small></div></div>
      ${A.erros.length ? `<div class="erro-txt">${esc(A.erros.join('; '))}</div>` : ''}
      ${A.ocorrencias.slice(0, 6).map(item).join('')}${A.ocorrencias.length > 6 ? `<div class="pequeno muted">+ ${A.ocorrencias.length - 6} ocorrência(s) no relatório</div>` : ''}
      ${A.processos.length ? `<div class="pequeno muted mt">Processos ANM com ${esc(A.mineral.toLowerCase())}</div>` + A.processos.slice(0, 4).map(item).join('') : ''}</div>`;
  }

  function renderSintese() {
    const av = estado.avaliacao, a = estado.analise, s = av.sintese;
    const falhas = Object.values(a.resultados).filter(r => r.status === 'falha');
    const precisaSrv = falhas.some(r => r.motivo === 'cors' || r.motivo === 'servidor');
    $('#resSintese').innerHTML = `<div class="sintese s-${s.classe}">
      <div class="sintese-rot">${esc(VA.FINALIDADES[estado.sessao.finalidade])} · ${esc(estado.municipios && estado.municipios.length ? estado.municipios.map(VA.fmt.munUF).join(', ') : a.ctx.uf || '')}</div>
      <div class="t">${esc(s.texto)}</div>
      <div class="chips">${Object.entries(av.contagem).filter(([, n]) => n).map(([nv, n]) => `<span class="chip n-${nv}">${n} ${VA.NIVEIS[nv].rotulo.toLowerCase()}</span>`).join('')}</div>
      ${htmlCobertura(s)}
      ${falhas.length ? `<div class="sintese-falhas">${falhas.length} fonte(s) não responderam${precisaSrv && !VA.Net.proxy.ok ? ' — parte delas (ANEEL/SIGEL) só funciona com o servidor local: abra pelo <b>iniciar.bat</b>' : ''}. <button class="mini" id="repetirFalhas">Tentar de novo só essas</button></div>` : ''}
    </div>`;
    const b = $('#repetirFalhas'); if (b) b.onclick = () => repetirFalhas();
    const bc = $('#repetirCriticas'); if (bc) bc.onclick = () => repetirFalhas(s.cobertura.pendentes.filter(x => x.estado === 'falhou').map(x => x.id));
  }
  const idadeTxt = seg => seg < 90 ? 'menos de 2 min' : seg < 5400 ? `${Math.round(seg / 60)} min` : `${VA.fmt.num(seg / 3600, seg < 36000 ? 1 : 0)} h`;
  /* quadro de cobertura das fontes críticas: mostra o que sustenta a conclusão e o que falta para concluir */
  function htmlCobertura(s) {
    const cob = s.cobertura; if (!cob || !cob.criticas.length) return '';
    const ok = cob.criticas.filter(x => x.estado === 'completo').length;
    const li = x => `<li class="${x.estado === 'completo' ? '' : x.estado === 'parcial' ? 'parc' : 'pend'}"><i></i><span>${esc(x.nome)} — ${esc(x.rotulo)}${x.motivo && x.estado !== 'completo' ? `<small>${esc(x.motivo)}</small>` : ''}</span></li>`;
    const ordem = l => l.slice().sort((a, b) => (a.estado === 'completo') - (b.estado === 'completo'));
    const falhou = cob.pendentes.filter(x => x.estado === 'falhou');
    const cache = cob.criticas.filter(x => x.cache != null);
    return `<div class="cobertura"><div class="cob-tit">Fontes críticas para esta finalidade<span>${ok} de ${cob.criticas.length} verificadas</span></div>
      <ul>${ordem(cob.criticas).map(li).join('')}</ul>
      ${cob.importantes.length ? `<div class="cob-tit mt">Fontes importantes<span>${cob.importantes.length - cob.importantesPendentes.length} de ${cob.importantes.length} verificadas</span></div><ul>${ordem(cob.importantes).map(li).join('')}</ul>` : ''}
      ${s.proximaAcao || falhou.length ? `<div class="cob-acao">${falhou.length ? `<button class="btn-repetir" id="repetirCriticas">Repetir ${falhou.length > 1 ? `as ${falhou.length} fontes críticas` : 'a fonte crítica'} sem resposta</button>` : ''}<span class="pequeno">${esc(s.proximaAcao || '')}</span></div>` : ''}
      ${cache.length ? `<div class="cob-cache">Parte das fontes críticas veio do cache do servidor local (resposta de ${idadeTxt(Math.max(...cache.map(x => x.cache)))} atrás). Processos da ANM são sempre consultados ao vivo.</div>` : ''}
    </div>`;
  }

  async function repetirFalhas(lista) {
    const a = estado.analise; if (!a || estado.rodando) return;
    const ids = (lista && lista.length ? lista : a.ordem).filter(id => a.resultados[id] && (['falha', 'sem_base'].includes(a.resultados[id].status) || a.resultados[id].completude === 'falhou'));
    if (!ids.length) return;
    estado.rodando = true; botaoAnalisar();
    let n = 0; progresso(0, ids.length);
    ids.forEach(id => atualizarFonte(id, 'aguardando'));
    await VA.reanalisar(a, ids, ev => { atualizarFonte(ev.id, ev.estado, ev.resultado); if (ev.resultado) progresso(++n, ids.length); });
    estado.rodando = false; botaoAnalisar(); $('#progresso').hidden = true;
    reavaliar();
    const ainda = ids.filter(id => a.resultados[id].status === 'falha').length;
    aviso(ainda ? `${ids.length - ainda} de ${ids.length} fontes responderam agora.` : 'Todas as fontes responderam.');
  }

  const ORDEM_CLASSE = { dentro: 0, proximo: 1, info: 2, fora: 3, falha: 4 };
  function renderQuadro() {
    const Q = estado.avaliacao.quadro;
    const html = VA.SETORES.filter(st => Q[st.id]).map(st => {
      const l = Q[st.id].slice().sort((a, b) => ORDEM_CLASSE[a.classe] - ORDEM_CLASSE[b.classe]);
      const c = k => l.filter(q => q.classe === k).length;
      return `<details class="q-setor" ${c('dentro') ? 'open' : ''}><summary><span class="q-nome"><i style="background:${st.cor}"></i>${esc(st.nome)}</span><span class="q-cont">${c('dentro') ? `<b class="c-dentro">${c('dentro')} dentro</b>` : ''}${c('proximo') ? `<b class="c-proximo">${c('proximo')} próximo</b>` : ''}<span>${c('fora')} fora</span>${c('info') ? `<span>${c('info')} info</span>` : ''}${c('falha') ? `<b class="c-falha">${c('falha')} sem resposta</b>` : ''}</span></summary>
        <div class="q-lista">${l.map(q => { const d = detalheQuadro(q); return `<div class="q-linha q-${q.classe}" data-ir="${q.id}" title="${esc(q.resumo || '')}">
          <span class="q-sit">${esc(d.sit)}</span>
          <span class="q-camada">${esc(q.nome)}${d.det ? `<small>${esc(d.det)}</small>` : ''}</span>
          ${q.sev ? `<span class="chip n-${q.sev}">${VA.NIVEIS[q.sev].rotulo}</span>` : ''}
          <span class="q-ev">${q.evid.map(e => `<a class="ev" data-ev="${e}">${e}</a>`).join('')}</span></div>`; }).join('')}</div></details>`;
    }).join('');
    $('#resQuadro').innerHTML = `<div class="cartao"><div class="titulo-cartao">Dentro ou fora — por setor</div><div class="pequeno muted">“Fora” vale para o raio consultado; ausência de registro não prova inexistência. Clique numa linha para ver os registros.</div>${html}</div>`;
  }

  function detalheQuadro(q) {
    const r = estado.analise.resultados[q.id] || {};
    if (q.classe === 'dentro') return { sit: 'DENTRO', det: r.resumo };
    if (q.classe === 'proximo') return { sit: 'Fora · ' + VA.fmt.km(r.dados && r.dados.distMin), det: r.resumo };
    if (q.classe === 'fora') return { sit: 'Fora', det: r.raioKm ? 'nada até ' + VA.fmt.km(r.raioKm) : 'sem registro no local' };
    if (q.classe === 'info') return { sit: 'No local', det: q.situacao };
    return { sit: r.status === 'sem_base' ? 'Sem base' : 'Sem resposta', det: r.status === 'sem_base' ? 'base da UF não importada' : (r.erro || '').slice(0, 120) };
  }

  function renderAchados() {
    const ach = estado.avaliacao.achados;
    $('#resAchados').innerHTML = `<div class="cartao"><div class="titulo-cartao">Achados <span class="muted">(${ach.length})</span></div>
      ${ach.map(a => `<div class="achado l-${a.nivel}"><div class="ac-cab"><span class="chip n-${a.nivel}">${VA.NIVEIS[a.nivel].rotulo}</span><span class="ac-setor">${esc(VA.nomeSetor(a.setor) || '')}</span></div>
        <div class="ac-tit">${esc(a.titulo)}</div><div class="ac-txt">${esc(a.texto)}</div>
        <div class="ac-rod"><span class="cz">${esc(a.certeza)}</span>${a.evidencias.slice(0, 14).map(e => `<a class="ev" data-ev="${e}">${e}</a>`).join('')}${a.evidencias.length > 14 ? `<span class="muted">+${a.evidencias.length - 14}</span>` : ''}</div></div>`).join('')}</div>`;
  }

  function renderBateiaRes() {
    const el = $('#resBateia'); if (!el) return;
    const bv = estado.bateiaVip, b = estado.analise && estado.analise.bateia;
    if (!bv && !b) { el.innerHTML = ''; return; }
    if (!b) {
      el.innerHTML = `<div class="cartao bateia-res"><div class="titulo-cartao">Mineração · Bateia</div><div class="pequeno">${bv.estado === 'erro' || bv.estado === 'tempo' ? `<span class="erro-txt">A Bateia não devolveu resultado${bv.erro ? ': ' + esc(bv.erro) : ''}.</span>` : '<span class="girando"></span> A Bateia está analisando a mesma área (geologia, geoquímica, geofísica, sensoriamento remoto e modelos de depósito). O resultado entra aqui e no relatório quando ela terminar.'}</div><button class="btn" data-vista-ir="bateia">Acompanhar na aba Bateia</button></div>`;
      return;
    }
    const mods = (b.modelos || []).slice(0, 5);
    el.innerHTML = `<div class="cartao bateia-res"><div class="titulo-cartao">Mineração · Bateia</div>
      ${b.geologia && b.geologia.pontual && b.geologia.pontual[0] ? `<div class="pequeno"><b>Geologia:</b> ${esc([b.geologia.pontual[0].sigla, b.geologia.pontual[0].nome].filter(Boolean).join(' — '))} (${esc(b.geologia.pontual[0].escala)})</div>` : ''}
      ${mods.length ? `<table class="tab mini"><thead><tr><th>Modelo de depósito</th><th class="num">Compat.</th><th class="num">Conf.</th></tr></thead><tbody>${mods.map(m => `<tr><td>${esc(m.nome)}<br><small class="muted">${esc((m.minerios || []).slice(0, 4).join(', '))}</small></td><td class="num"><b>${Math.round(m.ajuste * 100)}%</b><br><small>${esc(m.classe || '')}</small></td><td class="num">${Math.round(m.conf * 100)}%</td></tr>`).join('')}</tbody></table>` : '<div class="pequeno muted">Sem modelo de depósito com ajuste relevante.</div>'}
      ${b.substancias && b.substancias.length ? `<div class="pequeno"><b>Substâncias registradas:</b> ${b.substancias.slice(0, 10).map(x => `${esc(x.nome)} (${x.total})`).join(', ')}</div>` : ''}
      ${b.geoquimica && b.geoquimica.length ? `<div class="pequeno"><b>Anomalias geoquímicas:</b> ${b.geoquimica.map(x => esc(x.nome)).join(', ')}</div>` : ''}
      <button class="btn" data-vista-ir="bateia">Ver a análise completa na Bateia</button></div>`;
  }

  /* lista de fontes (progresso + evidências) */
  function montarListaFontes(tarefas) {
    let html = '', setor = null;
    tarefas.forEach(c => {
      if (c.setor !== setor) { setor = c.setor; html += `<div class="fl-setor">${esc(VA.nomeSetor(setor))}</div>`; }
      html += `<div class="fonte-l st-aguardando" id="f-${c.id}" data-id="${c.id}"><div class="fl-cab"><i class="dot"></i><div class="fl-txt"><div class="fl-nome">${esc(c.nome)}</div><div class="fl-res">aguardando</div></div><span class="fl-st">aguardando</span></div><div class="fl-itens"></div></div>`;
    });
    $('#resFontes').innerHTML = html;
  }
  function atualizarFonte(id, st, r) {
    const el = document.getElementById('f-' + id); if (!el) return;
    el.className = el.className.replace(/st-\S+/, 'st-' + st);
    el.querySelector('.fl-st').textContent = ROT_STATUS[st] || st;
    if (r) {
      el.querySelector('.fl-res').textContent = r.resumo || '';
      el.querySelector('.fl-st').textContent = (ROT_STATUS[r.status] || r.status) + (r.ms ? ` · ${(r.ms / 1000).toFixed(1)} s` : '');
      if (el.classList.contains('aberta')) preencherItens(el, r);
    } else if (st === 'executando') el.querySelector('.fl-res').textContent = 'consultando…';
  }
  function renderFontes() {
    const a = estado.analise;
    a.ordem.forEach(id => { const el = document.getElementById('f-' + id); if (el) { atualizarFonte(id, a.resultados[id].status, a.resultados[id]); if (el.classList.contains('aberta')) preencherItens(el, a.resultados[id]); } });
    const c = $('#resFontesCont'); if (c) c.textContent = `· ${a.ordem.length} · ${Object.values(a.resultados).filter(r => r.status === 'falha').length} sem resposta`;
  }
  function preencherItens(el, r) {
    const box = el.querySelector('.fl-itens');
    const its = r.itens || [];
    const consulta = r.consultas && r.consultas[0] && r.consultas[0].url;
    const LIM = 200;
    const dist = it => it.distancia_km != null ? (it.incide ? (it.sobreposicao_ha ? VA.fmt.ha(it.sobreposicao_ha) : 'dentro') : VA.fmt.kmItem(it)) : '';
    box.innerHTML = (r.erro ? `<div class="erro-txt">${esc(r.erro)}</div>` : '')
      + (its.length > 5 ? `<input type="search" class="fl-filtro" placeholder="Filtrar ${its.length} registros: mineral, titular, processo, qualquer atributo…">` : '')
      + (its.length ? its.slice(0, LIM).map(it => `<details class="item ${it.incide ? 'incide' : ''}" data-item="${it.evid}" data-busca="${esc(VA.fmt.norm(it.titulo + ' ' + (it.subtitulo || '') + ' ' + (it.atributos || []).map(a => a[1]).join(' ')))}"><summary><span class="ev" data-ev="${it.evid}" title="Localizar no mapa">${it.evid}</span><span class="it-txt"><b>${esc(it.titulo)}</b>${it.subtitulo ? `<small>${esc(it.subtitulo)}</small>` : ''}</span><span class="it-d">${dist(it)}</span></summary>${(it.atributos || []).length ? `<table class="it-attr">${it.atributos.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>` : ''}<button class="mini" data-ev="${it.evid}">ver no mapa</button></details>`).join('') + (its.length > LIM ? `<div class="pequeno muted">+ ${its.length - LIM} registros (todos no pacote de evidências e no GeoJSON)</div>` : '') : (r.erro ? '' : '<div class="pequeno muted">Nenhum registro.</div>'))
      + `<div class="fl-rod">${esc(r.camada.fonte)}${r.consultadoEm ? ' · ' + VA.fmt.dataHora(new Date(r.consultadoEm)) : ''}${consulta && /^https?:/.test(consulta) ? ` · <a href="${esc(consulta)}" target="_blank" rel="noopener">ver a requisição</a>` : ''} · <a href="#" data-info="${r.camada.id}">sobre a camada</a></div>`;
  }
  function abrirFonte(id, abrir) {
    const el = document.getElementById('f-' + id); if (!el || !estado.analise) return null;
    const r = estado.analise.resultados[id]; if (!r) return el;
    const aberta = abrir === undefined ? !el.classList.contains('aberta') : abrir;
    el.classList.toggle('aberta', aberta);
    if (aberta) preencherItens(el, r);
    return el;
  }

  $('#resultados').addEventListener('input', e => {
    const f = e.target.closest('.fl-filtro'); if (!f) return;
    const t = VA.fmt.norm(f.value);
    f.parentElement.querySelectorAll('.item').forEach(it => { it.hidden = t && !it.dataset.busca.includes(t); });
  });
  $('#resultados').addEventListener('click', e => {
    const inf = e.target.closest('[data-info]');
    if (inf) { e.preventDefault(); return infoCamada(VA.camada(inf.dataset.info)); }
    const ev = e.target.closest('[data-ev]');
    if (ev) { e.preventDefault(); return focarEvidencia(ev.dataset.ev); }
    const ir = e.target.closest('[data-ir]');
    if (ir) { const el = abrirFonte(ir.dataset.ir, true); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.classList.add('destaque'); setTimeout(() => el.classList.remove('destaque'), 1800); } return; }
    const cab = e.target.closest('.fl-cab');
    if (cab) return abrirFonte(cab.parentElement.dataset.id);
    const vista = e.target.closest('[data-vista-ir]');
    if (vista) mostrarVista(vista.dataset.vistaIr);
  });

  function pontoProximo(f, ref) {
    const g = f.geometry, pt = turf.point(ref);
    try {
      if (g.type === 'Point') return g.coordinates;
      if (/LineString/.test(g.type)) return turf.nearestPointOnLine(f, pt).geometry.coordinates;
      if (/Polygon/.test(g.type)) {
        if (turf.booleanPointInPolygon(pt, f)) return ref;
        const linhas = turf.flatten(turf.polygonToLine(f)).features;
        let melhor = null, dmin = Infinity;
        linhas.forEach(l => { const n = turf.nearestPointOnLine(l, pt); if (n.properties.dist < dmin) { dmin = n.properties.dist; melhor = n.geometry.coordinates; } });
        return melhor || turf.pointOnFeature(f).geometry.coordinates;
      }
      return turf.pointOnFeature(f).geometry.coordinates;
    } catch (e) { try { return turf.pointOnFeature(f).geometry.coordinates; } catch (e2) { return ref; } }
  }
  function popupItem(reg) {
    const it = reg.it;
    return `<div class="pop"><div class="pop-cab"><span class="ev">${it.evid}</span> ${esc(reg.r.camada.nome)}</div><b>${esc(it.titulo)}</b>${it.subtitulo ? `<div class="muted">${esc(it.subtitulo)}</div>` : ''}
      ${it.distancia_km != null ? `<div class="pop-d">${it.incide ? 'Incide na área' + (it.sobreposicao_ha ? ` · ${VA.fmt.ha(it.sobreposicao_ha)} sobrepostos` : '') : 'A ' + VA.fmt.kmItem(it) + ' da área'}</div>` : ''}
      <table>${(it.atributos || []).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table><div class="pop-f">${esc(reg.r.camada.fonte)}</div></div>`;
  }
  function focarEvidencia(ev) {
    const reg = estado.porEvid[ev]; if (!reg) return;
    mostrarAba('analise'); mostrarVista('mapa');
    const el = abrirFonte(reg.id, true);
    const linha = el && el.querySelector(`.item[data-item="${ev}"]`);
    if (linha) { linha.open = true; linha.scrollIntoView({ block: 'center', behavior: 'smooth' }); linha.classList.add('destaque'); setTimeout(() => linha.classList.remove('destaque'), 2500); }
    const it = reg.it, aoi = estado.sessao.aoi, centro = VA.geo.centro(aoi);
    let pos = centro;
    if (it.feature && it.feature.geometry) {
      pos = pontoProximo(it.feature, centro);
      const b = L.geoJSON(aoi).getBounds();
      if (!it.incide) b.extend([pos[1], pos[0]]);
      mapa.fitBounds(b, { padding: [60, 60], maxZoom: aoi.geometry.type === 'Point' ? 15 : 17 });
    }
    L.popup({ maxWidth: 400, maxHeight: 360, className: 'popup-ev' }).setLatLng([pos[1], pos[0]]).setContent(popupItem(reg)).openOn(mapa);
  }

  /* clique num elemento desenhado pela análise: mostra todos os elementos naquele ponto, com os atributos */
  function mostrarElementos(ll, evClicada) {
    const a = estado.analise; if (!a) return;
    const pt = turf.point([ll.lng, ll.lat]);
    const mPorPx = 40075016.686 * Math.cos(ll.lat * Math.PI / 180) / (256 * 2 ** mapa.getZoom());
    const tolKm = 7 * mPorPx / 1000;
    const hits = [];
    Object.entries(estado.porEvid).forEach(([e, reg]) => {
      const it = reg.it; if (!it.feature || !it.feature.geometry) return;
      const d = e === evClicada ? 0 : VA.geo.distanciaKm(pt, it.feature);
      if (d != null && d <= tolKm) hits.push({ id: reg.id, it, r: reg.r, peso: M.pesoFeicao(it.feature) });
    });
    hits.sort((x, y) => (y.it.evid === evClicada) - (x.it.evid === evClicada) || x.peso - y.peso);
    if (M._marcaFicha) mapa.removeLayer(M._marcaFicha);
    M._marcaFicha = L.circleMarker(ll, { radius: 6, color: '#1665d8', weight: 3, fillColor: '#fff', fillOpacity: 0.9, interactive: false }).addTo(mapa);
    const f = VA.coord.formatos(ll.lng, ll.lat);
    const rel = it => it.distancia_km == null ? '' : it.incide ? `<span class="q-sit-mini dentro">Dentro da área${it.sobreposicao_ha ? ' · ' + VA.fmt.ha(it.sobreposicao_ha) : ''}</span>` : `<span class="q-sit-mini proximo">Entorno · a ${VA.fmt.kmItem(it)} da área</span>`;
    APP.abrirFicha(`<div class="pequeno muted">${hits.length} elemento(s) da análise neste ponto · <span class="mono">${f.dec}</span> <button class="mini copiar" data-copiar="${f.dec}">copiar</button></div>
      ${hits.slice(0, 25).map((h, i) => `<details class="elem" ${i === 0 ? 'open' : ''}><summary><span class="ev">${esc(h.it.evid)}</span> <b>${esc(h.it.titulo)}</b></summary>
        <div class="elem-cab"><span class="elem-cam">${esc(h.r.camada.nome)}</span><span class="elem-fonte">${esc(h.r.camada.fonte)}</span></div>
        ${h.it.subtitulo ? `<div class="pequeno">${esc(h.it.subtitulo)}</div>` : ''}${rel(h.it)}
        <table class="elem-attr">${(h.it.atributos || []).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
        <a href="#" class="pequeno" data-ir-ev="${esc(h.it.evid)}">ver na lista de resultados</a></details>`).join('')}`, { lon: ll.lng, lat: ll.lat, f, titulo: 'Informações do elemento' });
  }

  /* ============================== saídas ============================== */
  function exigirSessao() { if (!estado.sessao) { aviso('Rode a análise primeiro.', true); return false; } return true; }
  /* ---------- relatório: abre uma nova aba (relatorio.html) e gera o relatório nela ----------
     A aba nova avisa que está pronta; esta tela roda a análise (se a área ou os parâmetros mudaram), manda o
     progresso fonte a fonte, espera a Bateia e, ao final, envia o relatório completo. Também fica guardado no navegador. */
  const relAbas = {};
  const CHAVE_ANALISE = ['alvoAtivo', 'requerimento', 'reqSubstancia', 'reqHa', 'raioAlvoKm', 'setores', 'raioEnergiaKm', 'osm', 'raioAnmKm', 'raioOcorrenciasKm', 'titulares', 'bateia', 'raioBateiaKm', 'raioAmbientalKm', 'raioPontoM', 'entornoKm', 'extras', 'filtrosNaAnalise', 'filtrosChave'];
  const chaveAnalise = p => JSON.stringify(CHAVE_ANALISE.map(k => k === 'extras' ? (p.extras || []).slice().sort() : p[k]));
  function sessaoAtual() {
    const s = estado.sessao; if (!s || s.aoiBase !== estado.aoi) return null;
    const p = lerParametros();
    if (s.chave !== chaveAnalise(p)) return null;
    s.finalidadeTexto = p.finalidadeTexto; s.responsavel = p.responsavel; s.municipios = estado.municipios; s.cota = estado.cota;
    if (s.finalidade !== p.finalidade) { s.finalidade = p.finalidade; reavaliar(); }
    return s;
  }
  function gerarRelatorio() {
    if (!estado.aoi) return aviso('Defina a área pelas ferramentas do topo: Ponto, Polígono, Retângulo, Círculo ou Importar.', true);
    const p0 = lerParametros();
    if (!['energia', 'mineracao', 'fundiario', 'ambiental'].some(s => p0.setores[s])) return aviso('Ligue pelo menos um setor em “Parâmetros por setor”.', true);
    if (precisaPerguntarAlvo(p0)) { perguntarAlvo().then(ok => { if (ok) gerarRelatorio(); }); return; }
    const id = 'R' + Date.now();
    const w = window.open('relatorio.html?id=' + id, '_blank');
    if (!w) return aviso('O navegador bloqueou a nova aba. Permita pop-ups para este endereço e clique de novo.', true, 8000);
    relAbas[id] = { w, pronto: false, semBateia: false, criado: Date.now() };
    if (!sessaoAtual() && !estado.rodando) analisar();
    aviso('Relatório sendo gerado na nova aba.');
  }
  APP.gerarRelatorio = gerarRelatorio;
  $('#btnRelatorio').addEventListener('click', gerarRelatorio);
  $('#btnRelatorioNovo').addEventListener('click', gerarRelatorio);
  const enviarRel = (job, msg) => { try { job.w.postMessage(Object.assign({ id: job.id }, msg), '*'); } catch (e) { } };
  function relProgresso(msg) { Object.entries(relAbas).forEach(([id, job]) => { job.id = id; if (job.pronto) enviarRel(job, Object.assign({ tipo: 'vip:rel:progresso' }, msg)); }); }
  function atualizarRelatorios() {
    Object.entries(relAbas).forEach(([id, job]) => {
      job.id = id;
      if (!job.w || job.w.closed) { delete relAbas[id]; return; }
      if (!job.pronto) return;
      const nome = estado.municipios && estado.municipios[0] ? VA.fmt.munUF(estado.municipios[0]) : 'Área de interesse';
      if (estado.rodando) return enviarRel(job, { tipo: 'vip:rel:progresso', nome, feitos: estado.progresso ? estado.progresso.n : 0, total: estado.progresso ? estado.progresso.total : 0 });
      const s = sessaoAtual();
      if (!s) {
        if (job.erro) return enviarRel(job, { tipo: 'vip:rel:erro', texto: job.erro });
        if (!estado.aoi) return enviarRel(job, { tipo: 'vip:rel:erro', texto: 'A área de interesse foi apagada na tela principal.' });
        return analisar();
      }
      const bv = estado.bateiaVip;
      if (bv && bv.aoi === s.aoi && !s.analise.bateia && ['enviada', 'analisando'].includes(bv.estado) && !job.semBateia)
        return enviarRel(job, { tipo: 'vip:rel:espera', nome, texto: 'Fontes oficiais concluídas. Aguardando a Bateia (prospecção mineral) terminar a análise da área…' });
      if (job.tipo === 'slides') {
        if (job.montando) return;
        job.montando = true;
        const mun0 = estado.municipios && estado.municipios[0];
        enviarRel(job, { tipo: 'vip:rel:etapa', nome, titulo: 'Montando a apresentação', texto: 'Preparando os mapas…' });
        VA.slidesHTML(s, { aoProgresso: (f, t) => enviarRel(job, { tipo: 'vip:rel:etapa', nome, titulo: 'Montando a apresentação', texto: `Mapas prontos: ${f} de ${t}`, feitos: f, total: t }) })
          .then(html2 => {
            enviarRel(job, { tipo: 'vip:rel:html', html: html2 }); delete relAbas[id];
            VA.db.gravar('relatorios', { id, nome: `Apresentação · ${mun0 ? VA.fmt.munUF(mun0) : 'Área'} · ${VA.FINALIDADES[s.finalidade]}`, criadoEm: new Date().toISOString(), sintese: s.avaliacao.sintese.texto, html: html2 })
              .then(() => { VA.db.podar('relatorios', 40); atualizarContEstudos(); }).catch(() => { });
          })
          .catch(e => { enviarRel(job, { tipo: 'vip:rel:erro', texto: 'Falha ao montar a apresentação: ' + e.message }); delete relAbas[id]; });
        return;
      }
      let html;
      try { html = VA.relatorioHTML(s); } catch (e) { return enviarRel(job, { tipo: 'vip:rel:erro', texto: 'Falha ao montar o relatório: ' + e.message }); }
      enviarRel(job, { tipo: 'vip:rel:html', html });
      delete relAbas[id];
      const mun = estado.municipios && estado.municipios[0];
      VA.db.gravar('relatorios', { id, nome: `${mun ? VA.fmt.munUF(mun) : 'Área'} · ${VA.FINALIDADES[s.finalidade]}`, criadoEm: new Date().toISOString(), sintese: s.avaliacao.sintese.texto, html })
        .then(() => { VA.db.podar('relatorios', 40); atualizarContEstudos(); }).catch(() => { });
    });
  }
  window.addEventListener('message', e => {
    const d = e.data; if (!d || typeof d !== 'object' || !d.id) return;
    if (!relAbas[d.id]) {  // aba de um relatório já gerado (recarregada ou aberta pelo histórico): entrega o guardado
      if (d.tipo === 'vip:rel:pronto' && /^[RS]\d+$/.test(d.id) && e.source) VA.db.ler('relatorios', d.id)
        .then(r => e.source.postMessage(r && r.html ? { id: d.id, tipo: 'vip:rel:html', html: r.html } : { id: d.id, tipo: 'vip:rel:erro', texto: 'Este relatório não está guardado neste navegador. Gere de novo pela tela principal.' }, '*'))
        .catch(() => { });
      return;
    }
    const job = relAbas[d.id]; if (e.source !== job.w) return;
    if (d.tipo === 'vip:rel:pronto' && !job.pronto) { job.pronto = true; atualizarRelatorios(); }
    if (d.tipo === 'vip:rel:semBateia') { job.semBateia = true; atualizarRelatorios(); }
  });
  /* ======================= estudos e relatórios salvos ======================= */
  VA.db = (function () {
    let p = null;
    const abrir = () => p || (p = new Promise((ok, falha) => {
      const r = indexedDB.open('vip-analysis', 1);
      r.onupgradeneeded = () => { ['estudos', 'relatorios'].forEach(n => { if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n, { keyPath: 'id' }); }); };
      r.onsuccess = () => ok(r.result); r.onerror = () => falha(r.error);
    }));
    const tx = async (loja, modo, fn) => { const d = await abrir(); return new Promise((ok, falha) => { const t = d.transaction(loja, modo); const req = fn(t.objectStore(loja)); t.oncomplete = () => ok(req && req.result); t.onerror = () => falha(t.error); }); };
    return {
      gravar: (loja, v) => tx(loja, 'readwrite', s => s.put(v)),
      ler: (loja, id) => tx(loja, 'readonly', s => s.get(id)),
      apagar: (loja, id) => tx(loja, 'readwrite', s => s.delete(id)),
      listar: (loja) => tx(loja, 'readonly', s => s.getAll()).then(l => (l || []).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))),
      async podar(loja, max) { const l = await this.listar(loja); for (const x of l.slice(max)) await this.apagar(loja, x.id); }
    };
  })();
  async function atualizarContEstudos() {
    try { const [e, r] = await Promise.all([VA.db.listar('estudos'), VA.db.listar('relatorios')]); $('#contEstudos').textContent = (e.length + r.length) || ''; } catch (err) { $('#contEstudos').textContent = ''; }
  }
  function salvarEstudo() {
    if (!estado.aoi) return aviso('Defina uma área primeiro.', true);
    const mun = estado.municipios && estado.municipios[0];
    const sugestao = `${mun ? VA.fmt.munUF(mun) : 'Área'} · ${new Date().toLocaleDateString('pt-BR')}`;
    modal(`<div class="modal-cab"><b>Salvar estudo</b><button class="x" data-fechar>×</button></div>
      <p class="pequeno muted">Guarda a área, a origem e os parâmetros neste navegador, para retomar depois.</p>
      <label>Nome do estudo<input type="text" id="nomeEstudo" maxlength="120" value="${esc(sugestao)}"></label>
      <div class="mini-acoes"><button class="btn btn-pri" id="confirmaEstudo">Salvar</button><button class="btn" data-fechar>Cancelar</button></div>`, fechar => {
      $('#confirmaEstudo').onclick = async () => {
        const nome = $('#nomeEstudo').value.trim(); if (!nome) return aviso('Informe um nome.', true);
        try {
          await VA.db.gravar('estudos', { id: 'E' + Date.now(), nome, criadoEm: new Date().toISOString(), aoi: estado.aoi, origem: estado.origem, notas: estado.notas, municipios: estado.municipios, params: lerParametros(), sintese: estado.avaliacao ? estado.avaliacao.sintese.texto : null });
          fechar(); aviso('Estudo salvo.'); atualizarContEstudos();
        } catch (e) { aviso('Não foi possível salvar: ' + e.message, true); }
      };
    });
  }
  $('#btnEstudos').addEventListener('click', async () => {
    let est = [], rel = [];
    try { [est, rel] = await Promise.all([VA.db.listar('estudos'), VA.db.listar('relatorios')]); } catch (e) { return aviso('O navegador não permitiu acessar o armazenamento local: ' + e.message, true); }
    const data = s => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    modal(`<div class="modal-cab"><b>Estudos e relatórios salvos</b><button class="x" data-fechar>×</button></div>
      <p class="pequeno muted">Ficam guardados só neste navegador. Para levar a outro computador, baixe o GeoJSON da área ou o HTML do relatório.</p>
      <div class="titulo-cartao mt">Estudos (${est.length})</div>
      ${est.length ? est.map(e => `<div class="salvo"><div><b>${esc(e.nome)}</b><div class="pequeno muted">${data(e.criadoEm)} · ${esc(e.origem || '')}${e.sintese ? ' · ' + esc(e.sintese) : ''}</div></div><div class="mini-acoes sem-mt"><button class="btn btn-pri" data-abrir-estudo="${e.id}">Abrir</button><button class="btn" data-apagar="estudos:${e.id}">Excluir</button></div></div>`).join('') : '<div class="vazio-msg">Nenhum estudo salvo. Use “Salvar estudo” no cartão da área.</div>'}
      <div class="titulo-cartao mt">Relatórios gerados (${rel.length})</div>
      ${rel.length ? rel.map(r => `<div class="salvo"><div><b>${esc(r.nome)}</b><div class="pequeno muted">${data(r.criadoEm)}${r.sintese ? ' · ' + esc(r.sintese) : ''}</div></div><div class="mini-acoes sem-mt"><button class="btn btn-pri" data-abrir-rel="${r.id}">Abrir</button><button class="btn" data-baixar-rel="${r.id}">Baixar</button><button class="btn" data-apagar="relatorios:${r.id}">Excluir</button></div></div>`).join('') : '<div class="vazio-msg">Os relatórios gerados aparecem aqui automaticamente.</div>'}`, fechar => {
      $('#modalCorpo').addEventListener('click', async ev => {
        const b = ev.target.closest('button'); if (!b) return;
        if (b.dataset.abrirEstudo) {
          const e = await VA.db.ler('estudos', b.dataset.abrirEstudo); if (!e) return;
          fechar(); restaurarParametros(e.params); definirAOI(e.aoi, e.origem, e.notas || []); mostrarVista('mapa'); aviso('Estudo aberto: ' + e.nome);
        } else if (b.dataset.abrirRel) {
          window.open('relatorio.html?id=' + encodeURIComponent(b.dataset.abrirRel), '_blank');
        } else if (b.dataset.baixarRel) {
          const r = await VA.db.ler('relatorios', b.dataset.baixarRel); if (!r) return;
          VA.baixar(`relatorio-${r.id}.html`, r.html, 'text/html');
        } else if (b.dataset.apagar) {
          const [loja, id] = b.dataset.apagar.split(':'); await VA.db.apagar(loja, id); b.closest('.salvo').remove(); atualizarContEstudos();
        }
      });
    });
  });
  function restaurarParametros(p) {
    if (!p) return;
    if (p.finalidade) $('#finalidade').value = p.finalidade;
    document.querySelectorAll('input[name="alvoModo"]').forEach(r => { r.checked = r.value === p.alvoModo; });
    mostrarAlvo();
    Object.entries(CAMPOS).forEach(([id, k]) => { if (p[k] != null) $('#' + id).value = p[k]; });
    Object.entries(CHECKS).forEach(([id, k]) => { if (p[k] != null) $('#' + id).checked = !!p[k]; });
    $$('[data-setor-on]').forEach(i => { if (p.setores && p.setores[i.dataset.setorOn] != null) i.checked = !!p.setores[i.dataset.setorOn]; });
    if (Array.isArray(p.extrasEscolhidas)) extrasEscolhidas = p.extrasEscolhidas.filter(id => VA.camada(id));
    contarFontes(); desenharRaio();
  }
  atualizarContEstudos();
  $('#btnPacote').addEventListener('click', () => { if (exigirSessao()) VA.baixar(`evidencias-${carimbo()}.json`, JSON.stringify(VA.pacoteEvidencias(estado.sessao), null, 2)); });
  /* slides: apresentação enxuta montada na nova aba a partir da análise concluída */
  $('#btnSlides').addEventListener('click', () => {
    if (!exigirSessao()) return;
    const id = 'S' + Date.now();
    const w = window.open('relatorio.html?id=' + id, '_blank');
    if (!w) return aviso('O navegador bloqueou a nova aba. Permita pop-ups para este endereço e clique de novo.', true, 8000);
    relAbas[id] = { w, pronto: false, semBateia: true, criado: Date.now(), tipo: 'slides' };
    aviso('Apresentação sendo montada na nova aba.');
  });
  $('#btnGeojson').addEventListener('click', () => {
    if (!exigirSessao()) return;
    const { aoi, analise } = estado.sessao;
    const feats = [Object.assign({}, aoi, { properties: { camada: 'area_interesse', origem: estado.sessao.origem } })];
    analise.ordem.forEach(id => (analise.resultados[id].itens || []).forEach(it => {
      if (it.feature && it.feature.geometry) feats.push({ type: 'Feature', geometry: it.feature.geometry, properties: Object.assign({ camada: id, evidencia: it.evid, titulo: it.titulo, distancia_km: it.distancia_km, sobreposicao_ha: it.sobreposicao_ha, incide: !!it.incide }, Object.fromEntries(it.atributos || [])) });
    }));
    VA.baixar(`vip-analysis-${carimbo()}.geojson`, JSON.stringify({ type: 'FeatureCollection', features: feats }), 'application/geo+json');
  });

  /* ============================ ficha do ponto ============================ */
  APP.abrirFicha = function (html, ctx) {
    const f = $('#ficha'); $('#fichaCorpo').innerHTML = html; f.hidden = false; f.scrollTop = 0; VA.filtros.fechar();
    $('#fichaTitulo').textContent = ctx.titulo || 'Informações do ponto';
    $('#fichaCorpo').onclick = e => {
      const ev = e.target.closest('[data-ir-ev]'); if (ev) { e.preventDefault(); focarEvidencia(ev.dataset.irEv); return; }
      const b = e.target.closest('[data-acao]'); if (!b) return;
      if (b.dataset.acao === 'regua') { fecharFicha(); sairDesenho(); sairEdicao(); VA.regua.iniciar(L.latLng(ctx.lat, ctx.lon)); }
    };
    return f;
  };
  function fecharFicha() { $('#ficha').hidden = true; if (M._marcaFicha) { mapa.removeLayer(M._marcaFicha); M._marcaFicha = null; } if (M._caixaCar) { mapa.removeLayer(M._caixaCar); M._caixaCar = null; } }
  $('#fechaFicha').addEventListener('click', fecharFicha);

  /* ================================ régua ================================ */
  APP.painelRegua = function (r, ativo) {
    const p = $('#reguaPainel');
    $('#btnRegua').classList.toggle('ativo', !!ativo);
    if (!r) { p.hidden = true; return; }
    p.hidden = false;
    const az = r.rumo;
    p.innerHTML = `<div class="rg-cab"><b>Régua</b><button class="x" data-rg="fechar" aria-label="Fechar">×</button></div>
      <div class="rg-total">${r.total ? VA.fmt.km(r.total).replace('dentro', '0 m') : '—'}</div>
      <div class="kv">
        <div class="k">Último trecho</div><div class="v">${r.ultimo ? VA.fmt.km(r.ultimo).replace('dentro', '0 m') : '—'}</div>
        <div class="k">Rumo</div><div class="v">${az != null ? `${VA.fmt.num(az, 1)}° (${VA.geo.rumoTxt(az)})` : '—'}</div>
        <div class="k">Pontos</div><div class="v">${r.n}</div>
        ${r.area_ha != null ? `<div class="k">Área</div><div class="v"><b>${VA.fmt.ha(r.area_ha)}</b> (${VA.fmt.num(r.area_ha * 10000, 0)} m²)</div><div class="k">Perímetro</div><div class="v">${VA.fmt.km(r.perimetro)}</div>` : ''}
      </div>
      ${ativo ? '<div class="pequeno muted">Clique para marcar pontos · clique no 1º ponto para fechar e medir a área · duplo clique ou Enter conclui · Backspace desfaz · Esc cancela</div>' : ''}
      <div class="mini-acoes">${ativo ? '<button class="btn btn-pri" data-rg="concluir">Concluir</button>' : '<button class="btn" data-rg="nova">Nova medida</button>'}${r.poligono ? '<button class="btn" data-rg="aoi">Usar como área de interesse</button>' : ''}${r.total ? '<button class="btn" data-rg="copiar">Copiar</button>' : ''}</div>`;
  };
  $('#reguaPainel').addEventListener('click', e => {
    const b = e.target.closest('[data-rg]'); if (!b) return;
    const acao = b.dataset.rg;
    if (acao === 'fechar') VA.regua.parar();
    if (acao === 'concluir') VA.regua.concluir();
    if (acao === 'nova') VA.regua.iniciar();
    if (acao === 'copiar') { const r = VA.regua.resumo(); copiar(`Distância: ${VA.fmt.km(r.total)}${r.area_ha != null ? ` · Área: ${VA.fmt.ha(r.area_ha)} · Perímetro: ${VA.fmt.km(r.perimetro)}` : ''}`, 'Medida copiada.'); }
    if (acao === 'aoi') { const r = VA.regua.resumo(); if (r.poligono) { const pol = r.poligono; VA.regua.parar(); definirAOI({ type: 'Feature', properties: {}, geometry: pol.geometry }, 'Polígono medido com a régua', [], false); } }
  });
  $('#btnBrasil').addEventListener('click', () => { mostrarVista('mapa'); mapa.flyTo([-14.2, -51.9], 4); });
  $('#btnRegua').addEventListener('click', () => {
    if (M.modo === 'regua') { VA.regua.pontos.length >= 2 ? VA.regua.concluir() : VA.regua.parar(); return; }
    sairDesenho(); sairEdicao(); fecharFicha(); mostrarVista('mapa');
    VA.regua.iniciar();
  });

  /* ============================== camadas ============================== */
  function montarBases() {
    const sel = $('#selBase');
    sel.innerHTML = VA.BASES.map(b => `<option value="${b.id}">${esc(b.nome)}</option>`).join('');
    M.basePronta.then(() => { sel.value = M.baseId; });
    sel.addEventListener('change', async () => { const ok = await M.setBase(sel.value); if (!ok) sel.value = M.baseId; });
    $('#lnkGoogle').addEventListener('click', e => { e.preventDefault(); APP.pedirChaveGoogle('google_sat'); });
    VA.google.ouvinte = mostrarUsoGoogle; mostrarUsoGoogle();
  }
  APP.baseMudou = () => { $('#selBase').value = M.baseId; mostrarUsoGoogle(); };
  function mostrarUsoGoogle() {
    const el = $('#googleUso'); if (!el) return;
    if (!VA.google.chave()) { el.textContent = ''; return; }
    const u = VA.google.uso(), t = VA.google.tetos(), n = v => VA.fmt.num(v, 0);
    const ex = VA.google.excedido();
    el.textContent = ex ? 'teto atingido' : `${n(u.nMes)}${t.mensal ? '/' + n(t.mensal) : ''}`;
    el.classList.toggle('excedido', !!ex);
    el.title = `Google: ${n(u.nDia)}${t.diario ? ' de ' + n(t.diario) : ''} blocos hoje; ${n(u.nMes)}${t.mensal ? ' de ' + n(t.mensal) : ''} no mês${ex ? ' — teto atingido' : ''}`;
  }

  APP.pedirChaveGoogle = function (id, erro) {
    const def = VA.BASES.find(b => b.id === id) || VA.BASES.find(b => b.google);
    modal(`<div class="modal-cab"><b>Imagens do Google — chave própria</b><button class="x" data-fechar>×</button></div>
      <p>O Google só libera as imagens de satélite pela <b>Map Tiles API</b>, com uma chave do seu projeto no Google Cloud (há cota gratuita mensal). É a mesma chave usada na Bateia.</p>
      <ol class="pequeno"><li>Acesse <a href="https://console.cloud.google.com/apis/library/tile.googleapis.com" target="_blank" rel="noopener">console.cloud.google.com</a> e ative a <b>Map Tiles API</b>.</li><li>Em “Credenciais”, crie uma <b>chave de API</b> (restrinja à Map Tiles API).</li><li>Cole a chave abaixo. Ela fica guardada só neste navegador.</li></ol>
      ${erro ? `<div class="erro-txt">Problema com a chave: ${esc(erro)}</div>` : ''}
      <input type="text" id="chaveGoogle" placeholder="AIza…" value="${esc(VA.google.chave())}" spellcheck="false">
      <div class="titulo-cartao mt">Teto de uso (para ficar na cota grátis)</div>
      <p class="pequeno">O Google libera <b>100.000 blocos de imagem por mês</b> de graça na Map Tiles API. A plataforma conta cada bloco pedido neste navegador e, ao chegar no teto, <b>para de usar o Google e volta para o Esri</b> — o mapa não para de funcionar e não há cobrança.</p>
      <div class="linha"><label class="sem-mt">Teto mensal (blocos)<input type="number" id="tetoMensal" min="0" step="1000" value="${VA.google.tetos().mensal}"></label><label class="sem-mt">Teto diário (blocos, 0 = sem)<input type="number" id="tetoDiario" min="0" step="500" value="${VA.google.tetos().diario}"></label></div>
      <p class="pequeno muted">Uso registrado: ${VA.fmt.num(VA.google.uso().nDia, 0)} blocos hoje · ${VA.fmt.num(VA.google.uso().nMes, 0)} neste mês. Uma tela cheia de mapa usa de 30 a 60 blocos. A contagem é deste navegador: se usar a chave em outro computador (ou na Bateia), defina também uma cota no Google Cloud — APIs e serviços › Map Tiles API › Cotas — de cerca de 3.000 pedidos por dia.</p>
      <div class="mini-acoes"><button class="btn btn-pri" id="salvarChave">Salvar e usar</button><button class="btn" data-fechar>Cancelar</button>${VA.google.chave() ? '<button class="btn" id="apagarChave">Apagar a chave</button>' : ''}</div>`, fechar => {
      $('#salvarChave').onclick = async () => {
        VA.google.definirChave($('#chaveGoogle').value);
        VA.google.definirTetos({ mensal: $('#tetoMensal').value, diario: $('#tetoDiario').value });
        if (!$('#chaveGoogle').value.trim()) { fechar(); return; }
        const ok = await M.setBase(def.id);
        if (ok) { $('#selBase').value = def.id; fechar(); aviso('Imagens do Google ativadas.'); }
      };
      const ap = $('#apagarChave'); if (ap) ap.onclick = async () => { VA.google.definirChave(''); fechar(); if (VA.BASES.find(b => b.id === M.baseId).google) { await M.setBase('esri_sat'); $('#selBase').value = 'esri_sat'; } };
    });
    $('#selBase').value = M.baseId || 'esri_sat';
  };

  function montarUF() {
    $('#selUF').innerHTML = VA.UFS.map(u => `<option>${u}</option>`).join('');
    $('#selUF').value = M.uf;
    $('#ufAtual').textContent = M.uf;
    $('#selUF').addEventListener('change', e => { M.definirUF(e.target.value); desenharUF(e.target.value, true); });
    $('#chkFiltroUF').checked = !!M.filtrarUF;
    $('#chkFiltroUF').addEventListener('change', e => { M.filtrarUF = e.target.checked; VA.armazem.gravar('filtrarUF', M.filtrarUF); M.recriar(c => c.ufCampo); M.atualizarRecorte(); });
  }
  /* contorno do estado escolhido (malha IBGE via ANM) */
  let camadaUF = null;
  async function desenharUF(uf, enquadrar) {
    try {
      const fc = await M.limiteUF(uf);
      if (camadaUF) mapa.removeLayer(camadaUF);
      camadaUF = L.geoJSON(fc, { interactive: false, style: { color: '#3886a7', weight: 2, fill: false, dashArray: '6 5' } }).addTo(mapa);
      if (enquadrar && camadaUF.getBounds().isValid()) mapa.fitBounds(camadaUF.getBounds(), { padding: [30, 30] });
    } catch (e) { aviso('Não foi possível desenhar o limite da UF: ' + e.message, true); }
  }
  APP.ufMudou = function (uf) {
    $('#selUF').value = uf; $('#ufAtual').textContent = uf;
    $$('[data-uf-nome]').forEach(el => { el.textContent = uf; });
    atualizarBases();
  };

  let abertos = VA.armazem.ler('setoresAbertos', ['mineracao', 'energia']);
  function linhaCamada(c) {
    const on = !!M.ativas[c.id];
    const op = VA.armazem.ler('op:' + c.id, c.view && c.view.tipo === 'img' ? 0.65 : 0.8);
    const tags = [];
    if (c.uf) tags.push(`<span class="tag tag-uf" title="Camada carregada por estado">UF <b data-uf-nome>${M.uf}</b></span>`);
    else if (c.ufCampo) tags.push('<span class="tag tag-uf" title="Pode ser mostrada só no estado de trabalho (opção acima)">UF</span>');
    if (c.cors === 'proxy') tags.push('<span class="tag tag-srv" title="Esta fonte só responde pelo servidor local (iniciar.bat)">servidor local</span>');
    if (curada(c)) tags.push('<span class="tag tag-an" title="Entra sempre na análise da área">analisa</span>');
    else if (analisavel(c)) tags.push('<span class="tag tag-ex" title="Entra na análise quando ligada ou escolhida em “Camadas extras”">análise opcional</span>');
    if (c.soMapa) tags.push('<span class="tag" title="Mapa de referência (WMS): não entra no cruzamento vetorial">só mapa</span>');
    if (c.apenasUF) tags.push(`<span class="tag tag-uf" title="Cobertura estadual">${c.apenasUF}</span>`);
    if (c.minZoom) tags.push(`<span class="tag" title="Aparece a partir deste nível de zoom">zoom ${c.minZoom}+</span>`);
    if (VA.filtros.ativo(c.id)) tags.push(`<button class="tag tag-filtro" data-filtrar="${c.id}" title="${esc(VA.filtros.descricao(c.id))}">filtrada</button>`);
    const av = M.avisos[c.id];
    return `<div class="cam ${on ? 'on' : ''}" data-id="${c.id}">
      <div class="cam-l-linha"><label class="cam-l"><input type="checkbox" data-cam="${c.id}" ${on ? 'checked' : ''}><span class="cam-nome">${esc(c.nome)}</span></label><button class="info" data-info="${c.id}" title="Sobre a camada e a fonte" aria-label="Sobre a camada">ⓘ</button></div>
      <div class="cam-meta"><span class="cam-fonte">${esc(c.fonte)}</span>${tags.join('')}</div>
      <div class="cam-aviso" data-aviso="${c.id}" ${av ? '' : 'hidden'}>${av ? esc(av) : ''}</div>
      ${on ? `<div class="cam-ctl"><input type="range" min="0.1" max="1" step="0.05" value="${op}" data-op="${c.id}" title="Opacidade"><button class="mini" data-leg="${c.id}">legenda</button>${VA.filtros.suporte(c) ? `<button class="mini" data-filtrar="${c.id}" title="Filtrar esta camada (fase, substância, categoria…)">filtrar</button>` : ''}</div><div class="cam-leg" data-legbox="${c.id}" hidden></div>` : ''}
      ${c.id === 'anm_proc' ? legendaSigmine() : ''}
    </div>`;
  }
  /* cores oficiais do SIGMINE por fase (renderer do serviço ANM, conferido em 22/10/2026) */
  const FASES = [['Requerimento de pesquisa', '#e9ffbe', '#4c7300'], ['Autorização de pesquisa', '#0070ff', '#004da8'], ['Direito de requerer a lavra', '#ffd37f', '#ffaa00'], ['Requerimento de lavra', '#ffa77f', '#a83800'], ['Concessão de lavra', '#ff0000', '#a80000'], ['Requerimento de lavra garimpeira', '#ca7af5', '#704489'], ['Lavra garimpeira', '#ba2d7a', '#894465'], ['Requerimento de licenciamento', '#ffffbe', '#ffff73'], ['Licenciamento', '#ffff00', '#a8a800'], ['Requerimento de registro de extração', '#70a800', '#4c7300'], ['Registro de extração', '#66cdab', '#448970'], ['Manifesto de mina', '#3cabc9', '#0084a8'], ['Reconhecimento geológico', '#c22fbf', '#6e6e6e'], ['Apto para disponibilidade', '#cccccc', '#a80000'], ['Disponibilidade', '#d7c29e', '#897044'], ['Dado não cadastrado', '#4131bd', '#6e6e6e']];
  const legendaSigmine = () => `<details class="leg-fixa"><summary>Legenda — fases do SIGMINE</summary>${FASES.map(([n, f, b]) => `<div class="leg-i"><i class="ar" style="background:${f};border-color:${b}"></i>${n}</div>`).join('')}</details>`;

  /* ⓘ sobre a camada: dados do catálogo + metadados lidos do próprio serviço */
  async function infoCamada(c) {
    if (!c) return;
    const v = c.view || {}, q = c.q || {};
    const svc = q.url || v.url || '';
    const raio = c.analise && c.analise.raioKm;
    const uso = curada(c) ? `Entra sempre na análise (${c.analise.contexto ? 'valor no local' : 'raio ' + (typeof raio === 'number' ? VA.fmt.km(raio) : 'do setor')})` : analisavel(c) ? 'Entra na análise quando ligada no mapa ou escolhida em “Camadas extras”' : 'Somente visualização (mapa de referência)';
    modal(`<div class="modal-cab"><b>${esc(c.nome)}</b><button class="x" data-fechar>×</button></div>
      <div class="kv"><div class="k">Fonte</div><div class="v">${esc(c.fonte)}</div><div class="k">Setor</div><div class="v">${esc(VA.nomeSetor(c.setor))} · ${esc(c.grupo || '')}</div>
      <div class="k">Cobertura</div><div class="v">${c.apenasUF ? esc(c.apenasUF) : c.uf ? 'por estado (UF de trabalho)' : 'Brasil'}${c.minZoom ? ` · visível a partir do zoom ${c.minZoom}` : ''}</div>
      <div class="k">Análise</div><div class="v">${esc(uso)}</div>${c.regra && c.regra.nota ? `<div class="k">Base legal</div><div class="v">${esc(c.regra.nota)}</div>` : ''}
      <div class="k">Acesso</div><div class="v">${c.cors === 'proxy' ? 'pelo servidor local (o órgão bloqueia o navegador)' : 'direto do navegador'}</div>
      <div class="k">Serviço</div><div class="v mono pequeno">${esc(svc)}${v.layers ? ' · ' + esc(v.layers) : ''}${q.typeName ? ' · ' + esc(q.typeName) : ''}</div></div>
      ${c.descricao ? `<p class="pequeno">${esc(c.descricao)}</p>` : ''}
      <div class="titulo-cartao mt">Metadados publicados pela fonte</div><div id="metaCamada" class="pequeno muted">consultando o serviço…</div>
      <div class="mini-acoes">${/^https?:/.test(svc) ? `<a class="btn" target="_blank" rel="noopener" href="${esc(urlMetadados(c))}">Abrir a fonte e os metadados ↗</a>` : ''}</div>`);
    const alvo = () => $('#metaCamada');
    try {
      const m = await metadadosCamada(c);
      if (alvo()) alvo().innerHTML = m || 'A fonte não publica descrição para esta camada.';
    } catch (e) { if (alvo()) alvo().innerHTML = `<span class="erro-txt">${esc(e.message)}</span>`; }
  }
  APP.infoCamada = infoCamada;
  function urlMetadados(c) {
    const v = c.view || {}, q = c.q || {};
    if (q.tipo === 'query') return q.url;
    if ((v.tipo === 'ags' || v.tipo === 'img') && v.url) return v.url;
    const t = q.typeName || v.layers;
    if (t && /geoserver/.test(v.url || q.url || '') && t.includes(':')) { const [ws, nome] = t.split(':'); return (v.url || q.url).replace(/\/geoserver\/.*$/, `/geoserver/${ws}/${nome}/wms?service=WMS&request=GetCapabilities`); }
    return v.url || q.url || '#';
  }
  const cacheMeta = {};
  async function metadadosCamada(c) {
    if (cacheMeta[c.id]) return cacheMeta[c.id];
    const v = c.view || {}, q = c.q || {};
    let html = '';
    if (q.tipo === 'query' || v.tipo === 'ags' || v.tipo === 'img') {
      const u = q.tipo === 'query' ? q.url : v.url;
      const j = await VA.Net.json(u + '?f=json', { cors: c.cors, timeout: 15000 });
      const linhas = [];
      if (j.name || j.serviceDescription) linhas.push(`<b>${esc(j.name || '')}</b>`);
      const d = VA.fmt.semTags(j.description || j.serviceDescription || '');
      if (d) linhas.push(esc(d.slice(0, 1200)));
      if (j.copyrightText) linhas.push('Créditos: ' + esc(VA.fmt.semTags(j.copyrightText).slice(0, 300)));
      if (j.fields) linhas.push('Campos: ' + esc(j.fields.filter(f => !/shape|objectid/i.test(f.name)).map(f => f.alias || f.name).slice(0, 30).join(', ')));
      if (j.editingInfo && j.editingInfo.lastEditDate) linhas.push('Última edição: ' + new Date(j.editingInfo.lastEditDate).toLocaleDateString('pt-BR'));
      html = linhas.join('<br>');
    } else if ((q.typeName || v.layers || '').includes(':')) {
      const t = await VA.Net.texto(urlMetadados(c), { cors: c.cors, timeout: 15000 });
      const doc = new DOMParser().parseFromString(t, 'application/xml');
      const lay = [...doc.getElementsByTagName('Layer')].find(l => l.getElementsByTagName('Name')[0] && /:|^[^:]+$/.test(l.getElementsByTagName('Name')[0].textContent) && l.getElementsByTagName('Layer').length === 0) || doc;
      const pega = tag => { const el = lay.getElementsByTagName(tag)[0]; return el ? el.textContent.trim() : ''; };
      const kws = [...lay.getElementsByTagName('Keyword')].map(k => k.textContent.trim()).filter(Boolean).slice(0, 12);
      html = [pega('Title') ? `<b>${esc(pega('Title'))}</b>` : '', pega('Abstract') ? esc(pega('Abstract').slice(0, 1500)) : '', kws.length ? 'Palavras-chave: ' + esc(kws.join(', ')) : ''].filter(Boolean).join('<br>');
    }
    cacheMeta[c.id] = html;
    return html;
  }
  function montarListaCamadas() {
    const filtro = VA.fmt.norm($('#filtroCamadas').value), so = $('#soLigadas').checked, setorSel = $('#filtroSetor').value, outras = $('#outrasUFs').checked;
    let html = '';
    VA.SETORES.filter(st => !setorSel || st.id === setorSel).forEach(st => {
      const lista = VA.CATALOGO.filter(c => c.setor === st.id && c.view && (!c.apenasUF || outras || c.apenasUF === M.uf || M.ativas[c.id]) && (!filtro || VA.fmt.norm(`${c.nome} ${c.fonte} ${c.grupo} ${c.id}`).includes(filtro)) && (!so || M.ativas[c.id]));
      if (!lista.length) return;
      const aberto = filtro || so || setorSel || abertos.includes(st.id);
      html += `<details class="cam-setor" data-setor="${st.id}" ${aberto ? 'open' : ''}><summary><i class="cs-cor" style="background:${st.cor}"></i><span class="cs-nome">${esc(st.nome)}</span><span class="cs-n" data-cs-n="${st.id}"></span></summary>`;
      let grupo = null;
      lista.forEach(c => { if (c.grupo !== grupo) { grupo = c.grupo; html += `<div class="cam-grupo">${esc(grupo)}</div>`; } html += linhaCamada(c); });
      html += '</details>';
    });
    $('#listaCamadas').innerHTML = html || '<div class="vazio-msg">Nenhuma camada encontrada.</div>';
    contarAtivas();
  }
  function contarAtivas() {
    const n = Object.keys(M.ativas).length;
    $('#contAtivas').textContent = n || '';
    $('#totalCamadas').textContent = `${VA.CATALOGO.length} camadas em ${VA.SETORES.length} setores · ${n} ligada(s)`;
    VA.SETORES.forEach(st => {
      const el = document.querySelector(`[data-cs-n="${st.id}"]`); if (!el) return;
      const tot = VA.CATALOGO.filter(c => c.setor === st.id).length, on = VA.CATALOGO.filter(c => c.setor === st.id && M.ativas[c.id]).length;
      el.innerHTML = `${on ? `<b>${on} ligada(s)</b> · ` : ''}${tot}`;
    });
  }
  function atualizarLinha(id) {
    const el = document.querySelector(`.cam[data-id="${id}"]`), c = VA.camada(id);
    if (el && c) el.outerHTML = linhaCamada(c);
    contarAtivas();
  }
  APP.atualizarAvisoCamada = function (id, msg) {
    const el = document.querySelector(`[data-aviso="${id}"]`); if (!el) return;
    el.textContent = msg || ''; el.hidden = !msg;
  };
  const lc = $('#listaCamadas');
  lc.addEventListener('change', e => {
    const id = e.target.dataset.cam; if (!id) return;
    M.ligar(id, e.target.checked);
    if (e.target.checked) {
      const c = VA.camada(id);
      if (c.minZoom && mapa.getZoom() < c.minZoom) aviso(`“${c.nome}” aparece a partir do zoom ${c.minZoom}. Aproxime o mapa.`);
      if (c.cors === 'proxy' && !VA.Net.proxy.ok && c.q && c.view && c.view.tipo !== 'ags') aviso('Esta fonte precisa do servidor local (iniciar.bat).', true);
    }
    atualizarLinha(id);
    contarFontes();
  });
  lc.addEventListener('input', e => { const id = e.target.dataset.op; if (id) M.opacidade(id, +e.target.value); });
  lc.addEventListener('click', e => {
    const b = e.target.closest('[data-leg]'); if (b) return legenda(VA.camada(b.dataset.leg), document.querySelector(`[data-legbox="${b.dataset.leg}"]`));
    const inf = e.target.closest('[data-info]'); if (inf) { e.preventDefault(); infoCamada(VA.camada(inf.dataset.info)); }
  });
  $('#filtroSetor').innerHTML += VA.SETORES.map(s => `<option value="${s.id}">${esc(s.nome)}</option>`).join('');
  $('#filtroSetor').addEventListener('change', montarListaCamadas);
  $('#outrasUFs').addEventListener('change', montarListaCamadas);
  $('#listaPendentes').innerHTML = (VA.PENDENTES || []).map(p => `<div class="pend"><b>${esc(p.nome)}</b><div class="pequeno">${esc(p.texto)}</div><a class="pequeno" href="${esc(p.url)}" target="_blank" rel="noopener">consultar o portal ↗</a></div>`).join('');

  /* topografia calculada */
  (function () {
    const T = VA.topo;
    $('#topoIntervalo').value = String(T.intervalo); $('#topoOpacidade').value = String(T.opacidade);
    $('#topoLegenda').innerHTML = T.CLASSES.map(([f, n, cor]) => `<span><i style="background:${cor}"></i>${f} <span class="muted">${n}</span></span>`).join('');
    const status = () => { $('#topoStatus').textContent = T.situacao(); $('#topoLegenda').hidden = !T.ativas().includes('declividade'); const n = T.ativas().length; $('#topoN').innerHTML = n ? `<b>${n} ligada(s)</b>` : 'curvas, relevo, declividade'; };
    T.ouvinte = status; mapa.on('zoomend', status); status();
    $$('[data-topo]').forEach(i => i.addEventListener('change', () => { T.ligar(i.dataset.topo, i.checked); if (i.checked && mapa.getZoom() < 10) aviso('A topografia aparece a partir do zoom 10. Aproxime o mapa.'); }));
    $('#topoIntervalo').addEventListener('change', e => T.definirIntervalo(e.target.value));
    $('#topoOpacidade').addEventListener('input', e => T.definirOpacidade(e.target.value));
  })();
  /* Topografia e BDGD: retângulos que abrem e fecham, como os setores */
  const ferrAbertas = new Set(VA.armazem.ler('ferrAbertas', []) || []);
  $$('details.cam-ferr').forEach(d => {
    d.open = ferrAbertas.has(d.dataset.ferr);
    d.addEventListener('toggle', () => { if (d.open) ferrAbertas.add(d.dataset.ferr); else ferrAbertas.delete(d.dataset.ferr); VA.armazem.gravar('ferrAbertas', [...ferrAbertas]); });
  });
  lc.addEventListener('toggle', e => {
    const d = e.target; if (!d.matches || !d.matches('details.cam-setor') || $('#filtroCamadas').value || $('#soLigadas').checked) return;
    abertos = abertos.filter(x => x !== d.dataset.setor); if (d.open) abertos.push(d.dataset.setor);
    VA.armazem.gravar('setoresAbertos', abertos);
  }, true);
  let tFiltro; $('#filtroCamadas').addEventListener('input', () => { clearTimeout(tFiltro); tFiltro = setTimeout(montarListaCamadas, 150); });
  $('#soLigadas').addEventListener('change', montarListaCamadas);
  $('#desligarTodas').addEventListener('click', e => { e.preventDefault(); Object.keys(M.ativas).forEach(id => M.ligar(id, false)); montarListaCamadas(); });

  async function legenda(c, box) {
    if (!c || !box) return;
    box.hidden = !box.hidden; if (box.hidden || box.dataset.ok) return;
    box.innerHTML = '<span class="muted">carregando a legenda…</span>';
    const v = c.view;
    try {
      if (v.tipo === 'wms') box.innerHTML = `<img src="${esc(VA.wfs.legendaUrl(v.url, v.layers.replace('{uf}', M.uf.toLowerCase())))}" alt="legenda" onerror="this.outerHTML='<span class=muted>legenda indisponível no servidor</span>'">`;
      else if (v.tipo === 'ags' || v.tipo === 'img') {
        const ls = await VA.ags.legenda(v.url, c.cors);
        const ids = v.layers ? String(v.layers).replace('show:', '').split(',').map(Number) : null;
        const sel = ls.filter(l => !ids || ids.includes(l.id));
        box.innerHTML = sel.slice(0, 10).map(l => `<div class="leg-cam">${sel.length > 1 ? `<b>${esc(l.nome)}</b>` : ''}${l.itens.slice(0, 40).map(i => `<div class="leg-i"><img src="${i.img}" alt="">${esc(i.rotulo || l.nome)}</div>`).join('')}</div>`).join('') || '<span class="muted">sem legenda</span>';
      } else if (v.tipo === 'overpass') box.innerHTML = '<div class="leg-i"><i class="lin" style="background:#d62828"></i>alta tensão (≥ 69 kV)</div><div class="leg-i"><i class="lin" style="background:#f77f00"></i>média tensão / distribuição</div><div class="leg-i"><i class="pt" style="background:#6a4c93"></i>subestação</div><div class="pequeno muted">Mapeamento colaborativo (OpenStreetMap): pode estar incompleto.</div>';
      else if (v.tipo === 'local') box.innerHTML = `<div class="leg-i"><i class="ar" style="border-color:${c.id === 'sigef' ? '#1d4ed8' : '#7c3aed'}"></i>parcela certificada</div>`;
      else if (v.tipo === 'bdgd') box.innerHTML = v.camada === 'sub' ? '<div class="leg-i"><i class="ar" style="border-color:#5f3dc4;background:rgba(121,80,242,.25)"></i>subestação de distribuição</div>'
        : v.camada === 'untrmt' ? '<div class="leg-i"><i class="pt" style="background:#ffc107;border:1px solid #7a4a00"></i>transformador de MT (passe o mouse: kVA, alimentador)</div>'
        : '<div class="leg-i"><i class="lin" style="background:#f08c00"></i>até 15 kV (ex.: 13,8 kV)</div><div class="leg-i"><i class="lin" style="background:#d9480f"></i>15–25 kV (ex.: 22 kV)</div><div class="leg-i"><i class="lin" style="background:#a61e4d"></i>acima de 25 kV (ex.: 34,5 kV)</div><div class="pequeno muted">Traço grosso = trifásica. Fonte: BDGD da distribuidora (ANEEL).</div>';
      else box.innerHTML = '<span class="muted">sem legenda</span>';
      box.dataset.ok = '1';
    } catch (e) { box.innerHTML = `<span class="erro-txt">legenda indisponível: ${esc(e.message)}</span>`; }
  }

  /* bases do INCRA por estado (servidor local) */
  let tBases;
  async function atualizarBases() {
    clearTimeout(tBases);
    const box = $('#painelBases'), uf = M.uf;
    if (!VA.Net.proxy.ok) {
      box.innerHTML = `<div class="pequeno muted mt">SIGEF e SNCI (INCRA) ficam numa base por estado no servidor local. Abra a VIP ANALYSIS pelo <b>iniciar.bat</b> para baixar ou importar.</div>`;
      $('#statusBases').textContent = 'servidor local desligado';
      return;
    }
    const fontes = [['sigef', 'SIGEF', 'parcelas certificadas'], ['snci', 'SNCI', 'imóveis certificados até 2013']];
    const est = await Promise.all(fontes.map(([f]) => VA.bases.estado(f, uf).catch(e => ({ erro: e.message }))));
    if (M.uf !== uf) return;
    box.innerHTML = `<div class="titulo-cartao mt">Bases do INCRA — ${uf}</div>` + fontes.map(([f, nome, desc], i) => {
      const e = est[i] || {};
      const pct = e.total ? Math.round(100 * (e.baixados || 0) / e.total) : null;
      return `<div class="base-uf"><div class="bu-cab"><b>${nome}</b> <span class="muted">${desc}</span></div>
        <div class="bu-st ${e.existe ? 'ok' : ''}">${e.existe ? `${VA.fmt.num(e.registros, 0)} registros · ${esc(e.origem || '')} em ${esc(e.atualizado_em || '')}` : 'não instalada'}</div>
        ${e.baixando ? `<div class="barra"><i style="width:${pct || 5}%"></i></div><div class="pequeno">${esc(e.mensagem || 'baixando…')}${pct != null ? ` · ${pct}%` : ''}</div>` : ''}
        ${e.erro ? `<div class="erro-txt">${esc(e.erro)}</div>` : ''}
        <div class="mini-acoes"><button class="btn" data-base-baixar="${f}" ${e.baixando ? 'disabled' : ''}>${e.existe ? 'Atualizar' : 'Baixar'} do INCRA</button><label class="btn">Importar .zip<input type="file" accept=".zip" data-base-importar="${f}" hidden></label></div></div>`;
    }).join('') + '<div class="pequeno muted">O download vem de certificacao.incra.gov.br. Se o INCRA exigir login gov.br, baixe o shapefile da UF no portal (Acervo Fundiário / Certificação) e use “Importar .zip”.</div>'
      + (VA.Net.proxy.dados ? `<div class="pequeno muted mt">Bases baixadas ficam em <b>${esc(VA.Net.proxy.dados)}</b> — fora da pasta do programa (e fora do OneDrive), então valem para todas as versões: baixe uma vez só.</div>` : '');
    const ok = est.filter(e => e && e.existe).length;
    $('#statusBases').textContent = ok === 2 ? 'instaladas' : ok ? '1 de 2 instalada' : 'não instaladas (veja Camadas)';
    if (est.some(e => e && e.baixando)) tBases = setTimeout(atualizarBases, 2000);
  }
  $('#painelBases').addEventListener('click', async e => {
    const b = e.target.closest('[data-base-baixar]'); if (!b) return;
    b.disabled = true;
    try { await VA.bases.baixar(b.dataset.baseBaixar, M.uf); aviso('Download iniciado no servidor local.'); } catch (err) { aviso(err.message, true); }
    atualizarBases();
  });
  $('#painelBases').addEventListener('change', async e => {
    const inp = e.target.closest('[data-base-importar]'); if (!inp || !inp.files[0]) return;
    const f = inp.files[0], fonte = inp.dataset.baseImportar;
    aviso(`Importando ${f.name} (${VA.fmt.num(f.size / 1048576, 1)} MB)…`, false, 20000);
    try { const r = await VA.bases.importar(fonte, M.uf, f); aviso(`${fonte.toUpperCase()} ${M.uf}: ${VA.fmt.num(r.registros, 0)} registros importados.`); if (M.ativas[fonte]) M.recriar(c => c.id === fonte); }
    catch (err) { aviso('Importação falhou: ' + err.message, true); }
    atualizarBases();
  });

  /* ======================== Mineração · Bateia ======================== */
  function mostrarVista(v) {
    $$('.ap').forEach(b => b.classList.toggle('ativa', b.dataset.vista === v));
    $$('.vista').forEach(x => x.classList.toggle('ativa', x.id === 'vista-' + v));
    document.querySelector('.abas-principal').classList.toggle('na-bateia', v === 'bateia');
    if (v === 'bateia') garantirBateia();
    if (v === 'mapa') setTimeout(() => mapa.invalidateSize(), 50);
  }
  APP.mostrarVista = mostrarVista;
  $$('.ap').forEach(b => b.addEventListener('click', () => mostrarVista(b.dataset.vista)));
  function garantirBateia() {
    const v = document.querySelector('.bateia-vazia'); if (v) v.remove();
    VA.bateia.garantir();
    if (!VA.bateia.pronta) $('#bateiaStatus').textContent = 'Carregando a Bateia…';
  }
  $('#abrirBateia').addEventListener('click', garantirBateia);
  $('#bateiaArquivo').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      let html = await f.text();
      if (!/B\.app|window\.B\b|Bateia/i.test(html)) throw new Error('o arquivo não parece ser a Bateia');
      const base = location.href.replace(/[^/]*$/, '');
      const ponte = `<script src="${base}bateia/ponte-vip.js"></scr` + 'ipt>';
      if (!/ponte-vip\.js/.test(html)) { const i = html.lastIndexOf('</body>'); html = i >= 0 ? html.slice(0, i) + ponte + html.slice(i) : html + ponte; }
      garantirBateia();
      VA.bateia.trocarFonte(URL.createObjectURL(new Blob([html], { type: 'text/html' })));
      $('#bateiaStatus').textContent = 'Usando a versão carregada: ' + f.name + ' (vale até recarregar a página).';
      mostrarVista('bateia');
    } catch (err) { aviso('Não foi possível usar o arquivo: ' + err.message, true); }
  });
  $('#enviarBateia').addEventListener('click', () => {
    if (!estado.aoi) return;
    const p = lerParametros();
    const { aoi } = aoiParaAnalise(p);
    iniciarBateia(aoi, p);
  });
  function iniciarBateia(aoi, p) {
    const nome = estado.municipios && estado.municipios[0] ? 'Área em ' + VA.fmt.munUF(estado.municipios[0]) : 'Área da VIP ANALYSIS';
    const reg = estado.bateiaVip = { aoi, estado: 'enviada', resumo: null, erro: null };
    garantirBateia();
    VA.bateia.analisar(aoi, p.raioBateiaKm, nome).then(resumo => {
      if (estado.bateiaVip !== reg) return;
      if (!resumo) { reg.estado = 'tempo'; reg.erro = 'tempo esgotado (4 min)'; }
      else { reg.estado = 'concluida'; reg.resumo = resumo; }
      if (resumo && estado.analise && estado.analise.ctx.aoi === aoi) { estado.analise.bateia = resumo; reavaliar(); aviso('Resultado da Bateia incorporado à análise e ao relatório.'); }
      else renderBateiaRes();
      atualizarRelatorios();
    });
    renderBateiaRes();
  }
  VA.bateia.aoMudar((tipo, dado) => {
    const st = $('#bateiaStatus'), bd = $('#badgeBateia');
    if (tipo === 'pronta') { st.textContent = 'Bateia pronta. Ela recebe a área de interesse da VIP ANALYSIS.'; }
    if (tipo === 'inicio') { st.innerHTML = '<span class="girando"></span> Bateia analisando a área…'; bd.textContent = '…'; bd.className = 'badge rodando'; if (estado.bateiaVip) estado.bateiaVip.estado = 'analisando'; }
    if (tipo === 'resultado') { const n = (dado && dado.fontes || []).filter(f => f.status === 'ok').length; st.textContent = `Bateia concluída · ${n} fontes com dados · ${VA.fmt.dataHora()}`; bd.textContent = '✓'; bd.className = 'badge ok'; }
    if (tipo === 'erro') { st.textContent = 'A Bateia teve um erro: ' + dado; bd.textContent = '!'; bd.className = 'badge erro'; if (estado.bateiaVip) { estado.bateiaVip.estado = 'erro'; estado.bateiaVip.erro = dado; renderBateiaRes(); } atualizarRelatorios(); }
  });

  /* =========================== abas e sobre =========================== */
  function mostrarAba(a) {
    $$('.aba').forEach(x => x.classList.toggle('ativa', x.dataset.aba === a));
    $$('.conteudo').forEach(c => c.classList.toggle('ativa', c.id === 'aba-' + a));
  }
  $$('.aba').forEach(a => a.addEventListener('click', () => mostrarAba(a.dataset.aba)));

  function montarSobre() {
    const porFonte = {};
    VA.CATALOGO.forEach(c => { const k = c.fonte.split(/ — | via /)[0].trim(); porFonte[k] = (porFonte[k] || 0) + 1; });
    const nAn = VA.CATALOGO.filter(c => c.analise && c.q).length;
    $('#sobre').innerHTML = `<h3>VIP ANALYSIS <span class="muted">v${VA.versao}</span></h3>
      <p>Inteligência territorial da Vip Air: define-se a área, a plataforma consulta em tempo real os serviços oficiais, testa se a área está <b>dentro ou fora</b> de cada camada e entrega achados com evidências rastreáveis, relatório e pacote para IA.</p>
      <p><b>${VA.CATALOGO.length} camadas</b> em 4 setores + referência; <b>${nAn}</b> entram na análise da área. A Bateia (prospecção mineral) roda dentro do setor de Mineração.</p>
      <div class="titulo-cartao mt">Camadas por órgão</div>
      <div class="sobre-orgaos">${Object.entries(porFonte).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<span class="tag">${esc(k)} · ${n}</span>`).join('')}</div>
      <div class="titulo-cartao mt">Como usar</div>
      <ul class="pequeno">
        <li><b>Clique no mapa</b>: coordenadas em decimal, GMS e UTM, município e o que as camadas ligadas dizem naquele ponto.</li>
        <li><b>Área</b>: Ponto, Polígono, Retângulo, Círculo, coordenada digitada (aceita os três formatos) ou arquivo KML/KMZ/GeoJSON/shapefile.</li>
        <li><b>Régua</b>: distância acumulada, rumo e — fechando no 1º ponto — área e perímetro. Pode virar área de interesse.</li>
        <li><b>Camadas</b>: por setor, com busca; as pesadas podem ser mostradas só no estado de trabalho.</li>
        <li><b>Evidências E#</b>: clique em qualquer uma para localizar o registro no mapa.</li>
      </ul>
      <div class="titulo-cartao mt">Limites conhecidos</div>
      <ul class="pequeno">
        <li>Rede de média tensão: vem da BDGD da distribuidora (ANEEL), instalada no servidor local em Camadas › Rede de distribuição; sem ela, só o OpenStreetMap (colaborativo). A BDGD mostra a rede física, não a capacidade de conexão.</li>
        <li>Registro de imóveis (matrículas): só no cartório. A plataforma aponta o Mapa do ONR e a certidão de inteiro teor; as parcelas SIGEF trazem a matrícula informada na certificação.</li>
        <li>Fora do ar na última verificação: embargos do IBAMA, GEOBahia e o WFS do Acervo Fundiário do INCRA (por isso SIGEF/SNCI vão para a base local por estado).</li>
        <li>ANEEL/SIGEL bloqueia acesso direto do navegador: essas camadas dependem do servidor local (iniciar.bat).</li>
      </ul>
      <p class="pequeno muted">Triagem automatizada a partir de bases públicas; não substitui certidões, consulta formal aos órgãos, campo e parecer de profissional habilitado.</p>`;
  }

  /* ======================= servidor local (status) ======================= */
  function statusServidor(ok) {
    const el = $('#statusSrv');
    el.className = 'status-srv ' + (ok ? 'ok' : 'off');
    el.textContent = ok ? '● Servidor local ativo' : '● Sem servidor local';
    el.title = ok ? 'Fontes que bloqueiam o navegador (ANEEL/SIGEL) passam pelo servidor local; bases SIGEF/SNCI disponíveis.' : 'Clique para ver como ligar o servidor local (iniciar.bat).';
    atualizarBases(); VA.bdgd.painel();
    Object.keys(M.ativas).forEach(id => { const c = VA.camada(id); if (c && (c.cors === 'proxy' || (c.view && /^(local|bdgd)$/.test(c.view.tipo)))) M.recriar(x => x.id === id); });
  }
  $('#statusSrv').addEventListener('click', () => {
    if (VA.Net.proxy.ok) return;
    modal(`<div class="modal-cab"><b>Servidor local desligado</b><button class="x" data-fechar>×</button></div>
      <p>${location.protocol === 'file:' ? 'A plataforma foi aberta direto pelo arquivo <b>index.html</b>.' : 'O servidor local não está respondendo.'} Assim funcionam o mapa e a maioria das fontes, mas ficam de fora: <b>ANEEL/SIGEL</b> (transmissão, usinas, distribuidoras), <b>CAR por coordenada</b>, <b>SIGEF/SNCI</b> e a <b>rede de média tensão (BDGD)</b>.</p>
      <ol class="pequeno">
        <li>Feche esta aba.</li>
        <li>Na pasta da VIP ANALYSIS, dê dois cliques em <b>iniciar.bat</b>. Abre uma janela preta e, em seguida, o navegador em <b>http://localhost:8766/</b>.</li>
        <li>Deixe a janela preta aberta (pode minimizar) enquanto usa a plataforma.</li>
      </ol>
      <p class="pequeno">Se a janela preta disser <b>“Python não encontrado”</b>: instale o Python em python.org/downloads marcando <b>“Add python.exe to PATH”</b> e abra o iniciar.bat de novo. Se ela mostrar outro erro, mande um print da janela.</p>
      <div class="mini-acoes"><button class="btn" data-fechar>Entendi</button></div>`);
  });
  let primeiroStatus = true;
  VA.Net.aoMudar(ok => {
    statusServidor(ok);
    if (primeiroStatus) { primeiroStatus = false; if (!ok && location.protocol === 'file:') aviso('Aberto sem o servidor local: as fontes da ANEEL e as bases SIGEF/SNCI precisam do iniciar.bat.', true); }
  });
  VA.Net.iniciarMonitor();

  /* atalhos */
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!$('#modal').hidden) { $('#modal').hidden = true; return; }
    if (M.modo === 'desenho') return sairDesenho();
    if (M.modo === 'edicao') return sairEdicao();
    if (!$('#ficha').hidden) fecharFicha();
  });

  /* filtros (botão sobre o mapa e “filtrar” em cada camada) */
  APP.filtrosMudaram = () => { montarListaCamadas(); contarFontes(); };
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-filtrar]'); if (!b) return;
    e.preventDefault(); mostrarVista('mapa'); VA.filtros.abrir(b.dataset.filtrar);
  });
  VA.filtros.iniciar();

  /* inicialização */
  montarBases(); montarUF(); montarListaCamadas(); montarSobre(); mostrarAOI();
  if (VA.iniciarBuscas) VA.iniciarBuscas();
  window.addEventListener('resize', () => mapa.invalidateSize());
})();
