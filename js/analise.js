/* VIP ANALYSIS — motor de análise.
   Para cada camada analisável do catálogo: consulta a fonte oficial no entorno da área, testa interseção exata,
   mede distância e área sobreposta e devolve um resultado padronizado:
   status = dentro | proximo | fora | info | falha | sem_base
   Nada é presumido: se a fonte não respondeu, o resultado é 'falha' com o motivo. */
'use strict';

(function () {
  const VA = window.VA;
  const N = s => VA.fmt.norm(s);

  function resolverRaio(r, p) {
    if (typeof r === 'number') return r;
    return { energia: p.raioEnergiaKm, anm: p.raioAnmKm, ocorrencias: p.raioOcorrenciasKm, ambiental: p.raioAmbientalKm, entorno: p.entornoKm }[r] ?? 2;
  }
  function rotulo(c, props) {
    const nomes = (c.rotulo || []).concat(['nome', 'NOME', 'Nome', 'Name', 'nome_uc', 'NM_MUN', 'NMMunicipio', 'nm_municip', 'NOME_UC1', 'terrai_nome', 'nome_area', 'nomeabrev', 'nome_imovel']);
    const partes = [];
    (c.rotulo || []).slice(0, 3).forEach(k => { const v = VA.attr(props, [k]); if (v != null) partes.push(VA.fmt.semTags(v)); });
    if (partes.length) return partes.join(' · ').slice(0, 160);
    const v = VA.attr(props, nomes) || props._camada;
    return v ? VA.fmt.semTags(v).slice(0, 160) : 'Registro sem nome';
  }

  /* --------------------------- execução de uma camada --------------------------- */
  async function rodarCamada(c, ctx) {
    const t0 = performance.now();
    const res = { camada: c, status: 'fora', itens: [], consultas: [], dados: {}, resumo: '', raioKm: 0, extra: !!(c.extra || ctx.extras.has(c.id)), origem: (ctx.origem && ctx.origem[c.id]) || (ctx.extras.has(c.id) ? 'escolhidas' : 'fixas') };
    const a = c.analise || { raioKm: 'entorno' };
    const aliases = c.q && c.q.tipo === 'query' ? await VA.aliasesCamada(c).catch(() => null) : null;
    const aoi = ctx.aoi;
    const bufferKm = c.regra && c.regra.bufferM ? c.regra.bufferM / 1000 : 0;
    try {
      if (a.contexto) {
        const [lon, lat] = ctx.centro;
        const d = /Polygon/.test(aoi.geometry.type) ? 0 : 0.0006;
        const bbox = d ? [lon - d, lat - d, lon + d, lat + d] : turf.bbox(aoi);
        const fc = await VA.consultarCamada(c, { bbox, max: 200, tolPx: 0, maxOffset: 0.0005, filtrar: !!ctx.params.filtrosNaAnalise });
        res.consultas.push({ url: fc._url, n: fc.features.length });
        if (fc._filtro) res.filtro = fc._filtro;
        res.dados.truncado = !!fc._truncado;
        const pt = turf.point(ctx.centro);
        let feats = fc.features.filter(f => { try { return !f.geometry || !/Polygon/.test(f.geometry.type) || turf.booleanIntersects(aoi, f) || turf.booleanPointInPolygon(pt, f); } catch (e) { return true; } });
        feats.forEach(f => {
          let noCentro = false; try { noCentro = !f.geometry || (/Polygon/.test(f.geometry.type) && turf.booleanPointInPolygon(pt, f)); } catch (e) { }
          res.itens.push({ titulo: rotulo(c, f.properties), subtitulo: f.properties._camada || '', atributos: VA.attrsLimpos(f.properties, 40, aliases), incide: true, noCentro, feature: null, props: f.properties });
        });
        res.status = res.itens.length ? 'info' : 'fora';
        res.resumo = res.itens.length ? res.itens.slice(0, 3).map(i => i.titulo).join(' · ') : 'Sem registro no local';
      } else {
        const raio = resolverRaio(a.raioKm, ctx.params);
        res.raioKm = raio;
        const bbox = VA.geo.bboxBuffer(aoi.geometry, Math.max(raio, bufferKm, 0.02));
        const fc = await VA.consultarCamada(c, { bbox, max: a.max || 800, maxOffset: c.tipoGeom === 'ponto' ? undefined : 0.00005, filtrar: !!ctx.params.filtrosNaAnalise });
        res.consultas.push({ url: fc._url, n: fc.features.length });
        if (fc._filtro) res.filtro = fc._filtro;
        res.dados.truncado = !!fc._truncado;
        let descartadas = 0;
        fc.features.forEach(f => {
          const d = VA.geo.distanciaKm(aoi, f);
          if (d == null) { if (f && f.geometry) descartadas++; return; }
          if (d > Math.max(raio, bufferKm) + 1e-9) return;
          const incide = d === 0 || (bufferKm > 0 && d <= bufferKm);
          res.itens.push({
            titulo: rotulo(c, f.properties), subtitulo: f.properties._camada && f.properties._camada !== c.nome ? f.properties._camada : '',
            atributos: VA.attrsLimpos(f.properties, 40, aliases), distancia_km: d, incide, sobreposto: d === 0,
            sobreposicao_ha: d === 0 ? VA.geo.sobreposicaoHa(aoi, f) : null, feature: f, props: f.properties
          });
        });
        res.dados.descartadas = descartadas;
        res.itens.sort((x, y) => x.distancia_km - y.distancia_km || (y.sobreposicao_ha || 0) - (x.sobreposicao_ha || 0));
        /* bases regionais: a distância não tem precisão de metros (1 mm no mapa 1:1.000.000 = 1 km) */
        if (c.precisaoKm) res.itens.forEach(it => { if (!it.distancia_km) return; const p = c.precisaoKm; it.precisao_km = p; if (it.distancia_km < p) { it.distancia_km = p; it.menorQue = true; } else it.distancia_km = Math.round(it.distancia_km / p) * p; });
        res.dados.total = res.itens.length;
        if (a.contagem && res.itens.length > 40) res.itens = res.itens.slice(0, 40);
        const nDentro = res.itens.filter(i => i.incide).length;
        res.status = nDentro ? 'dentro' : res.dados.total ? 'proximo' : 'fora';
        res.dados.nDentro = nDentro; res.dados.distMin = res.itens.length ? res.itens[0].distancia_km : null;
        if (res.status === 'dentro') res.resumo = `${nDentro} incide(m) na área${bufferKm ? ` (incluindo faixa de ${c.regra.bufferM} m)` : ''}` + (res.dados.total > nDentro ? ` · ${res.dados.total - nDentro} até ${VA.fmt.km(raio)}` : '');
        else if (res.status === 'proximo') res.resumo = `${res.dados.total} até ${VA.fmt.km(raio)} · mais próximo a ${VA.fmt.km(res.dados.distMin)}`;
        else res.resumo = `Nenhum registro até ${VA.fmt.km(raio)}`;
        if (res.dados.truncado) res.resumo += ' · resultado truncado pelo servidor';
      }
      if (a.especial && POS[a.especial]) await POS[a.especial](res, ctx);
      if (res.filtro) res.resumo += ' · filtro: ' + res.filtro;
    } catch (e) {
      res.status = e.motivo === 'sem_base' ? 'sem_base' : 'falha';
      res.erro = e.message || String(e); res.motivo = e.motivo || 'desconhecido';
      res.resumo = res.status === 'sem_base' ? (c.q && c.q.tipo === 'bdgd' ? 'BDGD da distribuidora não instalada (Camadas › Rede de distribuição)' : 'Base da UF ainda não importada no servidor local') : 'Fonte não consultada: ' + res.erro;
    }
    res.ms = Math.round(performance.now() - t0);
    res.consultadoEm = new Date().toISOString();
    completude(res);
    return res;
  }

  /* completude da consulta: só "completo" comprova ausência. Parcial = respondeu, mas truncado ou com feições
     que não puderam ser processadas; falhou = sem resposta; sem_base = base local não instalada. */
  function completude(res) {
    const motivos = [];
    if (res.status === 'falha') { res.completude = 'falhou'; res.motivosParcial = [res.erro || 'sem resposta']; }
    else if (res.status === 'sem_base') { res.completude = 'sem_base'; res.motivosParcial = [res.resumo]; }
    else {
      if (res.dados && res.dados.truncado) motivos.push('o servidor do órgão limitou o número de registros (lista parcial)');
      if (res.dados && res.dados.descartadas) motivos.push(`${res.dados.descartadas} feição(ões) com geometria que não pôde ser processada`);
      res.completude = motivos.length ? 'parcial' : 'completo';
      res.motivosParcial = motivos;
    }
    /* origem: ao vivo ou do cache do servidor local (com a idade) */
    const orig = (res.consultas || []).map(c => VA.Net.origemDe(c.url)).filter(Boolean);
    const cache = orig.filter(o => o.cache);
    res.origemDados = !orig.length ? null : cache.length ? { cache: true, idadeS: Math.max(...cache.map(o => o.idadeS)) } : { cache: false, via: orig[0].via };
  }
  VA.completude = completude;
  /* classificação de UC (proteção integral × uso sustentável), usada na análise e na janela da favorabilidade */
  VA.ucInfo = function (p, tituloPadrao) {
    const cat = VA.attr(p, ['categoria', 'CATEGORI3', 'sigla_cate', 'categ']) || '';
    const grupo = VA.attr(p, ['grupo', 'GRUPO4']) || '';
    const nome = VA.attr(p, ['nome_uc', 'NOME_UC1', 'nome']) || tituloPadrao || 'Unidade de conservação';
    return { cat, grupo, nome, integral: /integral/i.test(grupo) || /parque|esta[cç][aã]o ecol|reserva biol|monumento natural|ref[uú]gio de vida/i.test(cat + ' ' + nome) };
  };

  /* --------------------------- pós-processamento por tema --------------------------- */
  /* legenda MapBiomas (coleção 9 / 2024): código do pixel → classe */
  const MAPBIOMAS = { 1: 'Floresta', 3: 'Formação Florestal', 4: 'Formação Savânica', 5: 'Mangue', 6: 'Floresta Alagável', 49: 'Restinga Arbórea', 10: 'Vegetação Herbácea e Arbustiva', 11: 'Campo Alagado e Área Pantanosa', 12: 'Formação Campestre', 32: 'Apicum', 29: 'Afloramento Rochoso', 50: 'Restinga Herbácea', 13: 'Outras Formações não Florestais', 14: 'Agropecuária', 15: 'Pastagem', 18: 'Agricultura', 19: 'Lavoura Temporária', 39: 'Soja', 20: 'Cana', 40: 'Arroz', 62: 'Algodão', 41: 'Outras Lavouras Temporárias', 36: 'Lavoura Perene', 46: 'Café', 47: 'Citrus', 35: 'Dendê', 48: 'Outras Lavouras Perenes', 9: 'Silvicultura', 21: 'Mosaico de Usos', 22: 'Área não Vegetada', 23: 'Praia, Duna e Areal', 24: 'Área Urbanizada', 30: 'Mineração', 75: 'Usina Fotovoltaica', 25: 'Outras Áreas não Vegetadas', 26: 'Corpo d’Água', 33: 'Rio, Lago e Oceano', 31: 'Aquicultura', 27: 'Não Observado' };
  const FASES_AVANCADAS = /CONCESS[ÃA]O DE LAVRA|LAVRA GARIMPEIRA|^LICENCIAMENTO|REGISTRO DE EXTRA|MANIFESTO DE MINA|REQUERIMENTO DE LAVRA|DIREITO DE REQUERER/i;
  const POS = {
    anm(res, ctx) {
      const interesse = (ctx.params.titulares || '').split(/[;,\n]/).map(N).filter(s => s.length > 2);
      res.itens.forEach(i => {
        const p = i.props;
        i.fase = p.FASE; i.titulo = `${p.PROCESSO} — ${p.FASE || 'fase não informada'}`;
        i.subtitulo = `${p.SUBS || '—'} · ${p.NOME || 'titular não informado'}${p.AREA_HA ? ' · ' + VA.fmt.ha(p.AREA_HA) : ''}`;
        i.proprio = interesse.some(t => N(p.NOME).includes(t));
        i.avancado = FASES_AVANCADAS.test(p.FASE || '');
        i.disponivel = /DISPONIBILIDADE/i.test(p.FASE || '');
      });
      const inc = res.itens.filter(i => i.incide);
      res.dados.incidentes = inc.length; res.dados.vizinhos = res.itens.length - inc.length;
      res.dados.substancias = [...new Set(res.itens.map(i => i.props.SUBS).filter(Boolean))];
    },
    ocorrencias(res) {
      const porSubst = {}, porClasse = {};
      res.itens.forEach(i => {
        const p = i.props;
        i.titulo = p.SUBSTANCIAS || i.titulo; i.subtitulo = [p.TOPONIMIA, p.MUNICIPIO, p.STATUS_ECONOMICO].filter(Boolean).join(' · ');
        (p.SUBSTANCIAS || '').split(/[;,]/).map(s => s.trim()).filter(Boolean).forEach(s => { porSubst[s] = (porSubst[s] || 0) + 1; });
        (p.CLASSES_UTILITARIAS || 'Não definida').split(/[;,]/).map(s => s.trim()).filter(Boolean).forEach(s => { porClasse[s] = (porClasse[s] || 0) + 1; });
      });
      res.dados.porSubst = porSubst; res.dados.porClasse = porClasse;
      if (res.itens.length) res.resumo += ' · ' + Object.entries(porSubst).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([s, n]) => `${s} (${n})`).join(', ');
    },
    async geologia(res, ctx) {
      const esc = [['litoestratigrafia_100000', '1:100.000'], ['litoestratigrafia_250000', '1:250.000'], ['litoestratigrafia_estados', 'Mapa estadual'], ['litoestratigrafia_1000000', '1:1.000.000']];
      const g = VA.geo.simplificarAte(ctx.aoi.geometry, 120);
      const [esriG, tipo] = VA.esri.daGeoJSON(g);
      const bbox = VA.geo.bboxBuffer(ctx.aoi.geometry, 1);
      const unidades = []; const vistos = new Set();
      await VA.limitar(esc.map(([svc, nome]) => async () => {
        const url = VA.URL.SGB + 'geologia/' + svc + '/MapServer';
        try {
          const fc = await VA.ags.identify(url, { geom: esriG, tipo, bbox, layers: 'all', tolerance: 0, returnGeometry: false });
          res.consultas.push({ url: fc._url, n: fc.features.length });
          const ordem = esc.findIndex(e => e[0] === svc);
          fc.features.forEach(f => {
            const p = f.properties;
            const sigla = VA.attr(p, ['Sigla da unidade', 'SIGLA', 'SIGLA_UNID']), nomeU = VA.attr(p, ['Nome da unidade', 'NOME', 'NOME_UNIDA']);
            const k = nomeU + '|' + sigla + '|' + svc; if (vistos.has(k)) return; vistos.add(k);
            unidades.push({
              ordem, escala: nome,
              nome: [sigla, nomeU].filter(Boolean).join(' — ') || p._camada,
              litotipos: VA.attr(p, ['Litótipos', 'LITOTIPOS', 'Litotipo1', 'LITOTIPO1']),
              idade: [VA.attr(p, ['Era máxima', 'ERA_MAX']), VA.attr(p, ['Período máximo', 'PERIODO_MA'])].filter(Boolean).join(' · '),
              ambiente: VA.attr(p, ['Ambiente tectônico', 'AMB_TECTON']),
              texto: N(JSON.stringify(p))
            });
          });
        } catch (e) { res.consultas.push({ url, erro: e.message }); }
      }), 4);
      unidades.sort((a, b) => a.ordem - b.ordem);
      res.dados.unidades = unidades;
      res.itens = res.dados.unidades.map(u => ({ titulo: u.nome, subtitulo: u.escala + (u.litotipos ? ' · ' + u.litotipos : ''), atributos: [['Escala', u.escala], ['Litótipos', u.litotipos], ['Idade', u.idade], ['Ambiente tectônico', u.ambiente]].filter(x => x[1]), incide: true }));
      res.status = res.itens.length ? 'info' : 'falha';
      if (!res.itens.length) { res.erro = 'nenhuma escala respondeu'; res.resumo = 'Geologia não consultada'; }
      else res.resumo = `${res.itens.length} unidade(s) · melhor escala ${res.dados.unidades[0].escala}: ${res.dados.unidades[0].nome}`;
    },
    uc(res) {
      res.itens.forEach(i => {
        const p = i.props, { cat, grupo, nome, integral } = VA.ucInfo(p, i.titulo);
        i.titulo = nome; i.integral = integral;
        i.subtitulo = [cat, grupo || (i.integral ? 'Proteção Integral (presumido pela categoria)' : 'Uso Sustentável'), VA.attr(p, ['esfera', 'ESFERA5'])].filter(Boolean).join(' · ');
      });
    },
    caverna(res) { res.itens.forEach(i => { i.subtitulo = [VA.attr(i.props, ['municipio']), VA.attr(i.props, ['nvl_valida']), VA.attr(i.props, ['num_canie'])].filter(Boolean).join(' · '); }); },
    app(res) {
      res.dados.distCurso = res.itens.length ? res.itens[0].distancia_km : null;
      res.dados.provavelAPP = res.dados.distCurso != null && res.dados.distCurso <= 0.03;
      if (res.dados.distCurso != null) res.resumo = `Curso d’água mais próximo a ${VA.fmt.km(res.dados.distCurso).replace('dentro', 'menos de 1 m')}` + (res.dados.provavelAPP ? ' — provável APP (faixa ≥ 30 m)' : '');
      res.itens.forEach(i => { i.incide = i.distancia_km <= 0.03; });
      res.status = res.dados.provavelAPP ? 'dentro' : res.itens.length ? 'proximo' : 'fora';
    },
    car(res, ctx) {
      const st = { AT: 'Ativo', PE: 'Pendente', SU: 'Suspenso', CA: 'Cancelado' };
      res.itens = res.itens.filter(i => i.incide);
      res.itens.forEach(i => {
        const p = i.props;
        i.titulo = p.cod_imovel || i.titulo;
        i.status = p.status_imovel || p.ind_status;
        i.subtitulo = [st[i.status] || i.status, p.condicao, p.area ? VA.fmt.num(p.area) + ' ha declarados' : null, p.m_fiscal ? VA.fmt.num(p.m_fiscal) + ' módulos fiscais' : null, p.tipo_imovel].filter(Boolean).join(' · ');
      });
      res.status = res.itens.length ? 'dentro' : 'fora';
      res.dados.uniaoHa = VA.geo.uniaoSobreposicaoHa(ctx.aoi, res.itens.map(i => i.feature));
      res.resumo = res.itens.length ? `${res.itens.length} cadastro(s) do CAR sobre a área — autodeclarados, podem se sobrepor e não equivalem a proprietários` : 'Nenhum imóvel do CAR sobre a área';
    },
    sigef(res) {
      res.itens = res.itens.filter(i => i.incide);
      res.itens.forEach(i => {
        const p = i.props;
        i.titulo = VA.attr(p, ['nome_area', 'denominacao', 'nome_imove']) || VA.attr(p, ['parcela_co', 'cod_imovel']) || 'Parcela certificada';
        i.subtitulo = [VA.attr(p, ['registro_m']) ? 'matrícula ' + VA.attr(p, ['registro_m']) : null, VA.attr(p, ['situacao_i', 'status']), VA.attr(p, ['data_aprov', 'data_certi']) ? 'certificada em ' + VA.attr(p, ['data_aprov', 'data_certi']) : null].filter(Boolean).join(' · ');
      });
      res.status = res.itens.length ? 'dentro' : 'fora';
      res.resumo = res.itens.length ? `${res.itens.length} parcela(s) certificada(s) sobre a área` : 'Nenhuma parcela certificada sobre a área';
    },
    prioritaria(res) { res.itens.forEach(i => { i.subtitulo = ['importância ' + (VA.attr(i.props, ['import_bio']) || '—'), 'prioridade ' + (VA.attr(i.props, ['prior_acao']) || '—'), VA.attr(i.props, ['acao_princ'])].filter(Boolean).join(' · '); }); },
    prodes(res, ctx) {
      res.itens = res.itens.filter(i => i.incide);
      res.itens.forEach(i => { i.titulo = `Desmatamento ${VA.attr(i.props, ['year', 'ano']) || ''}`.trim(); i.subtitulo = [VA.attr(i.props, ['class_name']), VA.attr(i.props, ['area_km']) ? VA.fmt.num(VA.attr(i.props, ['area_km']) * 100, 2) + ' ha no polígono' : null].filter(Boolean).join(' · '); });
      /* área por ano e total sem somar duas vezes polígonos coincidentes */
      const anos = {}; res.itens.forEach(i => { const a = VA.attr(i.props, ['year', 'ano']) || 's/ano'; (anos[a] = anos[a] || []).push(i.feature); });
      res.dados.porAno = Object.fromEntries(Object.entries(anos).sort((a, b) => String(a[0]).localeCompare(String(b[0]))).map(([a, fs]) => [a, VA.geo.uniaoSobreposicaoHa(ctx.aoi, fs)]));
      res.dados.uniaoHa = VA.geo.uniaoSobreposicaoHa(ctx.aoi, res.itens.map(i => i.feature));
      res.status = res.itens.length ? 'dentro' : 'fora';
      res.resumo = res.itens.length ? `Desmatamento detectado por satélite em ${res.itens.length} polígono(s)${res.dados.uniaoHa != null ? `, ${VA.fmt.ha(res.dados.uniaoHa)} da área` : ''} — por ano: ${Object.entries(res.dados.porAno).map(([a, h]) => `${a}: ${h != null ? VA.fmt.ha(h) : '—'}`).join('; ')}. A detecção não indica, por si, ilegalidade (pode haver supressão autorizada)` : 'Sem desmatamento PRODES mapeado na área';
    },

    bioma(res) { const b = res.itens.find(i => i.noCentro) || res.itens[0]; if (b) { res.dados.bioma = VA.attr(b.props, ['name', 'nome', 'bioma', 'nom_bioma', 'NOME']) || b.titulo; res.resumo = 'Bioma: ' + res.dados.bioma; } },
    mapbiomas(res) {
      const v = res.itens.find(i => i.noCentro) || res.itens[0];
      if (!v) return;
      const p = v.props;
      const cod = VA.attr(p, ['UniqueValue.Pixel Value', 'Raster.Value', 'Pixel Value', 'Valor do pixel']);
      res.dados.classe = MAPBIOMAS[+cod] || VA.attr(p, ['Classe', 'classe', 'Class_Name', 'ClassName', 'descricao']) || (cod != null ? 'classe ' + cod : null);
      res.dados.codigo = cod;
      v.titulo = res.dados.classe || v.titulo;
      res.resumo = 'Cobertura no centro: ' + (res.dados.classe || v.titulo);
    },
    irradiacao(res) {
      const v = res.itens.find(i => i.noCentro) || res.itens[0];
      const anual = v && +VA.attr(v.props, ['ANNUAL']);
      if (anual) { res.dados.kwh = anual / 1000; res.resumo = `${VA.fmt.num(res.dados.kwh, 2)} kWh/m²·dia (média anual)`; }
    },
    carponto(res) {
      const v = res.itens[0];
      if (!v) { res.status = 'fora'; res.resumo = 'Nenhum cadastro do CAR no ponto central'; return; }
      const p = v.props;
      v.titulo = p.codeProperty || 'Cadastro CAR';
      v.subtitulo = [p.nameCity && (p.nameCity + (p.idState ? '-' + p.idState : '')), p.haRegisteredArea != null ? VA.fmt.num(+p.haRegisteredArea) + ' ha declarados' : null, p.fiscalModules != null ? VA.fmt.num(+p.fiscalModules) + ' módulos fiscais' : null, p.createdAt ? 'inscrito em ' + p.createdAt : null].filter(Boolean).join(' · ');
      res.dados.car = { codigo: p.codeProperty, municipio: p.nameCity, uf: p.idState, area_ha: +p.haRegisteredArea || null, modulos: +p.fiscalModules || null, inscricao: p.createdAt, retificacao: p.lastRectification };
      /* a consulta por coordenada do SICAR devolve a caixa envolvente do cadastro, não o contorno do imóvel */
      v.envelope = true; v.sobreposicao_ha = null;
      v.subtitulo = (v.subtitulo ? v.subtitulo + ' · ' : '') + 'desenho = caixa envolvente do cadastro, não o limite do imóvel';
      res.resumo = `${v.titulo} · ${v.subtitulo}`;
    },
    distribuidora(res) { const v = res.itens.find(i => i.noCentro) || res.itens[0]; if (v) { res.dados.distribuidora = VA.attr(v.props, ['RAZAO_SOCI', 'SIGR_ATUAL', 'FIRST_SIGL']) || v.titulo; res.resumo = 'Distribuidora: ' + res.dados.distribuidora; } },
    aerolev(res) { res.resumo = res.itens.length ? `${res.itens.length} levantamento(s) cobrem o local: ` + res.itens.slice(0, 3).map(i => VA.attr(i.props, ['Projeto', 'TITULO', 'Título', 'Titulo']) || i.titulo).join('; ') : 'Sem aerolevantamento cadastrado'; },
    lt(res) { res.dados.distMin = res.itens.length ? res.itens[0].distancia_km : null; res.itens.forEach(i => { const t = VA.attr(i.props, ['Tensao', 'TENSAO_KV', 'Tensão']); if (!t) { const m = /(\d{2,3})\s*kV/i.exec(VA.fmt.semTags(i.props.PopupInfo || i.props.Name || '')); if (m) i.tensao = +m[1]; } else i.tensao = parseFloat(String(t).replace(',', '.')); if (i.tensao) i.subtitulo = (i.subtitulo ? i.subtitulo + ' · ' : '') + i.tensao + ' kV'; }); },
    lt_plan(res) { POS.lt(res); },
    se(res) { POS.lt(res); },
    se_plan(res) { POS.lt(res); },
    ufv(res) { res.dados.potenciaMW = res.itens.reduce((s, i) => s + (+VA.attr(i.props, ['POT_KW']) || 0), 0) / 1000; if (res.itens.length) res.resumo += ` · ${VA.fmt.num(res.dados.potenciaMW, 1)} MW somados`; },
    acesso(res) {
      res.dados.distMin = res.itens.length ? res.itens[0].distancia_km : null;
      res.itens.forEach(i => { const br = VA.attr(i.props, ['Codigo_BR']); if (br) i.titulo = `BR-${br}` + (VA.attr(i.props, ['Nome_Tipo_Trecho']) ? ' · ' + VA.attr(i.props, ['Nome_Tipo_Trecho']) : ''); const tr = [VA.attr(i.props, ['Local_Inicio']), VA.attr(i.props, ['Local_Fim'])].filter(Boolean).join(' → '); if (tr) i.subtitulo = tr; });
      if (res.itens.length) res.resumo += ' · ' + [...new Set(res.itens.slice(0, 5).map(i => i.titulo.split(' · ')[0]))].join(', ');
    },
    bdgd_mt(res) {
      const total = res.itens.length, vistos = new Set(), circ = [];
      res.itens.forEach(i => {
        const p = i.props;
        i.tensao = p.TENSAO_KV || null; i.trifasica = /ABC/.test(p.FAS_CON || '');
        i.titulo = VA.bdgd.alimentador(p);
        i.subtitulo = [VA.bdgd.fmtKv(i.tensao), p.FASES, p.SUB ? 'SE ' + p.SUB : null, p.AREA_LOCALIZACAO, p.DISTRIBUIDORA].filter(Boolean).join(' · ');
        const k = p.CTMT || p.COD_ID; if (vistos.has(k)) return; vistos.add(k); circ.push(i);
      });
      const tri = res.itens.find(i => i.trifasica);
      res.dados.segmentos = total; res.dados.circuitos = circ.length;
      res.dados.distMT = circ.length ? circ[0].distancia_km : null;
      res.dados.tensaoMT = circ.length ? circ[0].tensao : null;
      res.dados.circuitoMT = circ.length ? circ[0].titulo : null;
      res.dados.distTrifasica = tri ? tri.distancia_km : null;
      res.dados.distribuidoras = [...new Set(res.itens.map(i => i.props.DISTRIBUIDORA).filter(Boolean))];
      res.dados.referencia = [...new Set(res.itens.map(i => i.props.REF_BDGD).filter(Boolean))].join(', ');
      res.itens = circ.slice(0, 25);
      if (res.dados.distMT != null) res.resumo = (res.status === 'dentro' ? 'Rede de MT cruza a área' : `Rede de MT a ${VA.fmt.km(res.dados.distMT)}`) + ` (${res.dados.circuitoMT}${res.dados.tensaoMT ? ', ' + VA.bdgd.fmtKv(res.dados.tensaoMT) : ''})` + ` · ${res.dados.circuitos} alimentador(es) até ${VA.fmt.km(res.raioKm)}` + (res.dados.distTrifasica != null && res.dados.distTrifasica !== res.dados.distMT ? ` · trifásica a ${VA.fmt.km(res.dados.distTrifasica)}` : '');
    },
    bdgd_sub(res) {
      res.itens.forEach(i => { const p = i.props; i.titulo = VA.bdgd.subestacao(p); i.subtitulo = [p.DISTRIBUIDORA, p.REF_BDGD ? 'BDGD ' + p.REF_BDGD : null].filter(Boolean).join(' · '); });
      res.dados.distSE = res.itens.length ? res.itens[0].distancia_km : null;
      if (res.itens.length) res.resumo = `${res.itens[0].titulo} a ${VA.fmt.km(res.dados.distSE)}` + (res.itens.length > 1 ? ` · ${res.itens.length} até ${VA.fmt.km(res.raioKm)}` : '');
    },
    bdgd_trafo(res) {
      res.itens.forEach(i => { const p = i.props; i.titulo = p.POTENCIA_KVA ? VA.fmt.num(p.POTENCIA_KVA) + ' kVA' : 'Transformador ' + (p.COD_ID || ''); i.subtitulo = [p.CIRCUITO || p.CTMT ? VA.bdgd.alimentador(p) : null, p.FASES, p.DISTRIBUIDORA].filter(Boolean).join(' · '); });
      res.dados.kvaTotal = res.itens.reduce((s, i) => s + (+i.props.POTENCIA_KVA || 0), 0);
      res.itens = res.itens.slice(0, 30);
      if (res.dados.total) res.resumo = `${res.dados.total} transformador(es) de MT até ${VA.fmt.km(res.raioKm)}` + (res.dados.kvaTotal ? ` · ${VA.fmt.num(res.dados.kvaTotal)} kVA instalados` : '') + (res.dados.distMin === 0 ? ' · há transformador dentro da área' : ` · mais próximo a ${VA.fmt.km(res.dados.distMin)}`);
    },
    /* PANs que abrangem a área: um item por plano, sem repetir */
    pans(res) {
      const vistos = new Set();
      res.itens = res.itens.filter(i => { const k = VA.fmt.semTags(i.props.pan || i.titulo); if (vistos.has(k)) return false; vistos.add(k); i.titulo = k; i.subtitulo = [i.props.centro, i.props.bioma].filter(Boolean).join(' · '); return true; });
      res.dados.abrangencia = res.itens.map(i => i.titulo);
      res.resumo = res.itens.length ? `Na abrangência de ${res.itens.length} plano(s): ${res.itens.slice(0, 4).map(i => i.titulo).join('; ')}${res.itens.length > 4 ? '…' : ''}` : 'Fora da abrangência dos planos de ação nacional';
    },
    osm(res) {
      res.itens.forEach(i => { i.classe = VA.osm.classe(i.props); i.titulo = i.classe; i.subtitulo = [i.props.operator, i.props.name, i.props.ref].filter(Boolean).join(' · '); });
      const mt = res.itens.filter(i => /média|distribui/.test(i.classe)), at = res.itens.filter(i => /alta|linha \(/.test(i.classe));
      res.dados.distMT = mt.length ? mt[0].distancia_km : null; res.dados.distAT = at.length ? at[0].distancia_km : null;
      res.resumo = `Média tensão/distribuição: ${res.dados.distMT != null ? VA.fmt.km(res.dados.distMT) : 'não mapeada no raio'} · alta tensão: ${res.dados.distAT != null ? VA.fmt.km(res.dados.distAT) : 'não mapeada no raio'}`;
      res.itens = mt.slice(0, 15).concat(at.slice(0, 10)).concat(res.itens.filter(i => /sub/.test(i.classe)).slice(0, 5));
    }
  };

  /* --------------------------- orquestração --------------------------- */
  /* composição das fontes da análise:
       fixas      — catálogo principal, sempre (por setor ligado);
       pacote     — opcionais que a finalidade puxa sozinha (VA.PACOTES);
       estado     — camadas estaduais, quando a área está naquele estado (VA.PACOTES_UF);
       escolhidas — as que o operador ligou no mapa ou escolheu em "Camadas extras";
       varredura  — todas as demais consultáveis, só com "Varredura completa". */
  VA.composicaoFontes = function (params, uf) {
    const ok = c => c && c.q && !c.soMapa && params.setores[c.setor] && (!c.apenasUF || c.apenasUF === uf);
    const fixas = VA.CATALOGO.filter(c => c.analise && !c.analise.extra && c.q && params.setores[c.setor] && !(c.analise.opcional === 'osm' && !params.osm));
    const usadas = new Set(fixas.map(c => c.id));
    const tomar = ids => { const l = []; ids.forEach(id => { const c = VA.camada(id); if (ok(c) && !usadas.has(c.id)) { usadas.add(c.id); l.push(c); } }); return l; };
    const pk = VA.PACOTES && VA.PACOTES[params.finalidade];
    const pacote = pk ? tomar(pk.ids) : [];
    const estado = uf && VA.PACOTES_UF ? tomar(VA.PACOTES_UF[uf] || []) : [];
    const escolhidas = tomar(params.extras || []);
    const varredura = params.varredura ? tomar(VA.CATALOGO.filter(c => c.setor !== 'referencia' && !(VA.FORA_DA_VARREDURA && VA.FORA_DA_VARREDURA.has(c.id))).map(c => c.id).concat(['icm_pans'])) : [];
    return { fixas, pacote, estado, escolhidas, varredura, pacoteNome: pk ? pk.nome : '', pacoteDescricao: pk ? pk.descricao : '', uf, total: fixas.length + pacote.length + estado.length + escolhidas.length + varredura.length };
  };
  VA.tarefasAnalise = function (params, uf) {
    const k = VA.composicaoFontes(params, uf);
    return k.fixas.concat(k.pacote, k.estado, k.escolhidas, k.varredura);
  };

  VA.analisar = async function (aoi, params, aoEvento) {
    const ctx = { aoi, params, centro: VA.geo.centro(aoi), extras: new Set(params.extras || []) };
    const inicio = new Date();
    const mun = await VA.municipioEm(ctx.centro[0], ctx.centro[1]).catch(() => null);
    ctx.municipio = mun; ctx.uf = mun && mun.uf && mun.uf.length === 2 ? mun.uf : VA.mapa.uf;
    if (ctx.uf && ctx.uf !== VA.mapa.uf) VA.mapa.definirUF(ctx.uf);
    const comp = VA.composicaoFontes(params, ctx.uf), tarefas = VA.tarefasAnalise(params, ctx.uf);
    ctx.origem = {}; ['pacote', 'estado', 'escolhidas', 'varredura'].forEach(k => comp[k].forEach(c => { ctx.origem[c.id] = k; }));
    ctx.composicao = { fixas: comp.fixas.length, pacote: comp.pacote.length, estado: comp.estado.length, escolhidas: comp.escolhidas.length, varredura: comp.varredura.length, total: comp.total, pacoteNome: comp.pacoteNome, pacoteDescricao: comp.pacoteDescricao, uf: ctx.uf };
    aoEvento && aoEvento({ tipo: 'inicio', total: tarefas.length, ctx, tarefas });
    const resultados = {};
    await VA.limitar(tarefas.map(c => async () => {
      aoEvento && aoEvento({ tipo: 'camada', id: c.id, estado: 'executando' });
      const r = await rodarCamada(c, ctx);
      resultados[c.id] = r;
      aoEvento && aoEvento({ tipo: 'camada', id: c.id, estado: r.status, resultado: r });
    }), 6);
    const ordem = tarefas.map(c => c.id);
    let n = 0;
    ordem.forEach(id => (resultados[id].itens || []).forEach(it => { it.evid = 'E' + (++n); }));
    return { ctx, resultados, ordem, inicio, fim: new Date(), params };
  };

  /** Repete só algumas camadas (ex.: as que falharam) mantendo o contexto; renumera as evidências. */
  VA.reanalisar = async function (analise, ids, aoEvento) {
    await VA.limitar(ids.map(id => async () => {
      const c = VA.camada(id); if (!c) return;
      aoEvento && aoEvento({ tipo: 'camada', id, estado: 'executando' });
      const r = await rodarCamada(c, analise.ctx);
      analise.resultados[id] = r;
      aoEvento && aoEvento({ tipo: 'camada', id, estado: r.status, resultado: r });
    }), 6);
    let n = 0;
    analise.ordem.forEach(id => (analise.resultados[id].itens || []).forEach(it => { it.evid = 'E' + (++n); }));
    analise.fim = new Date();
    return analise;
  };
})();
