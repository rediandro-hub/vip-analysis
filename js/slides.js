/* VIP ANALYSIS — apresentação enxuta (slides) a partir da mesma análise do relatório.
   Seções: capa, finalidade, viabilidade do requerimento, parecer, alvo da pesquisa (ou ocorrências), oportunidades
   (mapa e ranking), interpretação geológica, achados e próximos passos — cada uma só quando a análise tem o dado.
   Cada slide é um modelo de caixas em polegadas (16:9, 13,333 × 7,5 in). O mesmo modelo vira HTML (tela, modo
   apresentação e PDF pelo servidor local) e PowerPoint editável (PptxGenJS), então os dois saem iguais.
   Os mapas são rasterizados aqui (satélite + camadas + desenhos) e entram como imagem nos dois formatos. */
'use strict';

(function () {
  const VA = window.VA, esc = s => VA.fmt.esc(s);
  const LARG = 13.333, ALT = 7.5, M = 0.6, DIR = LARG - M;
  const C = { tinta: '#0d1b2e', azul: '#1f5fd6', prata: '#5e6d82', linha: '#d3dce8', painel: '#edf2f8', branco: '#ffffff', verde: '#187a5e', vermelho: '#b3121d', fundoMapa: '#1b2433' };
  const COR_SIT = { impede: '#b3121d', ajuste: '#d4521a', condiciona: '#b7800f', atencao: '#b7800f', sem_dados: '#6b7280', livre: '#187a5e' };

  /* ---------------- primitivas do modelo ---------------- */
  const run = (s, o = {}) => Object.assign({ s: String(s == null ? '' : s) }, o);
  const par = (runs, o = {}) => Object.assign({ r: Array.isArray(runs) ? runs : [run(runs)] }, o);
  const T = (x, y, w, h, paras, o = {}) => ({ t: 'txt', x, y, w, h, p: Array.isArray(paras) ? paras : paras && paras.r ? [paras] : [par(paras)], f: o.f || 'sans', z: o.z || 12, c: o.c || C.tinta, v: o.v || 'top', al: o.al || 'left', lh: o.lh || 1.18, b: !!o.b });
  const I = (x, y, w, h, k) => ({ t: 'img', x, y, w, h, k });
  const R = (x, y, w, h, fill, o = {}) => ({ t: 'ret', x, y, w, h, fill, linha: o.linha || null, raio: o.raio || 0, elipse: !!o.elipse, lw: o.lw || 0.75 });
  const TAB = (x, y, w, cols, cab, linhas, o = {}) => ({ t: 'tab', x, y, w, cols, cab, linhas, z: o.z || 10.5 });
  const cel = (s, o = {}) => Object.assign({ s: String(s == null ? '' : s) }, o);
  const corta = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); if (s.length <= n) return s; const c = s.slice(0, n - 1); const i = c.lastIndexOf(' '); return (i > n * 0.6 ? c.slice(0, i) : c).replace(/[,;:.\s—-]+$/, '') + '…'; };
  const primeiraFrase = (s, n) => { const t = String(s || '').trim(); const i = t.search(/[.!?](\s|$)/); return corta(i > 20 ? t.slice(0, i + 1) : t, n); };
  const maiuscula = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const lista = l => l.length > 1 ? l.slice(0, -1).join(', ') + ' e ' + l[l.length - 1] : (l[0] || '');
  const PLURAL = { impeditivo: ['impeditivo', 'impeditivos'], alerta: ['alerta', 'alertas'], atencao: ['ponto de atenção', 'pontos de atenção'], oportunidade: ['oportunidade', 'oportunidades'], informativo: ['informativo', 'informativos'], lacuna: ['lacuna de dados', 'lacunas de dados'] };
  const contagem = (nv, n) => `${n} ${(PLURAL[nv] || [nv, nv])[n > 1 ? 1 : 0]}`;
  const kmPartes = d => d == null ? ['—', ''] : d === 0 ? ['dentro', ''] : d < 1 ? [VA.fmt.num(d * 1000, 0), 'm'] : [VA.fmt.num(d, d < 10 ? 1 : 0), 'km'];

  /* ---------------- blocos de layout ---------------- */
  function titulo(els, texto, { cor, x = M, w = DIR - M, z = 26 } = {}) {
    if (cor) { els.push(R(x, 0.56, 0.08, 0.86, cor)); x += 0.24; w -= 0.24; }
    els.push(T(x, 0.48, w, 1.02, par(corta(texto, 120)), { f: 'serif', z, b: true, lh: 1.08 }));
  }
  const lead = (els, texto, { x = M, w = DIR - M, y = 1.56 } = {}) => els.push(T(x, y, w, 0.42, par(corta(texto, 230)), { z: 12.5, c: C.prata, lh: 1.2 }));
  function kpi(els, x, y, w, h, valor, unidade, rotulo, { cor } = {}) {
    els.push(R(x, y, w, h, C.branco, { linha: C.linha, raio: 0.06 }));
    els.push(T(x + 0.16, y + 0.12, w - 0.3, 0.6, par([run(valor, { c: cor || C.tinta }), run(unidade ? ' ' + unidade : '', { z: 14, c: C.prata, b: false })]), { f: 'serif', z: 26, b: true, lh: 1 }));
    els.push(T(x + 0.16, y + 0.7, w - 0.3, h - 0.78, par(corta(rotulo, 70)), { z: 10, c: C.prata, lh: 1.15 }));
  }
  function grade4(els, x, y, w, h, itens) {
    const g = 0.18, cw = (w - g) / 2, ch = (h - g) / 2;
    itens.slice(0, 4).forEach((it, i) => kpi(els, x + (i % 2) * (cw + g), y + Math.floor(i / 2) * (ch + g), cw, ch, it[0], it[1], it[2], { cor: it[3] }));
  }
  const subtitulo = (els, x, y, w, texto) => els.push(T(x, y, w, 0.34, par(texto), { f: 'serif', z: 15, b: true }));
  function rodape(els, meta, secao, x0 = M) {
    els.push(R(x0, 6.98, DIR - x0, 0.012, C.linha));
    if (meta.emblema) els.push(I(x0, 7.06, 0.52, 0.2, 'emblema'));
    els.push(T(x0 + (meta.emblema ? 0.62 : 0), 7.04, 6.6, 0.26, par(`${meta.numero} · ${meta.titulo}`), { z: 8.5, c: C.prata, v: 'middle' }));
    els.push(T(DIR - 4.2, 7.04, 4.2, 0.26, par([run(secao + '   '), run(String(meta.n), { b: true, c: C.tinta })]), { z: 8.5, c: C.prata, al: 'right', v: 'middle' }));
  }

  /* ---------------- mapas: rasterização (satélite + camadas + desenhos) ---------------- */
  const imgDeURL = src => new Promise((ok, falha) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => falha(new Error('imagem')); i.src = src; });
  async function carregar(src) {
    if (/^data:/.test(src)) return imgDeURL(src);
    const r = await VA.Net.obter(src, { binario: true, timeout: 45000 });
    if (!/image/.test(r.tipo || '')) throw new Error('resposta sem imagem');
    return createImageBitmap(r.blob);
  }
  /* desenha num canvas um mapa no formato do relatório: <img> (satélite, rótulos…) empilhadas e um <svg> por cima */
  VA.rasterizarMapa = async function (html, W, H, { q = 0.86 } = {}) {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.fillStyle = C.fundoMapa; g.fillRect(0, 0, W, H);
    const imgs = [...doc.querySelectorAll('img')];
    const bm = await Promise.all(imgs.map(i => carregar(i.getAttribute('src')).catch(() => null)));
    imgs.forEach((i, k) => { if (!bm[k]) return; const m = /opacity:\s*([\d.]+)/.exec(i.getAttribute('style') || ''); g.globalAlpha = m ? +m[1] : 1; g.drawImage(bm[k], 0, 0, W, H); });
    g.globalAlpha = 1;
    const svg = doc.querySelector('svg');
    if (svg) {
      svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); svg.setAttribute('width', W); svg.setAttribute('height', H); svg.removeAttribute('style'); svg.removeAttribute('class');
      try { g.drawImage(await imgDeURL('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg))), 0, 0, W, H); } catch (e) { }
    }
    return { url: c.toDataURL('image/jpeg', q), satelite: !!bm[0] };
  };
  /* mapa de localização (estado / mesorregião) em PNG, centrado numa caixa W × H */
  async function localizadorPNG(m, W, H) {
    if (!m) return null;
    const pad = 12, vw = m.w + pad * 2, vh = m.h + pad * 2, s = Math.min(W / vw, H / vh);
    const marca = m.ponto ? `<circle cx="${m.ponto[0]}" cy="${m.ponto[1]}" r="${m.anel ? 9 : 3.4}" fill="${m.anel ? 'none' : '#fff'}" stroke="${m.anel ? '#0d1b2e' : '#0d1b2e'}" stroke-width="${m.anel ? 2 : 1.6}"/>` : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${(vw * s).toFixed(0)}" height="${(vh * s).toFixed(0)}" viewBox="${-pad} ${-pad} ${vw} ${vh}"><path d="${m.fundo}" fill="#cfd9e6" stroke="#fff" stroke-width=".7" stroke-linejoin="round" fill-rule="evenodd"/><path d="${m.destaque}" fill="#1f5fd6" stroke="#0d1b2e" stroke-width=".5" stroke-linejoin="round" fill-rule="evenodd"/>${marca}</svg>`;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const im = await imgDeURL('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
    g.drawImage(im, (W - vw * s) / 2, (H - vh * s) / 2, vw * s, vh * s);
    return c.toDataURL('image/png');
  }
  async function arquivoDataURL(caminho) {
    try { const r = await fetch(caminho); if (!r.ok) return null; const b = await r.blob(); return await new Promise(ok => { const f = new FileReader(); f.onload = () => ok(f.result); f.onerror = () => ok(null); f.readAsDataURL(b); }); } catch (e) { return null; }
  }

  /* ====================================================================== */
  /* CONTEÚDO                                                                */
  /* ====================================================================== */
  const PEDIDO_MAPAS = []; // preenchido durante a montagem: { k, html, W, H } a rasterizar

  function capa(s, meta) {
    const { aoi, analise } = s, F = analise.local || {}, ad = F.adm || {}, m = VA.metricasAOI(aoi), els = [];
    els.push(R(6.95, 0, LARG - 6.95, ALT, C.fundoMapa));
    els.push(I(6.95, 0, LARG - 6.95, ALT, 'sat'));
    PEDIDO_MAPAS.push({ k: 'sat', html: VA.mapaRelatorio(aoi, null, { W: 958, H: 1125, limpo: true, folga: 0.9, minKm: 1.6 }), W: 958, H: 1125 });
    if (meta.logo) els.push(I(M, 0.5, 2.61, 0.5, 'logo'));
    const REQ = analise.requerimento && !analise.requerimento.erro ? analise.requerimento : null, A = analise.alvo && analise.alvo.mineral ? analise.alvo : null;
    const fin = VA.FINALIDADES[s.finalidade] + (REQ ? ` — local para requerimento${REQ.substancia ? ' de ' + REQ.substancia.toLowerCase() : ''}` : A ? ` — alvo: ${A.mineral.toLowerCase()}` : '');
    els.push(T(M, 1.42, 6.0, 0.34, par(fin), { z: 12, c: C.azul, b: true }));
    /* título do tamanho do nome; a altura conta com a fonte mais larga (Georgia, no PowerPoint) para não sobrepor */
    const tl = meta.titulo.length, zt = tl <= 16 ? 40 : tl <= 26 ? 34 : 28, linhas = Math.min(3, Math.ceil(tl * zt * 0.56 / 72 / 6.0)), ht = linhas * zt * 1.06 / 72 + 0.08;
    els.push(T(M, 1.78, 6.05, ht, par(meta.titulo), { f: 'serif', z: zt, b: true, lh: 1.02 }));
    const regiao = [ad.meso ? 'mesorregião ' + ad.meso : null, ad.regiao ? 'região ' + ad.regiao : null].filter(Boolean).join(', ');
    const ySub = 1.78 + ht + 0.08, yGrade = ySub + 0.62;
    els.push(T(M, ySub, 6.0, 0.55, par(`${m.tipo}${m.area_ha != null ? ' de ' + VA.fmt.ha(m.area_ha) : ''}${regiao ? ', ' + regiao : ''}`), { z: 13, c: C.prata }));
    const cota = F.cota || s.cota;
    const dados = [
      ['Coordenadas do centro', `${m.centro[1].toFixed(5)}, ${m.centro[0].toFixed(5)}`],
      ['Município', ad.municipio ? `${ad.municipio} (${ad.uf || ''})` : (analise.ctx.municipio ? VA.fmt.munUF(analise.ctx.municipio) : '—')],
      ['Altitude', cota && cota.m != null ? `${VA.fmt.num(cota.m, 0)} m` : '—'],
      ['Emitido em', new Date().toLocaleDateString('pt-BR')],
      ['Apresentação', meta.numero],
      ['Responsável', s.responsavel || 'Vip Air']
    ];
    dados.forEach(([k, v], i) => { const x = M + (i % 2) * 3.05, y = yGrade + Math.floor(i / 2) * 0.55; els.push(T(x, y, 2.95, 0.22, par(k), { z: 9, c: C.prata })); els.push(T(x, y + 0.2, 2.95, 0.3, par(corta(v, 34)), { z: 12, b: true })); });
    const M2 = F.mapas || {};
    const rg = M2.regiao, uf = ad.ufNome || ad.uf || 'o estado', tipo = rg && rg.tipo === 'intermediaria' ? 'região intermediária' : 'mesorregião';
    const locs = [];
    if (M2.estado) locs.push({ k: 'loc1', m: Object.assign({ anel: !!rg }, M2.estado), cap: rg ? `${maiuscula(tipo)} ${rg.nome} em ${uf}` : `${ad.municipio || 'Município'} em ${uf}` });
    if (rg) locs.push({ k: 'loc2', m: rg, cap: `${ad.municipio || 'Município'} na ${tipo}` });
    const yLoc = yGrade + 1.75, hLoc = Math.min(1.9, 6.82 - yLoc - 0.3);
    locs.forEach((l, i) => { const x = M + i * 3.05; els.push(R(x, yLoc, 2.9, hLoc, C.painel, { raio: 0.06 })); els.push(I(x + 0.05, yLoc + 0.05, 2.8, hLoc - 0.1, l.k)); els.push(T(x, yLoc + hLoc + 0.05, 2.9, 0.26, par(corta(l.cap, 46)), { z: 8.5, c: C.prata })); l.h = hLoc - 0.1; });
    meta._locs = locs;
    return { secao: 'Capa', els };
  }

  function finalidade(s, meta) {
    const { analise, avaliacao } = s, R0 = analise.resultados, todos = analise.ordem.map(id => R0[id]), p = analise.params, els = [];
    const REQ = analise.requerimento && !analise.requerimento.erro ? analise.requerimento : null, A = analise.alvo && analise.alvo.mineral ? analise.alvo : null;
    const tit = REQ ? `Saber se dá para requerer ${REQ.substancia ? REQ.substancia.toLowerCase() : 'esta área'} na ANM e o que pesa sobre a área`
      : A ? `Avaliar o potencial para ${A.mineral.toLowerCase()} e o acesso ao direito mineral`
        : { mineracao: 'Apoiar a decisão sobre direitos minerários nesta área', solar: 'Apoiar a decisão de implantar geração de energia nesta área', terra: 'Apoiar a compra ou o arrendamento do imóvel', geral: 'Due diligence territorial completa da área' }[s.finalidade] || 'Finalidade da análise';
    titulo(els, tit);
    const P = VA.relPecas;
    const paraQue = REQ ? 'Verificar direitos de terceiros e áreas vedadas, quanto da área sobra, se cabe no limite da substância, como fica a poligonal N-S/L-O e quais condicionantes resolver antes de investir na pesquisa.' : (P.PARA_QUE[s.finalidade] || P.PARA_QUE.geral);
    const ok = todos.filter(r => !['falha', 'sem_base'].includes(r.status));
    const porSetor = {}; todos.forEach(r => { porSetor[r.camada.setor] = (porSetor[r.camada.setor] || 0) + 1; });
    const orgaos = [...new Set(todos.flatMap(r => String(r.camada.fonte || '').split(/ — | via /)[0].split('/').map(x => x.trim())).filter(Boolean))];
    const raios = [p.setores.mineracao ? `processos minerários até ${VA.fmt.num(p.raioAnmKm, 0)} km` : null, p.setores.energia ? `energia até ${VA.fmt.num(p.raioEnergiaKm, 0)} km` : null, p.setores.ambiental ? `meio ambiente até ${VA.fmt.num(p.raioAmbientalKm, 0)} km` : null].filter(Boolean);
    const bl = [
      `${todos.length} consultas a camadas oficiais em ${Object.keys(porSetor).length} setores (${VA.SETORES.filter(st => porSetor[st.id]).map(st => st.nome.toLowerCase()).join(', ')})`,
      `Órgãos e bases: ${corta(orgaos.join(', '), 150)}`,
      raios.length ? `Raios de busca: ${raios.join('; ')}` : null,
      A ? `Busca dirigida a ${A.mineral.toLowerCase()} até ${VA.fmt.km(A.raioKm)}${analise.favorab && analise.favorab.grade ? `, com inteligência mineral numa janela de ${VA.fmt.num(analise.favorab.janelaKm, 0)} km` : ''}` : null,
      `Consulta feita em ${VA.fmt.dataHora(analise.inicio)}`
    ].filter(Boolean);
    subtitulo(els, M, 2.0, 6.9, 'Para quê');
    els.push(T(M, 2.42, 6.9, 1.5, par(corta(paraQue, 330)), { z: 13, lh: 1.3 }));
    subtitulo(els, M, 4.0, 6.9, 'O que foi consultado');
    els.push(T(M, 4.42, 6.9, 2.4, bl.map(t => par([run(t)], { bullet: '•', esp: 5 })), { z: 11.5, lh: 1.22 }));
    const nDentro = ok.reduce((n, r) => n + (r.itens || []).filter(i => i.incide).length, 0), nEntorno = ok.reduce((n, r) => n + (r.itens || []).filter(i => !i.incide && i.distancia_km != null).length, 0);
    const lac = todos.length - ok.length + ok.filter(r => r.dados && r.dados.truncado).length;
    grade4(els, 7.95, 2.0, DIR - 7.95, 2.8, [[`${ok.length}`, `/${todos.length}`, 'consultas concluídas'], [`${nDentro}`, '', 'registros com interseção na área'], [`${nEntorno}`, '', 'registros no entorno'], [`${lac}`, '', 'fontes indisponíveis ou parciais', lac ? '#a86a00' : null]]);
    els.push(T(7.95, 5.05, DIR - 7.95, 1.6, [par([run('Fora do escopo: ', { b: true, c: C.tinta }), run('titularidade e ônus do imóvel (só a certidão do cartório prova), teor, tonelagem ou reserva mineral, vistoria de campo e consulta formal aos órgãos.')])], { z: 10.5, c: C.prata, lh: 1.3 }));
    return { secao: 'Finalidade', els };
  }

  function requerimento(s, meta) {
    const Q = s.analise.requerimento; if (!Q || Q.erro) return null;
    const els = [], cor = VA.relPecas.COR_REQ[Q.classe] || '#6b7280', LI = VA.livreInfo(Q);
    const partes = String(Q.texto || '').split(' — ');
    titulo(els, partes[0], { cor });
    if (partes.length > 1) lead(els, maiuscula(partes.slice(1).join(' — ')));
    const mw = 6.6, mh = 4.55;
    els.push(R(M, 2.08, mw, mh, C.fundoMapa)); els.push(I(M, 2.08, mw, mh, 'req'));
    PEDIDO_MAPAS.push({ k: 'req', html: VA.relPecas.mapaRequerimento(s, 1200, Math.round(1200 * mh / mw)).html, W: 1200, H: Math.round(1200 * mh / mw) });
    els.push(T(M, 6.66, mw, 0.26, par([run('■ ', { c: '#1665d8' }), run('área pretendida   '), run('■ ', { c: LI.status === 'confirmada' ? '#2e9d3a' : '#6d28d9' }), run(LI.status === 'confirmada' ? 'sem interferência   ' : 'área livre potencial   '), run('■ ', { c: '#b3121d' }), run('impedida   ')].concat(Q.poligonal ? [run('- - ', { c: C.tinta, b: true }), run('poligonal N-S/L-O sugerida')] : [])), { z: 8.5, c: C.prata }));
    const pg = Q.poligonal, x = M + mw + 0.4, w = DIR - x;
    grade4(els, x, 2.08, w, 2.3, [
      [VA.fmt.num(Q.area_ha, Q.area_ha < 100 ? 1 : 0), 'ha', Q.ponto ? 'quadrado N-S/L-O pretendido' : 'área analisada'],
      [LI.ha != null ? VA.fmt.num(LI.ha, LI.ha < 100 ? 1 : 0) : '—', 'ha', LI.curto, LI.status === 'confirmada' ? C.verde : '#6d28d9'],
      [Q.limite && Q.limite.ha ? VA.fmt.num(Q.limite.ha, 0) : '—', 'ha', `limite para ${Q.substancia || 'a substância'}`],
      [pg ? VA.fmt.num(pg.ha, pg.ha < 100 ? 1 : 0) : '—', 'ha', pg ? `poligonal N-S/L-O, ${pg.vertices} vértices` : Q.poligonalBloqueada ? 'poligonal não gerada' : 'poligonal N-S/L-O']]);
    const acao = Q.itens.filter(i => i.situacao !== 'livre').sort((a, b) => ['impede', 'ajuste', 'condiciona', 'sem_dados', 'atencao'].indexOf(a.situacao) - ['impede', 'ajuste', 'condiciona', 'sem_dados', 'atencao'].indexOf(b.situacao));
    subtitulo(els, x, 4.6, w, 'O que exige ação');
    els.push(T(x, 5.0, w, 1.9, acao.length ? acao.slice(0, 4).map(i => par([run('● ', { c: COR_SIT[i.situacao] || C.prata }), run((VA.SIT_REQ[i.situacao] || i.situacao) + ': ', { b: true, c: COR_SIT[i.situacao] || C.prata }), run(corta(i.criterio, 60), { b: true }), run(i.acao ? ' — ' + corta(i.acao, 90) : '', { c: C.prata })], { esp: 4 }))
      : [par('Nenhum item exige ação nas bases consultadas.', { esp: 0 })], { z: 10.5, lh: 1.2 }));
    if (acao.length > 4) els.push(T(x, 6.72, w, 0.22, par(`+ ${acao.length - 4} item(ns) no checklist do relatório`), { z: 8.5, c: C.prata }));
    return { secao: 'Viabilidade do requerimento', els };
  }

  function parecer(s, meta) {
    const av = s.avaliacao, P = VA.relPecas, els = [];
    titulo(els, primeiraFrase(av.sintese.texto, 130), { cor: P.COR_NIVEL[av.sintese.classe] || null });
    const cont = Object.entries(av.contagem).filter(([, n]) => n).map(([nv, n]) => contagem(nv, n));
    const cob = av.sintese.cobertura, pend = cob ? cob.pendentes : [];
    const cobTxt = cob && cob.criticas.length ? `Fontes críticas para a finalidade: ${cob.criticas.length - pend.length} de ${cob.criticas.length} verificadas.` : '';
    if (cont.length || cobTxt) lead(els, [cont.length ? `Achados das regras de triagem: ${lista(cont)}.` : '', cobTxt].filter(Boolean).join(' '));
    const ordem = nv => (VA.NIVEIS[nv] || { ordem: 9 }).ordem;
    const contra = av.achados.filter(a => ['impeditivo', 'alerta', 'atencao'].includes(a.nivel)).sort((a, b) => ordem(a.nivel) - ordem(b.nivel));
    const favor = av.achados.filter(a => a.nivel === 'oportunidade');
    /* fonte crítica pendente: faixa roxa no rodapé, e as colunas encolhem para caber */
    const nMax = pend.length ? 3 : 4, hCol = pend.length ? 3.55 : 4.25;
    const coluna = (x, w, tit, l, vazio) => {
      subtitulo(els, x, 2.1, w, tit);
      els.push(T(x, 2.55, w, hCol, l.length ? l.slice(0, nMax).map(a => par([run(VA.NIVEIS[a.nivel].rotulo + '  ', { b: true, c: P.COR_NIVEL[a.nivel] }), run(corta(a.titulo, 80), { b: true }), run('\n', { quebra: true }), run(corta(a.texto, 150), { c: C.prata, z: 10.5 })], { esp: 9 })) : [par(vazio)], { z: 12, lh: 1.2 }));
      if (l.length > nMax) els.push(T(x, pend.length ? 6.02 : 6.7, w, 0.22, par(`+ ${l.length - nMax} no relatório`), { z: 8.5, c: C.prata }));
    };
    coluna(M, 5.85, 'Pontos de atenção', contra, 'Nenhuma restrição apontada pelas fontes que responderam.');
    els.push(R(6.66, 2.15, 0.012, 4.5, C.linha));
    coluna(6.88, DIR - 6.88, 'Pontos a favor', favor, 'Nenhuma oportunidade específica apontada pelas regras.');
    if (pend.length) {
      els.push(R(M, 6.3, DIR - M, 0.62, '#f3edff', { raio: 0.06 }));
      els.push(R(M, 6.3, 0.07, 0.62, '#6d28d9'));
      els.push(T(M + 0.22, 6.34, DIR - M - 0.35, 0.56, [par([run('Sem verificação: ', { b: true, c: '#6d28d9' }), run(corta(pend.map(x => `${x.nome} (${x.rotulo})`).join('; '), 190) + '. '), run('Ausência de registro nessas fontes não foi comprovada; repita a consulta antes de decidir.', { c: C.prata })])], { z: 10.5, lh: 1.15, v: 'middle' }));
    }
    return { secao: 'Parecer preliminar', els };
  }

  function alvo(s, meta) {
    const { analise } = s, P = VA.relPecas, MO = P.dadosOcorrencias(analise); if (!MO) return null;
    const A = analise.alvo && analise.alvo.mineral ? analise.alvo : null, els = [], sr = (A && A.resumo) || {};
    const n = MO.pontos.length, prox = MO.pontos.slice().sort((a, b) => (a.d == null ? 1e9 : a.d) - (b.d == null ? 1e9 : b.d))[0];
    titulo(els, A ? (n ? `${n} ocorrência${n > 1 ? 's' : ''} de ${A.mineral.toLowerCase()} até ${VA.fmt.km(A.raioKm)}; a mais próxima ${prox && prox.i ? 'dentro da área' : 'a ' + VA.fmt.km(prox.d)}` : `Nenhuma ocorrência de ${A.mineral.toLowerCase()} cadastrada até ${VA.fmt.km(A.raioKm)}`)
      : `${n} ocorrência${n > 1 ? 's' : ''} minerais até ${VA.fmt.km(MO.raioKm)} da área`);
    lead(els, A ? `GEOBANK (Serviço Geológico do Brasil) e processos da ANM com o mesmo bem. Ocorrência cadastrada não comprova jazida, teor ou reserva.` : 'Todas as substâncias cadastradas no GEOBANK (SGB) no entorno. Ocorrência cadastrada não comprova jazida, teor ou reserva.');
    const mw = 6.6, mh = 4.55, x = M + mw + 0.4, w = DIR - x;
    if (MO.pontos.length || MO.polis.length) {
      els.push(R(M, 2.08, mw, mh, C.fundoMapa)); els.push(I(M, 2.08, mw, mh, 'oc'));
      const W = 1200, H = Math.round(1200 * mh / mw);
      PEDIDO_MAPAS.push({ k: 'oc', html: P.mapaOcorrenciasEstatico(s.aoi, MO, { W, H }), W, H });
      const st = {}; MO.pontos.forEach(q => { st[q.st] = (st[q.st] || 0) + 1; });
      els.push(T(M, 6.66, mw, 0.26, par(Object.entries(st).sort((a, b) => b[1] - a[1]).slice(0, 4).flatMap(([k, v]) => [run('● ', { c: P.corStatus(k) }), run(`${k} (${v})   `)]).concat(MO.polis.length ? [run('■ ', { c: '#b26df0' }), run(`processo ANM com o bem (${MO.polis.length})`)] : [])), { z: 8.5, c: C.prata }));
    } else els.push(T(M, 2.2, mw, 1, par('Sem ocorrências nem processos com o bem no raio pesquisado. A ausência de registro reflete a cobertura dos levantamentos.'), { z: 12, c: C.prata }));
    grade4(els, x, 2.08, w, 2.3, A ? [[`${sr.ocDentro || 0}`, '', 'ocorrência(s) dentro da área'], [`${sr.ocTotal || 0}`, '', `ocorrências até ${VA.fmt.km(A.raioKm)}`], [...kmPartes(sr.ocMin), 'distância da mais próxima'], [`${sr.procTotal || 0}`, '', `processos ANM com o bem${sr.procDentro ? `, ${sr.procDentro} sobre a área` : ''}`]]
      : [[`${n}`, '', 'ocorrências no raio'], [`${new Set(MO.pontos.flatMap(q => String(q.sub).split(/\s*,\s*/))).size}`, '', 'substâncias distintas'], [...kmPartes(prox ? prox.d : null), 'distância da mais próxima'], [`${MO.pontos.filter(q => /mina|garimp/i.test(q.st)).length}`, '', 'minas e garimpos']]);
    subtitulo(els, x, 4.6, w, 'Mais próximas');
    els.push(T(x, 5.0, w, 1.9, MO.pontos.slice(0, 5).map(q => par([run(q.e + '  ', { b: true, c: P.corStatus(q.st) }), run(corta(q.t, 44), { b: true }), run(` — ${String(q.st).toLowerCase()}, ${q.i ? 'dentro' : VA.fmt.km(q.d)}`, { c: C.prata })], { esp: 3 })), { z: 10.5, lh: 1.2 }));
    return { secao: A ? 'Alvo da pesquisa' : 'Ocorrências minerais', els };
  }

  function oportunidades(s, meta) {
    const F = s.analise.favorab; if (!F || F.erro || !F.grade) return null;
    const P = VA.relPecas, g = F.grade, els = [], mineral = F.mineral.toLowerCase();
    /* mapa ocupa a altura toda do slide: é a informação mais importante */
    const asp = g.W / g.H; let mw = Math.min(7.7, ALT * asp), mh = mw / asp; if (mh > ALT) { mh = ALT; mw = mh * asp; }
    els.push(R(0, 0, mw, ALT, C.fundoMapa)); els.push(I(0, (ALT - mh) / 2, mw, mh, 'fav'));
    const W = 1500, H = Math.round(W / asp);
    PEDIDO_MAPAS.push({ k: 'fav', html: P.mapaFavHTML(F, s.aoi, { W, camada: 'fav', alvoR: 19 }).html, W, H });
    const x = mw + 0.45, w = DIR - x;
    const novos = F.alvos.filter(a => a.categoria === 'Novo requerimento possível').length;
    const D = F.disponibilidade || {}, naoVer = D.verificada === false;
    els.push(T(x, 0.5, w, 1.6, par(F.alvos.length ? `${F.alvos.length} alvos para ${mineral}${naoVer ? ', disponibilidade não verificada' : novos ? `, ${novos} sem processo ativo no SIGMINE` : ', todos já onerados'}` : `Nenhum alvo para ${mineral} com confiabilidade mínima`), { f: 'serif', z: 25, b: true, lh: 1.08 }));
    els.push(T(x, 2.1, w, 0.8, par(`Favorabilidade geológica numa janela de ${VA.fmt.num(F.janelaKm, 0)} km, pelo modelo de ${corta(F.sistema.nome.toLowerCase(), 70)}.`), { z: 11, c: C.prata, lh: 1.25 }));
    const kh = 0.92, kg = 0.12;
    [[F.favAoiPct != null ? `${Math.round(F.favAoiPct * 100)}º` : '—', '', 'percentil de favorabilidade da área na janela'],
     [P.nivelConf(F.confAoi), '', `confiabilidade dos dados na área (${F.confAoi != null ? Math.round(F.confAoi * 100) : '—'} de 100)`],
     naoVer ? ['não verificada', '', 'disponibilidade na janela: a consulta ANM ou de restrições não foi concluída'] : [P.pctTxt(D.semProcesso_pct), '', `da janela sem processo ativo nem restrição (${F.processosJanela || 0} processos)`]].forEach((k, i) => kpi(els, x, 2.98 + i * (kh + kg), w, kh, k[0], k[1], k[2]));
    /* legenda */
    const ly = 6.12, rampa = ['#ffffb2', '#fecc5c', '#fd8d3c', '#f03b20', '#bd0026'];
    rampa.forEach((c, i) => els.push(R(x + i * 0.18, ly + 0.05, 0.18, 0.12, c)));
    els.push(T(x + 1.0, ly, w - 1.0, 0.22, par('favorabilidade: média → muito alta'), { z: 8.5, c: C.prata, v: 'middle' }));
    const leg = [[P.COR_PROC.pesquisa, 'requerimento ou pesquisa (ANM)'], [P.COR_PROC.lavra, 'lavra ou licenciamento (ANM)'], ['#1665d8', 'área de interesse']].filter((l, i) => i === 2 || (F.processos || []).some(f => (i === 0 ? ['pesquisa', 'outro'] : ['lavra']).includes(f.properties.classe)));
    leg.forEach((l, i) => { const lx = x + (i % 2) * (w / 2), lyy = ly + 0.27 + Math.floor(i / 2) * 0.24; els.push(R(lx, lyy + 0.04, 0.18, 0.13, null, { linha: l[0], lw: 1.5 })); els.push(T(lx + 0.25, lyy, w / 2 - 0.3, 0.22, par(l[1]), { z: 8.5, c: C.prata, v: 'middle' })); });
    rodape(els, meta, 'Oportunidades', x);
    return { secao: 'Oportunidades', els, semRodape: true };
  }

  function ranking(s, meta) {
    const F = s.analise.favorab; if (!F || F.erro || !F.grade || !F.alvos.length) return null;
    const P = VA.relPecas, els = [], a1 = F.alvos[0];
    titulo(els, `${a1.id} lidera: favorabilidade ${Math.round(a1.nota * 100)}, confiabilidade ${P.nivelConf(a1.conf)}, ${a1.categoria.toLowerCase()}`);
    const Dr = F.disponibilidade || {};
    lead(els, Dr.verificada === false ? 'Disponibilidade não verificada: a consulta da ANM ou das restrições nesta janela não foi concluída. A favorabilidade não comprova disponibilidade para requerimento.' : 'Ordem: favorabilidade × acesso ao direito. “Novo requerimento possível” quer dizer sem processo ativo nem restrição nas bases consultadas — confirme no SIGAREAS no dia do protocolo.');
    const linhas = F.alvos.slice(0, 5).map(a => [
      cel(a.id, { b: true }),
      cel(`${a.c[1].toFixed(5)}, ${a.c[0].toFixed(5)}`, { c: C.prata }),
      cel(String(Math.round(a.nota * 100)), { b: true, al: 'center' }),
      cel(P.nivelConf(a.conf), { c: a.conf >= 0.6 ? C.verde : a.conf >= 0.4 ? '#a86a00' : C.vermelho, b: true, al: 'center' }),
      cel(a.categoria, { b: true, c: P.COR_CAT[a.categoria] || C.tinta, sub: corta(a.situacao.replace(/ · condicionante.*$/, ''), 60) }),
      cel(corta(a.motivos.slice(0, 2).join('; ') || 'convergência de evidências fracas', 115), { sub: a.contra.length ? '− ' + corta(a.contra[0], 64) : '' }),
      cel(a.dist_km === 0 ? 'dentro da área' : VA.fmt.km(a.dist_km), { al: 'right' })]);
    els.push(TAB(M, 2.12, DIR - M, [0.62, 1.62, 1.0, 1.08, 2.45, 4.16, 1.2], ['Alvo', 'Coordenadas', 'Favorab.', 'Confiab.', 'Via de acesso', 'Por que se destaca', 'Distância'].map(t => cel(t)), linhas, { z: 10 }));
    if (F.alvos.length > 5) els.push(T(M, 6.68, 6, 0.24, par(`+ ${F.alvos.length - 5} alvo(s) no relatório`), { z: 8.5, c: C.prata }));
    return { secao: 'Ranking de oportunidades', els };
  }

  function geologia(s, meta) {
    const F = s.analise.favorab; if (!F || F.erro || !F.grade) return null;
    const P = VA.relPecas, SG = P.sinteseGeologica(F), Gl = F.geologia || {}, Gq = F.geoquimica || {}, Cx = F.contexto || {}, els = [];
    const partes = [];
    if (SG.favPct != null) partes.push(`${P.pctTxt(SG.favPct)} da área em litologias favoráveis (${Gl.melhorEscala})`);
    else if (Gl.melhorEscala) partes.push(`geologia da área só em ${Gl.melhorEscala}`);
    partes.push(Gq.insuficiente ? 'geoquímica pública insuficiente' : (Gq.anomalas || []).length ? `${Gq.anomalas.length} anomalia(s) geoquímica(s) na janela` : 'sem anomalia geoquímica na janela');
    titulo(els, maiuscula(partes.join('; ')));
    lead(els, `Modelo: ${corta(F.sistema.nome, 90)}. Bases públicas do SGB e da ANM; o que não respondeu fica como lacuna, nunca como ausência.`);
    const wl = 6.35;
    subtitulo(els, M, 2.12, wl, `Unidades na área${Gl.melhorEscala ? ' (' + Gl.melhorEscala + ')' : ''}`);
    const un = (Gl.naArea || []).slice(0, 5);
    if (un.length) els.push(TAB(M, 2.55, wl, [3.35, 1.4, 1.6], [cel('Unidade'), cel('Área', { al: 'right' }), cel('Para o modelo')], un.map(z => [cel(corta(z.nome, 52), { b: true, sub: corta(z.litotipos, 60) }), cel(z.ha != null ? `${VA.fmt.ha(z.ha)}` : 'ponto', { al: 'right', sub: z.ha != null ? P.pctTxt(z.pct) : '' }), cel(z.classe, { b: true, c: { 'favorável': C.verde, 'possível': '#a86a00', 'pouco favorável': C.prata }[z.classe] })]), { z: 9.5 }));
    else els.push(T(M, 2.55, wl, 0.6, par('Nenhuma unidade mapeada sobre a área nas escalas publicadas pelo SGB.'), { z: 11, c: C.prata }));
    const lev = (F.levantamentos || [])[0];
    const ctx = [Cx.ocorrencias ? `${Cx.ocorrencias} ocorrência(s) de ${F.mineral.toLowerCase()} até ${VA.fmt.km(Cx.raioKm)}` : `Nenhuma ocorrência de ${F.mineral.toLowerCase()} até ${VA.fmt.km(Cx.raioKm)}`,
      lev ? `Aerogeofísica: ${corta(lev.projeto, 50)}${lev.esp ? `, linhas a cada ${VA.fmt.num(lev.esp, 0)} m` : ''}` : null,
      (Gq.projetos || []).length ? `${Gq.projetos.length} projeto(s) geoquímico(s) do SGB na janela, com relatório no RIGeo` : null].filter(Boolean);
    /* contexto logo abaixo da tabela (altura estimada de cada linha com a sublinha de litotipos) */
    const yCtx = un.length ? Math.min(5.35, 2.55 + 0.34 + un.length * 0.48 + 0.3) : 3.4;
    subtitulo(els, M, yCtx, wl, 'Contexto e dados de apoio');
    els.push(T(M, yCtx + 0.4, wl, 6.8 - yCtx - 0.4, ctx.map(t => par([run(t)], { bullet: '•', esp: 3 })), { z: 10.5, c: C.prata, lh: 1.2 }));
    const x = M + wl + 0.45, w = DIR - x;
    subtitulo(els, x, 2.12, w, 'Fortalece');
    els.push(T(x, 2.52, w, 1.45, SG.forte.length ? SG.forte.slice(0, 3).map(t => par([run(corta(t, 110))], { bullet: '+', bc: C.verde, esp: 4 })) : [par('Nenhuma evidência forte nas bases públicas.')], { z: 10.5, lh: 1.2 }));
    subtitulo(els, x, 4.0, w, 'Enfraquece ou limita');
    els.push(T(x, 4.4, w, 1.3, SG.fraco.length ? SG.fraco.slice(0, 3).map(t => par([run(corta(t, 110))], { bullet: '−', bc: C.vermelho, esp: 4 })) : [par('Nada relevante.')], { z: 10.5, lh: 1.2 }));
    if (SG.insuf.length) {
      els.push(R(x, 5.78, w, 1.02, C.painel, { raio: 0.06 }));
      els.push(T(x + 0.16, 5.86, w - 0.3, 0.9, [par([run('Bases insuficientes', { b: true, c: C.tinta })], { esp: 2 }), par(SG.insuf.slice(0, 4).map((i, k) => run(`${k ? ' · ' : ''}${i.rot}: ${i.curto}`)))], { z: 10, c: C.prata, lh: 1.25 }));
    }
    return { secao: 'Interpretação geológica', els };
  }

  function achados(s, meta) {
    const av = s.avaliacao, P = VA.relPecas, els = [];
    const niveis = ['impeditivo', 'alerta', 'atencao', 'oportunidade'].map(nv => ({ nv, l: av.achados.filter(a => a.nivel === nv) })).filter(g => g.l.length);
    const cont = niveis.map(g => contagem(g.nv, g.l.length));
    titulo(els, niveis.length ? maiuscula(lista(cont)) : 'Nenhum achado relevante nas fontes que responderam');
    lead(els, 'Cada achado vem de uma regra aplicada às camadas oficiais e cita os registros que o sustentam no relatório (E#, A#).');
    if (!niveis.length) return { secao: 'Achados', els };
    const g = 0.3, cw = (DIR - M - g * (niveis.length - 1)) / niveis.length;
    niveis.forEach((gr, i) => {
      const x = M + i * (cw + g), cor = P.COR_NIVEL[gr.nv];
      els.push(R(x, 2.12, cw, 0.06, cor));
      els.push(T(x, 2.26, cw, 0.5, par([run(String(gr.l.length) + '  ', { f: 'serif', z: 22, b: true, c: cor }), run(VA.NIVEIS[gr.nv].rotulo, { b: true })]), { z: 13, v: 'middle' }));
      const max = niveis.length > 2 ? 5 : 6;
      els.push(T(x, 2.9, cw, 3.75, gr.l.slice(0, max).map(a => par([run(corta(a.titulo, niveis.length > 2 ? 70 : 95), { b: true }), run('\n', { quebra: true }), run(VA.nomeSetor(a.setor) || '', { c: C.prata, z: 9 })], { esp: 7 })), { z: 10.5, lh: 1.18 }));
      if (gr.l.length > max) els.push(T(x, 6.68, cw, 0.22, par(`+ ${gr.l.length - max} no relatório`), { z: 8.5, c: C.prata }));
    });
    return { secao: 'Achados', els };
  }

  function proximos(s, meta) {
    const { analise } = s, els = [], passos = [];
    const Q = analise.requerimento && !analise.requerimento.erro ? analise.requerimento : null, F = analise.favorab && analise.favorab.grade ? analise.favorab : null;
    const pendCrit = s.avaliacao.sintese.cobertura ? s.avaliacao.sintese.cobertura.pendentes : [];
    if (pendCrit.length) passos.push(`Repetir a consulta das fontes críticas sem verificação (${corta(lista(pendCrit.map(x => x.nome)), 110)}) antes de qualquer decisão.`);
    if (Q) {
      const imp = Q.itens.filter(i => i.situacao === 'impede'), cond = Q.itens.filter(i => i.situacao === 'condiciona');
      if (Q.classe === 'inconclusivo') passos.push('Não protocolar ainda: a área livre não é definitiva e a poligonal só é gerada depois que todas as fontes do desconto responderem.');
      else if (Q.classe === 'impede') passos.push(`Não protocolar a área como está: ${corta(lista(imp.map(i => i.criterio.toLowerCase()).slice(0, 2)), 90)}.`);
      else passos.push(`Conferir a poligonal N-S/L-O com o técnico responsável e protocolar na ANM, confirmando no SIGMINE no dia que a área continua sem processo de terceiros.`);
      if (cond.length) passos.push(`Resolver antes de investir na pesquisa: ${corta(lista(cond.map(i => i.criterio.toLowerCase()).slice(0, 3)), 120)}.`);
    }
    if (F && F.alvos.length) {
      const top = F.alvos.slice(0, 3).map(a => a.id);
      passos.push(`Visitar em campo ${lista(top)}: mapeamento geológico de detalhe e amostragem nos pontos de maior favorabilidade.`);
      const SG = VA.relPecas.sinteseGeologica(F);
      SG.insuf.filter(i => i.rot !== 'Estruturas').slice(0, 2).forEach(i => passos.push(i.rot === 'Geoquímica' ? 'Amostragem de sedimento de corrente e solo — não há geoquímica pública suficiente para separar fundo e anomalia.' : i.rot === 'Geologia' ? `Mapeamento geológico em 1:25.000 ou mais detalhado (hoje só ${i.curto.replace(/^só /, '')}).` : 'Levantamento geofísico terrestre ou por drone (magnetometria e gamaespectrometria) sobre os alvos.'));
    }
    passos.push('Certidão de inteiro teor do imóvel no cartório (Mapa do Registro de Imóveis, ONR) e consulta formal aos órgãos competentes.');
    titulo(els, 'Próximos passos');
    els.push(T(M, 1.85, 7.3, 4.9, passos.slice(0, 6).map((t, i) => par([run(`${i + 1}.  `, { b: true, c: C.azul }), run(t)], { esp: 10 })), { z: 13, lh: 1.28 }));
    const x = 8.45, w = DIR - x, falhas = analise.ordem.filter(id => ['falha', 'sem_base'].includes(analise.resultados[id].status)).length;
    els.push(R(x, 1.85, w, 4.9, C.painel, { raio: 0.08 }));
    els.push(T(x + 0.25, 2.05, w - 0.5, 4.5, [
      par([run('Ressalvas', { b: true, c: C.tinta, z: 13 })], { esp: 6 }),
      par(`Triagem automática sobre bases públicas consultadas em ${VA.fmt.dataHora(analise.inicio)}.`, { esp: 5 }),
      par('Não substitui certidões, vistoria de campo, consulta formal aos órgãos nem parecer de profissional habilitado.', { esp: 5 }),
      F ? par('A favorabilidade é relativa à janela analisada: aponta onde as evidências convergem, não teor, tonelagem nem probabilidade de descoberta.', { esp: 5 }) : null,
      falhas ? par(`${falhas} fonte(s) não responderam e ficaram como lacuna — veja o relatório completo.`, { esp: 5 }) : null,
      par('O relatório completo traz cada registro, a fonte oficial e as lacunas de cada consulta.')
    ].filter(Boolean), { z: 10.5, c: C.prata, lh: 1.3 }));
    return { secao: 'Próximos passos', els };
  }

  /* ====================================================================== */
  /* MONTAGEM                                                                */
  /* ====================================================================== */
  VA.slidesModelo = function (s, meta) {
    PEDIDO_MAPAS.length = 0;
    const fabricas = [capa, finalidade, requerimento, parecer, alvo, oportunidades, ranking, geologia, achados, proximos];
    const slides = [];
    fabricas.forEach(f => { let sl = null; try { sl = f(s, Object.assign(meta, { n: slides.length + 1 })); } catch (e) { console.error('slide', f.name, e); } if (sl) slides.push(sl); });
    slides.forEach((sl, i) => { if (i > 0 && !sl.semRodape) rodape(sl.els, Object.assign({}, meta, { n: i + 1 }), sl.secao); });
    return { slides, mapas: PEDIDO_MAPAS.slice(), locs: meta._locs || [] };
  };

  /* imagens: mapas rasterizados, localizadores e logotipos (data URLs) */
  async function imagens(modelo, aoProgresso) {
    const out = {};
    const [logo, emblema] = await Promise.all([arquivoDataURL('assets/logo-horizontal.png'), arquivoDataURL('assets/emblema-transparente.png')]);
    if (logo) out.logo = logo; if (emblema) out.emblema = emblema;
    let feitos = 0;
    await Promise.all(modelo.mapas.map(async p => {
      try { const r = await VA.rasterizarMapa(p.html, p.W, p.H); out[p.k] = r.url; } catch (e) { console.error('mapa', p.k, e); }
      if (aoProgresso) aoProgresso(++feitos, modelo.mapas.length);
    }));
    await Promise.all(modelo.locs.map(async l => { try { out[l.k] = await localizadorPNG(l.m, 560, Math.round(560 * (l.h || 1.1) / 2.8)); } catch (e) { } }));
    return out;
  }

  /* ---------------- HTML ---------------- */
  const PX = 96, pt = z => (z * 4 / 3).toFixed(2) + 'px', px = v => (v * PX).toFixed(1) + 'px';
  function htmlTexto(el) {
    const fam = el.f === 'serif' ? 'var(--serif)' : 'var(--sans)';
    const paras = el.p.map(p => {
      const runs = p.r.map(r => r.quebra ? '<br>' : `<span style="${r.b != null ? `font-weight:${r.b ? 600 : 400};` : ''}${r.c ? `color:${r.c};` : ''}${r.z ? `font-size:${pt(r.z)};` : ''}${r.f ? `font-family:${r.f === 'serif' ? 'var(--serif)' : 'var(--sans)'};` : ''}${r.i ? 'font-style:italic;' : ''}">${esc(r.s)}</span>`).join('');
      const b = p.bullet ? `<span class="bl" style="${p.bc ? `color:${p.bc};` : ''}">${esc(p.bullet)}</span>` : '';
      return `<p style="margin:0 0 ${p.esp ? pt(p.esp) : 0};text-align:${p.al || el.al}${p.bullet ? ';padding-left:1.1em' : ''}">${b}${runs}</p>`;
    }).join('');
    return `<div class="t" style="left:${px(el.x)};top:${px(el.y)};width:${px(el.w)};height:${px(el.h)};font-family:${fam};font-size:${pt(el.z)};color:${el.c};line-height:${el.lh};font-weight:${el.b ? 600 : 400};justify-content:${{ top: 'flex-start', middle: 'center', bottom: 'flex-end' }[el.v]}">${paras}</div>`;
  }
  function htmlTabela(el) {
    const tot = el.cols.reduce((a, b) => a + b, 0);
    const td = (c, cab) => `<${cab ? 'th' : 'td'} style="text-align:${c.al || 'left'};${c.c ? `color:${c.c};` : ''}${c.b ? 'font-weight:600;' : ''}">${esc(c.s)}${c.sub ? `<div class="sub">${esc(c.sub)}</div>` : ''}</${cab ? 'th' : 'td'}>`;
    return `<table class="tb" style="left:${px(el.x)};top:${px(el.y)};width:${px(el.w)};font-size:${pt(el.z)}"><colgroup>${el.cols.map(w => `<col style="width:${(w / tot * 100).toFixed(2)}%">`).join('')}</colgroup><thead><tr>${el.cab.map(c => td(c, true)).join('')}</tr></thead><tbody>${el.linhas.map(l => `<tr>${l.map(c => td(c)).join('')}</tr>`).join('')}</tbody></table>`;
  }
  function htmlEl(el, img) {
    if (el.t === 'txt') return htmlTexto(el);
    if (el.t === 'img') return img[el.k] ? `<img class="im" data-k="${el.k}" src="${img[el.k]}" style="left:${px(el.x)};top:${px(el.y)};width:${px(el.w)};height:${px(el.h)}" alt="">` : '';
    if (el.t === 'ret') return `<div class="rt" style="left:${px(el.x)};top:${px(el.y)};width:${px(el.w)};height:${px(el.h)};${el.fill ? `background:${el.fill};` : ''}${el.linha ? `border:${el.lw}pt solid ${el.linha};` : ''}border-radius:${el.elipse ? '50%' : px(el.raio)}"></div>`;
    if (el.t === 'tab') return htmlTabela(el);
    return '';
  }

  VA.slidesHTML = async function (s, { aoProgresso, relatorio } = {}) {
    const { analise } = s, F = analise.local || {}, ad = F.adm || {}, mun = analise.ctx.municipio;
    const agora = new Date(), numero = 'VA-' + agora.toISOString().replace(/[-:T]/g, '').slice(0, 12);
    const nomesMun = s.municipios && s.municipios.length ? [...new Set(s.municipios.map(x => x.municipio))] : ad.municipio ? [ad.municipio] : [];
    const titulo = nomesMun.length ? (nomesMun.length > 2 ? nomesMun.slice(0, 2).join(', ') + ' e outros' : nomesMun.join(' e ')) + (ad.ufNome ? ', ' + ad.ufNome : mun && mun.uf ? ' — ' + mun.uf : '') : (mun ? VA.fmt.munUF(mun) : 'Área de interesse');
    const meta = { numero, titulo, relatorio, emblema: true, logo: true };
    const modelo = VA.slidesModelo(s, meta);
    const img = await imagens(modelo, aoProgresso);
    if (!img.emblema) modelo.slides.forEach(sl => { sl.els = sl.els.filter(e => e.k !== 'emblema'); });
    const base = location.href.replace(/[^/]*$/, '');
    const SRV = VA.Net.proxy.ok ? (VA.Net.proxy.base || (location.origin + '/')) : 'http://localhost:8766/';
    const nome = `Apresentação ${numero} — ${titulo}`;
    const corpo = modelo.slides.map((sl, i) => `<div class="vaga"><section class="sl" data-n="${i + 1}" aria-label="${esc(sl.secao)}">${sl.els.map(el => htmlEl(el, img)).join('')}</section></div>`).join('\n');
    const json = o => JSON.stringify(o).replace(/</g, '\\u003c');
    return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(nome)}</title><link rel="icon" href="${base}assets/icone-64.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,500;8..60,600;8..60,700&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>
:root{--serif:"Source Serif 4",Georgia,"Times New Roman",serif;--sans:"IBM Plex Sans","Segoe UI",Arial,sans-serif;--k:1}
*{box-sizing:border-box}html,body{margin:0}body{background:#dfe5ee;font-family:var(--sans);color:#0d1b2e}
.barra{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:8px;padding:10px 20px;background:rgba(223,229,238,.94);backdrop-filter:blur(6px);border-bottom:1px solid #c8d2df}
.barra button{border:1px solid #1f5fd6;background:#fff;color:#1f5fd6;border-radius:6px;padding:8px 14px;font:600 13px var(--sans);cursor:pointer}.barra button.pri{background:#1f5fd6;color:#fff}.barra button:disabled{opacity:.5;cursor:wait}
.barra .esp{flex:1}.barra #msg{font-size:12.5px;color:#33445e;max-width:520px}.barra #msg a{color:#1f5fd6}
.deck{display:flex;flex-direction:column;align-items:center;gap:26px;padding:26px 0 70px}
.vaga{width:calc(1280px*var(--k));height:calc(720px*var(--k));position:relative}
.sl{position:absolute;left:0;top:0;width:1280px;height:720px;background:#fff;overflow:hidden;transform:scale(var(--k));transform-origin:0 0;box-shadow:0 2px 16px rgba(13,27,46,.16)}
.sl>*{position:absolute}.t{display:flex;flex-direction:column;overflow:hidden}.t p{position:relative}.t .bl{position:absolute;left:0;font-weight:700}
.im{object-fit:fill;display:block}
.tb{border-collapse:collapse;table-layout:fixed;line-height:1.2}.tb th{font-weight:600;color:#5e6d82;text-align:left;padding:4pt 6pt;border-bottom:1pt solid #d3dce8;font-size:.92em}.tb td{padding:5pt 6pt;border-bottom:.75pt solid #e6ecf3;vertical-align:top}.tb .sub{color:#5e6d82;font-weight:400;font-size:.88em;margin-top:2pt}
body.apresentando{background:#000;overflow:hidden}body.apresentando .barra{display:none}body.apresentando .deck{padding:0;gap:0;height:100vh;justify-content:center}
body.apresentando .vaga{display:none}body.apresentando .vaga.atual{display:block}body.apresentando .sl{box-shadow:none}
@media print{@page{size:13.333in 7.5in;margin:0}body{background:#fff}.barra{display:none}.deck{display:block;padding:0}.vaga{width:1280px;height:720px;break-after:page;page-break-after:always}.vaga:last-child{break-after:auto}.sl{transform:none;box-shadow:none}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<div class="barra"><button id="bVoltar">Voltar ao mapa</button><span class="esp"></span><span id="msg"></span><button id="bApresentar">Apresentar</button><button id="bPptx">Baixar PowerPoint</button><button id="bPdf" class="pri">Salvar PDF</button></div>
<main class="deck" id="deck">
${corpo}
</main>
<script type="application/json" id="modelo">${json({ slides: modelo.slides.map(sl => ({ secao: sl.secao, els: sl.els })), nome, numero })}</script>
<script>
(function(){
  var SRV=${json(SRV)}, BASE=${json(base)}, MODELO=JSON.parse(document.getElementById('modelo').textContent);
  var deck=document.getElementById('deck'), vagas=[].slice.call(document.querySelectorAll('.vaga')), msg=document.getElementById('msg'), atual=0;
  var esc=function(t){return String(t==null?'':t).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})};
  function escala(){var k;if(document.body.classList.contains('apresentando'))k=Math.min(innerWidth/1280,innerHeight/720);else k=Math.min(1,(document.documentElement.clientWidth-40)/1280);deck.style.setProperty('--k',k.toFixed(4))}
  addEventListener('resize',escala);escala();
  document.getElementById('bVoltar').onclick=function(){if(window.opener&&!window.opener.closed){window.close();if(!window.closed)window.opener.focus()}else location.href=BASE+'index.html'};
  /* modo apresentação: tela cheia, setas, espaço ou clique avançam; Esc sai */
  function mostrar(i){atual=Math.max(0,Math.min(vagas.length-1,i));vagas.forEach(function(v,k){v.classList.toggle('atual',k===atual)})}
  function sair(){document.body.classList.remove('apresentando');escala();vagas[atual].scrollIntoView({block:'center'})}
  document.getElementById('bApresentar').onclick=function(){var y=scrollY,a=0;vagas.forEach(function(v,k){if(v.offsetTop<=y+innerHeight/3)a=k});document.body.classList.add('apresentando');mostrar(a);escala();var e=document.documentElement;if(e.requestFullscreen)e.requestFullscreen().catch(function(){})};
  document.addEventListener('fullscreenchange',function(){if(!document.fullscreenElement&&document.body.classList.contains('apresentando'))sair()});
  document.addEventListener('keydown',function(e){if(!document.body.classList.contains('apresentando'))return;if(['ArrowRight','ArrowDown','PageDown',' ','Enter'].indexOf(e.key)>=0){e.preventDefault();mostrar(atual+1)}else if(['ArrowLeft','ArrowUp','PageUp','Backspace'].indexOf(e.key)>=0){e.preventDefault();mostrar(atual-1)}else if(e.key==='Escape'){if(!document.fullscreenElement)sair()}else if(e.key==='Home')mostrar(0);else if(e.key==='End')mostrar(vagas.length-1)});
  deck.addEventListener('click',function(e){if(document.body.classList.contains('apresentando'))mostrar(atual+(e.clientX<innerWidth/4?-1:1))});
  function postar(rota,dados){return fetch(SRV+rota,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(dados)}).then(function(r){return r.json().then(function(j){if(!r.ok||!j.ok)throw new Error(j.erro||('HTTP '+r.status));return j})})}
  function pronto(j,tipo){msg.innerHTML=(j.aberto?tipo+' aberto e salvo em ':tipo+' salvo em ')+'<b>'+esc(j.arquivo)+'</b> · <a href="'+SRV+j.url.slice(1)+'">baixar uma cópia</a>'}
  /* PDF pelo servidor local (Edge/Chrome do computador), uma página por slide */
  var bPdf=document.getElementById('bPdf');
  bPdf.onclick=function(){
    var c=document.documentElement.cloneNode(true);c.querySelectorAll('script,.barra').forEach(function(x){x.remove()});c.querySelector('body').classList.remove('apresentando');
    bPdf.disabled=true;bPdf.textContent='Gerando PDF…';msg.textContent='Leva de 10 a 30 segundos.';
    postar('api/pdf',{html:'<!doctype html>'+c.outerHTML,nome:MODELO.nome}).then(function(j){pronto(j,'PDF')})
      .catch(function(e){msg.innerHTML='Não consegui gerar o PDF pelo servidor local ('+esc(e.message)+'). Abrindo a impressão: escolha <b>Salvar como PDF</b> e o tamanho de página <b>paisagem</b>.';setTimeout(function(){print()},300)})
      .then(function(){bPdf.disabled=false;bPdf.textContent='Salvar PDF'});
  };
  /* PowerPoint editável: o mesmo modelo, caixa por caixa */
  var bPptx=document.getElementById('bPptx');
  function carregarPptx(){return new Promise(function(ok,falha){if(window.PptxGenJS)return ok();var s=document.createElement('script');s.src=BASE+'lib/pptxgen.bundle.js';s.onload=function(){ok()};s.onerror=function(){falha(new Error('biblioteca do PowerPoint não carregou'))};document.head.appendChild(s)})}
  var hex=function(c){return String(c||'#0d1b2e').replace('#','').slice(0,6).toUpperCase()};
  function texto(sl,el){
    var runs=[];
    el.p.forEach(function(p,pi){
      var linhas=[[]];p.r.forEach(function(r){if(r.quebra)linhas.push([]);else linhas[linhas.length-1].push(r)});
      linhas.forEach(function(l,li){l.forEach(function(r,ri){
        var o={bold:r.b!=null?!!r.b:!!el.b,color:hex(r.c||el.c),fontSize:r.z||el.z,fontFace:(r.f||el.f)==='serif'?'Georgia':'Segoe UI',italic:!!r.i};
        if(ri===0){o.align=p.al||el.al;if(p.esp&&li===linhas.length-1)o.paraSpaceAfter=p.esp;if(p.bullet&&li===0)o.bullet={code:p.bullet==='+'?'002B':p.bullet==='−'?'2212':'2022',indent:13}}
        runs.push({text:r.s,options:o})});
        if((li<linhas.length-1||pi<el.p.length-1)&&runs.length)runs[runs.length-1].options.breakLine=true});
    });
    sl.addText(runs,{x:el.x,y:el.y,w:el.w,h:el.h,margin:0,valign:el.v,lineSpacingMultiple:el.lh,fit:'shrink'});
  }
  function tabela(sl,el){
    var borda=function(cab){return[{type:'none'},{type:'none'},{type:'solid',pt:cab?1:.75,color:cab?'D3DCE8':'E6ECF3'},{type:'none'}]};
    var celula=function(c,cab){var t=[{text:c.s,options:{bold:cab||!!c.b,color:hex(cab?'#5e6d82':c.c),fontSize:cab?el.z*.92:el.z,breakLine:!!c.sub}}];if(c.sub)t.push({text:c.sub,options:{color:'5E6D82',fontSize:el.z*.88}});return{text:t,options:{align:c.al||'left',valign:'top',border:borda(cab),margin:[3,5,3,5]}}};
    var rows=[el.cab.map(function(c){return celula(c,true)})].concat(el.linhas.map(function(l){return l.map(function(c){return celula(c,false)})}));
    sl.addTable(rows,{x:el.x,y:el.y,w:el.w,colW:el.cols.map(function(w){return w*el.w/el.cols.reduce(function(a,b){return a+b},0)}),fontFace:'Segoe UI',fontSize:el.z,color:'0D1B2E',autoPage:false});
  }
  bPptx.onclick=function(){
    bPptx.disabled=true;bPptx.textContent='Gerando PowerPoint…';msg.textContent='';
    var nomeArq=MODELO.nome;
    carregarPptx().then(function(){
      var p=new PptxGenJS();p.layout='LAYOUT_WIDE';p.author='VIP ANALYSIS · Vip Air';p.title=MODELO.nome;
      MODELO.slides.forEach(function(m){var sl=p.addSlide();sl.background={color:'FFFFFF'};
        m.els.forEach(function(el){
          if(el.t==='txt')texto(sl,el);
          else if(el.t==='img'){var im=document.querySelector('img[data-k="'+el.k+'"]');if(im)sl.addImage({data:im.src.replace(/^data:/,''),x:el.x,y:el.y,w:el.w,h:el.h})}
          else if(el.t==='ret'){var o={x:el.x,y:el.y,w:el.w,h:el.h,fill:el.fill?{color:hex(el.fill)}:{type:'none'},line:el.linha?{color:hex(el.linha),width:el.lw}:{type:'none'}};if(el.raio&&!el.elipse)o.rectRadius=Math.min(el.raio,Math.min(el.w,el.h)/2);sl.addShape(el.elipse?p.ShapeType.ellipse:el.raio?p.ShapeType.roundRect:p.ShapeType.rect,o)}
          else if(el.t==='tab')tabela(sl,el)})});
      return p.write({outputType:'base64'}).then(function(b64){
        return postar('api/arquivo',{base64:b64,nome:nomeArq,ext:'pptx'}).then(function(j){pronto(j,'PowerPoint')})
          .catch(function(){return p.writeFile({fileName:nomeArq+'.pptx'}).then(function(){msg.textContent='PowerPoint baixado pelo navegador (pasta Downloads).'})})});
    }).catch(function(e){msg.textContent='Não consegui gerar o PowerPoint: '+e.message})
      .then(function(){bPptx.disabled=false;bPptx.textContent='Baixar PowerPoint'});
  };
})();
</script></body></html>`;
  };
})();
