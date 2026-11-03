/* VIP ANALYSIS — motor de regras: transforma os resultados das fontes em achados rastreáveis
   e no quadro "dentro / fora" por setor. Cada achado cita as evidências (E#) e o grau de certeza. */
'use strict';

(function () {
  const VA = window.VA;
  const N = s => VA.fmt.norm(s);

  VA.FINALIDADES = {
    mineracao: 'Pesquisa / lavra mineral',
    solar: 'Usina solar / geração de energia',
    terra: 'Aquisição ou arrendamento de terra',
    geral: 'Due diligence territorial geral'
  };
  VA.NIVEIS = {
    impeditivo: { rotulo: 'Impeditivo', ordem: 0 }, alerta: { rotulo: 'Alerta', ordem: 1 }, atencao: { rotulo: 'Atenção', ordem: 2 },
    oportunidade: { rotulo: 'Oportunidade', ordem: 3 }, informativo: { rotulo: 'Informativo', ordem: 4 }, lacuna: { rotulo: 'Lacuna de dados', ordem: 5 }
  };
  const CERTEZA = { oficial: 'Comprovado na fonte oficial consultada', indicio: 'Indício — requer verificação técnica', heuristica: 'Critério de triagem (ajustável)', ausencia: 'Ausência de registro (não prova inexistência)', pendente: 'Não verificado' };
  VA.CERTEZA = CERTEZA;

  const PISTAS = [
    [/pegmat/, 'pegmatitos — ambiente de gemas (turmalina, berilo/água-marinha), lítio, tântalo, feldspato e mica'],
    [/aluvi|cascalh|terraco/, 'depósitos aluvionares — possíveis concentrações secundárias (ouro, gemas, minerais pesados)'],
    [/kimberl|lamproit/, 'kimberlito/lamproíto — fonte primária potencial de diamante'],
    [/ferrifer|itabir|formacao ferr/, 'formação ferrífera — potencial para ferro'],
    [/calcari|marmore/, 'calcário/mármore — cal, cimento ou rocha ornamental'],
    [/quartzit/, 'quartzito — uso industrial e ornamental'],
    [/granit/, 'granitoides — potencial para rocha ornamental']
  ];

  /* ---------------- fontes críticas por decisão ----------------
     Uma fonte crítica que não respondeu, veio parcial (truncada) ou não tem base instalada impede conclusão positiva,
     qualquer que seja o percentual geral de sucesso. As "importantes" ficam como pendência declarada, sem travar
     (ex.: SIGEF/SNCI, cujo download em lote o INCRA tirou do ar). */
  VA.CRITICAS = {
    mineracao: ['anm_proc', 'anm_estoque', 'anm_bloq', 'anm_militar', 'funai_ti', 'cnuc'],
    solar: ['funai_ti', 'cnuc', 'sigel_parque', 'sigel_dup', 'anm_proc'],
    terra: ['car', 'funai_ti', 'anm_quilombo', 'anm_assent', 'cnuc', 'icmbio_embargos'],
    geral: ['anm_proc', 'funai_ti', 'cnuc', 'car']
  };
  VA.IMPORTANTES = { terra: ['sigef', 'snci'], geral: ['sigef', 'snci'] };
  const ESTADO_FONTE = { completo: 'verificada', parcial: 'parcial', falhou: 'sem resposta', sem_base: 'base não instalada' };
  VA.coberturaCritica = function (analise, finalidade) {
    const R = analise.resultados || {};
    const linha = (id, critica) => {
      const r = R[id], c = VA.camada(id);
      if (!r) return { id, nome: c ? c.nome : id, critica, estado: 'nao_consultada', rotulo: 'não consultada (setor desligado)', motivo: 'o setor desta fonte foi desligado na análise' };
      const comp = r.completude || (['falha', 'sem_base'].includes(r.status) ? (r.status === 'falha' ? 'falhou' : 'sem_base') : 'completo');
      return { id, nome: r.camada.nome, critica, estado: comp, rotulo: ESTADO_FONTE[comp] || comp, motivo: (r.motivosParcial || []).join('; '), cache: r.origemDados && r.origemDados.cache ? r.origemDados.idadeS : null };
    };
    const criticas = (VA.CRITICAS[finalidade] || VA.CRITICAS.geral).map(id => linha(id, true));
    const importantes = (VA.IMPORTANTES[finalidade] || []).map(id => linha(id, false));
    const pendentes = criticas.filter(x => x.estado !== 'completo');
    return { criticas, importantes, pendentes, importantesPendentes: importantes.filter(x => x.estado !== 'completo'), completa: !pendentes.length };
  };
  /* o que fazer quando uma base local não está instalada */
  const INSTRUCAO_SEM_BASE = r => {
    const q = r.camada.q || {};
    if (q.tipo === 'bdgd') return 'Instale a rede da distribuidora em Camadas › Rede de distribuição (BDGD da ANEEL): o servidor local baixa e converte a base uma vez.';
    if (q.tipo === 'local' && /sigef|snci/i.test(q.fonte || r.camada.id)) return 'Importe a base do INCRA desta UF em Camadas › Bases por estado (SIGEF/SNCI). O download em lote do INCRA saiu do ar em 29/10/2026: se não for possível, consulte as parcelas em sigef.incra.gov.br e registre a pendência.';
    return 'Instale a base local desta fonte pela aba Camadas e analise de novo.';
  };

  VA.avaliar = function (analise, finalidade) {
    const R = analise.resultados, P = analise.params;
    const achados = [];
    const add = (nivel, setor, titulo, texto, evid = [], certeza = CERTEZA.oficial) => { if (nivel) achados.push({ nivel, setor, titulo, texto, evidencias: evid.filter(Boolean), certeza }); };
    const ev = l => l.map(i => i.evid);
    const ok = id => R[id] && !['falha', 'sem_base'].includes(R[id].status);
    const dentro = id => ok(id) ? R[id].itens.filter(i => i.incide) : [];
    const perto = id => ok(id) ? R[id].itens.filter(i => !i.incide) : [];
    const nomes = (l, n = 4) => [...new Set(l.map(i => i.titulo))].slice(0, n).join('; ') + (new Set(l.map(i => i.titulo)).size > n ? '…' : '');

    /* lacunas */
    const falhas = Object.values(R).filter(r => r.status === 'falha');
    const porMotivo = {};
    falhas.forEach(r => { (porMotivo[r.motivo] = porMotivo[r.motivo] || []).push(r); });
    Object.entries(porMotivo).forEach(([m, l]) => {
      const lista = l.map(r => r.camada.nome).join('; ');
      const como = m === 'cors' ? 'Essas fontes só funcionam com o servidor local: abra a VIP ANALYSIS pelo iniciar.bat e mantenha a janela dele aberta.'
        : m === 'servidor' ? 'O servidor local parou durante a análise. Reabra o iniciar.bat e analise de novo.'
          : m === 'tempo' ? 'Os servidores dos órgãos demoraram a responder. Tente novamente em alguns minutos.'
            : 'O serviço do órgão respondeu com erro ou está fora do ar. Tente mais tarde ou confira no portal da fonte.';
      add('lacuna', 'geral', `${l.length} fonte(s) não consultada(s)`, `${lista}. ${como}`, [], CERTEZA.pendente);
    });
    Object.values(R).filter(r => r.status === 'sem_base').forEach(r => add('lacuna', r.camada.setor, `${r.camada.nome}: base local não instalada`, INSTRUCAO_SEM_BASE(r), [], CERTEZA.pendente));
    Object.values(R).filter(r => r.dados && r.dados.truncado).forEach(r => add('lacuna', r.camada.setor, `${r.camada.nome}: resultado truncado`, 'O servidor limitou o número de registros; reduza a área ou o raio para a lista completa.', [], CERTEZA.pendente));

    /* regras genéricas do catálogo */
    analise.ordem.forEach(id => {
      const r = R[id], c = r.camada, rg = c.regra;
      if (!rg || !ok(id)) return;
      const inc = dentro(id);
      if (inc.length && rg.incide && rg.incide[finalidade] && !['cnuc', 'ana_drenagem'].includes(id)) {
        /* área da união das partes dentro da área: polígonos coincidentes (ex.: PRODES de anos diferentes) não contam duas vezes */
        const area = r.dados && r.dados.uniaoHa != null ? r.dados.uniaoHa : VA.geo.uniaoSobreposicaoHa(analise.ctx.aoi, inc.map(i => i.feature).filter(Boolean));
        const porAno = r.dados && r.dados.porAno ? ` (por ano: ${Object.entries(r.dados.porAno).map(([a, h]) => `${a}: ${h != null ? VA.fmt.ha(h) : '—'}`).join('; ')})` : '';
        add(rg.incide[finalidade], c.setor, c.nome + ': incide na área', `${nomes(inc)}${area ? ` — ${VA.fmt.ha(area)} da área${porAno}` : ''}. ${rg.nota || ''}`, ev(inc));
      } else if (!inc.length && rg.proximo && rg.proximo[finalidade]) {
        const pr = perto(id).filter(i => i.distancia_km <= (rg.alcanceKm || r.raioKm));
        if (pr.length) add(rg.proximo[finalidade], c.setor, c.nome + ': próximo', `${nomes(pr, 3)} — mais próximo a ${VA.fmt.kmItem(pr[0])}. ${rg.nota || ''}`, ev(pr.slice(0, 5)));
      }
    });

    /* PANs (verificação única): quais planos abrangem a área; as áreas estratégicas vêm da camada fixa do ICMBio */
    if (ok('icm_pans') && (R.icm_pans.dados.abrangencia || []).length) {
      const l = R.icm_pans.dados.abrangencia, est = dentro('icmbio_pan');
      add('informativo', 'ambiental', 'Planos de Ação Nacional que abrangem a área', `${l.length} plano(s) para espécies ameaçadas: ${l.slice(0, 6).join('; ')}${l.length > 6 ? '…' : ''}. A abrangência mostra onde o plano atua; ${est.length ? 'a área também toca área estratégica (ver “Áreas estratégicas dos PAN”), onde o licenciamento costuma exigir medidas para as espécies.' : ok('icmbio_pan') ? 'nenhuma área estratégica dos planos incide na área, que é onde costumam estar as exigências concretas.' : 'as áreas estratégicas não puderam ser verificadas nesta emissão.'}`, R.icm_pans.itens.slice(0, 6).map(i => i.evid), CERTEZA.oficial);
    }

    /* ---------------- mineração ---------------- */
    if (ok('anm_proc')) {
      const its = R.anm_proc.itens, inc = its.filter(i => i.incide && !i.proprio), prop = its.filter(i => i.incide && i.proprio), viz = its.filter(i => !i.incide);
      const avanc = inc.filter(i => i.avancado), disp = inc.filter(i => i.disponivel), outros = inc.filter(i => !i.avancado && !i.disponivel);
      const lista = l => l.map(i => `${i.props.PROCESSO} (${(i.fase || '').toLowerCase()}, ${i.props.NOME || '—'})`).join('; ');
      if (prop.length) add('informativo', 'mineracao', 'Processo(s) do titular de interesse', lista(prop), ev(prop));
      if (finalidade === 'mineracao') {
        if (avanc.length) add('impeditivo', 'mineracao', 'Direito minerário avançado de terceiro', `${lista(avanc)}. Pela prioridade (Código de Mineração, art. 11), novo requerimento sobre a mesma área tende ao indeferimento; a via é negociação ou cessão.`, ev(avanc));
        if (outros.length) add('alerta', 'mineracao', 'Área onerada por requerimento/autorização de terceiro', `${lista(outros)}. Verifique prazos e possível caducidade no SDM da ANM (sdm.anm.gov.br).`, ev(outros));
        if (disp.length) add('oportunidade', 'mineracao', 'Área em disponibilidade na ANM', `${lista(disp)}. Ofertada em procedimento de disponibilidade, não por requerimento comum.`, ev(disp));
        if (!inc.length && !prop.length) {
          if (R.anm_proc.completude === 'completo') add('oportunidade', 'mineracao', 'Sem processo minerário ativo na área', 'Indício de área livre na data da consulta; confirme no momento do protocolo.', [], CERTEZA.ausencia);
          else add('lacuna', 'mineracao', 'Processos minerários: lista parcial', `${(R.anm_proc.motivosParcial || []).join('; ') || 'consulta incompleta'}. Não dá para afirmar que a área está sem processo.`, [], CERTEZA.pendente);
        }
      } else if (inc.length) {
        add(avanc.length ? 'alerta' : 'atencao', 'mineracao', 'Direito minerário de terceiro sobre a área', `${lista(inc)}.${finalidade === 'terra' ? ' O proprietário do solo tem direito à participação no resultado da lavra, mas não controla o direito minerário.' : ' Avalie acordo com o titular ou pedido de bloqueio de área junto à ANM.'}`, ev(inc));
      }
      if (viz.length) add('informativo', 'mineracao', 'Processos vizinhos', `${viz.length} processo(s) até ${VA.fmt.km(R.anm_proc.raioKm)}; o mais próximo é ${viz[0].props.PROCESSO} (${(viz[0].fase || '').toLowerCase()}, ${viz[0].props.SUBS || '—'}) a ${VA.fmt.km(viz[0].distancia_km)}.`, ev(viz.slice(0, 8)));
    }
    if (ok('sgb_ocorr') && R.sgb_ocorr.itens.length) {
      const r = R.sgb_ocorr, its = r.itens;
      const subs = Object.entries(r.dados.porSubst || {}).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([s, n]) => `${s} (${n})`).join(', ');
      add(finalidade === 'mineracao' ? 'oportunidade' : 'informativo', 'mineracao', 'Ocorrências minerais no entorno', `${its.length} ocorrência(s) no GEOBANK até ${VA.fmt.km(r.raioKm)}; a mais próxima a ${VA.fmt.km(its[0].distancia_km)}. Substâncias: ${subs}.`, ev(its.slice(0, 10)), CERTEZA.indicio);
    } else if (ok('sgb_ocorr') && finalidade === 'mineracao') add('informativo', 'mineracao', 'Sem ocorrências cadastradas no raio', 'A falta de registro reflete a cobertura dos levantamentos, não a ausência de mineralização.', [], CERTEZA.ausencia);
    if (ok('sgb_geo100') && R.sgb_geo100.dados.unidades && R.sgb_geo100.dados.unidades.length) {
      const us = R.sgb_geo100.dados.unidades, it = R.sgb_geo100.itens;
      add('informativo', 'mineracao', 'Geologia do local', `${us[0].nome} (${us[0].escala})${us[0].litotipos ? ': ' + us[0].litotipos : ''}.`, ev(it.slice(0, 1)));
      if (finalidade === 'mineracao') PISTAS.forEach(([re, txt]) => { const h = us.filter(u => re.test(u.texto)); if (h.length) add('oportunidade', 'mineracao', 'Pista geológica', `Unidade(s) com ${txt}: ${h.map(u => u.nome).slice(0, 3).join('; ')}.`, ev(it.slice(0, 2)), CERTEZA.indicio); });
      if (!us.some(u => /100\.000|250\.000/.test(u.escala))) add('atencao', 'mineracao', 'Geologia só em escala regional', `Melhor escala disponível: ${us[0].escala}. Decisão de pesquisa exige mapeamento de detalhe.`, [], CERTEZA.heuristica);
    }
    /* alvo específico da pesquisa (mineral, minério ou gema) */
    const A = analise.alvo;
    if (A && A.mineral && P.setores.mineracao) {
      const s = A.resumo || {}, m = A.mineral, raio = VA.fmt.km(A.raioKm);
      if (A.erros.length && !s.ocTotal && !s.procTotal) add('lacuna', 'mineracao', `Busca por ${m} incompleta`, A.erros.join('; ') + '.', [], CERTEZA.pendente);
      if (s.ocDentro) add('oportunidade', 'mineracao', `${m}: ocorrência cadastrada dentro da área`, `${s.ocDentro} registro(s) no GEOBANK dentro da área (${[...new Set(A.ocorrencias.filter(i => i.incide).map(i => i.props.STATUS_ECONOMICO).filter(Boolean))].join(', ') || 'status não informado'}).`, ev(A.ocorrencias.filter(i => i.incide).slice(0, 5)));
      else if (s.ocTotal) add(s.ocMin <= 2 ? 'oportunidade' : 'informativo', 'mineracao', `${m}: ocorrências no entorno`, `${s.ocTotal} ocorrência(s) até ${raio}; a mais próxima a ${VA.fmt.km(s.ocMin)} (${A.ocorrencias[0].titulo}${A.ocorrencias[0].props.STATUS_ECONOMICO ? ', ' + A.ocorrencias[0].props.STATUS_ECONOMICO.toLowerCase() : ''}). ${Object.entries(s.porStatus).map(([k, n]) => `${k}: ${n}`).join(' · ')}.`, ev(A.ocorrencias.slice(0, 6)), CERTEZA.indicio);
      else if (!A.erros.some(e => /GEOBANK/.test(e))) add('atencao', 'mineracao', `${m}: nenhuma ocorrência cadastrada até ${raio}`, 'O GEOBANK não registra o alvo no raio pesquisado. Reflete a cobertura dos levantamentos, não prova ausência; a geologia e a Bateia indicam se o ambiente é favorável.', [], CERTEZA.ausencia);
      const pd = A.processos.filter(i => i.incide && !i.proprio), pv = A.processos.filter(i => !i.incide);
      if (pd.length) add('alerta', 'mineracao', `${m}: área já requerida por terceiro para o mesmo bem`, pd.slice(0, 4).map(i => `${i.props.PROCESSO} (${(i.fase || '').toLowerCase()}, ${i.props.NOME || '—'})`).join('; ') + '.', ev(pd.slice(0, 6)));
      if (pv.length) add('informativo', 'mineracao', `${m}: processos ANM no entorno`, `${pv.length} processo(s) com ${m.toLowerCase()} até ${raio}; titulares: ${[...new Set(pv.map(i => i.props.NOME).filter(Boolean))].slice(0, 4).join('; ')}${new Set(pv.map(i => i.props.NOME)).size > 4 ? '…' : ''}. Indica interesse ativo pelo bem na região.`, ev(pv.slice(0, 6)));
      const mb = VA.alvo.daBateia(analise.bateia, A.termos).filter(x => x.ajuste >= 0.3);
      if (mb.length) add(mb[0].ajuste >= 0.5 ? 'oportunidade' : 'informativo', 'mineracao', `${m}: modelos de depósito compatíveis (Bateia)`, mb.slice(0, 3).map(x => `${x.nome} — ${Math.round(x.ajuste * 100)}%`).join('; ') + '.', [], CERTEZA.indicio);
    }

    if (analise.bateia) {
      const b = analise.bateia;
      const top = (b.modelos || []).filter(m => m.ajuste >= 0.4).slice(0, 3);
      if (top.length) add(finalidade === 'mineracao' ? 'oportunidade' : 'informativo', 'mineracao', 'Potencial mineral (Bateia)', top.map(m => `${m.nome}: ${Math.round(m.ajuste * 100)}% (confiança ${Math.round(m.conf * 100)}%)`).join('; ') + '.', [], CERTEZA.indicio);
    }

    /* ---------------- energia ---------------- */
    const distMin = ids => { const v = ids.filter(ok).map(id => R[id].itens[0] && R[id].itens[0].distancia_km).filter(x => x != null); return v.length ? Math.min(...v) : null; };
    const evMin = ids => { let m = null; ids.filter(ok).forEach(id => { const i = R[id].itens[0]; if (i && (!m || i.distancia_km < m.distancia_km)) m = i; }); return m ? [m.evid] : []; };
    const se = distMin(['sigel_se', 'epe_se', 'sigel_ufv_se']), lt = distMin(['sigel_lt', 'epe_lt', 'sigel_ufv_lt']);
    const sePlan = distMin(['epe_se_plan']), ltPlan = distMin(['epe_lt_plan']);
    const seTestada = ['sigel_se', 'epe_se'].some(ok);
    if (P.setores.energia) {
      const sev = finalidade === 'solar';
      if (seTestada) {
        if (se == null) add(sev ? 'alerta' : 'informativo', 'energia', 'Sem subestação de transmissão no raio', `Nenhuma subestação cadastrada até ${VA.fmt.km(P.raioEnergiaKm)}.`, [], CERTEZA.ausencia);
        else add(se <= 5 ? (sev ? 'oportunidade' : 'informativo') : se <= 15 ? 'informativo' : (sev ? 'alerta' : 'informativo'), 'energia', 'Subestação mais próxima', `A ${VA.fmt.km(se)} da área.`, evMin(['sigel_se', 'epe_se', 'sigel_ufv_se']), CERTEZA.heuristica);
      }
      if (lt != null) add('informativo', 'energia', 'Linha de transmissão mais próxima', `A ${VA.fmt.km(lt)}.`, evMin(['sigel_lt', 'epe_lt', 'sigel_ufv_lt']));
      if (sePlan != null || ltPlan != null) add(sev ? 'oportunidade' : 'informativo', 'energia', 'Expansão planejada da transmissão (EPE)', [sePlan != null ? `subestação planejada a ${VA.fmt.km(sePlan)}` : null, ltPlan != null ? `LT planejada a ${VA.fmt.km(ltPlan)}` : null].filter(Boolean).join('; ') + '.', evMin(['epe_se_plan', 'epe_lt_plan']));
      if (ok('osm_rede')) {
        const d = R.osm_rede.dados;
        add(d.distMT != null && d.distMT <= 2 && sev ? 'oportunidade' : 'informativo', 'energia', 'Rede de distribuição (OpenStreetMap)', d.distMT != null ? `Linha de média tensão/distribuição mapeada a ${VA.fmt.km(d.distMT)}. Mapeamento colaborativo: confirme com a distribuidora.` : 'Nenhuma rede de distribuição mapeada no OSM no raio — não significa que não exista.', ev(R.osm_rede.itens.slice(0, 3)), CERTEZA.indicio);
      }
      if (ok('bdgd_mt')) {
        const d = R.bdgd_mt.dados, base = `BDGD ${d.distribuidoras.join(', ') || 'da distribuidora'}${d.referencia ? ' (referência ' + d.referencia + ')' : ''}`;
        if (d.distMT != null) {
          const tri = d.distTrifasica != null ? (d.distTrifasica === d.distMT ? ' O trecho mais próximo é trifásico.' : ` Trecho trifásico mais próximo a ${VA.fmt.km(d.distTrifasica)}.`) : ' Nenhum trecho trifásico no raio — minigeração normalmente pede rede trifásica (a extensão costuma correr por conta do acessante).';
          add(sev ? (d.distMT <= 1 && d.distTrifasica != null && d.distTrifasica <= 2 ? 'oportunidade' : d.distMT <= 3 ? 'informativo' : 'atencao') : 'informativo', 'energia', 'Rede de média tensão (BDGD/ANEEL)',
            `${R.bdgd_mt.status === 'dentro' ? 'A rede de MT cruza a área' : 'Rede de MT a ' + VA.fmt.km(d.distMT)}: ${d.circuitoMT}${d.tensaoMT ? ', ' + VA.bdgd.fmtKv(d.tensaoMT) : ''}. ${d.circuitos} alimentador(es) até ${VA.fmt.km(R.bdgd_mt.raioKm)}.${tri} Fonte: ${base}.`, ev(R.bdgd_mt.itens.slice(0, 3)));
        } else add(sev ? 'alerta' : 'informativo', 'energia', 'Sem rede de média tensão no raio (BDGD)', `Nenhum segmento de MT até ${VA.fmt.km(R.bdgd_mt.raioKm)} na ${base}. Conexão exigiria extensão de rede.`, [], CERTEZA.ausencia);
      }
      if (ok('bdgd_sub') && R.bdgd_sub.itens.length) add('informativo', 'energia', 'Subestação de distribuição mais próxima', `${R.bdgd_sub.itens[0].titulo} a ${VA.fmt.km(R.bdgd_sub.dados.distSE)} (BDGD).`, ev(R.bdgd_sub.itens.slice(0, 2)));
      if (sev) add('atencao', 'energia', 'Capacidade da rede de distribuição', ok('bdgd_mt') ? 'A BDGD mostra onde está a rede, não a margem de capacidade dos alimentadores nem a inversão de fluxo. Para minigeração distribuída (Lei 14.300/2022), peça a informação de acesso / consulta de acesso à distribuidora antes de fechar a área.' : 'Instale a BDGD da distribuidora (Camadas › Rede de distribuição) para medir a distância à rede de MT. A capacidade dos alimentadores não é pública: para minigeração distribuída (Lei 14.300/2022), peça a informação de acesso à distribuidora.', [], CERTEZA.pendente);
      if (ok('epe_ghi') && R.epe_ghi.dados.kwh) add(sev ? (R.epe_ghi.dados.kwh >= 5.5 ? 'oportunidade' : 'informativo') : 'informativo', 'energia', 'Recurso solar', `Irradiação global horizontal de ${VA.fmt.num(R.epe_ghi.dados.kwh, 2)} kWh/m²·dia${ok('epe_incl') && R.epe_incl.dados.kwh ? ` e ${VA.fmt.num(R.epe_incl.dados.kwh, 2)} kWh/m²·dia no plano inclinado` : ''} (Atlas Solar INPE).`, ev(R.epe_ghi.itens.slice(0, 1)));
      if (ok('sigel_dist') && R.sigel_dist.dados.distribuidora) add('informativo', 'energia', 'Distribuidora da região', R.sigel_dist.dados.distribuidora + '.', ev(R.sigel_dist.itens.slice(0, 1)));
      if (sev && ok('sigel_ufv') && R.sigel_ufv.itens.length) add('informativo', 'energia', 'Usinas solares no entorno', `${R.sigel_ufv.itens.length} usina(s) até ${VA.fmt.km(R.sigel_ufv.raioKm)} (${VA.fmt.num(R.sigel_ufv.dados.potenciaMW, 1)} MW): confirma o recurso, mas indica disputa por capacidade de conexão.`, ev(R.sigel_ufv.itens.slice(0, 5)));
      const ac = distMin(['dnit_snv', 'anm_rodovias']);
      if (ac != null) add('informativo', 'energia', 'Acesso rodoviário', `Rodovia mais próxima a ${VA.fmt.km(ac)}.`, evMin(['dnit_snv', 'anm_rodovias']));
    }

    /* ---------------- fundiário ---------------- */
    if (P.setores.fundiario) {
      if (ok('car')) {
        const its = R.car.itens, prob = its.filter(i => /SU|CA/.test(i.status || ''));
        if (its.length) add(prob.length ? 'atencao' : 'informativo', 'fundiario', 'Cadastro Ambiental Rural', `${its.length} cadastro(s) sobre a área${prob.length ? `, ${prob.length} suspenso(s)/cancelado(s)` : ''}${R.car.dados && R.car.dados.uniaoHa != null ? ` (${VA.fmt.ha(R.car.dados.uniaoHa)} da área cobertos)` : ''}: ${nomes(its, 3)}. Cadastros podem se sobrepor e não equivalem a proprietários. O CAR é autodeclaratório e não prova domínio; serve para identificar possuidores e passivos (APP, reserva legal).`, ev(its));
        else add(finalidade === 'terra' ? 'atencao' : 'informativo', 'fundiario', 'Nenhum CAR sobre a área', 'Imóvel possivelmente não inscrito no CAR (obrigatório para imóveis rurais).', [], CERTEZA.ausencia);
      }
      const sig = ['sigef', 'snci'].filter(ok).flatMap(id => R[id].itens);
      if (['sigef', 'snci'].some(ok)) {
        if (sig.length) add(finalidade === 'terra' || finalidade === 'solar' ? 'atencao' : 'informativo', 'fundiario', 'Parcelas certificadas no INCRA', `${nomes(sig, 3)}. Confirme matrícula, titular e ônus por certidão de inteiro teor no cartório — a certificação não substitui o registro.`, ev(sig));
        else if (finalidade === 'terra' || finalidade === 'solar') add('atencao', 'fundiario', 'Nenhuma parcela certificada', 'O imóvel pode não estar georreferenciado/certificado (Lei 10.267/2001) — verifique a matrícula antes de negociar.', [], CERTEZA.ausencia);
      }
      add('informativo', 'fundiario', 'Registro de imóveis', 'Matrícula, titularidade e ônus só constam no cartório de registro de imóveis da circunscrição. Consulte o Mapa do ONR (mapa.onr.org.br) e peça certidão de inteiro teor.', [], CERTEZA.pendente);
    }

    /* ---------------- ambiental ---------------- */
    if (P.setores.ambiental) {
      if (ok('cnuc')) {
        const inc = dentro('cnuc'), integ = inc.filter(i => i.integral), sust = inc.filter(i => !i.integral), pr = perto('cnuc').filter(i => i.distancia_km <= 3);
        if (integ.length) add('impeditivo', 'ambiental', 'Unidade de conservação de proteção integral', `${nomes(integ)}. Só se admite uso indireto dos recursos naturais (Lei 9.985/2000).`, ev(integ));
        if (sust.length) add(finalidade === 'mineracao' || finalidade === 'solar' ? 'alerta' : 'atencao', 'ambiental', 'Unidade de conservação de uso sustentável', `${nomes(sust)}. Atividades dependem do plano de manejo e da anuência do órgão gestor.`, ev(sust));
        if (pr.length) add('atencao', 'ambiental', 'UC a menos de 3 km', `${pr.map(i => `${i.titulo} (${VA.fmt.km(i.distancia_km)})`).slice(0, 3).join('; ')}. Verifique a zona de amortecimento e a ciência do órgão gestor no licenciamento (Res. CONAMA 428/2010).`, ev(pr));
        if (!R.cnuc.itens.length) add('informativo', 'ambiental', 'Sem UC no raio consultado', `Nenhuma unidade do CNUC até ${VA.fmt.km(R.cnuc.raioKm)}.`, [], CERTEZA.ausencia);
      }
      if (ok('ana_drenagem')) {
        const d = R.ana_drenagem.dados;
        if (d.provavelAPP) add(finalidade === 'mineracao' || finalidade === 'solar' ? 'alerta' : 'atencao', 'ambiental', 'Provável APP de curso d’água', `Curso d’água a ${VA.fmt.km(d.distCurso).replace('dentro', 'menos de 1 m')} da área: faixa marginal mínima de 30 m é APP (Lei 12.651/2012, art. 4º, I). Hidrografia em escala regional — confirme em campo.`, ev(R.ana_drenagem.itens.slice(0, 1)), CERTEZA.indicio);
        else if (d.distCurso != null) add('informativo', 'ambiental', 'Curso d’água mais próximo', `A ${VA.fmt.km(d.distCurso)}.`, ev(R.ana_drenagem.itens.slice(0, 1)));
      }
      if (ok('biomas') && R.biomas.dados.bioma) {
        const b = R.biomas.dados.bioma;
        add(/atl[aâ]ntica/i.test(b) && finalidade !== 'geral' ? 'atencao' : 'informativo', 'ambiental', 'Bioma', /atl[aâ]ntica/i.test(b) ? `${b}: supressão de vegetação nativa segue o regime especial da Lei 11.428/2006.` : `${b}. Supressão de vegetação nativa exige autorização (ASV) do órgão ambiental.`, ev(R.biomas.itens.slice(0, 1)));
      }
      if (ok('mapbiomas') && R.mapbiomas.dados.classe) add('informativo', 'ambiental', 'Cobertura do solo no centro da área', `MapBiomas 2024: ${R.mapbiomas.dados.classe}.`, ev(R.mapbiomas.itens.slice(0, 1)));
      ['solos', 'relevo_padrao', 'sgb_hidrogeo'].filter(ok).forEach(id => { if (R[id].itens.length) add('informativo', 'ambiental', R[id].camada.nome, R[id].itens.slice(0, 2).map(i => i.titulo).join('; ') + '.', ev(R[id].itens.slice(0, 1))); });
    }

    achados.sort((a, b) => VA.NIVEIS[a.nivel].ordem - VA.NIVEIS[b.nivel].ordem);
    const conta = n => achados.filter(a => a.nivel === n).length;
    /* síntese por suficiência de decisão: fonte crítica pendente impede conclusão positiva, qualquer que seja o
       percentual geral de sucesso; falhas em fontes secundárias só entram como ressalva */
    const cob = VA.coberturaCritica(analise, finalidade);
    const idsCrit = new Set(cob.criticas.map(x => x.id));
    const secundariasPend = Object.values(R).filter(r => !idsCrit.has(r.camada.id) && ['falhou', 'parcial'].includes(r.completude || (r.status === 'falha' ? 'falhou' : ''))).length;
    const nomesPend = l => l.map(x => `${x.nome} (${x.rotulo})`).join('; ');
    let sintese;
    if (conta('impeditivo')) sintese = { classe: 'impeditivo', texto: 'Restrições impeditivas para a finalidade informada' + (cob.pendentes.length ? ` — e ${cob.pendentes.length} fonte(s) crítica(s) sem verificação` : '') };
    else if (cob.pendentes.length) sintese = { classe: 'inconclusivo', texto: `Resultado inconclusivo: faltam evidências críticas para concluir — ${nomesPend(cob.pendentes)}` };
    else if (conta('alerta')) sintese = { classe: 'alerta', texto: 'Viável apenas com ressalvas relevantes a resolver' };
    else if (conta('atencao')) sintese = { classe: 'atencao', texto: 'Sem impeditivos nas fontes críticas verificadas; há pontos de atenção' };
    else sintese = { classe: 'oportunidade', texto: 'Nenhuma restrição identificada nas fontes críticas consultadas com sucesso' };
    if (secundariasPend && sintese.classe !== 'inconclusivo') sintese.texto += ` — ${secundariasPend} fonte(s) secundária(s) sem resposta ou parcial(is)`;
    if (cob.importantesPendentes.length && sintese.classe !== 'impeditivo') sintese.texto += ` — pendência: ${cob.importantesPendentes.map(x => x.nome).join(', ')}`;
    sintese.cobertura = cob;
    sintese.proximaAcao = cob.pendentes.length ? `Repita a consulta das fontes críticas pendentes (${cob.pendentes.map(x => x.nome).join(', ')}) antes de decidir.` : null;

    return { achados, sintese, contagem: Object.fromEntries(Object.keys(VA.NIVEIS).map(n => [n, conta(n)])), quadro: VA.quadro(analise, finalidade) };
  };

  /* Quadro "dentro / fora" por setor */
  VA.quadro = function (analise, finalidade) {
    const Q = {};
    analise.ordem.forEach(id => {
      const r = analise.resultados[id], c = r.camada;
      let situacao, classe, sev = null;
      if (r.status === 'falha') { situacao = 'Não consultada'; classe = 'falha'; }
      else if (r.status === 'sem_base') { situacao = 'Base não importada'; classe = 'falha'; }
      else if (r.status === 'info') { situacao = r.resumo; classe = 'info'; }
      else if (r.status === 'dentro') { situacao = 'DENTRO'; classe = 'dentro'; sev = c.regra && c.regra.incide ? c.regra.incide[finalidade] : null; }
      else if (r.status === 'proximo') { situacao = 'Fora · a ' + VA.fmt.km(r.dados.distMin); classe = 'proximo'; }
      else { situacao = 'Fora' + (r.raioKm ? ` (nada até ${VA.fmt.km(r.raioKm)})` : ''); classe = 'fora'; }
      if (id === 'cnuc' && r.status === 'dentro') sev = r.itens.some(i => i.incide && i.integral) ? 'impeditivo' : 'alerta';
      if (id === 'anm_proc' && r.status === 'dentro') sev = finalidade === 'mineracao' ? (r.itens.some(i => i.incide && i.avancado && !i.proprio) ? 'impeditivo' : 'alerta') : 'atencao';
      (Q[c.setor] = Q[c.setor] || []).push({ id, nome: c.nome, fonte: c.fonte, grupo: c.grupo, situacao, classe, sev, resumo: r.resumo, evid: (r.itens || []).filter(i => i.incide).slice(0, 4).map(i => i.evid) });
    });
    return Q;
  };
})();
