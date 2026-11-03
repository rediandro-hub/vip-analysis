/* VIP ANALYSIS — testes de segurança (abra http://localhost:8766/testes.html).
   Princípio verificado: falha, lista parcial ou base ausente nunca viram "nada encontrado".
   As fontes são simuladas: nenhum teste depende da internet. */
'use strict';

(function () {
  const VA = window.VA;
  const casos = [];
  const teste = (id, nome, fn) => casos.push({ id, nome, fn });

  /* ---------------- fábrica de cenários ---------------- */
  const AOI = turf.polygon([[[-40.52, -9.40], [-40.50, -9.40], [-40.50, -9.38], [-40.52, -9.38], [-40.52, -9.40]]]);
  const CENTRO = [-40.51, -9.39];
  const quadrado = (lon, lat, d) => turf.polygon([[[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]]);

  /* resultado de uma camada; o motor calcula completude e origem como na análise real */
  function res(id, o = {}) {
    const c = VA.camada(id) || { id, nome: id, setor: 'mineracao', fonte: 'teste' };
    const r = Object.assign({ camada: c, status: 'fora', itens: [], consultas: [{ url: 'https://teste.local/' + id, n: 0 }], dados: {}, resumo: 'nenhum registro', raioKm: 1, consultadoEm: new Date().toISOString() }, o);
    if (r.status === 'falha' && !r.erro) r.erro = 'o servidor do órgão não respondeu';
    VA.completude(r);
    return r;
  }
  const item = (titulo, o = {}) => Object.assign({ titulo, subtitulo: '', incide: true, distancia_km: 0, sobreposicao_ha: 1, atributos: [], props: {}, feature: null }, o);

  /* análise sintética: todas as fontes críticas e importantes da finalidade respondendo vazias, mais uma secundária */
  function analise(finalidade, mod = {}) {
    const ids = [...new Set([...(VA.CRITICAS[finalidade] || VA.CRITICAS.geral), ...(VA.IMPORTANTES[finalidade] || []), 'sgb_ocorr', 'anm_quilombo', 'anm_assent'])].filter(id => VA.camada(id));
    const resultados = {};
    ids.forEach(id => { resultados[id] = res(id, mod[id] || {}); });
    Object.keys(mod).filter(id => !resultados[id] && VA.camada(id)).forEach(id => { resultados[id] = res(id, mod[id]); });
    const ordem = Object.keys(resultados);
    let n = 0; ordem.forEach(id => resultados[id].itens.forEach(it => { it.evid = 'E' + (++n); }));
    const params = { finalidade, setores: { referencia: false, energia: true, mineracao: true, fundiario: true, ambiental: true }, raioEnergiaKm: 10, raioAnmKm: 5, raioOcorrenciasKm: 10, raioAmbientalKm: 10, raioAlvoKm: 10, reqSubstancia: 'ouro', requerimento: finalidade === 'mineracao' };
    return { ctx: { aoi: AOI, centro: CENTRO, uf: 'PE', municipio: { municipio: 'Teste', uf: 'PE' }, composicao: null }, resultados, ordem, inicio: new Date(), fim: new Date(), params };
  }

  /* ---------------- verificação ---------------- */
  function conferir(lista) {
    return (rot, cond, det) => { lista.push({ rot, ok: !!cond, det }); return !!cond; };
  }

  /* ======================= síntese por suficiência de decisão ======================= */
  teste('T01', 'ANM sem resposta: o parecer fica inconclusivo, nunca verde', ok => {
    const a = analise('mineracao', { anm_proc: { status: 'falha' } });
    const av = VA.avaliar(a, 'mineracao');
    ok('classe da síntese = inconclusivo', av.sintese.classe === 'inconclusivo', av.sintese.classe);
    ok('texto cita a fonte pendente', /inconclusivo/i.test(av.sintese.texto) && /miner/i.test(av.sintese.texto), av.sintese.texto);
    ok('cobertura marca a ANM como "sem resposta"', av.sintese.cobertura.pendentes.some(x => x.id === 'anm_proc' && x.estado === 'falhou'));
    ok('há próxima ação', !!av.sintese.proximaAcao, av.sintese.proximaAcao);
    ok('nenhum achado "sem processo minerário ativo"', !av.achados.some(x => /sem processo miner/i.test(x.titulo + ' ' + x.texto)));
  });

  teste('T02', 'ANM com lista parcial (limite de registros): não comprova ausência', ok => {
    const a = analise('mineracao', { anm_proc: { dados: { truncado: true } } });
    const av = VA.avaliar(a, 'mineracao');
    ok('completude da ANM = parcial', a.resultados.anm_proc.completude === 'parcial', a.resultados.anm_proc.completude);
    ok('motivo registrado', /limitou/.test(a.resultados.anm_proc.motivosParcial.join(' ')), a.resultados.anm_proc.motivosParcial.join('; '));
    ok('classe da síntese = inconclusivo', av.sintese.classe === 'inconclusivo', av.sintese.classe);
    ok('nenhum achado "sem processo minerário ativo"', !av.achados.some(x => /sem processo miner/i.test(x.titulo + ' ' + x.texto)));
    ok('lacuna de lista parcial registrada', av.achados.some(x => /parcial/i.test(x.titulo + ' ' + x.texto)));
  });

  teste('T03', 'FUNAI sem resposta: inconclusivo', ok => {
    const av = VA.avaliar(analise('mineracao', { funai_ti: { status: 'falha' } }), 'mineracao');
    ok('classe = inconclusivo', av.sintese.classe === 'inconclusivo', av.sintese.classe);
    ok('FUNAI listada como pendente', av.sintese.cobertura.pendentes.some(x => x.id === 'funai_ti'));
  });

  teste('T04', 'CNUC sem resposta: inconclusivo também no requerimento', ok => {
    const a = analise('mineracao', { cnuc: { status: 'falha' } });
    const av = VA.avaliar(a, 'mineracao'), Q = VA.avaliarRequerimento(a, AOI, a.params);
    ok('síntese = inconclusivo', av.sintese.classe === 'inconclusivo', av.sintese.classe);
    ok('requerimento = inconclusivo', Q.classe === 'inconclusivo', Q.classe + ' — ' + Q.texto);
    ok('requerimento nunca diz "Pode requerer"', !/^Pode requerer/.test(Q.texto), Q.texto);
  });

  teste('T05', 'Todas as fontes críticas verificadas e vazias: conclusão positiva com a ressalva certa', ok => {
    const a = analise('mineracao');
    const av = VA.avaliar(a, 'mineracao');
    ok('cobertura completa', av.sintese.cobertura.completa, av.sintese.cobertura.pendentes.map(x => x.id).join(', '));
    ok('classe não é inconclusivo', av.sintese.classe !== 'inconclusivo', av.sintese.classe);
    ok('texto restrito às fontes consultadas com sucesso', av.sintese.classe !== 'oportunidade' || /consultadas com sucesso/.test(av.sintese.texto), av.sintese.texto);
    const Q = VA.avaliarRequerimento(a, AOI, a.params);
    ok('área livre confirmada', Q.livre && Q.livre.status === 'confirmada', Q.livre && Q.livre.status);
    ok('poligonal gerada', !!Q.poligonal);
  });

  teste('T06', 'Só uma fonte secundária falhou: conclui, com ressalva', ok => {
    const av = VA.avaliar(analise('mineracao', { sgb_ocorr: { status: 'falha' } }), 'mineracao');
    ok('classe não é inconclusivo', av.sintese.classe !== 'inconclusivo', av.sintese.classe);
    ok('texto traz a ressalva da secundária', /secundária/.test(av.sintese.texto), av.sintese.texto);
  });

  teste('T06b', 'Impeditivo encontrado com fonte crítica pendente: impeditivo, citando a pendência', ok => {
    const ti = item('TI Teste', { feature: quadrado(-40.51, -9.39, 0.004), props: { terrai_nome: 'TI Teste', fase_ti: 'Regularizada' } });
    const av = VA.avaliar(analise('mineracao', { funai_ti: { status: 'dentro', itens: [ti] }, cnuc: { status: 'falha' } }), 'mineracao');
    ok('classe = impeditivo', av.sintese.classe === 'impeditivo', av.sintese.classe);
    ok('texto menciona a fonte crítica sem verificação', /sem verificação/.test(av.sintese.texto), av.sintese.texto);
  });

  /* ======================= área livre do requerimento ======================= */
  teste('T07', 'Bloqueio da ANM sem resposta: área livre só potencial, sem poligonal', ok => {
    const a = analise('mineracao', { anm_bloq: { status: 'falha' } });
    const Q = VA.avaliarRequerimento(a, AOI, a.params), LI = VA.livreInfo(Q);
    ok('status da área livre = potencial', Q.livre.status === 'potencial', Q.livre.status);
    ok('rótulo diz "não definitiva"', /não definitiva/.test(LI.rotulo), LI.rotulo);
    ok('pendência nomeada', Q.livre.pendentes.some(x => x.id === 'anm_bloq'));
    ok('poligonal não gerada', !Q.poligonal);
    ok('motivo da poligonal bloqueada', /não foi confirmada/.test(Q.poligonalBloqueada || ''), Q.poligonalBloqueada);
    ok('veredito inconclusivo', Q.classe === 'inconclusivo', Q.texto);
    ok('item "Sem resposta" no checklist', Q.itens.some(i => i.situacao === 'sem_dados'));
  });

  teste('T08', 'Recorte geométrico falha: área livre indeterminada, nunca "toda livre"', ok => {
    const proc = item('Processo 800.000/2024', { feature: quadrado(-40.505, -9.385, 0.004), props: { PROCESSO: '800.000/2024', FASE: 'AUTORIZAÇÃO DE PESQUISA', NOME: 'Terceiro' }, fase: 'Autorização de pesquisa' });
    const a = analise('mineracao', { anm_proc: { status: 'dentro', itens: [proc] } });
    const orig = turf.difference;
    turf.difference = () => { throw new Error('geometria inválida (simulada)'); };
    let Q; try { Q = VA.avaliarRequerimento(a, AOI, a.params); } finally { turf.difference = orig; }
    const LI = VA.livreInfo(Q);
    ok('status = indeterminada', Q.livre.status === 'indeterminada', Q.livre.status);
    ok('área livre sem número (null)', Q.livre.ha === null, String(Q.livre.ha));
    ok('rótulo "não calculada"', /não calculada/.test(LI.rotulo), LI.rotulo);
    ok('veredito inconclusivo', Q.classe === 'inconclusivo', Q.texto);
    ok('erro registrado no checklist', Q.itens.some(i => /Cálculo da área livre/.test(i.criterio)));
    ok('sem poligonal', !Q.poligonal);
  });

  /* ======================= favorabilidade: disponibilidade na janela ======================= */
  /* fontes simuladas da janela: ocorrências de ouro, uma unidade geológica 1:25.000, pintas em bateia */
  async function favorab(cenario) {
    const orig = { q: VA.ags.query, i: VA.ags.identify, c: VA.consultarCamada, o: VA.Net.obter };
    const FC = f => ({ type: 'FeatureCollection', features: f || [] });
    const pt = (lon, lat, props) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: props });
    VA.ags.query = async (url, o) => {
      if (/ocorrencias\/MapServer\/0/.test(url)) return FC([pt(-40.512, -9.392, { SUBSTANCIAS: 'Ouro', STATUS_ECONOMICO: 'Garimpo', TOPONIMIA: 'Garimpo Teste' }), pt(-40.45, -9.33, { SUBSTANCIAS: 'Ouro', STATUS_ECONOMICO: 'Mina', TOPONIMIA: 'Mina Teste' })]);
      if (/dados_anm\/MapServer\/0/.test(url)) {
        if (cenario.anm === 'falha') throw new Error('geo.anm.gov.br respondeu HTTP 500');
        const fc = FC(cenario.processos || []); if (cenario.anm === 'parcial') fc._truncado = true; return fc;
      }
      if (/litoestratigrafia_25000/.test(url)) { const b = o.bbox; return FC([Object.assign(turf.bboxPolygon(b), { properties: { SIGLA: 'XT', NOME: 'Unidade Xisto Teste', LITOTIPOS: 'Xisto, Quartzito, Formação ferrífera', HIERARQUIA: 'Formação', IDADE_MIN: 'Paleoproterozoico', IDADE_MAX: 'Arqueano' } })]); }
      return FC();
    };
    VA.ags.identify = async (url, o) => {
      if (o.layers === 'all:14') return FC([pt(-40.513, -9.391, { latitude: '-9.391', longitude: '-40.513', quantidade: '3' }), pt(-40.52, -9.37, { latitude: '-9.37', longitude: '-40.52' }), pt(-40.49, -9.36, { latitude: '-9.36', longitude: '-40.49', quantidade: '0' })]);
      return FC();
    };
    VA.consultarCamada = async (c) => {
      if (cenario.restricaoFalha === c.id) throw new Error('WFS sem resposta (simulado)');
      if (cenario.restricoes && cenario.restricoes[c.id]) return FC(cenario.restricoes[c.id]);
      return FC();
    };
    VA.Net.obter = async () => { throw new Error('sem imagem no teste'); };
    try { return await VA.favorabilidade(AOI, analise('mineracao'), { alvoAtivo: 'Ouro', raioAlvoKm: 10 }); }
    finally { VA.ags.query = orig.q; VA.ags.identify = orig.i; VA.consultarCamada = orig.c; VA.Net.obter = orig.o; }
  }
  const temClasse = (F, v) => F.grade && Array.prototype.some.call(F.grade.disp, x => x === v);

  teste('T14', 'Consulta ANM da janela falha: nenhum alvo vira "Novo requerimento possível"', async ok => {
    const F = await favorab({ anm: 'falha' });
    ok('há alvos para o teste ser válido', F.alvos && F.alvos.length > 0, F.alvos && F.alvos.length);
    ok('nenhum "Novo requerimento possível"', !F.alvos.some(a => a.categoria === 'Novo requerimento possível'), [...new Set(F.alvos.map(a => a.categoria))].join(', '));
    ok('alvos sem processo conhecido = "Disponibilidade não verificada"', F.alvos.every(a => a.categoria !== 'Novo requerimento possível' && (a.processo || a.categoria !== 'Novo requerimento possível')) && F.alvos.some(a => a.categoria === 'Disponibilidade não verificada'));
    ok('disponibilidade.verificada = false', F.disponibilidade.verificada === false);
    ok('aviso exato', F.disponibilidade.aviso === 'Disponibilidade não verificada: a consulta ANM desta janela não foi concluída. A favorabilidade apresentada não comprova disponibilidade para requerimento.', F.disponibilidade.aviso);
    ok('mapa de disponibilidade com classe "não verificada"', temClasse(F, 6) && !temClasse(F, 0));
    ok('nenhum alvo marcado como livre', F.alvos.every(a => !a.livre));
  });

  teste('T14b', 'ANM da janela com lista parcial: disponibilidade não verificada', async ok => {
    const F = await favorab({ anm: 'parcial' });
    ok('verificada = false', F.disponibilidade.verificada === false);
    ok('pendência descreve lista parcial', F.disponibilidade.pendentes.some(x => /parcial/.test(x.como)));
    ok('nenhum "Novo requerimento possível"', !F.alvos.some(a => a.categoria === 'Novo requerimento possível'));
  });

  teste('T14c', 'Terra indígena da janela sem resposta: disponibilidade não verificada', async ok => {
    const F = await favorab({ restricaoFalha: 'funai_ti' });
    ok('verificada = false', F.disponibilidade.verificada === false);
    ok('FUNAI listada como pendente', F.disponibilidade.pendentes.some(x => x.id === 'funai_ti'));
    ok('erro visível', F.erros.some(e => /janela/.test(e)), F.erros.join('; '));
  });

  teste('T14d', 'Terra indígena fora do raio da análise, mas dentro da janela: alvo restrito', async ok => {
    const ti = Object.assign(quadrado(-40.512, -9.392, 0.02), { properties: { terrai_nome: 'TI Distante', fase_ti: 'Regularizada' } });
    const F = await favorab({ restricoes: { funai_ti: [ti] } });
    ok('verificada = true (todas responderam)', F.disponibilidade.verificada === true);
    ok('alvo sobre a TI = "Restrito"', F.alvos.some(a => a.categoria === 'Restrito'), F.alvos.map(a => a.id + ':' + a.categoria).join(', '));
    ok('mapa com classe restrita', temClasse(F, 5));
  });

  teste('T14e', 'Controle: tudo respondeu e nada ocupa a janela', async ok => {
    const F = await favorab({});
    ok('verificada = true', F.disponibilidade.verificada === true);
    ok('há "Novo requerimento possível"', F.alvos.some(a => a.categoria === 'Novo requerimento possível'), [...new Set(F.alvos.map(a => a.categoria))].join(', '));
    ok('zona do alvo informada', F.alvos.every(a => a.zona && a.zona.livre_pct >= 0));
  });

  teste('T16', 'Pintas de ouro: lê "quantidade" e descarta registro sem contagem', async ok => {
    const F = await favorab({});
    const g = F.geoquimica || {};
    ok('só a amostra com 3 pintas entra (sem contagem e zero ficam de fora)', g.pintas === 1, String(g.pintas));
  });

  /* ======================= origem dos dados e cache ======================= */
  teste('T17', 'Cache do servidor local: ANM sempre ao vivo; idade do cache registrada', async ok => {
    const base = VA.Net.proxy.base;
    VA.Net.proxy.base = '';
    ok('ANM vai com fresco=1', /&fresco=1$/.test(VA.Net.urlProxy('https://geo.anm.gov.br/arcgis/rest/services/SIGMINE/dados_anm/MapServer/0/query?f=json')));
    ok('SGB pode usar cache', !/fresco/.test(VA.Net.urlProxy('https://geoportal.sgb.gov.br/server/rest/services/x/MapServer/0/query?f=json')));
    const orig = { f: VA.Net._fetchComTempo, p: Object.assign({}, VA.Net.proxy) };
    VA.Net.proxy = { ok: true, base: '' };
    VA.Net._fetchComTempo = async () => new Response('{"type":"FeatureCollection","features":[]}', { status: 200, headers: { 'Content-Type': 'application/json', 'X-VIP-Origem': 'cache', 'X-VIP-Idade': '7200' } });
    const url = 'https://teste.local/cache-' + Date.now();
    try { await VA.Net.obter(url, { cors: 'proxy' }); } finally { VA.Net._fetchComTempo = orig.f; VA.Net.proxy = orig.p; VA.Net.proxy.base = base; }
    const o = VA.Net.origemDe(url);
    ok('origem marcada como cache', o && o.cache === true, JSON.stringify(o));
    ok('idade do cache = 2 h', o && o.idadeS === 7200);
    const r = res('sgb_ocorr', { consultas: [{ url, n: 0 }] });
    ok('resultado da camada carrega a origem', r.origemDados && r.origemDados.cache && r.origemDados.idadeS === 7200, JSON.stringify(r.origemDados));
  });

  /* ======================= pacote de evidências (JSON) ======================= */
  teste('T18', 'Pacote JSON preserva completude, cobertura e status da área livre', ok => {
    const a = analise('mineracao', { anm_bloq: { status: 'falha' }, anm_proc: { dados: { truncado: true } } });
    a.requerimento = VA.avaliarRequerimento(a, AOI, a.params);
    const av = VA.avaliar(a, 'mineracao');
    const P = VA.pacoteEvidencias({ aoi: AOI, analise: a, avaliacao: av, finalidade: 'mineracao', origem: 'teste', municipios: [] });
    const f = id => P.fontes.find(x => x.id === id) || {};
    ok('completude por fonte', f('anm_proc').completude === 'parcial' && f('anm_bloq').completude === 'falhou', `${f('anm_proc').completude} / ${f('anm_bloq').completude}`);
    ok('motivos da lista parcial', (f('anm_proc').motivos_parcial || []).length > 0);
    ok('decisão não conclusiva', P.decisao && P.decisao.conclusiva === false && P.decisao.classe === 'inconclusivo', JSON.stringify(P.decisao && { c: P.decisao.classe, k: P.decisao.conclusiva }));
    ok('fontes críticas com estado', P.decisao.fontes_criticas.some(x => x.id === 'anm_bloq' && x.estado === 'falhou'));
    ok('status da área livre = potencial', P.requerimento.livre_status === 'potencial', P.requerimento.livre_status);
    ok('poligonal bloqueada explicada', !!P.requerimento.poligonal_bloqueada);
    ok('JSON serializável', (() => { try { JSON.stringify(P); return true; } catch (e) { return false; } })());
  });

  /* ---------------- execução ---------------- */
  async function rodar() {
    const lista = document.getElementById('lista'), resumo = document.getElementById('resumo');
    let passou = 0;
    const saida = [];
    for (const c of casos) {
      const ver = [];
      let erro = null;
      try { await c.fn(conferir(ver)); } catch (e) { erro = e; }
      const ok = !erro && ver.length && ver.every(v => v.ok);
      if (ok) passou++;
      saida.push({ id: c.id, nome: c.nome, ok, verificacoes: ver, erro: erro ? String(erro.stack || erro) : null });
      const div = document.createElement('div');
      div.className = 'teste ' + (ok ? 'ok' : 'falha');
      const esc = t => String(t == null ? '' : t).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
      div.innerHTML = `<div class="cab"><span class="id">${c.id}</span><span>${esc(c.nome)}</span><span class="res">${ok ? 'passou' : 'falhou'}</span></div>
        <ul>${ver.map(v => `<li class="${v.ok ? 'v' : 'x'}">${esc(v.rot)}${!v.ok && v.det != null ? ` — obtido: ${esc(v.det)}` : ''}</li>`).join('')}</ul>${erro ? `<pre>${esc(erro.stack || erro)}</pre>` : ''}`;
      lista.appendChild(div);
    }
    resumo.textContent = `${passou} de ${casos.length} testes passaram`;
    resumo.className = passou === casos.length ? 'ok' : 'falha';
    window.RESULTADO_TESTES = { total: casos.length, passou, casos: saida };
  }
  window.addEventListener('load', () => { rodar(); });
})();
