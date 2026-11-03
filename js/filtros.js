/* VIP ANALYSIS — filtros por camada.
   1) setor → 2) camada → 3) condições próprias da camada (ex.: fase e substância nos processos da ANM; mineral,
   status e importância no GEOBANK; categoria e esfera nas UCs; tensão e fases na BDGD; qualquer outro campo).
   O filtro vale para o desenho no mapa (ArcGIS: layerDefs · GeoServer: CQL_FILTER · bases locais: no navegador),
   para a ficha do clique e — se o operador marcar — para a análise e o relatório. */
'use strict';

(function () {
  const VA = window.VA;
  const esc = s => VA.fmt.esc(s);
  const norm = s => VA.fmt.norm(String(s == null ? '' : s));
  const $ = s => document.querySelector(s);

  const F = VA.filtros = {
    dados: VA.armazem.ler('filtros', {}) || {},
    naAnalise: !!VA.armazem.ler('filtrosNaAnalise', false),
    ouvintes: []
  };
  const gravar = () => { VA.armazem.gravar('filtros', F.dados); VA.armazem.gravar('filtrosNaAnalise', F.naAnalise); };
  const avisar = id => F.ouvintes.forEach(fn => { try { fn(id); } catch (e) { } });
  F.aoMudar = fn => F.ouvintes.push(fn);

  /* ------------------------------ que camadas aceitam filtro ------------------------------ */
  const rep = s => String(s || '').replace('{uf}', ((VA.mapa && VA.mapa.uf) || 'PB').toLowerCase());
  F.suporte = function (c) {
    if (!c || !c.view) return null;
    const v = c.view;
    if (v.tipo === 'ags' && c.q && c.q.tipo === 'query' && /^show:\d+$/.test(String(v.layers || ''))) return 'ags';
    if (v.tipo === 'wms' && /\/geoserver\//i.test(v.url) && !/geowebcache|gwc\//i.test(v.url)) return 'cql';
    if (v.tipo === 'local' || v.tipo === 'bdgd') return 'local';
    return null;
  };
  F.ativo = id => !!(F.dados[id] && F.dados[id].conds && F.dados[id].conds.length);
  F.conds = id => (F.ativo(id) ? F.dados[id].conds : []);
  F.ativos = () => Object.keys(F.dados).filter(F.ativo).filter(id => VA.camada(id));
  F.definir = function (id, conds) {
    if (conds && conds.length) F.dados[id] = { conds, em: new Date().toISOString() }; else delete F.dados[id];
    gravar(); avisar(id);
  };
  F.limparTodos = function () { const ids = Object.keys(F.dados); F.dados = {}; gravar(); ids.forEach(avisar); };
  F.definirNaAnalise = v => { F.naAnalise = !!v; gravar(); avisar(null); };

  /* --------------------------- tradução das condições --------------------------- */
  const aspas = v => "'" + String(v).replace(/'/g, "''") + "'";
  const lit = (cd, v) => (cd.num && Number.isFinite(+v) ? String(+v) : aspas(v));
  /* ArcGIS (SQL padronizado) */
  F.whereAgs = function (c) {
    if (F.suporte(c) !== 'ags' || !F.ativo(c.id)) return null;
    return F.conds(c.id).map(cd => {
      const k = cd.campo;
      if (cd.tipo === 'em') return `${k} IN (${cd.valores.map(v => lit(cd, v)).join(',')})`;
      if (cd.tipo === 'contem') return '(' + cd.valores.map(v => `UPPER(${k}) LIKE ${aspas('%' + String(v).toUpperCase() + '%')}`).join(' OR ') + ')';
      if (cd.tipo === 'texto') return `UPPER(${k}) LIKE ${aspas('%' + String(cd.texto).toUpperCase() + '%')}`;
      if (cd.tipo === 'entre') return [cd.min != null ? `${k} >= ${+cd.min}` : '', cd.max != null ? `${k} <= ${+cd.max}` : ''].filter(Boolean).join(' AND ');
      return '';
    }).filter(Boolean).map(s => '(' + s + ')').join(' AND ') || null;
  };
  /* GeoServer (CQL) */
  F.cql = function (c) {
    if (F.suporte(c) !== 'cql' || !F.ativo(c.id)) return null;
    return F.conds(c.id).map(cd => {
      const k = cd.campo;
      if (cd.tipo === 'em') return `${k} IN (${cd.valores.map(v => lit(cd, v)).join(',')})`;
      if (cd.tipo === 'contem') return '(' + cd.valores.map(v => `${k} ILIKE ${aspas('%' + v + '%')}`).join(' OR ') + ')';
      if (cd.tipo === 'texto') return `${k} ILIKE ${aspas('%' + cd.texto + '%')}`;
      if (cd.tipo === 'entre') return [cd.min != null ? `${k} >= ${+cd.min}` : '', cd.max != null ? `${k} <= ${+cd.max}` : ''].filter(Boolean).join(' AND ');
      return '';
    }).filter(Boolean).map(s => '(' + s + ')').join(' AND ') || null;
  };
  /* no navegador: vale para qualquer camada (bases locais, WFS, conferência das respostas) */
  const valorProp = (p, k) => { if (!p) return undefined; if (k in p) return p[k]; const kk = Object.keys(p).find(x => x.toLowerCase() === k.toLowerCase()); return kk ? p[kk] : undefined; };
  F.passa = function (id, props) {
    if (!F.ativo(id)) return true;
    return F.conds(id).every(cd => {
      const v = valorProp(props, cd.campo);
      if (v === undefined) return true;  // campo ausente na resposta (ex.: identify com apelidos): não exclui
      const n = norm(v);
      if (cd.tipo === 'em') return cd.valores.some(x => norm(x) === n || (cd.num && +x === +v));
      if (cd.tipo === 'contem') return cd.valores.some(x => n.includes(norm(x)));
      if (cd.tipo === 'texto') return n.includes(norm(cd.texto));
      if (cd.tipo === 'entre') { const x = parseFloat(String(v).replace(',', '.')); if (!Number.isFinite(x)) return false; return (cd.min == null || x >= +cd.min) && (cd.max == null || x <= +cd.max); }
      return true;
    });
  };
  F.descricao = function (id) {
    return F.conds(id).map(cd => {
      const r = cd.rotulo || cd.campo;
      if (cd.tipo === 'em') return `${r}: ${cd.valores.slice(0, 6).join(', ')}${cd.valores.length > 6 ? ` (+${cd.valores.length - 6})` : ''}`;
      if (cd.tipo === 'contem') return `${r} contém ${cd.valores.slice(0, 6).join(' ou ')}${cd.valores.length > 6 ? ` (+${cd.valores.length - 6})` : ''}`;
      if (cd.tipo === 'texto') return `${r} contém “${cd.texto}”`;
      if (cd.tipo === 'entre') return `${r} ${cd.min != null && cd.max != null ? `de ${cd.min} a ${cd.max}` : cd.min != null ? `≥ ${cd.min}` : `≤ ${cd.max}`}`;
      return r;
    }).join(' · ');
  };

  /* ------------------------------ campos de cada camada ------------------------------ */
  /* condições próprias por tipo de camada (reconhecidas pelos campos que ela tem) */
  const PRESETS = [
    { se: ['FASE', 'SUBS'], campos: [
      { campo: 'FASE', rotulo: 'Fase do processo', tipo: 'lista' },
      { campo: 'SUBS', rotulo: 'Substância', tipo: 'lista' },
      { campo: 'USO', rotulo: 'Uso', tipo: 'lista' },
      { campo: 'NOME', rotulo: 'Titular (contém)', tipo: 'texto' },
      { campo: 'ANO', rotulo: 'Ano do processo', tipo: 'entre' },
      { campo: 'AREA_HA', rotulo: 'Área (ha)', tipo: 'entre' }] },
    { se: ['SUBSTANCIAS', 'STATUS_ECONOMICO'], campos: [
      { campo: 'SUBSTANCIAS', rotulo: 'Mineral / substância', tipo: 'lista', dividir: true },
      { campo: 'STATUS_ECONOMICO', rotulo: 'Status econômico', tipo: 'lista' },
      { campo: 'IMPORTANCIA', rotulo: 'Importância', tipo: 'lista' },
      { campo: 'CLASSES_UTILITARIAS', rotulo: 'Classe utilitária', tipo: 'lista', dividir: true },
      { campo: 'MUNICIPIO', rotulo: 'Município', tipo: 'lista' }] },
    { se: ['categoria', 'grupo'], campos: [
      { campo: 'categoria', rotulo: 'Categoria', tipo: 'lista' },
      { campo: 'grupo', rotulo: 'Grupo (proteção integral / uso sustentável)', tipo: 'lista' },
      { campo: 'esfera', rotulo: 'Esfera', tipo: 'lista' },
      { campo: 'uf', rotulo: 'UF', tipo: 'lista' }] },
    { se: ['TENSAO_KV'], campos: [
      { campo: 'TENSAO_KV', rotulo: 'Tensão (kV)', tipo: 'lista', num: true },
      { campo: 'FASES', rotulo: 'Fases', tipo: 'lista' },
      { campo: 'CIRCUITO', rotulo: 'Alimentador (contém)', tipo: 'texto' },
      { campo: 'DISTRIBUIDORA', rotulo: 'Distribuidora', tipo: 'lista' }] },
    { se: ['POTENCIA_KVA'], campos: [
      { campo: 'POTENCIA_KVA', rotulo: 'Potência (kVA)', tipo: 'entre' },
      { campo: 'FASES', rotulo: 'Fases', tipo: 'lista' },
      { campo: 'CIRCUITO', rotulo: 'Alimentador (contém)', tipo: 'texto' }] }
  ];
  const bonito = s => String(s).replace(/_/g, ' ').toLowerCase().replace(/^./, x => x.toUpperCase());
  const cacheCampos = {}, cacheValores = {};

  async function amostraNaVista(c) {
    const m = VA.mapa.L, b = m.getBounds();
    const fc = await VA.consultarCamada(c, { bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], max: 1500, returnGeometry: false, filtrar: false });
    return fc.features.map(f => f.properties || {});
  }

  F.campos = async function (c) {
    if (cacheCampos[c.id]) return cacheCampos[c.id];
    const tipo = F.suporte(c);
    const r = { campos: [], uf: null, distinct: true, orderBy: true, amostra: null };
    if (tipo === 'ags') {
      const j = await VA.Net.json(c.q.url + '?f=json', { cors: c.cors, timeout: 20000 });
      if (j.error) throw new Error(j.error.message || 'o serviço não informou os campos');
      r.campos = (j.fields || []).filter(f => !/OID|Geometry|GlobalID|Blob|Raster|GUID|XML/.test(f.type) && !/^shape|\.st(area|length)|^objectid$/i.test(f.name))
        .map(f => ({ campo: f.name, rotulo: f.alias && f.alias !== f.name ? f.alias : bonito(f.name), num: /Integer|Double|Single|BigInteger/.test(f.type), data: /Date/.test(f.type), dominio: f.domain && f.domain.type === 'codedValue' ? f.domain.codedValues : null }));
      const aq = j.advancedQueryCapabilities || {};
      r.distinct = aq.supportsDistinct !== false; r.orderBy = aq.supportsOrderBy !== false;
    } else if (tipo === 'cql') {
      const url = (c.q && c.q.url) || c.view.url, tn = rep((c.q && c.q.typeName) || c.view.layers);
      const j = await VA.Net.json(`${url}${url.includes('?') ? '&' : '?'}service=WFS&version=1.0.0&request=DescribeFeatureType&typeName=${encodeURIComponent(tn)}&outputFormat=application/json`, { cors: c.cors, timeout: 20000 });
      const props = (j.featureTypes && j.featureTypes[0] && j.featureTypes[0].properties) || [];
      r.campos = props.filter(p => !/Geometry|Point|Polygon|LineString|Surface|Curve/i.test(p.localType || p.type || ''))
        .map(p => ({ campo: p.name, rotulo: bonito(p.name), num: /int|long|double|float|decimal|number|short/i.test(p.localType || '') }));
    } else if (tipo === 'local') {
      const props = await amostraNaVista(c);
      r.amostra = props;
      const ks = [...new Set(props.slice(0, 80).flatMap(p => Object.keys(p)))].filter(k => !/^_/.test(k));
      r.campos = ks.map(k => ({ campo: k, rotulo: bonito(k), num: props.every(p => p[k] == null || p[k] === '' || Number.isFinite(+p[k])) && props.some(p => p[k] !== '' && p[k] != null) }));
    } else throw new Error('esta camada não aceita filtro');
    r.uf = (r.campos.find(f => /^(uf|sg_uf|sigla_uf|sgestado)$/i.test(f.campo)) || {}).campo || null;
    const nomes = new Set(r.campos.map(f => f.campo.toLowerCase()));
    const p = PRESETS.find(x => x.se.every(k => nomes.has(k.toLowerCase())));
    r.preset = p ? p.campos.filter(x => nomes.has(x.campo.toLowerCase())).map(x => Object.assign({}, r.campos.find(f => f.campo.toLowerCase() === x.campo.toLowerCase()), x, { campo: r.campos.find(f => f.campo.toLowerCase() === x.campo.toLowerCase()).campo })) : [];
    cacheCampos[c.id] = r;
    return r;
  };

  /* valores existentes de um campo (no estado de trabalho, quando a camada tem campo de UF) */
  const separar = arr => [...new Set(arr.flatMap(s => String(s == null ? '' : s).split(/\s*[,;]\s*/)).map(s => s.trim()).filter(Boolean))];
  F.valores = async function (c, cp, { brasil = false } = {}) {
    const meta = await F.campos(c);
    const uf = VA.mapa.uf, porUF = meta.uf && uf && !brasil;
    const k = [c.id, cp.campo, porUF ? uf : 'BR'].join('|');
    if (cacheValores[k]) return cacheValores[k];
    let lista = [], amostra = false;
    const ordenar = l => l.sort((a, b) => (cp.num ? (+a) - (+b) : String(a).localeCompare(String(b), 'pt')));
    if (cp.dominio) lista = cp.dominio.map(d => ({ v: d.code, r: d.name }));
    else {
      const tipo = F.suporte(c);
      let brutos = null;
      if (tipo === 'ags') {
        const where = porUF ? `${meta.uf}='${uf}'` : '1=1';
        const base = `${c.q.url}/query?where=${encodeURIComponent(where)}&outFields=${encodeURIComponent(cp.campo)}&returnGeometry=false&f=json`;
        if (meta.distinct && !cp.dividir) {
          try {
            const j = await VA.Net.json(base + '&returnDistinctValues=true' + (meta.orderBy ? '&orderByFields=' + encodeURIComponent(cp.campo) : ''), { cors: c.cors, timeout: 30000 });
            if (!j.error) { brutos = (j.features || []).map(f => f.attributes[cp.campo]); amostra = !!j.exceededTransferLimit; }
          } catch (e) { /* tenta sem distinct */ }
        }
        if (!brutos) {
          const j = await VA.Net.json(base, { cors: c.cors, timeout: 60000 });
          if (j.error) throw new Error(j.error.message || 'o serviço recusou a consulta');
          brutos = (j.features || []).map(f => f.attributes[cp.campo]); amostra = !!j.exceededTransferLimit;
        }
      } else if (tipo === 'cql') {
        const url = (c.q && c.q.url) || c.view.url, tn = rep((c.q && c.q.typeName) || c.view.layers);
        const cql = porUF ? `&CQL_FILTER=${encodeURIComponent(`${meta.uf}='${uf}'`)}` : '';
        const j = await VA.Net.json(`${url}${url.includes('?') ? '&' : '?'}service=WFS&version=1.0.0&request=GetFeature&typeName=${encodeURIComponent(tn)}&propertyName=${encodeURIComponent(cp.campo)}&maxFeatures=5000&outputFormat=application/json${cql}`, { cors: c.cors, timeout: 60000 });
        brutos = (j.features || []).map(f => (f.properties || {})[cp.campo]); amostra = brutos.length >= 5000;
      } else {
        const props = meta.amostra || await amostraNaVista(c);
        brutos = props.map(p => valorProp(p, cp.campo)); amostra = true;
      }
      const vals = cp.dividir ? separar(brutos) : [...new Set(brutos.filter(v => v != null && v !== '').map(v => (typeof v === 'string' ? v.trim() : v)))];
      lista = ordenar(vals).map(v => ({ v, r: String(v) }));
    }
    const out = { lista, amostra, escopo: F.suporte(c) === 'local' ? 'área visível do mapa' : porUF ? uf : 'Brasil', porUF };
    cacheValores[k] = out;
    return out;
  };

  /* ===================================== painel ===================================== */
  const SETOR_PADRAO = VA.armazem.ler('filtroSetor', 'mineracao');
  let setorSel = SETOR_PADRAO, camadaSel = VA.armazem.ler('filtroCamada', '');
  let blocos = [];  // campos mostrados para a camada escolhida

  function camadasDoSetor(setor) {
    const M = VA.mapa;
    const l = VA.CATALOGO.filter(c => (!setor || c.setor === setor) && F.suporte(c) && (!c.apenasUF || c.apenasUF === M.uf));
    const ligadas = l.filter(c => M.ativas[c.id]);
    return { ligadas, outras: l.filter(c => !M.ativas[c.id]) };
  }

  F.abrir = function (idCamada) {
    const p = $('#painelFiltros'); if (!p) return;
    if (idCamada) { const c = VA.camada(idCamada); if (c) { camadaSel = c.id; setorSel = c.setor; } }
    const f = $('#ficha'); if (f && !f.hidden) { const x = $('#fechaFicha'); if (x) x.click(); }
    p.hidden = false;
    montar();
  };
  F.fechar = () => { const p = $('#painelFiltros'); if (p) p.hidden = true; };

  function montar() {
    const corpo = $('#filtrosCorpo');
    const setores = VA.SETORES;
    corpo.innerHTML = `
      <label class="f-rot">1 · Setor<select id="fSetor"><option value="">Todos os setores</option>${setores.map(s => `<option value="${s.id}" ${s.id === setorSel ? 'selected' : ''}>${esc(s.nome)}</option>`).join('')}</select></label>
      <label class="f-rot">2 · Camada<select id="fCamada"></select></label>
      <div class="pequeno muted" id="fCamadaInfo"></div>
      <div class="f-titulo">3 · Filtros da camada</div>
      <div id="fCampos"><div class="vazio-msg">Escolha a camada.</div></div>
      <div class="f-acoes"><button class="btn btn-pri" id="fAplicar">Aplicar filtro</button><button class="btn" id="fLimpar">Limpar esta camada</button></div>
      <label class="chk f-analise"><input type="checkbox" id="fNaAnalise" ${F.naAnalise ? 'checked' : ''}> Aplicar os filtros também à análise e ao relatório</label>
      <div class="f-titulo">Filtros ativos</div>
      <div id="fAtivos"></div>`;
    $('#fSetor').value = setorSel || '';
    preencherCamadas();
    pintarAtivos();
    $('#fSetor').onchange = e => { setorSel = e.target.value; VA.armazem.gravar('filtroSetor', setorSel); camadaSel = ''; preencherCamadas(); };
    $('#fCamada').onchange = e => { camadaSel = e.target.value; VA.armazem.gravar('filtroCamada', camadaSel); carregarCampos(); };
    $('#fAplicar').onclick = aplicar;
    $('#fLimpar').onclick = () => { if (!camadaSel) return; F.definir(camadaSel, []); carregarCampos(); VA.app.aviso('Filtro removido.'); };
    $('#fNaAnalise').onchange = e => F.definirNaAnalise(e.target.checked);
  }

  function preencherCamadas() {
    const { ligadas, outras } = camadasDoSetor(setorSel);
    const op = c => `<option value="${c.id}">${esc(c.nome)}${F.ativo(c.id) ? ' · filtrada' : ''}</option>`;
    $('#fCamada').innerHTML = (ligadas.length ? `<optgroup label="Ligadas no mapa">${ligadas.map(op).join('')}</optgroup>` : '')
      + (outras.length ? `<optgroup label="Outras (liga ao aplicar)">${outras.map(op).join('')}</optgroup>` : '');
    const todas = ligadas.concat(outras);
    if (!todas.some(c => c.id === camadaSel)) camadaSel = (ligadas.find(c => F.ativo(c.id)) || ligadas[0] || outras.find(c => F.ativo(c.id)) || outras[0] || {}).id || '';
    $('#fCamada').value = camadaSel;
    if (!todas.length) { $('#fCampos').innerHTML = '<div class="vazio-msg">Nenhuma camada deste setor aceita filtro.</div>'; $('#fCamadaInfo').textContent = ''; return; }
    carregarCampos();
  }

  async function carregarCampos() {
    const c = VA.camada(camadaSel), box = $('#fCampos'); if (!c || !box) return;
    $('#fCamadaInfo').textContent = `${c.fonte}${VA.mapa.ativas[c.id] ? '' : ' · desligada: liga ao aplicar'}`;
    box.innerHTML = '<div class="vazio-msg"><span class="girando"></span> lendo os campos da camada…</div>';
    let meta;
    try { meta = await F.campos(c); } catch (e) { if (camadaSel === c.id) box.innerHTML = `<div class="erro-txt">Não foi possível ler os campos: ${esc(e.message)}</div>`; return; }
    if (camadaSel !== c.id) return;
    const existentes = F.conds(c.id);
    const porNome = n => meta.campos.find(f => f.campo === n);
    blocos = (meta.preset.length ? meta.preset : []).map(x => Object.assign({}, x));
    existentes.forEach(cd => { if (!blocos.some(b => b.campo === cd.campo)) { const f = porNome(cd.campo); if (f) blocos.push(Object.assign({}, f, { tipo: cd.tipo === 'entre' ? 'entre' : cd.tipo === 'texto' ? 'texto' : 'lista', dividir: cd.tipo === 'contem' })); } });
    pintarCampos(c, meta);
  }

  function pintarCampos(c, meta) {
    const box = $('#fCampos');
    const usados = new Set(blocos.map(b => b.campo));
    const resto = meta.campos.filter(f => !usados.has(f.campo) && !f.data);
    box.innerHTML = (blocos.length ? '' : '<div class="pequeno muted">Esta camada não tem filtros prontos: escolha o campo abaixo.</div>')
      + blocos.map((b, i) => {
        const cd = F.conds(c.id).find(x => x.campo === b.campo);
        const ativo = !!cd;
        return `<details class="f-campo" data-i="${i}" ${ativo || i === 0 ? 'open' : ''}><summary><b>${esc(b.rotulo || b.campo)}</b><span class="f-resumo">${ativo ? esc(resumoCond(cd)) : ''}</span></summary><div class="f-corpo" data-corpo="${i}"></div></details>`;
      }).join('')
      + (resto.length ? `<label class="f-rot mt">+ Filtrar por outro campo<select id="fOutro"><option value="">escolha o campo…</option>${resto.map(f => `<option value="${esc(f.campo)}">${esc(f.rotulo)}${f.rotulo.toLowerCase() !== f.campo.toLowerCase() ? ` (${esc(f.campo)})` : ''}</option>`).join('')}</select></label>` : '');
    blocos.forEach((b, i) => { const d = box.querySelector(`details[data-i="${i}"]`); const abrir = () => preencherBloco(c, b, i); if (d.open) abrir(); d.addEventListener('toggle', () => { if (d.open && !d.dataset.ok) abrir(); }); });
    const o = $('#fOutro');
    if (o) o.onchange = () => {
      const f = meta.campos.find(x => x.campo === o.value); if (!f) return;
      blocos.push(Object.assign({}, f, { tipo: f.num ? 'entre' : 'lista' }));
      pintarCampos(c, meta);
      const ult = box.querySelector(`details[data-i="${blocos.length - 1}"]`); if (ult) { ult.open = true; ult.scrollIntoView({ block: 'nearest' }); }
    };
  }
  const resumoCond = cd => cd.tipo === 'em' || cd.tipo === 'contem' ? `${cd.valores.length} escolhido(s)` : cd.tipo === 'texto' ? `contém “${cd.texto}”` : [cd.min, cd.max].map(v => (v == null ? '…' : v)).join(' a ');

  async function preencherBloco(c, b, i, brasil) {
    const alvo = document.querySelector(`[data-corpo="${i}"]`); if (!alvo) return;
    alvo.closest('details').dataset.ok = '1';
    const cd = F.conds(c.id).find(x => x.campo === b.campo);
    if (b.tipo === 'texto') { alvo.innerHTML = `<input type="text" data-texto placeholder="digite parte do texto" value="${esc(cd && cd.texto || '')}">`; return; }
    if (b.tipo === 'entre') {
      alvo.innerHTML = `<div class="linha"><input type="number" data-min placeholder="de" value="${cd && cd.min != null ? cd.min : ''}"><input type="number" data-max placeholder="até" value="${cd && cd.max != null ? cd.max : ''}"></div>`
        + (b.num ? '<a href="#" class="pequeno" data-virar-lista>escolher valores numa lista</a>' : '');
      const v = alvo.querySelector('[data-virar-lista]'); if (v) v.onclick = e => { e.preventDefault(); b.tipo = 'lista'; delete alvo.closest('details').dataset.ok; preencherBloco(c, b, i); };
      return;
    }
    alvo.innerHTML = '<div class="vazio-msg"><span class="girando"></span> buscando os valores…</div>';
    let r;
    try { r = await F.valores(c, b, { brasil }); } catch (e) { alvo.innerHTML = `<div class="erro-txt">${esc(e.message)}</div><input type="text" data-texto placeholder="digite parte do texto">`; b.tipo = 'texto'; return; }
    if (!r.lista.length) { alvo.innerHTML = `<div class="pequeno muted">Nenhum valor em ${esc(r.escopo)}.</div>${r.porUF ? '<a href="#" class="pequeno" data-brasil>ver valores de todo o Brasil</a>' : ''}`; ligarBrasil(); return; }
    if (r.lista.length > 1500) { b.tipo = 'texto'; alvo.innerHTML = `<div class="pequeno muted">${VA.fmt.num(r.lista.length, 0)} valores diferentes — filtre por texto.</div><input type="text" data-texto placeholder="digite parte do texto" value="${esc(cd && cd.texto || '')}">`; return; }
    const marcados = new Set(cd && cd.valores ? cd.valores.map(String) : []);
    alvo.innerHTML = `${r.lista.length > 10 ? '<input type="search" data-busca placeholder="procurar na lista…">' : ''}
      <div class="f-lista">${r.lista.map(x => `<label class="chk" data-n="${esc(norm(x.r))}"><input type="checkbox" value="${esc(String(x.v))}" ${marcados.has(String(x.v)) ? 'checked' : ''}> ${esc(x.r)}</label>`).join('')}</div>
      <div class="pequeno muted">${VA.fmt.num(r.lista.length, 0)} valor(es) em ${esc(r.escopo)}${r.amostra ? ' (amostra)' : ''}${r.porUF ? ' · <a href="#" data-brasil>ver de todo o Brasil</a>' : ''} · <a href="#" data-marcar="1">marcar todos</a> · <a href="#" data-marcar="0">desmarcar</a></div>`;
    const busca = alvo.querySelector('[data-busca]');
    if (busca) busca.oninput = () => { const t = norm(busca.value); alvo.querySelectorAll('.f-lista label').forEach(l => { l.hidden = t && !l.dataset.n.includes(t); }); };
    alvo.querySelectorAll('[data-marcar]').forEach(a => a.onclick = e => { e.preventDefault(); alvo.querySelectorAll('.f-lista label:not([hidden]) input').forEach(x => { x.checked = a.dataset.marcar === '1'; }); });
    ligarBrasil();
    function ligarBrasil() { const a = alvo.querySelector('[data-brasil]'); if (a) a.onclick = e => { e.preventDefault(); preencherBloco(c, b, i, true); }; }
  }

  function aplicar() {
    const c = VA.camada(camadaSel); if (!c) return;
    const conds = [];
    blocos.forEach((b, i) => {
      const alvo = document.querySelector(`[data-corpo="${i}"]`);
      const antigo = F.conds(c.id).find(x => x.campo === b.campo);
      if (!alvo || !alvo.closest('details').dataset.ok) { if (antigo) conds.push(antigo); return; }  // bloco não aberto: mantém o que havia
      const base = { campo: b.campo, rotulo: b.rotulo || b.campo, num: !!b.num };
      const t = alvo.querySelector('[data-texto]');
      if (t) { if (t.value.trim()) conds.push(Object.assign(base, { tipo: 'texto', texto: t.value.trim() })); return; }
      const mn = alvo.querySelector('[data-min]'), mx = alvo.querySelector('[data-max]');
      if (mn || mx) { const a = mn && mn.value !== '' ? +mn.value : null, z = mx && mx.value !== '' ? +mx.value : null; if (a != null || z != null) conds.push(Object.assign(base, { tipo: 'entre', min: a, max: z })); return; }
      const vals = [...alvo.querySelectorAll('.f-lista input:checked')].map(x => x.value);
      if (vals.length) conds.push(Object.assign(base, { tipo: b.dividir ? 'contem' : 'em', valores: vals }));
    });
    F.definir(c.id, conds);
    if (conds.length && !VA.mapa.ativas[c.id]) VA.mapa.ligar(c.id, true);
    VA.app.aviso(conds.length ? `Filtro aplicado em “${c.nome}”.` : 'Nenhuma condição marcada: filtro removido.');
    preencherCamadas(); pintarAtivos();
  }

  function pintarAtivos() {
    const box = $('#fAtivos'); if (!box) return;
    const ids = F.ativos();
    box.innerHTML = ids.length ? ids.map(id => { const c = VA.camada(id); return `<div class="f-ativo"><div><b>${esc(c.nome)}</b><div class="pequeno">${esc(F.descricao(id))}</div></div><div><button class="mini" data-editar="${id}">editar</button> <button class="mini" data-remover="${id}" title="Remover filtro">×</button></div></div>`; }).join('')
      + '<a href="#" class="pequeno" id="fLimparTodos">remover todos os filtros</a>'
      : '<div class="pequeno muted">Nenhum filtro ativo.</div>';
    box.onclick = e => {
      const ed = e.target.closest('[data-editar]'), rm = e.target.closest('[data-remover]');
      if (ed) { F.abrir(ed.dataset.editar); }
      if (rm) { F.definir(rm.dataset.remover, []); preencherCamadas(); pintarAtivos(); }
      if (e.target.id === 'fLimparTodos') { e.preventDefault(); F.limparTodos(); preencherCamadas(); pintarAtivos(); }
    };
  }

  /* mudanças: redesenha a camada, atualiza o selo do botão e a lista de camadas */
  F.aoMudar(id => {
    const M = VA.mapa;
    if (id && M.ativas[id]) M.recriar(c => c && c.id === id);
    const n = F.ativos().length, b = $('#badgeFiltros');
    if (b) { b.textContent = n || ''; }
    const bt = $('#btnFiltros'); if (bt) bt.classList.toggle('com-filtro', n > 0);
    if (VA.app && VA.app.filtrosMudaram) VA.app.filtrosMudaram(id);
  });
  F.iniciar = function () {
    const bt = $('#btnFiltros'); if (!bt) return;
    bt.addEventListener('click', () => { const p = $('#painelFiltros'); if (p.hidden) F.abrir(); else F.fechar(); });
    $('#fechaFiltros').addEventListener('click', F.fechar);
    const n = F.ativos().length; $('#badgeFiltros').textContent = n || ''; bt.classList.toggle('com-filtro', n > 0);
  };
})();
