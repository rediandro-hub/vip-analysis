/* VIP ANALYSIS — buscas.
   1. Localizador do topo: coordenada (decimal, GMS, UTM), município (lista do IBGE) ou lugar (OpenStreetMap).
   2. Busca de processos minerários (SIGMINE/ANM) por número, titular ou empresa, na barra do mapa. */
'use strict';

(function () {
  const VA = window.VA, M = VA.mapa, esc = s => VA.fmt.esc(s), N = s => VA.fmt.norm(s);
  const $ = s => document.querySelector(s);
  const app = () => VA.app;
  const aviso = (t, e, ms) => app() && app().aviso && app().aviso(t, e, ms);

  /* ====================================================================== */
  /* 1. LOCALIZADOR                                                          */
  /* ====================================================================== */
  let municipios = null, carregando = null;
  async function listaMunicipios() {
    if (municipios) return municipios;
    const g = VA.armazem.ler('municipiosIBGE', null);
    if (g && g.v === 1 && Array.isArray(g.l) && g.l.length > 5000) { municipios = g.l.map(([id, nome, uf]) => ({ id, nome, uf, n: N(nome) })); return municipios; }
    if (!carregando) carregando = VA.Net.json('https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado', { timeout: 30000 })
      .then(j => { const l = j.map(m => [String(m['municipio-id']), m['municipio-nome'], m['UF-sigla']]); VA.armazem.gravar('municipiosIBGE', { v: 1, l }); municipios = l.map(([id, nome, uf]) => ({ id, nome, uf, n: N(nome) })); return municipios; })
      .catch(() => { carregando = null; return []; });
    return carregando;
  }
  /* "picui pb", "Picuí-PB", "Picuí, PB" → { termo: 'picui', uf: 'PB' } */
  function separarUF(txt) {
    const m = /^(.*?)[\s,\-\/]+([A-Za-z]{2})$/.exec(txt.trim());
    if (m && VA.UFS.includes(m[2].toUpperCase()) && m[1].trim().length >= 2) return { termo: N(m[1]), uf: m[2].toUpperCase() };
    return { termo: N(txt), uf: null };
  }
  function filtrarMunicipios(txt) {
    if (!municipios) return [];
    const { termo, uf } = separarUF(txt); if (termo.length < 2) return [];
    const l = municipios.filter(m => (!uf || m.uf === uf) && m.n.includes(termo));
    const ufTrab = M.uf;
    return l.map(m => ({ m, r: (m.n === termo ? 0 : m.n.startsWith(termo) ? 1 : 2) * 10 + (m.uf === ufTrab ? 0 : 1) })).sort((a, b) => a.r - b.r || a.m.nome.localeCompare(b.m.nome, 'pt')).slice(0, 8).map(x => x.m);
  }
  let ultNominatim = 0;
  async function lugares(txt) {
    const espera = Math.max(0, 1100 - (Date.now() - ultNominatim)); if (espera) await new Promise(r => setTimeout(r, espera));
    ultNominatim = Date.now();
    const j = await VA.Net.json(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=br&limit=7&accept-language=pt-BR&addressdetails=1&q=${encodeURIComponent(txt)}`, { timeout: 15000 });
    return (j || []).map(r => {
      const a = r.address || {}, uf = (a['ISO3166-2-lvl4'] || '').replace('BR-', '');
      const onde = [a.city || a.town || a.village || a.municipality, uf].filter(Boolean).join('-');
      return { nome: r.name || String(r.display_name).split(',')[0], onde, tipo: TIPO[r.type] || TIPO[r.category] || r.type, lon: +r.lon, lat: +r.lat, bb: r.boundingbox ? r.boundingbox.map(Number) : null, desc: r.display_name };
    });
  }
  const TIPO = { peak: 'pico / serra', ridge: 'serra', hill: 'morro', river: 'rio', stream: 'riacho', water: 'açude / lagoa', reservoir: 'reservatório', village: 'povoado', hamlet: 'sítio / povoado', town: 'cidade', city: 'cidade', farm: 'fazenda', farmyard: 'fazenda', locality: 'localidade', quarry: 'pedreira / mina', mine: 'mina', aerodrome: 'aeródromo', suburb: 'bairro', neighbourhood: 'bairro', administrative: 'divisão administrativa', place: 'lugar', natural: 'acidente natural' };

  let lista = null, itens = [], ativo = -1, tDigitar = null, tLugar = null, consulta = 0, camadaBusca = null;
  function montarLista() {
    if (lista) return lista;
    const form = $('#formBusca');
    lista = document.createElement('div'); lista.className = 'sugestoes'; lista.id = 'sugestoes'; lista.setAttribute('role', 'listbox'); lista.hidden = true;
    form.appendChild(lista);
    lista.addEventListener('mousedown', e => e.preventDefault());
    lista.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) escolher(+b.dataset.i); else if (e.target.closest('[data-lugares]')) buscarLugares($('#campoCoord').value, true); });
    return lista;
  }
  function render(estadoLugares) {
    montarLista();
    const txt = $('#campoCoord').value.trim();
    if (!txt) { lista.hidden = true; return; }
    const html = itens.map((it, i) => it.tipo === 'mun'
      ? `<button type="button" role="option" class="sug${i === ativo ? ' ativo' : ''}" data-i="${i}"><b>${esc(it.m.nome)}</b><span>${esc(it.m.uf)} · município</span></button>`
      : `<button type="button" role="option" class="sug${i === ativo ? ' ativo' : ''}" data-i="${i}"><b>${esc(it.p.nome)}</b><span>${esc([it.p.tipo, it.p.onde].filter(Boolean).join(' · '))}</span></button>`).join('');
    const rodape = estadoLugares === 'buscando' ? '<div class="sug-info">Procurando lugares no OpenStreetMap…</div>'
      : estadoLugares === 'nada' ? `<div class="sug-info">Nenhum lugar com “${esc(txt)}” no OpenStreetMap.</div>`
      : estadoLugares === 'erro' ? '<div class="sug-info">O OpenStreetMap não respondeu; tente de novo em instantes.</div>'
      : estadoLugares === 'feito' ? '' : `<button type="button" class="sug sug-mais" data-lugares>Procurar “${esc(txt)}” em lugares (serras, fazendas, rios, povoados…)</button>`;
    lista.innerHTML = html + rodape;
    lista.hidden = !html && !rodape;
  }
  function aoDigitar() {
    const txt = $('#campoCoord').value.trim(); ativo = -1; consulta++;
    clearTimeout(tLugar);
    let coord = false; try { VA.coord.interpretar(txt); coord = true; } catch (e) { }
    if (!txt || coord) { itens = []; montarLista().hidden = true; return; }
    listaMunicipios().then(() => {
      itens = filtrarMunicipios(txt).map(m => ({ tipo: 'mun', m }));
      render();
      const n = consulta;
      if (txt.length >= 4 && !itens.some(it => it.m.n === separarUF(txt).termo)) tLugar = setTimeout(() => { if (n === consulta) buscarLugares(txt); }, 900);
    });
  }
  async function buscarLugares(txt, jaPedido) {
    txt = String(txt || '').trim(); if (txt.length < 3) return;
    const n = consulta; render('buscando');
    try {
      const l = await lugares(txt); if (n !== consulta) return;
      itens = itens.filter(it => it.tipo === 'mun').concat(l.map(p => ({ tipo: 'lugar', p })));
      render(l.length ? 'feito' : 'nada');
      if (jaPedido && l.length && !itens.some(it => it.tipo === 'mun')) { ativo = 0; render('feito'); }
    } catch (e) { if (n === consulta) render('erro'); }
  }
  function fechar() { if (lista) lista.hidden = true; ativo = -1; }
  function limparCamada() { if (camadaBusca) { M.L.removeLayer(camadaBusca); camadaBusca = null; } }
  async function escolher(i) {
    const it = itens[i]; if (!it) return;
    fechar();
    limparCamada();
    if (it.tipo === 'mun') {
      const m = it.m;
      $('#campoCoord').value = `${m.nome}-${m.uf}`;
      if (m.uf !== M.uf) M.definirUF(m.uf);
      try {
        const fc = await VA.ags.query(VA.URL.ANM + 'SIGMINE/estrutura_territorial/MapServer/2', { where: `CDMunicipio='${m.id}'`, outFields: 'NMMunicipio,SGEstado,CDMunicipio', maxOffset: 0.0015, max: 1 });
        if (!fc.features.length) throw new Error('sem limite');
        camadaBusca = L.geoJSON(fc, { interactive: false, style: { color: '#1665d8', weight: 2.5, dashArray: '6 5', fillColor: '#1665d8', fillOpacity: 0.05 } }).addTo(M.L);
        M.L.fitBounds(camadaBusca.getBounds(), { padding: [30, 30] });
      } catch (e) {
        const sede = await VA.ags.query(VA.URL.ANM + 'SIGMINE/estrutura_territorial/MapServer/5', { where: `CDMunicipio='${m.id}'`, outFields: 'NMSedeMunicipal', max: 1 }).catch(() => null);
        const g = sede && sede.features[0] && sede.features[0].geometry;
        if (g) M.L.setView([g.coordinates[1], g.coordinates[0]], 12); else return aviso('Não encontrei o limite de ' + m.nome + '.', true);
      }
      if (app().mostrarVista) app().mostrarVista('mapa');
      aviso(`${m.nome}-${m.uf}. Para analisar, marque o ponto ou desenhe a área com as ferramentas do topo.`, false, 6000);
    } else {
      const p = it.p;
      $('#campoCoord').value = p.nome;
      if (p.bb && Math.abs(p.bb[1] - p.bb[0]) > 0.002) M.L.fitBounds([[p.bb[0], p.bb[2]], [p.bb[1], p.bb[3]]], { maxZoom: 15, padding: [30, 30] });
      else M.L.setView([p.lat, p.lon], 15);
      camadaBusca = L.layerGroup([L.circleMarker([p.lat, p.lon], { radius: 8, color: '#1665d8', weight: 3, fillColor: '#fff', fillOpacity: 1 })]).addTo(M.L);
      const pop = L.popup({ maxWidth: 300 }).setLatLng([p.lat, p.lon]).setContent(`<b>${esc(p.nome)}</b><div class="pequeno muted">${esc(p.desc)}</div><div class="pequeno">${p.lat.toFixed(6)}, ${p.lon.toFixed(6)} · OpenStreetMap</div><div class="mini-acoes"><button class="btn btn-pri" data-usar-lugar>Usar como ponto de análise</button></div>`).openOn(M.L);
      setTimeout(() => { const b = pop.getElement() && pop.getElement().querySelector('[data-usar-lugar]'); if (b) b.onclick = () => { M.L.closePopup(); limparCamada(); app().definirAOI({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } }, `Lugar buscado: ${p.nome}${p.onde ? ' (' + p.onde + ')' : ''} — OpenStreetMap`); }; }, 30);
      if (app().mostrarVista) app().mostrarVista('mapa');
    }
  }
  /* chamado pelo formulário quando o texto não é coordenada */
  VA.busca = {
    texto(txt) {
      if (itens.length) return escolher(ativo >= 0 ? ativo : 0);
      listaMunicipios().then(() => { itens = filtrarMunicipios(txt).map(m => ({ tipo: 'mun', m })); if (itens.length === 1 || (itens[0] && itens[0].m.n === separarUF(txt).termo)) return escolher(0); render(); buscarLugares(txt, true); });
    }
  };
  function iniciarLocalizador() {
    const campo = $('#campoCoord'); if (!campo) return;
    campo.placeholder = 'Cidade, lugar ou coordenada (ex.: Picuí PB · Serra do Pico · -7.08, -36.84)';
    campo.title = 'Município (lista do IBGE), lugar do OpenStreetMap ou coordenada: decimal, GMS (7°04\'52"S 36°50\'32"O) ou UTM (24S 738333 9216722)';
    campo.setAttribute('aria-label', 'Buscar cidade, lugar ou coordenada');
    campo.setAttribute('role', 'combobox'); campo.setAttribute('aria-controls', 'sugestoes'); campo.setAttribute('aria-autocomplete', 'list');
    campo.addEventListener('input', () => { clearTimeout(tDigitar); tDigitar = setTimeout(aoDigitar, 160); });
    campo.addEventListener('focus', () => { if (itens.length) render('feito'); listaMunicipios(); });
    campo.addEventListener('blur', () => setTimeout(fechar, 150));
    campo.addEventListener('keydown', e => {
      if (!lista || lista.hidden || !itens.length) { if (e.key === 'Escape') fechar(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); ativo = (ativo + 1) % itens.length; render('feito'); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); ativo = (ativo - 1 + itens.length) % itens.length; render('feito'); }
      else if (e.key === 'Enter' && ativo >= 0) { e.preventDefault(); escolher(ativo); }
      else if (e.key === 'Escape') fechar();
    });
  }

  /* ====================================================================== */
  /* 2. PROCESSOS MINERÁRIOS                                                 */
  /* ====================================================================== */
  const PROC = () => VA.URL.ANM + 'SIGMINE/dados_anm/MapServer/0';
  const CAMPOS = 'PROCESSO,NUMERO,ANO,FASE,NOME,SUBS,USO,AREA_HA,UF,ULT_EVENTO,OBJECTID';
  let camadaProc = null, ultimos = [];
  /* o que foi digitado vira uma condição SQL do ArcGIS */
  VA.condicaoProcesso = function (txt, uf) {
    const t = String(txt || '').trim(); if (!t) return null;
    const so = t.replace(/[\s.]/g, '');
    let w, tipo;
    let m = /^(\d{1,6})\/(\d{4})$/.exec(so);
    if (m) { w = `PROCESSO = '${m[1].padStart(6, '0')}/${m[2]}'`; tipo = 'processo'; }
    else if (/^\d{6}$/.test(so)) { w = `NUMERO = ${+so}`; tipo = 'processo'; }
    else if (/^\d{3,6}\/?\d{0,4}$/.test(so)) { w = `PROCESSO LIKE '%${so}%'`; tipo = 'processo'; }
    else {
      const palavras = N(t).toUpperCase().replace(/[^A-Z0-9 &]/g, ' ').split(/\s+/).filter(p => p.length >= 2 && !['LTDA', 'S/A', 'SA', 'ME', 'EPP', 'EIRELI', 'DE', 'DA', 'DO', 'DOS', 'DAS', 'E'].includes(p));
      if (!palavras.length) return null;
      w = palavras.map(p => `UPPER(NOME) LIKE '%${p.replace(/'/g, "''")}%'`).join(' AND '); tipo = 'titular';
    }
    if (uf) w = `(${w}) AND UF = '${uf}'`;
    return { where: w, tipo };
  };
  async function buscarProcessos(txt, uf) {
    const c = VA.condicaoProcesso(txt, uf);
    if (!c) throw new Error('Digite o número do processo (ex.: 846123/2019) ou parte do nome do titular.');
    const p = new URLSearchParams({ f: 'json', where: c.where, outFields: CAMPOS, returnGeometry: 'false', orderByFields: 'NOME,ANO DESC,NUMERO', resultRecordCount: '300' });
    let j = await VA.Net.json(PROC() + '/query?' + p, { timeout: 60000 });
    if (j.error) { p.delete('orderByFields'); p.delete('resultRecordCount'); j = await VA.Net.json(PROC() + '/query?' + p, { timeout: 60000 }); }
    if (j.error) throw new Error('ANM: ' + (j.error.message || 'erro na consulta'));
    return { lista: (j.features || []).map(f => f.attributes), tipo: c.tipo, truncado: !!j.exceededTransferLimit };
  }
  async function geometrias(ids) {
    const out = [];
    for (let i = 0; i < ids.length; i += 100) {
      const p = new URLSearchParams({ f: 'geojson', objectIds: ids.slice(i, i + 100).join(','), outFields: CAMPOS, returnGeometry: 'true', outSR: '4326', maxAllowableOffset: '0.0002' });
      const j = await VA.Net.json(PROC() + '/query?' + p, { timeout: 60000 });
      const fc = j.type === 'FeatureCollection' ? j : VA.esri.featureSetToGeoJSON(j);
      out.push(...fc.features.filter(f => f.geometry));
    }
    return out;
  }
  const COR_FASE = f => { const n = N(f); return /concessao|lavra|licenciamento/.test(n) ? '#c1121f' : /requerimento/.test(n) ? '#b7791f' : /disponib/.test(n) ? '#6b7280' : /autorizacao/.test(n) ? '#1665d8' : '#5b6b82'; };
  function desenhar(feats, foco) {
    if (camadaProc) M.L.removeLayer(camadaProc);
    camadaProc = L.geoJSON({ type: 'FeatureCollection', features: feats }, {
      style: f => ({ color: f.properties.OBJECTID === foco ? '#ff6a00' : COR_FASE(f.properties.FASE), weight: f.properties.OBJECTID === foco ? 4 : 2, fillOpacity: f.properties.OBJECTID === foco ? 0.18 : 0.08 }),
      onEachFeature: (f, l) => { l.bindTooltip(`${f.properties.PROCESSO} · ${f.properties.FASE}`, { sticky: true }); l.on('click', ev => { L.DomEvent.stopPropagation(ev); abrirProcesso(f.properties, f); }); }
    }).addTo(M.L);
    return camadaProc;
  }
  function linkProcesso(a) {
    return `<a class="btn" target="_blank" rel="noopener" data-cm="${esc(a.PROCESSO)}" href="https://sistemas.anm.gov.br/SCM/Extra/site/admin/dadosProcesso.aspx" title="Cadastro Mineiro da ANM (eventos e situação). O número já vai copiado: cole no campo e digite o código da imagem.">Cadastro Mineiro</a><a class="btn" target="_blank" rel="noopener" href="https://sdm.anm.gov.br" title="Sistema de Dados Minerários (login gov.br)">SDM</a>`;
  }
  async function abrirProcesso(a, feat) {
    if (!feat) {
      try { feat = (await geometrias([a.OBJECTID]))[0]; } catch (e) { aviso('Não consegui o desenho do processo: ' + e.message, true); }
      if (feat) { const todos = camadaProc ? camadaProc.toGeoJSON().features.filter(f => f.properties.OBJECTID !== a.OBJECTID) : []; desenhar(todos.concat([feat]), a.OBJECTID); }
    } else if (camadaProc) camadaProc.setStyle(f => ({ color: f.properties.OBJECTID === a.OBJECTID ? '#ff6a00' : COR_FASE(f.properties.FASE), weight: f.properties.OBJECTID === a.OBJECTID ? 4 : 2, fillOpacity: f.properties.OBJECTID === a.OBJECTID ? 0.18 : 0.08 }));
    if (feat) { try { M.L.fitBounds(L.geoJSON(feat).getBounds(), { padding: [40, 40], maxZoom: 15 }); } catch (e) { } }
    if (app().mostrarVista) app().mostrarVista('mapa');
    const ev = String(a.ULT_EVENTO || '');
    const html = `<div class="elem"><div class="elem-cab"><span class="elem-cam">Processo ${esc(a.PROCESSO)}</span><span class="elem-fonte">ANM — SIGMINE</span></div>
      <div class="kv">
        <div class="k">Fase</div><div class="v"><b style="color:${COR_FASE(a.FASE)}">${esc(a.FASE || '—')}</b></div>
        <div class="k">Titular</div><div class="v">${esc(a.NOME || '—')}</div>
        <div class="k">Substância</div><div class="v">${esc(a.SUBS || '—')}${a.USO ? ` <span class="muted">· ${esc(a.USO)}</span>` : ''}</div>
        <div class="k">Área</div><div class="v">${VA.fmt.ha(a.AREA_HA)} <span class="muted">· ${esc(a.UF || '')}</span></div>
        <div class="k">Último evento</div><div class="v pequeno">${esc(ev || '—')}</div>
      </div>
      <div class="ficha-acoes">
        <button class="btn btn-pri" data-proc-aoi>Usar como área de interesse</button>
        <button class="btn" data-proc-titular>Outros processos do titular</button>
        <button class="btn copiar" data-copiar="${esc(a.PROCESSO)}">Copiar nº</button>
        ${linkProcesso(a)}
      </div></div>`;
    /* a ficha do processo abre no próprio painel de processos (a lista fica a um clique) */
    painel().hidden = false;
    $('#procTitulo').textContent = 'Processo ' + a.PROCESSO;
    const voltar = ultimos.length > 1 && ultimos.some(x => x.OBJECTID === a.OBJECTID);
    $('#procCorpo').innerHTML = (voltar ? `<button type="button" class="mini proc-voltar" id="procVoltar">← voltar à lista (${ultimos.length})</button>` : '') + html;
    if (voltar) $('#procVoltar').onclick = () => { if (ultimaBusca) mostrarResultados(ultimaBusca.r, ultimaBusca.txt); };
    const corpo = $('#procCorpo');
    corpo.querySelector('[data-proc-aoi]').onclick = () => { if (!feat) return aviso('Sem o desenho do processo.', true); const f2 = { type: 'Feature', properties: {}, geometry: feat.geometry }; app().definirAOI(f2, `Processo ANM ${a.PROCESSO} (${a.FASE}, ${a.NOME})`); };
    corpo.querySelector('[data-proc-titular]').onclick = () => { $('#campoProc').value = a.NOME; executar(a.NOME, ''); };
    const cm = corpo.querySelector('[data-cm]');
    if (cm) cm.addEventListener('click', () => { try { navigator.clipboard.writeText(a.PROCESSO); aviso(`Nº ${a.PROCESSO} copiado: cole no Cadastro Mineiro e digite o código da imagem.`, false, 7000); } catch (e) { } });
  }
  function painel() { return $('#painelProc'); }
  function fecharPainel() { painel().hidden = true; }
  let ultimaBusca = null;
  function mostrarResultados(r, txt) {
    const l = r.lista; ultimos = l; ultimaBusca = { r, txt };
    $('#procTitulo').textContent = 'Processos minerários';
    const titulares = new Set(l.map(a => a.NOME)), ha = l.reduce((s, a) => s + (+a.AREA_HA || 0), 0);
    const porFase = l.reduce((o, a) => { o[a.FASE] = (o[a.FASE] || 0) + 1; return o; }, {});
    $('#procCorpo').innerHTML = !l.length ? `<div class="vazio-msg">Nenhum processo ativo encontrado para “${esc(txt)}”. O SIGMINE traz só processos ativos; para extintos, consulte o Cadastro Mineiro.</div>` : `
      <div class="proc-resumo"><b>${l.length}${r.truncado ? '+' : ''}</b> processo(s) · ${titulares.size} titular(es) · ${VA.fmt.num(ha, 0)} ha</div>
      <div class="proc-fases">${Object.entries(porFase).sort((a, b) => b[1] - a[1]).map(([f, n]) => `<span><i style="background:${COR_FASE(f)}"></i>${esc(f)} (${n})</span>`).join('')}</div>
      <div class="mini-acoes"><button class="btn btn-pri" id="procTodos">Mostrar todos no mapa</button><button class="btn" id="procCsv">Baixar lista (CSV)</button></div>
      <div class="proc-lista">${l.map((a, i) => `<button class="proc-item" data-i="${i}"><span class="proc-num">${esc(a.PROCESSO)}</span><span class="proc-fase" style="color:${COR_FASE(a.FASE)}">${esc(a.FASE)}</span><span class="proc-tit">${esc(a.NOME)}</span><span class="proc-det">${esc(a.SUBS || '')} · ${VA.fmt.ha(a.AREA_HA)} · ${esc(a.UF || '')}</span></button>`).join('')}</div>
      ${r.truncado ? '<p class="pequeno muted">A ANM limitou o resultado; refine a busca (mais palavras do nome ou só o seu estado).</p>' : ''}`;
    const corpo = $('#procCorpo');
    corpo.querySelectorAll('.proc-item').forEach(b => b.onclick = () => abrirProcesso(ultimos[+b.dataset.i]));
    const todos = $('#procTodos');
    if (todos) todos.onclick = async () => {
      todos.disabled = true; todos.textContent = 'Carregando desenhos…';
      try { const f = await geometrias(ultimos.map(a => a.OBJECTID)); const c = desenhar(f); if (f.length) M.L.fitBounds(c.getBounds(), { padding: [30, 30], maxZoom: 14 }); if (app().mostrarVista) app().mostrarVista('mapa'); todos.textContent = `${f.length} no mapa`; }
      catch (e) { aviso('Falha ao desenhar: ' + e.message, true); todos.textContent = 'Mostrar todos no mapa'; }
      todos.disabled = false;
    };
    const csv = $('#procCsv');
    if (csv) csv.onclick = () => {
      const cab = ['PROCESSO', 'FASE', 'NOME', 'SUBS', 'USO', 'AREA_HA', 'UF', 'ULT_EVENTO'];
      const linhas = [cab.join(';')].concat(ultimos.map(a => cab.map(k => `"${String(a[k] == null ? '' : a[k]).replace(/"/g, '""')}"`).join(';')));
      VA.baixar(`processos-${N(txt).replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'busca'}.csv`, '﻿' + linhas.join('\r\n'), 'text/csv');
    };
  }
  async function executar(txt, uf) {
    painel().hidden = false;
    $('#procTitulo').textContent = 'Processos minerários';
    $('#procCorpo').innerHTML = `<div class="vazio-msg">Consultando o SIGMINE${uf ? ' em ' + esc(uf) : ' em todo o Brasil'}… a busca por nome leva alguns segundos.</div>`;
    try { const r = await buscarProcessos(txt, uf); mostrarResultados(r, txt); if (r.lista.length === 1) abrirProcesso(r.lista[0]); }
    catch (e) { $('#procCorpo').innerHTML = `<div class="vazio-msg erro-txt">${esc(e.message)}</div>`; }
  }
  function iniciarProcessos() {
    const f = $('#formProc'); if (!f) return;
    const atualizarUF = () => { const o = $('#procUF').querySelector('[value="uf"]'); if (o) o.textContent = 'Só ' + M.uf; };
    atualizarUF();
    const ufMudou = app().ufMudou; app().ufMudou = uf => { atualizarUF(); if (ufMudou) ufMudou(uf); };
    f.addEventListener('submit', e => { e.preventDefault(); const t = $('#campoProc').value.trim(); if (!t) return; executar(t, $('#procUF').value === 'uf' ? M.uf : ''); });
    $('#fechaProc').addEventListener('click', () => { fecharPainel(); });
    $('#limparProc').addEventListener('click', () => { if (camadaProc) M.L.removeLayer(camadaProc); camadaProc = null; $('#procCorpo').innerHTML = ''; fecharPainel(); });
  }

  VA.iniciarBuscas = function () { iniciarLocalizador(); iniciarProcessos(); };
})();
