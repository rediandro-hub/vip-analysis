/* VIP ANALYSIS — BDGD (Base de Dados Geográfica da Distribuidora, ANEEL).
   A rede de média tensão não tem serviço de mapa público: a ANEEL publica a BDGD de cada distribuidora como
   File Geodatabase. O servidor local baixa (ou importa) a base, lê segmentos de MT, subestações de distribuição e
   transformadores e grava bases indexadas; aqui ficam a consulta, a tradução dos códigos e o painel em Camadas. */
'use strict';

(function () {
  const VA = window.VA;
  const esc = s => VA.fmt.esc(s);

  /* Códigos da BDGD (Manual de Instruções da BDGD / PRODIST Módulo 10), conforme a tabela usada pelo bdgd2opendss (MIT). */
  const TTEN = { 0: null, 1: 0.11, 2: 0.115, 3: 0.12, 4: 0.121, 5: 0.125, 6: 0.127, 7: 0.208, 8: 0.216, 9: 0.2165, 10: 0.22, 11: 0.23, 12: 0.231, 13: 0.24, 14: 0.254, 15: 0.38, 16: 0.4, 17: 0.44, 18: 0.48, 19: 0.5, 20: 0.6, 21: 0.75, 22: 1, 23: 2.3, 24: 3.2, 25: 3.6, 26: 3.785, 27: 3.8, 28: 3.848, 29: 3.985, 30: 4.16, 31: 4.2, 32: 4.207, 33: 4.368, 34: 4.56, 35: 5, 36: 6, 37: 6.6, 38: 6.93, 39: 7.96, 40: 8.67, 41: 11.4, 42: 11.9, 43: 12, 44: 12.6, 45: 12.7, 46: 13.2, 47: 13.337, 48: 13.53, 49: 13.8, 50: 13.86, 51: 14.14, 52: 14.19, 53: 14.4, 54: 14.835, 55: 15, 56: 15.2, 57: 19.053, 58: 19.919, 59: 21, 60: 21.5, 61: 22, 62: 23, 63: 23.1, 64: 23.827, 65: 24, 66: 24.2, 67: 25, 68: 25.8, 69: 27, 70: 30, 71: 33, 72: 34.5, 73: 36, 74: 38, 75: 40, 76: 44, 77: 45, 78: 45.4, 79: 48, 80: 60, 81: 66, 82: 69, 83: 72.5, 84: 88, 85: 88.2, 86: 92, 87: 100, 88: 120, 89: 121, 90: 123, 91: 131.6, 92: 131.63, 93: 131.635, 94: 138, 95: 145, 96: 230, 97: 345, 98: 500, 99: 750, 100: 1000, 103: 11, 104: 11.5, 105: 13, 106: 20, 107: 68, 108: 85, 109: 440 };
  const TPOT = { 1: 3, 2: 5, 3: 10, 4: 15, 5: 20, 6: 22.5, 7: 25, 8: 30, 9: 35, 10: 37.5, 11: 38.1, 12: 40, 13: 45, 14: 50, 15: 60, 16: 75, 17: 76.2, 18: 88, 19: 100, 20: 112.5, 21: 114.3, 22: 120, 23: 138, 24: 150, 25: 167, 26: 175, 27: 180, 28: 200, 29: 207, 30: 225, 31: 250, 32: 276, 33: 288, 34: 300, 35: 332, 36: 333, 37: 400, 38: 414, 39: 432, 40: 500, 41: 509, 42: 667, 43: 750, 44: 833, 45: 1000, 46: 1250, 47: 1300, 48: 1500, 49: 1750, 50: 2000, 51: 2250, 52: 2300, 53: 2400, 54: 2500, 55: 2750, 56: 2900, 57: 3000, 58: 3125, 59: 3300, 60: 3750, 61: 4000, 62: 4200, 63: 4500, 64: 5000, 65: 6250, 66: 6500, 67: 7000, 68: 7500, 69: 7800, 70: 8000, 71: 9000, 72: 9375, 73: 9600, 74: 10000, 75: 12000, 76: 12500, 77: 13300, 78: 15000, 79: 16000, 80: 18000, 81: 18750, 82: 20000, 83: 25000, 84: 26000, 85: 26600, 86: 28000, 87: 30000, 88: 32000, 89: 33000, 90: 33300, 91: 40000, 92: 45000, 93: 50000, 94: 60000, 95: 67000, 96: 75000, 97: 80000, 98: 83000, 99: 85000, 100: 90000, 101: 100000, 102: 200000 };
  const codigo = v => { const s = String(v == null ? '' : v).trim(); return /^\d+(\.0+)?$/.test(s) ? parseInt(s, 10) : null; };

  const B = VA.bdgd = { estadoAtual: null, sugestao: '', ouvinte: null };
  B.kv = v => { const c = codigo(v); return c != null && TTEN[c] != null ? TTEN[c] : null; };
  B.kva = v => { const c = codigo(v); return c != null && TPOT[c] != null ? TPOT[c] : null; };
  B.fmtKv = kv => kv == null ? '' : VA.fmt.num(kv, kv < 1 ? 3 : kv % 1 ? 1 : 0) + ' kV';

  /* traduz os códigos e acrescenta campos legíveis (mantém os originais) */
  function enriquecer(p, camada) {
    const kv = B.kv(p.TEN_NOM); if (kv != null) p.TENSAO_KV = kv;
    const ope = B.kv(p.TEN_OPE); if (ope != null) p.TENSAO_OPERACAO_KV = ope;
    if (camada === 'untrmt') { const kva = B.kva(p.POT_NOM); if (kva != null) p.POTENCIA_KVA = kva; }
    if (p.ARE_LOC) p.AREA_LOCALIZACAO = /^UR/i.test(p.ARE_LOC) ? 'urbana' : /^NU|^RU/i.test(p.ARE_LOC) ? 'não urbana' : p.ARE_LOC;
    const fc = p.FAS_CON || p.FAS_CON_P;
    if (fc) p.FASES = /ABC/.test(fc) ? 'trifásica' : /^[ABC]{2}N?$/.test(fc) ? 'bifásica' : /^[ABC]N?$/.test(fc) ? 'monofásica' : fc;
    if (p.COMP != null && p.COMP !== '') p.COMPRIMENTO_M = +p.COMP;
  }
  B.alimentador = p => { const n = String(p.CIRCUITO || p.CTMT || '').trim(); return n ? (/^alim/i.test(n) ? n : 'Alimentador ' + n) : 'Segmento de MT ' + (p.COD_ID || ''); };
  B.subestacao = p => { const n = String(p.NOME || p.COD_ID || '').trim(); return /^(SE\b|subesta)/i.test(n) ? n : 'SE ' + n; };
  B.rotulo = function (p, camada) {
    if (camada === 'sub') return [B.subestacao(p), p.DISTRIBUIDORA].filter(Boolean).join(' · ');
    if (camada === 'untrmt') return [p.POTENCIA_KVA ? VA.fmt.num(p.POTENCIA_KVA) + ' kVA' : 'Transformador', p.CIRCUITO, p.FASES].filter(Boolean).join(' · ');
    return [B.alimentador(p), B.fmtKv(p.TENSAO_KV), p.FASES, p.SUB ? 'SE ' + p.SUB : ''].filter(Boolean).join(' · ');
  };
  B.cor = kv => kv == null ? '#e07a00' : kv < 16 ? '#f08c00' : kv < 26 ? '#d9480f' : '#a61e4d';
  B.estilo = function (camada) {
    if (camada === 'sub') return { color: '#5f3dc4', weight: 2, fillColor: '#7950f2', fillOpacity: 0.25 };
    return f => ({ color: B.cor(f.properties.TENSAO_KV), weight: /ABC/.test(f.properties.FAS_CON || '') ? 2.2 : 1.4, opacity: 0.95 });
  };

  /* ------------------------------ API do servidor local ------------------------------ */
  async function api(caminho, opt) {
    if (!VA.Net.proxy.ok) throw VA.Net._erro('servidor', 'a BDGD fica no servidor local — abra a VIP ANALYSIS pelo iniciar.bat');
    let r;
    try { r = await fetch(VA.Net.proxy.base + 'api/bdgd/' + caminho, Object.assign({ cache: 'no-store' }, opt)); }
    catch (e) { throw VA.Net._erro('servidor', 'o servidor local parou de responder (a janela do iniciar.bat foi fechada?)'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw VA.Net._erro(j.codigo === 'sem_base' ? 'sem_base' : 'servidor', j.erro || ('HTTP ' + r.status));
    return j;
  }
  B.estado = () => api('estado');
  B.distribuidoras = forcar => api('distribuidoras' + (forcar ? '?forcar=1' : '')).then(j => j.distribuidoras || []);
  B.preparar = () => api('preparar', { method: 'POST' });
  B.baixar = item => api('baixar?item=' + encodeURIComponent(item), { method: 'POST' });
  B.importar = arquivo => api('importar?nome=' + encodeURIComponent(arquivo.name), { method: 'POST', body: arquivo });
  B.remover = slug => api('remover?slug=' + encodeURIComponent(slug), { method: 'POST' });

  /* camada: ssdmt | sub | untrmt — devolve GeoJSON com os códigos traduzidos */
  B.consultar = async function (camada, bbox, max = 1500, tol = 0) {
    const j = await api(`consulta?camada=${camada}&bbox=${bbox.map(v => (+v).toFixed(6)).join(',')}&max=${max}${tol ? '&tol=' + tol.toFixed(8) : ''}`);
    if (!(j.distribuidoras || []).length) throw VA.Net._erro('sem_base', 'nenhuma BDGD instalada cobre esta região — instale a da distribuidora local em Camadas › Rede de distribuição');
    j.features.forEach(f => enriquecer(f.properties, camada));
    j._url = `servidor local: BDGD ${camada.toUpperCase()} — ${j.distribuidoras.join(', ')}`;
    return j;
  };

  /* ---------------------------------- painel (Camadas) ---------------------------------- */
  let tPainel = null, distCache = null;
  const mb = n => n ? VA.fmt.num(n / 1048576, n > 1e9 ? 1 : 0) + ' MB' : '';
  const dataBR = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s.split('-').reverse().join('/') : (s || '');
  const NOMES = { ssdmt: 'segmentos de MT', sub: 'subestações', untrmt: 'transformadores' };

  B.painel = async function () {
    clearTimeout(tPainel);
    const box = document.getElementById('painelBDGD'); if (!box) return;
    if (!VA.Net.proxy.ok) {
      const cont = document.getElementById('bdgdN'); if (cont) cont.textContent = 'precisa do servidor local';
      box.innerHTML = '<div class="pequeno muted">A rede de média tensão da ANEEL (BDGD) é instalada por distribuidora no servidor local. Abra a VIP ANALYSIS pelo <b>iniciar.bat</b> para usar.</div>';
      return;
    }
    let e;
    try { e = await B.estado(); } catch (err) { box.innerHTML = `<div class="erro-txt">${esc(err.message)}</div>`; return; }
    B.estadoAtual = e;
    const cont = document.getElementById('bdgdN'); if (cont) cont.innerHTML = (e.bases || []).length ? `<b>${e.bases.length}</b> instalada(s)` : 'nenhuma';
    const tarefas = Object.entries(e.tarefas || {});
    const leitor = (e.tarefas || {}).leitor;
    const nomeItem = id => { const d = (distCache || []).find(x => x.id === id); return d ? d.nome : id === 'importar' ? 'arquivo importado' : 'BDGD'; };
    let h = '';
    if (!e.leitor) {
      h += `<div class="bdgd-leitor"><div class="pequeno">Para ler a BDGD (File Geodatabase) o servidor precisa do leitor <b>pyogrio</b> (GDAL, cerca de 30 MB, instalado uma vez).</div>
        ${leitor && leitor.baixando ? `<div class="pequeno"><span class="girando"></span> ${esc(leitor.mensagem || 'instalando…')}</div>` : `<button class="btn btn-pri" data-bdgd="leitor">Instalar leitor</button>`}
        ${leitor && leitor.erro ? `<div class="erro-txt">${esc(leitor.erro)}</div><div class="pequeno muted">Alternativa: abra o Prompt de Comando e rode <code>py -m pip install --user pyogrio</code>; depois feche e abra o iniciar.bat.</div>` : ''}</div>`;
    }
    h += (e.bases || []).length ? (e.bases || []).map(b => `<div class="base-uf"><div class="bu-cab"><b>${esc(b.distribuidora)}</b> <span class="muted">referência ${esc(dataBR(b.data_referencia)) || '—'}</span></div>
        <div class="bu-st ok">${Object.entries(b.camadas).map(([k, n]) => `${VA.fmt.num(n, 0)} ${NOMES[k] || k}`).join(' · ')}</div>
        <div class="mini-acoes pequeno muted">instalada em ${esc(b.atualizado_em || '')}<button class="btn" data-bdgd-remover="${esc(b.slug)}">Remover</button></div></div>`).join('')
      : '<div class="pequeno muted">Nenhuma distribuidora instalada. Sem a BDGD, a média tensão aparece só pelo OpenStreetMap (colaborativo).</div>';
    tarefas.filter(([k, t]) => k !== 'leitor' && (t.baixando || t.erro)).forEach(([k, t]) => {
      const pct = t.total ? Math.round(100 * (t.baixados || 0) / t.total) : null;
      h += `<div class="base-uf"><div class="bu-cab"><b>${esc(nomeItem(k))}</b></div>
        ${t.baixando ? `<div class="barra"><i style="width:${pct != null && t.baixados < t.total ? pct : 100}%"></i></div><div class="pequeno">${esc(t.mensagem || '…')}${pct != null && t.baixados < t.total ? ` · ${pct}% de ${mb(t.total)}` : ''}</div>` : ''}
        ${t.erro ? `<div class="erro-txt">${esc(t.erro)}</div>` : ''}</div>`;
    });
    h += `<div class="mini-acoes"><button class="btn btn-pri" data-bdgd="adicionar" ${e.leitor ? '' : 'disabled'}>Adicionar distribuidora</button><label class="btn ${e.leitor ? '' : 'desab'}">Importar .zip<input type="file" accept=".zip" data-bdgd-importar hidden ${e.leitor ? '' : 'disabled'}></label></div>
      <div class="pequeno muted">Fonte: ANEEL — Dados Abertos (BDGD, publicada por distribuidora no ArcGIS Online). Bases grandes (centenas de MB) levam alguns minutos. A BDGD mostra a rede física, não a capacidade disponível para conexão.</div>`;
    box.innerHTML = h;
    if (B.ouvinte) B.ouvinte(e);
    if (tarefas.some(([, t]) => t.baixando)) tPainel = setTimeout(B.painel, 2500);
  };

  /* distribuidoras principais por UF, pelo código de agente da ANEEL (o nome muda com fusões; o código não) */
  const POR_UF = { AC: ['26'], AL: ['44'], AM: ['7019'], AP: ['31'], BA: ['47', '46'], CE: ['39'], DF: ['5160'], ES: ['380'], GO: ['6072'], MA: ['37'], MG: ['4950', '6585'], MS: ['404'], MT: ['405'], PA: ['371'], PB: ['6600'], PE: ['43'], PI: ['38'], PR: ['2866'], RJ: ['382', '383', '6585'], RN: ['40'], RO: ['369'], RR: ['370'], RS: ['396', '5707'], SC: ['5697'], SE: ['6587', '46'], SP: ['390', '63', '2937', '391', '385', '5216'], TO: ['32'] };
  async function abrirLista() {
    const uf = VA.mapa && VA.mapa.uf, sug = new Set(POR_UF[uf] || []);
    const fechar = VA.app.modal(`<h3>Adicionar distribuidora — BDGD</h3>
      <p class="pequeno muted">Lista da ANEEL (base mais recente de cada distribuidora). Escolha a que atende a sua área${uf && sug.size ? ` — as de <b>${esc(uf)}</b> (estado de trabalho) aparecem primeiro` : ''}${B.sugestao ? `; a análise indicou <b>${esc(B.sugestao)}</b>` : ''}. Áreas na divisa de estados podem precisar de duas.</p>
      <div class="linha"><input type="search" id="bdgdFiltro" placeholder="Procurar por nome ou código…" value=""><a href="#" id="bdgdAtualizar" class="pequeno">atualizar lista</a></div>
      <div id="bdgdLista" class="bdgd-lista"><span class="muted"><span class="girando"></span> consultando a ANEEL…</span></div>
      <div class="mini-acoes"><button class="btn" data-fechar>Fechar</button></div>`);
    const lista = document.getElementById('bdgdLista'), filtro = document.getElementById('bdgdFiltro');
    const inst = (B.estadoAtual || {}).bases || [];
    const instalada = d => inst.find(b => b.item === d.id || (b.codigo && b.codigo === d.codigo && b.data_referencia >= d.data));
    const pintar = () => {
      const q = VA.fmt.norm(filtro.value), dist = distCache || [];
      const sel = dist.filter(d => !q || VA.fmt.norm(d.nome + ' ' + d.codigo).includes(q)).sort((a, b) => sug.has(b.codigo) - sug.has(a.codigo));
      lista.innerHTML = sel.length ? sel.map(d => `<div class="bdgd-l ${sug.has(d.codigo) ? 'sugerida' : ''}"><div><b>${esc(d.nome)}</b> <span class="muted">cód. ${esc(d.codigo)}</span>${sug.has(d.codigo) ? ` <span class="tag tag-uf">atende ${esc(uf)}</span>` : ''}<div class="pequeno muted">referência ${esc(dataBR(d.data))}${d.tamanho ? ' · ' + mb(d.tamanho) : ''}${d.antiga ? ' · <span class="erro-txt">base antiga — provavelmente incorporada a outra distribuidora</span>' : ''}</div></div>
        ${instalada(d) ? '<span class="tag">instalada</span>' : `<button class="btn" data-bdgd-item="${esc(d.id)}">${inst.some(b => b.codigo === d.codigo) ? 'Atualizar' : 'Instalar'}</button>`}</div>`).join('') : '<span class="muted">nenhuma distribuidora com esse nome</span>';
    };
    const carregar = async forcar => {
      lista.innerHTML = '<span class="muted"><span class="girando"></span> consultando a ANEEL…</span>';
      try { distCache = await B.distribuidoras(forcar); pintar(); }
      catch (err) { lista.innerHTML = `<div class="erro-txt">A lista da ANEEL não respondeu: ${esc(err.message)}</div><div class="pequeno muted">Alternativa: baixe a BDGD em dadosabertos-aneel.opendata.arcgis.com (busca “BDGD” + nome da distribuidora) e use “Importar .zip”.</div>`; }
    };
    filtro.addEventListener('input', pintar);
    document.getElementById('bdgdAtualizar').addEventListener('click', ev => { ev.preventDefault(); carregar(true); });
    lista.addEventListener('click', async ev => {
      const b = ev.target.closest('[data-bdgd-item]'); if (!b) return;
      b.disabled = true;
      try { await B.baixar(b.dataset.bdgdItem); VA.app.aviso('Instalação iniciada no servidor local — acompanhe em Camadas › Rede de distribuição.'); fechar(); }
      catch (err) { VA.app.aviso(err.message, true); b.disabled = false; }
      B.painel();
    });
    if (distCache) pintar(); else carregar(false);
  }

  document.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-bdgd],[data-bdgd-remover]'); if (!b || !b.closest('#painelBDGD')) return;
    ev.preventDefault();
    if (b.dataset.bdgd === 'leitor') { b.disabled = true; try { await B.preparar(); } catch (err) { VA.app.aviso(err.message, true); } B.painel(); }
    else if (b.dataset.bdgd === 'adicionar') abrirLista();
    else if (b.dataset.bdgdRemover) {
      if (b.dataset.confirmar !== '1') { b.dataset.confirmar = '1'; b.textContent = 'Confirmar remoção'; return; }
      try { await B.remover(b.dataset.bdgdRemover); VA.app.aviso('BDGD removida do servidor local.'); } catch (err) { VA.app.aviso(err.message, true); }
      B.painel(); B.recarregarCamadas();
    }
  });
  document.addEventListener('change', async ev => {
    const inp = ev.target.closest('[data-bdgd-importar]'); if (!inp || !inp.files[0]) return;
    const f = inp.files[0]; inp.value = '';
    VA.app.aviso(`Enviando ${f.name} (${mb(f.size)}) ao servidor local…`, false, 20000);
    const t = setTimeout(B.painel, 1500);
    try { await B.importar(f); VA.app.aviso('Arquivo recebido; lendo a BDGD…'); } catch (err) { VA.app.aviso('Importação falhou: ' + err.message, true); }
    clearTimeout(t); B.painel();
  });

  /* quando uma instalação termina, redesenha as camadas BDGD ligadas */
  let instaladasAntes = null;
  B.ouvinte = e => {
    const k = (e.bases || []).map(b => b.slug + b.atualizado_em).join('|');
    if (instaladasAntes != null && k !== instaladasAntes) B.recarregarCamadas();
    instaladasAntes = k;
  };
  B.recarregarCamadas = () => { const M = VA.mapa; if (M && M.recriar) M.recriar(c => c && c.q && c.q.tipo === 'bdgd'); };
})();
