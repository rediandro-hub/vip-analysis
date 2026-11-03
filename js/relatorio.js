/* VIP ANALYSIS — relatório técnico, mapa da área, pacote de evidências e prompt de IA. */
'use strict';

(function () {
  const VA = window.VA;
  const esc = s => VA.fmt.esc(s);

  VA.metricasAOI = function (aoi) {
    const g = aoi.geometry, poli = /Polygon/.test(g.type);
    const c = VA.geo.centro(aoi);
    return {
      tipo: { Point: 'Ponto', MultiPoint: 'Conjunto de pontos', Polygon: 'Polígono', MultiPolygon: 'Multipolígono' }[g.type] || g.type,
      area_ha: poli ? turf.area(aoi) / 10000 : null,
      perimetro_km: poli ? turf.length(turf.polygonToLine(aoi), { units: 'kilometers' }) : null,
      vertices: turf.coordAll(aoi).length,
      centro: c, f: VA.coord.formatos(c[0], c[1])
    };
  };

  /* ---------- mapa real: satélite + processos ANM + UCs + área e achados ---------- */
  VA.mapaRelatorio = function (aoi, analise, { W = 1200, H = 720, limpo = false, folga = 0.45, minKm = 1.2 } = {}) {
    const b0 = turf.bbox(aoi);
    const kmLado = Math.max((b0[2] - b0[0]) * 111.32 * Math.cos(b0[1] * Math.PI / 180), (b0[3] - b0[1]) * 110.57);
    const b = VA.geo.bboxBuffer(aoi.geometry, Math.max(minKm, kmLado * folga));
    let [x0, y0] = VA.geo.merc([b[0], b[1]]), [x1, y1] = VA.geo.merc([b[2], b[3]]);
    const asp = W / H, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    let w = x1 - x0, h = y1 - y0;
    if (w / h > asp) h = w / asp; else w = h * asp;
    x0 = cx - w / 2; x1 = cx + w / 2; y0 = cy - h / 2; y1 = cy + h / 2;
    const bb = [x0, y0, x1, y1].map(v => v.toFixed(1)).join(',');
    const P = ([lon, lat]) => { const [x, y] = VA.geo.merc([lon, lat]); return [((x - x0) / w * W).toFixed(1), ((y1 - y) / h * H).toFixed(1)]; };
    const sat = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${bb}&bboxSR=3857&imageSR=3857&size=${W},${H}&format=jpg&f=image`;
    const rot = `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/export?bbox=${bb}&bboxSR=3857&imageSR=3857&size=${W},${H}&format=png32&transparent=true&f=image`;
    const anm = `${VA.URL.ANM}SIGMINE/dados_anm/MapServer/export?bbox=${bb}&bboxSR=3857&imageSR=3857&size=${W},${H}&format=png32&transparent=true&layers=show:0,3,4&f=image`;
    const uc = `${VA.URL.INDE}?service=WMS&version=1.1.1&request=GetMap&layers=MMA:cnuc_2026_03&styles=&srs=EPSG:3857&bbox=${bb}&width=${W}&height=${H}&format=image/png&transparent=true`;
    const caminho = g => {
      const anel = r => 'M' + r.map(P).map(p => p.join(',')).join('L') + 'Z';
      const linha = r => 'M' + r.map(P).map(p => p.join(',')).join('L');
      if (g.type === 'Polygon') return g.coordinates.map(anel).join('');
      if (g.type === 'MultiPolygon') return g.coordinates.map(p => p.map(anel).join('')).join('');
      if (g.type === 'LineString') return linha(g.coordinates);
      if (g.type === 'MultiLineString') return g.coordinates.map(linha).join('');
      return '';
    };
    let corpo = '';
    (analise && !limpo ? analise.ordem : []).forEach(id => {
      const r = analise.resultados[id];
      (r.itens || []).filter(i => i.feature && i.feature.geometry && (i.incide || i.distancia_km < kmLado * 0.6 + 1)).slice(0, 25).forEach(i => {
        const g = i.feature.geometry, cor = i.incide ? '#ff2d55' : '#ffb703';
        if (/Point/.test(g.type)) (g.type === 'Point' ? [g.coordinates] : g.coordinates).forEach(c => { const [x, y] = P(c); corpo += `<circle cx="${x}" cy="${y}" r="5" fill="${cor}" stroke="#fff" stroke-width="1.5"/><text x="${+x + 7}" y="${+y - 6}" font-size="11" fill="#fff" stroke="#000" stroke-width="2.5" paint-order="stroke">${esc(i.evid)}</text>`; });
        else corpo += `<path d="${caminho(g)}" fill="${i.incide ? 'rgba(255,45,85,.12)' : 'none'}" stroke="${cor}" stroke-width="${i.incide ? 2 : 1.3}" ${i.incide ? '' : 'stroke-dasharray="6 4"'} fill-rule="evenodd"/>`;
      });
    });
    const g = aoi.geometry;
    let area = '';
    if (/Polygon/.test(g.type)) area = `<path d="${caminho(g)}" fill="none" stroke="#fff" stroke-width="5" opacity=".85"/><path d="${caminho(g)}" fill="none" stroke="#1665d8" stroke-width="2.6"/>`;
    else (g.type === 'Point' ? [g.coordinates] : g.coordinates).forEach(c => { const [x, y] = P(c); area += `<circle cx="${x}" cy="${y}" r="10" fill="none" stroke="#fff" stroke-width="5"/><circle cx="${x}" cy="${y}" r="10" fill="none" stroke="#1665d8" stroke-width="3"/><circle cx="${x}" cy="${y}" r="3" fill="#1665d8"/>`; });
    const mpp = w / W, alvo = mpp * 160 / 1000, passos = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50], km = passos.reduce((a, c) => Math.abs(c - alvo) < Math.abs(a - alvo) ? c : a), px = km * 1000 / mpp / Math.cos(((b[1] + b[3]) / 2) * Math.PI / 180);
    const escala = `<g transform="translate(18,${H - 26})"><rect x="-8" y="-14" width="${(px + 70).toFixed(0)}" height="30" rx="4" fill="rgba(255,255,255,.85)"/><rect width="${px.toFixed(1)}" height="6" fill="#0b1730"/><rect width="${(px / 2).toFixed(1)}" height="6" fill="#1665d8"/><text x="${(px + 6).toFixed(1)}" y="7" font-size="12" fill="#0b1730" font-family="Arial">${km < 1 ? km * 1000 + ' m' : km + ' km'}</text></g>`;
    const norte = `<g transform="translate(${W - 34},40)"><circle r="20" fill="rgba(255,255,255,.85)"/><path d="M0,-14 L7,8 L0,3 L-7,8 Z" fill="#0b1730"/><text y="17" font-size="10" text-anchor="middle" fill="#0b1730" font-family="Arial">N</text></g>`;
    return `<div class="mapa-rel" style="position:relative;width:100%;aspect-ratio:${W}/${H};background:#1b2433;border-radius:6px;overflow:hidden">
      <img src="${sat}" style="position:absolute;inset:0;width:100%;height:100%" alt="Imagem de satélite">
      ${limpo ? '' : `<img src="${uc}" style="position:absolute;inset:0;width:100%;height:100%;opacity:.55" alt="" onerror="this.remove()">
      <img src="${anm}" style="position:absolute;inset:0;width:100%;height:100%;opacity:.65" alt="" onerror="this.remove()">`}
      <img src="${rot}" style="position:absolute;inset:0;width:100%;height:100%" alt="" onerror="this.remove()">
      <svg viewBox="0 0 ${W} ${H}" style="position:absolute;inset:0;width:100%;height:100%">${corpo}${area}${escala}${norte}</svg></div>`;
  };

  /* ---------- pacote de evidências (entrada da IA) ---------- */
  VA.pacoteEvidencias = function (s) {
    const { aoi, analise, avaliacao, finalidade, origem } = s;
    const m = VA.metricasAOI(aoi), mun = analise.ctx.municipio;
    return {
      schema: 'vip-analysis/evidencias@2', versao_app: VA.versao, gerado_em: new Date().toISOString(),
      finalidade: { codigo: finalidade, descricao: VA.FINALIDADES[finalidade] }, parametros: analise.params,
      area_interesse: { origem, tipo: m.tipo, area_ha: m.area_ha, perimetro_km: m.perimetro_km, centro: { decimal: m.f.dec, gms: m.f.gms, utm: m.f.utm }, municipio: mun && mun.municipio, uf: analise.ctx.uf, municipios_abrangidos: (s.municipios || []).map(VA.fmt.munUF), geometria_wgs84: VA.geo.simplificarAte(aoi.geometry, 500) },
      quadro_restricoes: avaliacao.quadro,
      fontes: analise.ordem.map(id => { const r = analise.resultados[id]; return { id, camada: r.camada.nome, setor: r.camada.setor, orgao: r.camada.fonte, status: r.status, completude: r.completude || null, motivos_parcial: r.motivosParcial || [], resumo: r.resumo, filtro: r.filtro || null, erro: r.erro || null, consultado_em: r.consultadoEm, origem_dados: r.origemDados ? (r.origemDados.cache ? { cache: true, idade_s: r.origemDados.idadeS } : { cache: false, via: r.origemDados.via }) : null, requisicoes: r.consultas }; }),
      decisao: { classe: avaliacao.sintese.classe, conclusiva: !!(avaliacao.sintese.cobertura && avaliacao.sintese.cobertura.completa), texto: avaliacao.sintese.texto, proxima_acao: avaliacao.sintese.proximaAcao || null,
        fontes_criticas: avaliacao.sintese.cobertura ? avaliacao.sintese.cobertura.criticas.map(x => ({ id: x.id, nome: x.nome, estado: x.estado, motivo: x.motivo || null, cache_idade_s: x.cache })) : [],
        fontes_importantes: avaliacao.sintese.cobertura ? avaliacao.sintese.cobertura.importantes.map(x => ({ id: x.id, nome: x.nome, estado: x.estado, motivo: x.motivo || null })) : [] },
      evidencias: analise.ordem.flatMap(id => (analise.resultados[id].itens || []).map(it => ({ id: it.evid, camada: id, titulo: it.titulo, subtitulo: it.subtitulo, atributos: Object.fromEntries(it.atributos || []), distancia_km: it.distancia_km == null ? null : +it.distancia_km.toFixed(3), sobreposicao_ha: it.sobreposicao_ha == null ? null : +it.sobreposicao_ha.toFixed(3), incide_na_area: !!it.incide }))),
      ficha_local: analise.local ? Object.assign({}, analise.local, { mapas: undefined }) : null,
      requerimento: analise.requerimento && !analise.requerimento.erro ? { veredito: analise.requerimento.texto, classe: analise.requerimento.classe, substancia: analise.requerimento.substancia, limite: analise.requerimento.limite, area_ha: analise.requerimento.area_ha, livre_ha: analise.requerimento.livre && analise.requerimento.livre.ha, livre_status: analise.requerimento.livre ? analise.requerimento.livre.status : null, livre_pendentes: analise.requerimento.livre ? analise.requerimento.livre.pendentes : [], livre_erro: analise.requerimento.livre ? analise.requerimento.livre.erro : null, poligonal_bloqueada: analise.requerimento.poligonalBloqueada || null, itens: analise.requerimento.itens, poligonal: analise.requerimento.poligonal && { ha: analise.requerimento.poligonal.ha, vertices: analise.requerimento.poligonal.feature.geometry.coordinates[0] } } : null,
      inteligenciaMineral: analise.favorab && analise.favorab.alvos ? (F => ({ mineral: F.mineral, sistema: F.sistema, camadas: F.camadas, consultadoEm: F.consultadoEm, janela_km: +F.janelaKm.toFixed(1),
        area: { favorabilidade_percentil: F.favAoiPct, confiabilidade: F.confAoi }, disponibilidade: F.disponibilidade,
        ranking: F.alvos.map(a => ({ id: a.id, rank: a.rank, coordenadas: a.c, favorabilidade: +a.nota.toFixed(3), confiabilidade: +a.conf.toFixed(3), oportunidade: +a.oportunidade.toFixed(3), categoria: a.categoria, situacao: a.situacao, area_ha: +a.area_ha.toFixed(1), distancia_km: +a.dist_km.toFixed(2), unidade: a.unidade, favoraveis: a.motivos, desfavoraveis: a.contra, contribuicoes: a.contrib, geofisica_percentis: a.geof })),
        geologia: F.geologia, contexto: F.contexto, estruturas: F.estruturas, geofisica: { levantamentos: F.levantamentos, resolucao: F.resolucaoGeof, naArea: F.geofisica && F.geofisica.naArea, cobertura: F.geofisica && F.geofisica.cobertura },
        geoquimica: F.geoquimica, erros: F.erros }))(analise.favorab) : null,
      bateia: analise.bateia || null,
      alvo: analise.alvo && analise.alvo.mineral ? { mineral: analise.alvo.mineral, termos: analise.alvo.termos, raio_km: analise.alvo.raioKm, resumo: analise.alvo.resumo, erros: analise.alvo.erros,
        ocorrencias: analise.alvo.ocorrencias.map(i => ({ id: i.evid, titulo: i.titulo, atributos: Object.fromEntries(i.atributos || []), distancia_km: +i.distancia_km.toFixed(3), incide_na_area: !!i.incide, coordenadas: i.feature.geometry.type === 'Point' ? i.feature.geometry.coordinates : null })),
        processos: analise.alvo.processos.map(i => ({ id: i.evid, processo: i.props.PROCESSO, fase: i.fase, titular: i.props.NOME, substancia: i.props.SUBS, distancia_km: +i.distancia_km.toFixed(3), incide_na_area: !!i.incide })) } : null,
      achados_regras: avaliacao.achados, sintese_regras: avaliacao.sintese
    };
  };

  VA.promptIA = function (pacote) {
    return `# Papel
Você é analista sênior de inteligência territorial no Brasil, com domínio de direito minerário (ANM), setor elétrico (ANEEL/EPE/ONS), regularização fundiária (INCRA, CAR, registro de imóveis) e licenciamento ambiental. Escreve para um investidor que vai decidir se avança com a área.

# Regras invioláveis
1. Use apenas o PACOTE DE EVIDÊNCIAS para afirmar fatos sobre a área. Não acrescente processos, imóveis, unidades de conservação, distâncias ou números que não estejam nele.
2. Toda afirmação factual sobre a área cita evidências entre colchetes, ex.: [E3] ou [E3, E7]. Conhecimento geral (leis, conceitos) é marcado como (conhecimento geral).
3. Classifique cada conclusão: COMPROVADO (dado oficial no pacote), PROVÁVEL (inferência das evidências citadas) ou A VERIFICAR (fonte não consultada, lacuna ou documento externo).
4. Fontes com status "falha" ou "sem_base" são lacunas: diga o que NÃO pode ser concluído por causa delas.
5. Ausência de registro não prova inexistência.
6. Não emita parecer jurídico ou técnico definitivo; indique quem deve confirmar (advogado, geólogo, engenheiro eletricista, agrimensor, cartório).
7. Seja quantitativo quando o pacote permitir. Se discordar de um achado das regras automáticas, explique.

# Tarefa
Finalidade: ${pacote.finalidade.descricao}.${pacote.alvo ? ` Alvo da pesquisa: ${pacote.alvo.mineral} — dê prioridade ao que o pacote diz sobre esse bem (seção "alvo", evidências A#) e avalie se a área merece pesquisa para ele.` : ''} Produza em português:
## 1. Conclusão executiva — semáforo VERDE/AMARELO/VERMELHO e o motivo principal (até 5 linhas)
## 2. Restrições e riscos — tabela: risco | gravidade | classificação | evidências | como verificar/mitigar
## 3. Oportunidades — mesma estrutura
## 4. Lacunas e próximos passos — por impacto na decisão, com responsável
## 5. Perguntas que o operador deve responder antes de decidir

# Pacote de evidências (JSON)
\`\`\`json
${JSON.stringify(pacote, null, 1)}
\`\`\`
`;
  };

  /* ---------- relatório ---------- */
  const COR_SETOR = { energia: '#d79027', mineracao: '#9268cc', fundiario: '#328fc0', ambiental: '#399b71', referencia: '#5a6b85' };
  const COR_NIVEL = { impeditivo: '#b3121d', alerta: '#d4521a', atencao: '#b7800f', oportunidade: '#187a5e', informativo: '#1665d8', lacuna: '#6b7280', inconclusivo: '#6d28d9' };
  /* status econômico das ocorrências do GEOBANK */
  const COR_STATUS = { mina: '#c1121f', garimpo: '#e07b00', 'nao explotado': '#1665d8', indeterminado: '#7b8794' };
  const corStatus = s => COR_STATUS[VA.fmt.norm(s || 'indeterminado')] || '#7b8794';

  function dadosMapa(aoi, analise) {
    const feats = [];
    analise.ordem.forEach(id => {
      const r = analise.resultados[id];
      (r.itens || []).forEach(it => {
        if (!it.feature || !it.feature.geometry || feats.length >= 800) return;
        let g = it.feature.geometry;
        try { if (!/Point/.test(g.type)) g = VA.geo.simplificarAte(g, 250); } catch (e) { }
        feats.push({ type: 'Feature', geometry: g, properties: { e: it.evid, c: r.camada.nome, s: r.camada.setor, t: it.titulo, d: it.distancia_km == null ? null : +it.distancia_km.toFixed(3), i: it.incide ? 1 : 0, h: it.sobreposicao_ha == null ? null : +it.sobreposicao_ha.toFixed(2) } });
      });
    });
    return { aoi: { type: 'Feature', properties: {}, geometry: VA.geo.simplificarAte(aoi.geometry, 2000) }, fc: { type: 'FeatureCollection', features: feats }, cores: COR_SETOR };
  }

  /* pontos de ocorrência para o mapa do relatório: do alvo, ou todas as do GEOBANK no raio (varredura geral) */
  function dadosOcorrencias(analise) {
    const A = analise.alvo, R = analise.resultados;
    const ponto = it => { const g = it.feature && it.feature.geometry; if (!g) return null; const c = g.type === 'Point' ? g.coordinates : turf.centroid(it.feature).geometry.coordinates; const p = it.props || {};
      return { e: it.evid, c: [+c[0].toFixed(6), +c[1].toFixed(6)], t: it.titulo, sub: p.SUBSTANCIAS || '', st: p.STATUS_ECONOMICO || 'Indeterminado', imp: p.IMPORTANCIA || '', d: it.distancia_km == null ? null : +it.distancia_km.toFixed(3), i: it.incide ? 1 : 0 }; };
    if (A && A.mineral) {
      return { modo: 'alvo', titulo: A.mineral, raioKm: A.raioKm,
        pontos: A.ocorrencias.map(ponto).filter(Boolean),
        polis: A.processos.slice(0, 120).map(it => { let g = it.feature.geometry; try { g = VA.geo.simplificarAte(g, 120); } catch (e) { } return { type: 'Feature', geometry: g, properties: { e: it.evid, t: it.titulo, n: it.props.NOME || '', d: +it.distancia_km.toFixed(3), i: it.incide ? 1 : 0 } }; }) };
    }
    const oc = R.sgb_ocorr && !['falha', 'sem_base'].includes(R.sgb_ocorr.status) ? R.sgb_ocorr : null;
    if (!oc || !oc.itens.length) return null;
    return { modo: 'geral', titulo: 'todas as substâncias', raioKm: oc.raioKm, pontos: oc.itens.map(ponto).filter(Boolean), polis: [] };
  }

  /* versão estática (impressão) do mapa de ocorrências */
  function mapaOcorrenciasEstatico(aoi, MO, { W = 1200, H = 680 } = {}) {
    const lons = MO.pontos.map(p => p.c[0]), lats = MO.pontos.map(p => p.c[1]);
    MO.polis.forEach(f => { try { const bb = turf.bbox(f); lons.push(bb[0], bb[2]); lats.push(bb[1], bb[3]); } catch (e) { } });
    const b0 = turf.bbox(aoi);
    let b = [Math.min(b0[0], ...lons), Math.min(b0[1], ...lats), Math.max(b0[2], ...lons), Math.max(b0[3], ...lats)];
    const pad = Math.max(0.01, (b[2] - b[0]) * 0.08, (b[3] - b[1]) * 0.08);
    b = [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad];
    let [x0, y0] = VA.geo.merc([b[0], b[1]]), [x1, y1] = VA.geo.merc([b[2], b[3]]);
    const asp = W / H, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; let w = x1 - x0, h = y1 - y0;
    if (w / h > asp) h = w / asp; else w = h * asp;
    x0 = cx - w / 2; x1 = cx + w / 2; y0 = cy - h / 2; y1 = cy + h / 2;
    const bb = [x0, y0, x1, y1].map(v => v.toFixed(1)).join(',');
    const P = ([lon, lat]) => { const [x, y] = VA.geo.merc([lon, lat]); return [+((x - x0) / w * W).toFixed(1), +((y1 - y) / h * H).toFixed(1)]; };
    const anel = r => 'M' + r.map(P).map(p => p.join(',')).join('L') + 'Z';
    const caminho = g => g.type === 'Polygon' ? g.coordinates.map(anel).join('') : g.type === 'MultiPolygon' ? g.coordinates.map(p => p.map(anel).join('')).join('') : '';
    const sat = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${bb}&bboxSR=3857&imageSR=3857&size=${W},${H}&format=jpg&f=image`;
    const rot = `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/export?bbox=${bb}&bboxSR=3857&imageSR=3857&size=${W},${H}&format=png32&transparent=true&f=image`;
    let svg = MO.polis.map(f => `<path d="${caminho(f.geometry)}" fill="rgba(178,109,240,.12)" stroke="#b26df0" stroke-width="1.4" fill-rule="evenodd"/>`).join('');
    const g = aoi.geometry;
    svg += /Polygon/.test(g.type) ? `<path d="${caminho(g)}" fill="none" stroke="#fff" stroke-width="5"/><path d="${caminho(g)}" fill="none" stroke="#1665d8" stroke-width="2.6"/>`
      : (() => { const [x, y] = P(g.type === 'Point' ? g.coordinates : turf.centroid(aoi).geometry.coordinates); return `<circle cx="${x}" cy="${y}" r="11" fill="none" stroke="#fff" stroke-width="5"/><circle cx="${x}" cy="${y}" r="11" fill="none" stroke="#1665d8" stroke-width="3"/>`; })();
    MO.pontos.slice(0, 600).forEach(p => { const [x, y] = P(p.c); svg += `<circle cx="${x}" cy="${y}" r="${p.i ? 7 : 5.5}" fill="${corStatus(p.st)}" stroke="#fff" stroke-width="1.6"/>`; });
    MO.pontos.slice(0, 12).forEach(p => { const [x, y] = P(p.c); svg += `<text x="${x + 8}" y="${y - 7}" font-size="11.5" font-family="Arial" fill="#fff" stroke="#000" stroke-width="2.6" paint-order="stroke">${esc(p.e)}</text>`; });
    const mpp = w / W, alvoKm = mpp * 160 / 1000, passos = [0.5, 1, 2, 5, 10, 20, 50, 100], km = passos.reduce((a, c) => Math.abs(c - alvoKm) < Math.abs(a - alvoKm) ? c : a), px = km * 1000 / mpp / Math.cos(((b[1] + b[3]) / 2) * Math.PI / 180);
    svg += `<g transform="translate(18,${H - 26})"><rect x="-8" y="-14" width="${(px + 70).toFixed(0)}" height="30" rx="4" fill="rgba(255,255,255,.88)"/><rect width="${px.toFixed(1)}" height="6" fill="#0b1730"/><rect width="${(px / 2).toFixed(1)}" height="6" fill="#1665d8"/><text x="${(px + 6).toFixed(1)}" y="7" font-size="12" fill="#0b1730" font-family="Arial">${km} km</text></g>`;
    return `<div class="mapa-est" style="aspect-ratio:${W}/${H}"><img src="${sat}" alt="Imagem de satélite"><img src="${rot}" alt="" onerror="this.remove()"><svg viewBox="0 0 ${W} ${H}">${svg}</svg></div>`;
  }


  /* ====================================================================== */
  /* FICHA DO LOCAL — blocos da capa                                         */
  /* ====================================================================== */
  const DIRECAO = { N: 'norte', NE: 'nordeste', L: 'leste', SE: 'sudeste', S: 'sul', SO: 'sudoeste', O: 'oeste', NO: 'noroeste' };
  const fmtH = h => { if (h == null) return '—'; const t = Math.round(h * 60); return t < 60 ? t + ' min' : `${Math.floor(t / 60)}h${String(t % 60).padStart(2, '0')}`; };
  const fmtInt = v => v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  const fmtReais = mil => mil == null ? '—' : mil >= 1e6 ? `R$ ${VA.fmt.num(mil / 1e6, 2)} bilhões` : `R$ ${VA.fmt.num(mil / 1e3, 1)} milhões`;
  const pct = v => v == null ? '—' : VA.fmt.num(v * 100, 0) + '%';
  const SUPERF = { PAV: 'pavimentada', DUP: 'duplicada', EOD: 'em obras de duplicação', EOP: 'em obras de pavimentação', IMP: 'implantada, sem pavimento', LEN: 'leito natural', PLA: 'planejada', TRV: 'travessia' };
  const PARA_QUE = {
    mineracao: 'Apoiar a decisão de requerer, adquirir ou investir em direitos minerários nesta área: se ela tem processos ativos no cadastro da ANM, o que se sabe da geologia e das ocorrências minerais, que restrições ambientais e fundiárias pesam sobre a pesquisa e a lavra, e como ficam o escoamento e a energia.',
    solar: 'Apoiar a decisão de implantar geração de energia nesta área: recurso solar, distância e porte da rede de transmissão e de distribuição, sobreposição com outros empreendimentos e restrições ambientais e fundiárias ao uso do terreno.',
    terra: 'Apoiar a compra ou o arrendamento do imóvel: situação no CAR, no SIGEF e no SNCI, áreas de regime especial (terras indígenas, quilombos, assentamentos, terrenos da União), restrições ambientais ao uso e direitos minerários de terceiros.',
    geral: 'Dar uma visão completa do território para due diligence: o que existe dentro da área e no entorno em energia, mineração, situação fundiária e meio ambiente, com a fonte oficial de cada dado e as lacunas de cada consulta.'
  };

  /* climograma: chuva mensal (barras) e temperatura média (linha) */
  function climograma(cl, W = 340, H = 150) {
    const ml = 34, mr = 34, mt = 20, mb = 22, pw = W - ml - mr, ph = H - mt - mb;
    const P = cl.meses.map(x => x.p), T = cl.meses.map(x => x.t);
    const passo = [25, 50, 100, 150, 200, 250, 300, 400, 500].find(v => v >= Math.max(...P)) || Math.ceil(Math.max(...P) / 100) * 100;
    const t0 = Math.floor(Math.min(...T) - 2), t1 = Math.ceil(Math.max(...T) + 2);
    const bw = pw / 12, x = i => ml + i * bw, yP = v => mt + ph - v / passo * ph, yT = v => mt + (t1 - v) / (t1 - t0) * ph;
    let g = `<line x1="${ml}" x2="${W - mr}" y1="${mt + ph}" y2="${mt + ph}" stroke="#b9c6d6"/>`;
    [0.5, 1].forEach(f => { g += `<line x1="${ml}" x2="${W - mr}" y1="${yP(passo * f)}" y2="${yP(passo * f)}" stroke="#d9e2ee" stroke-dasharray="2 3"/>`; });
    P.forEach((p, i) => { g += `<rect x="${(x(i) + 3).toFixed(1)}" y="${yP(p).toFixed(1)}" width="${(bw - 6).toFixed(1)}" height="${(mt + ph - yP(p)).toFixed(1)}" rx="2" fill="#86b0ee"><title>${cl.meses[i].nome}: ${p} mm</title></rect>`; });
    g += `<polyline fill="none" stroke="#c2410c" stroke-width="2" stroke-linejoin="round" points="${T.map((t, i) => (x(i) + bw / 2).toFixed(1) + ',' + yT(t).toFixed(1)).join(' ')}"/>`;
    T.forEach((t, i) => { g += `<circle cx="${(x(i) + bw / 2).toFixed(1)}" cy="${yT(t).toFixed(1)}" r="2.4" fill="#c2410c"><title>${cl.meses[i].nome}: ${VA.fmt.num(t, 1)} °C</title></circle>`; });
    cl.meses.forEach((m, i) => { g += `<text x="${(x(i) + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${m.nome.charAt(0).toUpperCase()}</text>`; });
    g += `<text x="${ml - 5}" y="${yP(passo) + 4}" text-anchor="end">${passo}</text><text x="${ml - 5}" y="${mt + ph + 4}" text-anchor="end">0</text><text x="${ml - 5}" y="${mt - 9}" text-anchor="end">mm</text>`;
    g += `<text x="${W - mr + 5}" y="${mt - 9}">°C</text><text x="${W - mr + 5}" y="${yT(t1) + 4}">${t1}</text><text x="${W - mr + 5}" y="${yT(t0) + 4}">${t0}</text>`;
    return `<svg class="climograma" viewBox="0 0 ${W} ${H}" role="img" aria-label="Chuva e temperatura médias por mês">${g}</svg>`;
  }
  /* mapa de localização: no do Brasil, um anel em volta do estado (os pequenos somem na escala);
     no do estado, o município em destaque e um ponto discreto no local */
  function localizador(m, rotulo, anel) {
    if (!m) return '';
    const [x, y] = m.ponto || [];
    const marca = !m.ponto ? '' : anel ? `<circle cx="${x}" cy="${y}" r="9" fill="none" stroke="#fff" stroke-width="3.5"/><circle cx="${x}" cy="${y}" r="9" fill="none" stroke="#0d1b2e" stroke-width="1.5"/>`
      : `<circle cx="${x}" cy="${y}" r="3.2" fill="#fff" stroke="#0d1b2e" stroke-width="1.6"/>`;
    return `<figure class="loc"><svg viewBox="-12 -12 ${m.w + 24} ${m.h + 24}" role="img" aria-label="${esc(rotulo)}"><path d="${m.fundo}" fill="#cfd9e6" stroke="#fff" stroke-width=".7" stroke-linejoin="round" fill-rule="evenodd"/><path d="${m.destaque}" fill="#1f5fd6" stroke="#0d1b2e" stroke-width=".5" stroke-linejoin="round" fill-rule="evenodd"/>${marca}</svg><figcaption>${esc(rotulo)}</figcaption></figure>`;
  }
  const linhaDL = (k, v, extra) => v == null || v === '' ? '' : `<dt>${esc(k)}</dt><dd>${v}${extra ? `<small>${extra}</small>` : ''}</dd>`;

  /* o mais próximo entre várias camadas da análise (LT, subestação…) */
  function maisProximo(R, ids) {
    return ids.map(id => R[id]).filter(r => r && !['falha', 'sem_base'].includes(r.status) && (r.itens || []).some(i => i.distancia_km != null))
      .map(r => ({ r, i: r.itens.filter(i => i.distancia_km != null).sort((a, b) => a.distancia_km - b.distancia_km)[0] }))
      .sort((a, b) => a.i.distancia_km - b.i.distancia_km)[0] || null;
  }

  function fichaHTML(s, F, m) {
    const { aoi, analise } = s, R = analise.resultados, ad = (F && F.adm) || {}, md = (F && F.municipio) || {}, cl = F && F.clima;
    const coord = m.f, varios = s.municipios && s.municipios.length > 1;
    const bioma = R.biomas && R.biomas.dados && R.biomas.dados.bioma;
    const ghi = R.epe_ghi && R.epe_ghi.dados && R.epe_ghi.dados.kwh;
    const cota = (F && F.cota) || s.cota;
    const T = F && F.territorio || {};
    const sim = v => v == null ? null : v ? 'Sim' : 'Não';

    /* visual: satélite da área + localizadores */
    const visual = `<div class="f-visual">
      <figure class="sat">${VA.mapaRelatorio(aoi, null, { W: 960, H: 700, limpo: true, folga: 0.9, minKm: 1.6 })}<figcaption>Imagem de satélite com o contorno da área de interesse</figcaption></figure>
      <div class="locs">${(() => {
        const M2 = F && F.mapas; if (!M2 || (!M2.estado && !M2.regiao)) return '<p class="f-nada">Mapas de localização indisponíveis nesta emissão.</p>';
        const uf = ad.ufNome || ad.uf || 'o estado', rg = M2.regiao, tipo = rg && rg.tipo === 'intermediaria' ? 'região intermediária' : 'mesorregião';
        if (M2.brasil && !rg) return localizador(M2.brasil, `${uf} no Brasil`, true) + localizador(M2.estado, `${ad.municipio || 'Município'} em ${uf}`);
        return localizador(M2.estado, rg ? `${tipo.charAt(0).toUpperCase() + tipo.slice(1)} ${rg.nome} em ${uf}` : `${ad.municipio || 'Município'} em ${uf}`, !!rg)
          + (rg ? localizador(rg, `${ad.municipio || 'Município'} na ${tipo} ${rg.nome}`) : '');
      })()}</div>
    </div>`;

    const localizacao = `<div class="bloco"><h3>Localização</h3><dl>
      ${linhaDL(varios ? 'Municípios' : 'Município', esc(varios ? s.municipios.map(VA.fmt.munUF).join(', ') : ad.municipio || (s.municipios && s.municipios[0] && s.municipios[0].municipio) || '—'), !varios && ad.codigo ? 'código IBGE ' + esc(ad.codigo) : '')}
      ${linhaDL('Estado', esc(ad.ufNome ? `${ad.ufNome} (${ad.uf})` : ad.uf || analise.ctx.uf || '—'))}
      ${linhaDL('Região', esc(ad.regiao || ''))}
      ${linhaDL('Região intermediária', esc(ad.intermediaria || ''))}
      ${linhaDL('Região imediata', esc(ad.imediata || ''))}
      ${linhaDL('Meso e microrregião', ad.meso ? esc(ad.meso + (ad.micro ? ' / ' + ad.micro : '')) : '')}
      ${linhaDL('Bioma', esc(bioma || ''))}
      ${linhaDL('Amazônia Legal', sim(T.amazoniaLegal))}
      ${linhaDL('Faixa de fronteira', T.faixaFronteira == null ? null : T.faixaFronteira ? 'Sim — exige assentimento do Conselho de Defesa Nacional' : 'Não')}
    </dl></div>`;

    const coordenadas = `<div class="bloco"><h3>Coordenadas e altitude</h3><dl>
      ${linhaDL('Decimal', `<span class="mono">${esc(coord.dec)}</span>`)}
      ${linhaDL('Graus, minutos e segundos', `<span class="mono">${esc(coord.gms)}</span>`)}
      ${linhaDL('UTM', `<span class="mono">${esc(coord.utm)}</span>`, esc(coord.utmDet))}
      ${linhaDL('Altitude', cota ? `${VA.fmt.num(cota.m, 0)} m` : '—', cota ? esc(String(cota.fonte).split(' — ')[0].split(' via ')[0]) + ', modelo de superfície' : '')}
      ${linhaDL('Referência', m.area_ha != null ? 'centro geométrico da área' : 'ponto informado')}
    </dl></div>`;

    const p = analise.params;
    const raioPonto = aoi.geometry.type !== 'Point' && /raio de/.test(s.origem || '') ? (s.origem.match(/raio de ([\d.,]+ m)/) || [])[1] : null;
    const area = `<div class="bloco"><h3>Área e geometria</h3><dl>
      ${linhaDL('Tipo', esc(m.tipo), esc(s.origem || ''))}
      ${m.area_ha != null ? linhaDL('Área', `<b>${VA.fmt.ha(m.area_ha)}</b>`, `${VA.fmt.num(m.area_ha * 10000, 0)} m²`) : ''}
      ${m.perimetro_km != null ? linhaDL('Perímetro', `${VA.fmt.num(m.perimetro_km, 3)} km`) : ''}
      ${linhaDL('Vértices', fmtInt(m.vertices))}
      ${raioPonto ? linhaDL('Raio aplicado ao ponto', esc(raioPonto)) : ''}
      ${linhaDL('Entorno pesquisado', `${[p.raioAnmKm, p.raioAmbientalKm, p.raioEnergiaKm].filter(v => v != null).map(v => +v).sort((a, b) => a - b).filter((v, i, l) => i === 0 || i === l.length - 1).map(v => VA.fmt.num(v, 0)).join(' a ')} km`, 'conforme a camada')}
    </dl></div>`;

    let municipio = '';
    if (md.pop || md.pib_mil) {
      const v = md.vab;
      municipio = `<div class="bloco"><h3>${esc(ad.municipio || 'Município')} em números</h3><dl>
        ${linhaDL('População', md.pop ? `<b>${fmtInt(md.pop)}</b> habitantes` : null, 'Censo 2022')}
        ${linhaDL('Área do município', md.area_km2 ? `${VA.fmt.num(md.area_km2, 1)} km²` : null)}
        ${linhaDL('Densidade', md.densidade ? `${VA.fmt.num(md.densidade, 1)} hab./km²` : null)}
        ${linhaDL('PIB', md.pib_mil ? fmtReais(md.pib_mil) : null, md.pibAno ? 'em ' + md.pibAno : '')}
        ${linhaDL('PIB por habitante', md.pibPorHab ? `R$ ${VA.fmt.num(md.pibPorHab / 1000, 1)} mil` : null, md.pibPorHab ? `aproximado: PIB ${md.pibAno} ÷ população 2022` : '')}
      </dl>
      ${v ? `<div class="eco"><div class="eco-t">Composição da economia, ${v.ano}</div><div class="eco-barra">${[['servicos', 'Serviços', '#1f5fd6'], ['publico', 'Administração pública', '#8fb3ee'], ['agro', 'Agropecuária', '#b7791f'], ['industria', 'Indústria', '#5b6b82']].map(([k, n, c]) => `<i style="width:${(v[k] * 100).toFixed(1)}%;background:${c}" title="${n}: ${pct(v[k])}"></i>`).join('')}</div>
        <div class="eco-leg">${[['servicos', 'Serviços', '#1f5fd6'], ['publico', 'Adm. pública', '#8fb3ee'], ['agro', 'Agropecuária', '#b7791f'], ['industria', 'Indústria', '#5b6b82']].map(([k, n, c]) => `<span><i style="background:${c}"></i>${n} ${pct(v[k])}</span>`).join('')}</div></div>` : ''}
    </div>`;
    }

    let clima = '';
    if (cl) {
      clima = `<div class="bloco clima"><h3>Clima</h3>
        <div class="kp"><b>${esc(cl.koppen)}</b><span>Köppen — ${esc(cl.koppenNome)}</span></div>
        ${climograma(cl)}
        <div class="clima-leg"><span><i class="b"></i>chuva (mm/mês)</span><span><i class="l"></i>temperatura média (°C)</span><span>normal ${esc(cl.periodo)}</span></div>
        <dl>
          ${linhaDL('Temperatura média', `${VA.fmt.num(cl.tMedia, 1)} °C`, `de ${VA.fmt.num(cl.mesFrio.t, 1)} °C em ${cl.mesFrio.nome} a ${VA.fmt.num(cl.mesQuente.t, 1)} °C em ${cl.mesQuente.nome}`)}
          ${linhaDL('Chuva anual', `<b>${fmtInt(cl.chuvaAnual)} mm</b>`, cl.chuvosa ? `estação chuvosa ${cl.chuvosa.texto} (${pct(cl.chuvosa.fracao)} do total)` : '')}
          ${linhaDL('Meses secos', `${cl.mesesSecos} de 12`, 'chuva menor que o dobro da temperatura (Gaussen)')}
          ${cl.aridez != null ? linhaDL('Índice de aridez', `${VA.fmt.num(cl.aridez, 2)} — ${esc(cl.aridezClasse)}`, `chuva ÷ evapotranspiração de referência (${fmtInt(cl.eto)} mm/ano)`) : ''}
          ${linhaDL('Irradiação solar', `${VA.fmt.num(ghi || cl.irradiacao, 2)} kWh/m²·dia`, ghi ? 'global horizontal, Atlas Solar INPE/EPE' : 'global horizontal, ERA5')}
        </dl><p class="f-nota">Reanálise ERA5 em grade de cerca de 25 km: no semiárido ela tende a subestimar a chuva. Para projeto, confirme com as normais do INMET ou as séries da ANA (HidroWeb).</p></div>`;
    }

    /* distâncias */
    const linhas = [];
    const dl = (F && F.distancias) || [];
    const snv = maisProximo(R, ['dnit_snv']);
    dl.forEach(d => {
      if (d.tipo === 'rodovia' && snv && snv.i.distancia_km <= d.km + 0.5) {
        const pr = snv.i.props, sup = SUPERF[String(pr.Superficie_Federal || '').toUpperCase()] || pr.Superficie_Federal;
        linhas.push({ rotulo: d.rotulo, nome: `BR-${pr.Codigo_BR}${sup ? ', ' + sup : ''}`, det: [pr.Local_Inicio, pr.Local_Fim].filter(Boolean).join(' → '), km: snv.i.distancia_km, fonte: 'DNIT — SNV' });
      } else linhas.push(d);
    });
    if (F && F.acessoKm != null) linhas.push({ rotulo: 'Via mais próxima, qualquer tipo', nome: 'malha do OpenStreetMap', km: F.acessoKm });
    const lt = maisProximo(R, ['sigel_lt', 'epe_lt']), se = maisProximo(R, ['sigel_se', 'epe_se']);
    const energiaNome = it => { const nome = String(it.titulo || '').split(' · ')[0], t = VA.attr(it.props || {}, ['Tensao', 'TENSAO_KV', 'Tensão', 'REL_TENSAO']) || it.tensao; return esc(nome) + (t && !/kV/i.test(nome) ? ` — ${esc(String(t).replace(/\s*kV$/i, ''))} kV` : ''); };
    if (lt) linhas.push({ rotulo: 'Linha de transmissão mais próxima', nome: energiaNome(lt.i), det: lt.r.camada.fonte, km: lt.i.distancia_km, evid: lt.i.evid, html: true });
    if (se) linhas.push({ rotulo: 'Subestação mais próxima', nome: energiaNome(se.i), det: se.r.camada.fonte, km: se.i.distancia_km, evid: se.i.evid, html: true });
    const mt = R.bdgd_mt && R.bdgd_mt.dados && R.bdgd_mt.dados.distMT != null ? R.bdgd_mt.dados : null;
    if (mt) linhas.push({ rotulo: 'Rede de média tensão', nome: esc(mt.circuitoMT || 'alimentador') + (mt.tensaoMT ? ` — ${VA.bdgd.fmtKv(mt.tensaoMT)}` : ''), km: mt.distMT, html: true });
    const tab = linhas.length ? `<table class="dist"><thead><tr><th>Destino</th><th>Referência</th><th class="num">Linha reta</th><th>Direção</th><th class="num">Por estrada</th><th class="num">Tempo</th></tr></thead><tbody>
      ${linhas.map(d => `<tr><td>${esc(d.rotulo)}</td><td><b>${d.html ? d.nome : esc(d.nome)}</b>${d.det ? `<small>${esc(d.det)}</small>` : ''}${d.evid ? ` <a class="ev" href="#reg-${esc(d.evid)}">${esc(d.evid)}</a>` : ''}</td><td class="num">${d.km === 0 ? 'cruza a área' : VA.fmt.km(d.km)}</td><td>${d.rumo ? DIRECAO[d.rumo] || d.rumo : ''}</td><td class="num">${d.estradaKm != null ? VA.fmt.km(d.estradaKm) : ''}</td><td class="num">${d.estradaH != null ? fmtH(d.estradaH) : ''}</td></tr>`).join('')}
    </tbody></table>
    <p class="f-nota">Linha reta medida do ${m.area_ha != null ? 'centro da área' : 'ponto'}. ${F && F.rotasFonte ? `Rotas por estrada pelo ${esc(F.rotasFonte)}, a partir da via mais próxima, sem paradas — confirme as condições de tráfego no local.` : 'Rotas por estrada indisponíveis nesta emissão.'}</p>` : '<p class="f-nada">Distâncias indisponíveis nesta emissão.</p>';

    const fontes = ['IBGE (Localidades, Censo 2022, PIB dos Municípios, malhas)', cl ? 'ERA5 via Open-Meteo' : null, 'ANM/SIGMINE (sedes, rodovias, ferrovias, portos)', 'ANAC via DNIT (aeródromos)', F && F.rotasFonte ? 'OSRM/OpenStreetMap' : null, cota ? esc(cota.fonte) : null].filter(Boolean);
    return `<section class="ficha" aria-label="Ficha do local">
      ${visual}
      <div class="f-grade3">${localizacao}${coordenadas}${area}</div>
      ${municipio || clima ? `<div class="f-grade2">${municipio}${clima}</div>` : ''}
      <div class="bloco f-dist"><h3>Distâncias e acessos</h3>${tab}</div>
      <p class="f-fontes">Fontes da ficha: ${fontes.join('; ')}.${F && F.erros && F.erros.length ? ` Sem resposta nesta emissão: ${esc(F.erros.map(e => e.split(':')[0]).join(', '))}.` : ''}${!F ? ' A ficha completa do local não foi montada nesta emissão — gere o relatório de novo para incluí-la.' : ''}</p>
    </section>`;
  }

  /* mapa estático em lon/lat (EPSG:4326): satélite + imagens sobrepostas + feições desenhadas */
  function mapaGeo(bb, { W = 1200, H = 720, imagens = [], desenhos = () => '', svgExtra = () => '' } = {}) {
    const asp = W / H, latm = (bb[1] + bb[3]) / 2, kx = Math.cos(latm * Math.PI / 180);
    let [x0, y0, x1, y1] = bb; let w = (x1 - x0) * kx, h = y1 - y0; const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    if (w / h > asp) h = w / asp; else w = h * asp;
    x0 = cx - w / 2 / kx; x1 = cx + w / 2 / kx; y0 = cy - h / 2; y1 = cy + h / 2;
    const P = ([lon, lat]) => [+((lon - x0) / (x1 - x0) * W).toFixed(1), +((y1 - lat) / (y1 - y0) * H).toFixed(1)];
    const caminho = g => { const anel = r => 'M' + r.map(P).map(p => p.join(',')).join('L') + 'Z'; return g.type === 'Polygon' ? g.coordinates.map(anel).join('') : g.type === 'MultiPolygon' ? g.coordinates.map(q => q.map(anel).join('')).join('') : ''; };
    const env = [x0, y0, x1, y1].map(v => v.toFixed(6)).join(',');
    const sat = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${env}&bboxSR=4326&imageSR=4326&size=${W},${H}&format=jpg&f=image`;
    const rot = `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/export?bbox=${env}&bboxSR=4326&imageSR=4326&size=${W},${H}&format=png32&transparent=true&f=image`;
    const img = imagens.map(i => { const [a, b] = P([i.bb[0], i.bb[3]]), [c, d] = P([i.bb[2], i.bb[1]]); return `<image href="${i.url}" x="${a}" y="${b}" width="${(c - a).toFixed(1)}" height="${(d - b).toFixed(1)}" preserveAspectRatio="none" opacity="${i.op || 1}"/>`; }).join('');
    const kmPx = w * 111.32 / W, alvoKm = kmPx * 150, passos = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20], km = passos.reduce((a, c) => Math.abs(c - alvoKm) < Math.abs(a - alvoKm) ? c : a), px = km / kmPx;
    const escala = `<g transform="translate(18,${H - 26})"><rect x="-8" y="-14" width="${(px + 74).toFixed(0)}" height="30" rx="4" fill="rgba(255,255,255,.88)"/><rect width="${px.toFixed(1)}" height="6" fill="#0b1730"/><rect width="${(px / 2).toFixed(1)}" height="6" fill="#1665d8"/><text x="${(px + 6).toFixed(1)}" y="7" font-size="12" fill="#0b1730" font-family="Arial">${km < 1 ? km * 1000 + ' m' : km + ' km'}</text></g>`;
    return { html: `<div class="mapa-est" style="aspect-ratio:${W}/${H}"><img src="${sat}" alt="Imagem de satélite"><img src="${rot}" alt="" onerror="this.remove()"><svg viewBox="0 0 ${W} ${H}">${img}${desenhos(caminho, P)}${svgExtra(P)}${escala}</svg></div>`, P, caminho };
  }

  const COR_REQ = { impede: '#b3121d', ajuste: '#d4521a', condiciona: '#b7800f', livre: '#187a5e', inconclusivo: '#6d28d9' };
  const maiusc = t => t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
  function secaoRequerimento(s, sec, esc2) {
    const Q = s.analise.requerimento; if (!Q || Q.erro) return '';
    const aoi = s.aoi, pg = Q.poligonal;
    const m = mapaRequerimento(s, 1200, 680);
    return secaoRequerimentoCorpo(s, sec, esc2, m, Q, aoi, pg);
  }
  function mapaRequerimento(s, W, H) {
    const Q = s.analise.requerimento, aoi = s.aoi, pg = Q.poligonal;
    const bb = VA.geo.bboxBuffer(aoi.geometry, Math.max(0.3, Math.sqrt(Math.max(Q.area_ha, 1) / 100) * 0.35));
    return mapaGeo(bb, { W, H, desenhos: (cam) => Q.bloqueios.map(b => `<path d="${cam(b.geometry)}" fill="rgba(179,18,29,.28)" stroke="#ff4d5e" stroke-width="1.6" stroke-dasharray="5 4" fill-rule="evenodd"/>`).join('')
      + (Q.livre && Q.livre.feature ? (Q.livre.status === 'confirmada' ? `<path d="${cam(Q.livre.feature.geometry)}" fill="rgba(46,157,58,.28)" stroke="#5fe07a" stroke-width="1.8" fill-rule="evenodd"/>` : `<path d="${cam(Q.livre.feature.geometry)}" fill="rgba(109,40,217,.16)" stroke="#c4a5ff" stroke-width="1.8" stroke-dasharray="6 4" fill-rule="evenodd"/>`) : '')
      + `<path d="${cam(aoi.geometry)}" fill="none" stroke="#fff" stroke-width="4"/><path d="${cam(aoi.geometry)}" fill="none" stroke="#1665d8" stroke-width="2.2"/>`
      + (pg ? `<path d="${cam(pg.feature.geometry)}" fill="none" stroke="#fff" stroke-width="4.5"/><path d="${cam(pg.feature.geometry)}" fill="none" stroke="#0b1730" stroke-width="2.4" stroke-dasharray="9 5"/>` : '') });
  }
  function secaoRequerimentoCorpo(s, sec, esc2, m, Q, aoi, pg) {
    const LI = VA.livreInfo(Q);
    const vs = pg ? pg.feature.geometry.coordinates[0].slice(0, -1) : [];
    const gmsF = (v, h) => VA.coord.fmtGMS(v, h[0], h[1]);
    return sec('requerimento', 'Viabilidade do requerimento') + `
      <div class="parecer" style="--c:${COR_REQ[Q.classe] || '#6b7280'}"><p>${esc2(Q.texto)}</p></div>
      <div class="kpis"><div><b>${VA.fmt.num(Q.area_ha, Q.area_ha < 100 ? 1 : 0)}<small> ha</small></b><span>${Q.ponto ? 'quadrado N-S/L-O pretendido em volta do ponto' : 'área analisada'}</span></div><div class="${LI.status === 'confirmada' ? '' : 'k-aviso'}"><b>${LI.ha != null ? VA.fmt.num(LI.ha, LI.ha < 100 ? 1 : 0) : '—'}<small> ha</small></b><span>${esc2(LI.rotulo)}</span></div><div><b>${Q.limite && Q.limite.ha ? VA.fmt.num(Q.limite.ha, 0) : '—'}<small> ha</small></b><span>limite para ${esc2(Q.substancia || 'a substância (não informada)')}</span></div><div><b>${pg ? VA.fmt.num(pg.ha, pg.ha < 100 ? 1 : 0) : '—'}<small> ha</small></b><span>${pg ? `poligonal N-S/L-O sugerida, ${pg.vertices} vértices` : Q.poligonalBloqueada ? 'poligonal não gerada: área livre não confirmada' : 'poligonal N-S/L-O sugerida'}</span></div></div>
      ${m.html}
      <div class="legenda"><span><i class="ar" style="border-color:#1665d8"></i>área ${Q.ponto ? 'pretendida' : 'analisada'}</span>${LI.status === 'confirmada' ? '<span><i class="ar" style="border-color:#2e9d3a;background:rgba(46,157,58,.3)"></i>sem interferência nas bases</span>' : Q.livre && Q.livre.feature ? '<span><i class="ar tracejado" style="border-color:#6d28d9;background:rgba(109,40,217,.16)"></i>área livre potencial (não definitiva)</span>' : ''}<span><i class="ar" style="border-color:#b3121d;background:rgba(179,18,29,.3)"></i>impedida (terceiros, bloqueio, TI, UC integral, área militar, disponibilidade)</span>${pg ? '<span><i class="ar tracejado" style="border-color:#0b1730"></i>poligonal N-S/L-O sugerida</span>' : ''}</div>
      ${LI.nota ? `<div class="aviso aviso-inc"><b>${LI.status === 'potencial' ? 'Área livre potencial, não definitiva.' : 'Área livre não calculada.'}</b> ${esc2(maiusc(LI.nota))}.</div>` : ''}
      <h3>Checklist</h3>
      <table class="tab req"><thead><tr><th>Situação</th><th>Critério e o que foi encontrado</th><th>O que fazer</th></tr></thead><tbody>${Q.itens.map(i => `<tr><td><span class="rs rs-${i.situacao}">${esc2(VA.SIT_REQ[i.situacao])}</span></td><td><b>${esc2(i.criterio)}</b><div>${esc2(i.detalhe)}${i.evid.length ? ' ' + i.evid.map(e => `<a href="#reg-${esc2(e)}" class="ev">${esc2(e)}</a>`).join('') : ''}</div></td><td class="det">${esc2(i.acao || '—')}</td></tr>`).join('')}</tbody></table>
      ${pg ? `<h3>Poligonal N-S/L-O sugerida</h3>
      <p>${VA.fmt.ha(pg.ha)} em ${pg.vertices} vértices, com lados só nos rumos N-S e L-O verdadeiros, em SIRGAS 2000 — como a ANM exige. Foi desenhada sobre a área sem interferência nas bases${pg.buracosPreenchidos_ha > 0.05 ? `; inclui ${VA.fmt.ha(pg.buracosPreenchidos_ha)} de terceiros cercados pela área, que o SIGAREAS exclui` : ''}${pg.excedeLimite ? `. <b>Passa do limite de ${VA.fmt.num(Q.limite.ha, 0)} ha: reduza antes de protocolar.</b>` : '.'}</p>
      <div class="so-tela mini-acoes"><button class="btn-acao" id="bReqKml">Baixar poligonal (KML)</button><button class="btn-acao" id="bReqCsv">Memorial para conferência (CSV)</button></div>
      <details class="trilha"><summary>Vértices (${vs.length})</summary><table class="tab mini"><thead><tr><th>Vértice</th><th>Latitude</th><th>Longitude</th><th>Decimal</th></tr></thead><tbody>${vs.map(([x, y], i) => `<tr><td>${i + 1}</td><td class="mono">${gmsF(y, ['N', 'S'])}</td><td class="mono">${gmsF(x, ['L', 'O'])}</td><td class="mono">${y.toFixed(7)}, ${x.toFixed(7)}</td></tr>`).join('')}</tbody></table></details>` : Q.poligonalBloqueada ? `<h3>Poligonal N-S/L-O</h3><p class="aviso aviso-inc"><b>Poligonal não gerada:</b> ${esc2(Q.poligonalBloqueada)}. A poligonal só é desenhada sobre área livre confirmada; repita a consulta das fontes pendentes e gere o relatório de novo.</p>` : ''}
      <h3>Próximos passos</h3>
      <ol class="abr"><li>No dia do protocolo, confirme no SIGMINE que a área continua sem processo de terceiros: a prioridade é de quem protocola primeiro.</li><li>Confira a poligonal com o técnico responsável e protocole no sistema de requerimento eletrônico da ANM, com o plano de pesquisa, o orçamento e a ART do geólogo ou engenheiro de minas.</li><li>Resolva antes de investir na pesquisa as condicionantes marcadas acima (anuências, consultas e licenças).</li></ol>
      <p class="fonte">Limites de área: Portaria DNPM 155/2016, art. 42, com a redação das Resoluções ANM 49/2020 e 135/2023. Triagem nas bases públicas consultadas em ${VA.fmt.dataHora(s.analise.inicio)}; não substitui a análise de interferência do SIGAREAS.</p>`;
  }

  /* quadro de cobertura: a conclusão só é positiva quando todas as fontes críticas da finalidade responderam por inteiro */
  function coberturaRel(sint, esc2) {
    const cob = sint.cobertura; if (!cob || !cob.criticas.length) return '';
    const idade = sg => sg < 5400 ? `${Math.max(1, Math.round(sg / 60))} min` : `${VA.fmt.num(sg / 3600, sg < 36000 ? 1 : 0)} h`;
    const linha = x => `<tr><td>${esc2(x.nome)}${x.critica ? '' : ' <span class="fonte">(importante)</span>'}</td><td class="est e-${x.estado}">${esc2(x.rotulo)}</td><td class="det">${esc2(x.estado === 'completo' ? (x.cache != null ? `resposta do cache local, de ${idade(x.cache)} atrás` : 'consulta concluída') : x.motivo || '—')}</td></tr>`;
    const ok = cob.criticas.filter(x => x.estado === 'completo').length;
    return `<div class="cob-rel"><h3>Cobertura das fontes críticas — ${ok} de ${cob.criticas.length} verificadas</h3>
      <table class="tab req"><thead><tr><th>Fonte</th><th>Situação</th><th>Observação</th></tr></thead><tbody>${cob.criticas.concat(cob.importantes).sort((a, b) => (a.estado === 'completo') - (b.estado === 'completo')).map(linha).join('')}</tbody></table>
      ${sint.proximaAcao ? `<p class="acao">Próxima ação: ${esc2(sint.proximaAcao)}</p>` : ''}
      <p class="fonte">Fonte crítica sem resposta ou com lista parcial impede conclusão positiva: o parecer fica inconclusivo até que ela seja verificada. Ausência de registro só vale para fontes verificadas.</p></div>`;
  }

  /* ====================================================================== */
  /* INTELIGÊNCIA MINERAL (bem específico): oportunidades + interpretação   */
  /* ====================================================================== */
  const FONTE_EVID = { oc: 'GEOBANK/SGB: ocorrências do bem e do mesmo sistema mineral', lito: 'Litoestratigrafia do SGB na melhor escala de cada trecho', contato: 'Limites entre unidades de uma mesma escala', estr: 'Estruturas do SGB (1:1.000.000) e suas interseções', gama: 'Aerogamaespectrometria do SGB', mag: 'Aeromagnetometria do SGB', geoq: 'Geoquímica do SGB (rocha, solo, sedimento de corrente)' };
  const COMO_EVID = { oc: 'decai com a distância (1,2 km); mina e garimpo pesam mais que indício; ocorrência de outro bem do mesmo sistema vale 60%', lito: 'nota do tipo de rocha para o modelo; unidade que hospeda ocorrência conhecida sobe no máximo a 0,75 (a ocorrência já conta como ponto)', contato: 'decai com a distância ao contato (0,5 km)', estr: 'maior entre a proximidade da estrutura (1 km) e da interseção de estruturas (1,5 km)', gama: 'percentil na janela da combinação de canais do modelo', mag: 'percentil na janela do canal magnético do modelo', geoq: 'amostra acima do P90 da sua população (elemento, material, unidade e método), decai com 1,5 km; sem amostra a menos de 3 km fica sem nota' };
  const QUAL_EVID = { oc: 'fixa (0,6): cadastro pontual', lito: 'pela escala: 1:25.000 = 1 … 1:1.000.000 = 0,35', contato: '80% da qualidade da litologia', estr: 'fixa (0,35): base 1:1.000.000', gama: 'pelo espaçamento das linhas de voo (≤ 250 m = 1; ≤ 500 m = 0,85; ≤ 1 km = 0,65)', mag: 'idem gamaespectrometria', geoq: 'pela densidade: 3+ amostras a menos de 3 km = 1; 1–2 = 0,6' };
  const COR_CAT = { 'Novo requerimento possível': '#187a5e', 'Aquisição, cessão ou parceria': '#a86a00', 'Parceria com o titular': '#c2410c', 'Oferta pública (ANM)': '#4b5563', 'Restrito': '#4c1d95', 'Disponibilidade não verificada': '#6d28d9' };
  const LEG_DISP = [[1, 'processo de terceiros em pesquisa'], [2, 'processo em lavra ou licenciamento'], [3, 'em disponibilidade (oferta pública da ANM)'], [4, 'condicionada (UC de uso sustentável, quilombo, assentamento, área urbana, reserva garimpeira)'], [5, 'restrita (terra indígena, UC de proteção integral, área militar, bloqueio)'], [6, 'não verificada (fonte crítica sem resposta ou com lista parcial)']];
  const nivelConf = v => v == null ? '—' : v >= 0.6 ? 'alta' : v >= 0.4 ? 'média' : v >= 0.25 ? 'baixa' : 'muito baixa';
  const aoiGeom = aoi => aoi.geometry.type === 'Point' ? turf.circle(aoi.geometry.coordinates, 0.15).geometry : aoi.geometry;
  const pctTxt = v => v == null ? '—' : VA.fmt.num(v * 100, v < 0.1 ? 1 : 0) + '%';

  /* o que fortalece, o que enfraquece e que bases faltam — texto puro, usado pelo relatório e pelos slides */
  function sinteseGeologica(F) {
    const Gl = F.geologia || {}, Cx = F.contexto || {}, Gq = F.geoquimica || {}, Es = F.estruturas || {}, mineral = F.mineral.toLowerCase();
    const somaHa = c => (Gl.naArea || []).filter(z => z.classe === c).reduce((t, z) => t + (z.ha || 0), 0);
    const temHa = (Gl.naArea || []).some(z => z.ha != null), areaTot = (Gl.naArea || []).reduce((t, z) => t + (z.ha || 0), 0);
    const st = Object.entries(Cx.porStatus || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k.toLowerCase()}`).join(', ');
    const forte = [], fraco = [], insuf = [];
    const favPct = temHa && areaTot ? somaHa('favorável') / areaTot : null;
    if (favPct) forte.push(`${pctTxt(favPct)} da área em litologias favoráveis ao modelo (${Gl.melhorEscala}).`);
    else if (temHa && areaTot) fraco.push('Nenhuma litologia da área é das mais favoráveis ao modelo na escala disponível.');
    if ((Gl.hospedeiras || []).some(u => (Gl.naArea || []).some(z => z.sigla && z.sigla === u.sigla))) forte.push('A área contém unidade que hospeda ocorrências conhecidas do bem na janela.');
    if ((Cx.hospedeirasNaArea || []).length) forte.push(`Rochas da área repetem hospedeiras ou encaixantes registradas nos análogos: ${Cx.hospedeirasNaArea.slice(0, 4).join(', ')}.`);
    if (Cx.ocorrencias) forte.push(`${Cx.ocorrencias} ocorrência(s) de ${mineral} até ${VA.fmt.km(Cx.raioKm)} (${st}).`); else fraco.push(`Nenhuma ocorrência de ${mineral} cadastrada até ${VA.fmt.km(Cx.raioKm)}.`);
    if ((Cx.provinciaAurifera || []).length) forte.push(`Dentro de ${Cx.provinciaAurifera.join(', ')} (províncias e distritos auríferos do SGB).`);
    const dentro = F.alvos.filter(a => a.dist_km === 0);
    if (dentro.length) forte.push(`Alvo${dentro.length > 1 ? 's' : ''} ${dentro.map(a => a.id).join(', ')} dentro da área.`);
    else if (F.alvos.length) { const prox = F.alvos.slice().sort((a, b) => a.dist_km - b.dist_km)[0]; fraco.push(`Nenhum alvo cai dentro da área; o mais próximo (${prox.id}) está a ${VA.fmt.km(prox.dist_km)}.`); }
    if (Gq.anomalas && Gq.anomalas.length) forte.push(`${Gq.anomalas.length} resultado(s) geoquímico(s) acima do P90 da sua população na janela.`);
    if (Gl.insuficiente) { fraco.push(`Geologia só ${Gl.melhorEscala ? 'na escala ' + Gl.melhorEscala : 'regional'} sobre a área.`); insuf.push({ rot: 'Geologia', curto: Gl.melhorEscala ? `só ${Gl.melhorEscala}` : 'sem mapa', txt: `${Gl.melhorEscala ? 'a escala mais detalhada sobre a área é ' + Gl.melhorEscala : 'sem mapa sobre a área'}. Para delimitar corpos e contatos é preciso mapeamento em 1:25.000 ou mais detalhado.` }); }
    if (Gq.insuficiente) { fraco.push('Cobertura geoquímica pública insuficiente.'); insuf.push({ rot: 'Geoquímica', curto: `${Gq.amostras || 0} amostra(s) pública(s)`, txt: `${Gq.amostras || 0} amostra(s) pública(s) na janela (${VA.fmt.num(Gq.densidade100km2 || 0, 1)} por 100 km²) para ${(Gq.elementos || []).map(e => e.toUpperCase()).join(', ') || 'os elementos do modelo'}. Não dá para definir limiar de anomalia — a falta de amostra não indica ausência de anomalia. Próximo passo: amostragem de sedimento de corrente e solo${(Gq.projetos || []).length ? ' e leitura dos relatórios dos projetos listados abaixo' : ''}.` }); }
    if (F.resolucaoGeof && F.resolucaoGeof.espacamento_m > 500) { fraco.push(`Aerolevantamento com linhas a cada ${VA.fmt.num(F.resolucaoGeof.espacamento_m, 0)} m.`); insuf.push({ rot: 'Geofísica', curto: `linhas a cada ${VA.fmt.num(F.resolucaoGeof.espacamento_m, 0)} m`, txt: `linhas de voo a cada ${VA.fmt.num(F.resolucaoGeof.espacamento_m, 0)} m — corpos com menos de ~${VA.fmt.num(F.resolucaoGeof.menorFeicao_m, 0)} m de largura não aparecem. Para os alvos, levantamento terrestre ou por drone (magnetometria e gamaespectrometria) com linhas de 25 a 50 m.` }); }
    if (!F.resolucaoGeof && Object.values((F.geofisica || {}).cobertura || {}).every(v => !v)) insuf.push({ rot: 'Geofísica', curto: 'sem aerolevantamento', txt: 'a janela não tem cobertura dos mosaicos aerogeofísicos do SGB.' });
    if (Es.n) insuf.push({ rot: 'Estruturas', curto: 'só 1:1.000.000', txt: 'só a base 1:1.000.000 do SGB (incerteza de posição da ordem de 1 km). Use como corredor, não como traço exato; a interpretação estrutural de detalhe precisa de imagem de satélite, relevo e magnetometria de alta resolução.' });
    else fraco.push('Nenhuma estrutura regional mapeada na janela (base 1:1.000.000).');
    return { forte, fraco, insuf, favPct, somaHa, temHa, areaTot };
  }

  /* mapa de favorabilidade (ou disponibilidade/confiabilidade) com processos da ANM, ocorrências e alvos */
  const COR_PROC = { pesquisa: '#ffb020', lavra: '#ff4d5e', disponibilidade: '#c3c9d2', outro: '#ffb020' };
  function mapaFavHTML(F, aoi, { W = 1200, camada = 'fav', alvoR = 13, processos = camada === 'fav' } = {}) {
    const g = F.grade, H = Math.round(W * g.H / g.W), geomA = aoiGeom(aoi);
    const contorno = cam => `<path d="${cam(geomA)}" fill="none" stroke="#fff" stroke-width="4"/><path d="${cam(geomA)}" fill="none" stroke="#1665d8" stroke-width="2.4"/>`;
    const marcas = P => F.alvos.map(a => { const [x, y] = P(a.c); return `<circle cx="${x}" cy="${y}" r="${alvoR}" fill="rgba(11,23,48,.82)" stroke="${a.categoria === 'Novo requerimento possível' ? '#fff' : '#ffd166'}" stroke-width="2.2"/><text x="${x}" y="${+y + alvoR * 0.36}" font-size="${alvoR}" font-weight="700" text-anchor="middle" fill="#fff" font-family="Arial">${a.id}</text>`; }).join('');
    const procs = cam => processos ? (F.processos || []).map(f => { const c = COR_PROC[f.properties.classe] || COR_PROC.outro; return `<path d="${cam(f.geometry)}" fill="${c}" fill-opacity=".07" stroke="${c}" stroke-width="1.6" fill-rule="evenodd"/>`; }).join('') : '';
    const oc = P => camada === 'fav' ? F.ocorrencias.map(o => { const [x, y] = P(o.c); return `<circle cx="${x}" cy="${y}" r="${o.alvo ? 5 : 3.5}" fill="${o.alvo ? '#8e2bd6' : '#c9a3f0'}" stroke="#fff" stroke-width="1.3"/>`; }).join('') : '';
    return mapaGeo(g.bbox, { W, H, imagens: [{ url: VA.favImagem(F, camada), bb: g.bbox, op: camada === 'disp' ? 1 : camada === 'conf' ? 0.8 : 0.82 }], desenhos: (cam, P) => procs(cam) + contorno(cam) + oc(P) + marcas(P) });
  }
  const legendaProcessos = F => { const cl = new Set((F.processos || []).map(f => f.properties.classe)); return [['pesquisa', 'processo ANM em requerimento ou pesquisa'], ['lavra', 'processo em lavra ou licenciamento'], ['disponibilidade', 'área em disponibilidade']].filter(([k]) => cl.has(k) || (k === 'pesquisa' && cl.has('outro'))).map(([k, t]) => `<span><i class="ar" style="border-color:${COR_PROC[k]};background:${COR_PROC[k]}22"></i>${t}</span>`).join(''); };

  function secaoInteligencia(s, sec, esc2) {
    const F = s.analise.favorab; if (!F) return '';
    if (F.erro || !F.grade) return sec('favorabilidade', 'Inteligência mineral') + `<p class="vazio">Não foi possível montar a inteligência mineral: ${esc2(F.erro || 'sem dados na janela')}. Isso não indica ausência de potencial — repita a análise mais tarde.</p>`;
    const g = F.grade, mineral = F.mineral.toLowerCase(), aoi = s.aoi;
    const mFav = mapaFavHTML(F, aoi, { W: 1400, camada: 'fav', alvoR: 15 });
    const mDisp = mapaFavHTML(F, aoi, { W: 900, camada: 'disp', alvoR: 22 });
    const mConf = mapaFavHTML(F, aoi, { W: 900, camada: 'conf', alvoR: 22 });
    const gms = c => `${VA.coord.fmtGMS(c[1], 'N', 'S')} ${VA.coord.fmtGMS(c[0], 'L', 'O')}`;
    const novos = F.alvos.filter(a => a.categoria === 'Novo requerimento possível').length;
    const D = F.disponibilidade || {};
    const ranking = F.alvos.length ? `<table class="tab fav"><thead><tr><th>Alvo</th><th class="num">Favorabilidade</th><th class="num">Confiabilidade</th><th>O que sustenta e o que pesa contra</th><th>Situação e via de acesso</th></tr></thead><tbody>${F.alvos.map(a => `<tr>
        <td><b class="fav-id">${a.id}</b><div class="mono pequeno">${a.c[1].toFixed(5)}, ${a.c[0].toFixed(5)}</div><div class="fonte">${gms(a.c)}</div><div class="fonte">${a.dist_km === 0 ? '<b>dentro da área</b>' : 'a ' + VA.fmt.km(a.dist_km) + ' da área'} · zona de ${VA.fmt.num(a.area_ha, a.area_ha < 10 ? 1 : 0)} ha entre os 10% mais favoráveis da janela</div></td>
        <td class="num"><b class="nota-g">${Math.round(a.nota * 100)}</b><div class="fonte">de 100</div></td>
        <td class="num"><b class="conf conf-${nivelConf(a.conf).replace(' ', '-')}">${nivelConf(a.conf)}</b><div class="fonte">${Math.round(a.conf * 100)} de 100</div></td>
        <td>${a.motivos.length ? `<ul class="motivos pro">${a.motivos.map(t => `<li>${esc2(t)}</li>`).join('')}</ul>` : '<div class="fonte">convergência de evidências fracas</div>'}${a.contra.length ? `<ul class="motivos contra">${a.contra.map(t => `<li>${esc2(t)}</li>`).join('')}</ul>` : ''}</td>
        <td><span class="cat" style="--c:${COR_CAT[a.categoria] || '#6b7280'}">${esc2(a.categoria)}</span><div class="fonte">${esc2(a.situacao)}</div>${a.zona ? `<div class="fonte">zona do alvo: ${Math.round(a.zona.livre_pct * 100)}% sem processo${a.zona.desconhecida_pct > 0.005 ? `, ${Math.round(a.zona.desconhecida_pct * 100)}% sem verificação` : ''}</div>` : ''}</td></tr>`).join('')}</tbody></table>
      <p class="fonte">Ordem do ranking: favorabilidade × acesso ao direito (1 sem processo ativo; 0,6 processo de terceiros em pesquisa; 0,5 oferta pública; 0,4 lavra; 0,7 no máximo com condicionante; 0,5 quando a disponibilidade não pôde ser verificada; 0 restrito). “Novo requerimento possível” quer dizer sem processo ativo no SIGMINE nem restrição nas bases consultadas em ${VA.fmt.dataHora(s.analise.inicio)} — não é garantia de área livre: confirme no SIGAREAS no dia do protocolo.</p>`
      : '<p class="vazio">Nenhum ponto se destacou com confiabilidade mínima: as evidências não convergem na janela, ou os dados disponíveis são fracos demais para apontar alvos.</p>';

    let h = sec('favorabilidade', `Oportunidades para ${mineral}`) + `
      <p class="lead">Três respostas separadas, para não confundir geologia boa com área acessível: <b>onde procurar</b> (favorabilidade geológica pelo modelo ${esc2(F.sistema.nome.toLowerCase())}), <b>onde é possível atuar</b> (disponibilidade na ANM e restrições territoriais) e <b>com que segurança</b> (confiabilidade dos dados em cada trecho). O ranking cruza as três numa janela de ${VA.fmt.num(F.janelaKm, 0)} km em volta da área.</p>
      <div class="kpis">
        <div><b>${F.favAoiPct != null ? Math.round(F.favAoiPct * 100) : '—'}<small>º</small></b><span>percentil de favorabilidade da área na janela</span></div>
        <div><b class="kpi-txt">${nivelConf(F.confAoi)}</b><span>confiabilidade dos dados na área (${F.confAoi != null ? Math.round(F.confAoi * 100) : '—'} de 100)</span></div>
        <div><b>${F.alvos.length}</b><span>alvos com confiabilidade mínima${novos ? `, ${novos} sem processo ativo` : ''}</span></div>
        ${D.verificada === false ? `<div class="k-aviso"><b class="kpi-txt">não verificada</b><span>disponibilidade na janela (${pctTxt(D.desconhecido_pct)} sem verificação)</span></div>` : `<div><b>${pctTxt(D.semProcesso_pct)}</b><span>da janela sem processo ativo nem restrição (${F.processosJanela || 0} processos na janela${D.truncado ? ', lista parcial: o SIGMINE limitou a resposta' : ''})</span></div>`}
      </div>
      ${D.aviso ? `<div class="aviso aviso-inc"><b>${esc2(D.aviso)}</b>${(D.pendentes || []).filter(x => D.aviso.indexOf(x.nome) < 0).length ? ` Fonte: ${esc2(D.pendentes.filter(x => D.aviso.indexOf(x.nome) < 0).map(x => `${x.nome} — ${x.como}`).join('; '))}.` : ''} Nenhum alvo foi classificado como “Novo requerimento possível”.</div>` : ''}
      ${D.secundariasPendentes && D.secundariasPendentes.length ? `<p class="fonte">Condicionantes não verificadas em toda a janela: ${esc2(D.secundariasPendentes.map(x => `${x.nome} (${x.como})`).join('; '))}.</p>` : ''}
      <h3>Onde procurar: favorabilidade geológica</h3>
      <div class="so-tela"><div id="mapaFav" class="mapa-int mapa-fav"></div></div><div class="so-impressao">${mFav.html}</div>
      <div class="legenda"><span><i class="rampa"></i>favorabilidade relativa à janela: acima do P60 → acima do P97</span><span><i class="pt" style="background:#8e2bd6"></i>ocorrência de ${esc2(mineral)}</span><span><i class="pt" style="background:#c9a3f0"></i>ocorrência do mesmo sistema mineral</span><span><i class="ar" style="border-color:#1665d8"></i>área de interesse</span>${legendaProcessos(F)}<span>alvo com borda amarela: já onerado ou condicionado</span></div>
      <div class="dois-mapas">
        <figure><figcaption><b>Onde é possível atuar: disponibilidade</b></figcaption>${mDisp.html}<div class="legenda"><span><i class="ar" style="border-color:#94a3b8"></i>sem processo ativo nem restrição (${pctTxt(D.semProcesso_pct)})</span>${LEG_DISP.filter(([k]) => k !== 6 || D.desconhecido_pct > 0).map(([k, t]) => `<span><i class="ar" style="border-color:${VA.COR_DISP[k]};background:${VA.COR_DISP[k]}88"></i>${esc2(t)}</span>`).join('')}</div></figure>
        <figure><figcaption><b>Com que segurança: confiabilidade dos dados</b></figcaption>${mConf.html}<div class="legenda"><span><i class="rampa rampa-conf"></i>baixa → alta (escala da geologia, espaçamento do aerolevantamento, densidade de amostras)</span></div></figure>
      </div>
      <h3>Ranking de oportunidades</h3>
      ${ranking}`;

    /* ---------- interpretação geológica integrada ---------- */
    const Gl = F.geologia || {}, Cx = F.contexto || {}, Gq = F.geoquimica || {}, Es = F.estruturas || {};
    const CLS_COR = { 'favorável': '#187a5e', 'possível': '#a86a00', 'pouco favorável': '#6b7280' };
    const { somaHa, temHa, areaTot } = sinteseGeologica(F);
    const cobEsc = Object.entries(Gl.cobertura || {}).sort((a, b) => b[1] - a[1]).map(([e, f]) => `${e} cobre ${pctTxt(f)}`).join('; ');
    const tabGeo = (Gl.naArea || []).length ? `<table class="tab"><thead><tr><th>Unidade</th><th>Litotipos</th><th class="num">${temHa ? 'Área' : 'Na área'}</th><th>Para o modelo</th></tr></thead><tbody>${Gl.naArea.map(z => `<tr><td><b>${esc2(z.nome)}</b>${z.sigla && z.sigla !== z.nome ? `<div class="mono pequeno">${esc2(z.sigla)}</div>` : ''}${z.idade && z.idade[0] != null ? `<div class="fonte">${VA.fmt.num(z.idade[0], 0)}–${VA.fmt.num(z.idade[1], 0)} Ma${z.ambiente ? ' · ' + esc2(z.ambiente) : ''}</div>` : z.ambiente ? `<div class="fonte">${esc2(z.ambiente)}</div>` : ''}</td><td>${esc2(z.litotipos || '—')}</td><td class="num">${z.ha != null ? `<b>${VA.fmt.ha(z.ha)}</b><div class="fonte">${pctTxt(z.pct)}</div>` : 'ponto'}</td><td><span class="cat" style="--c:${CLS_COR[z.classe]}">${esc2(z.classe)}</span><div class="fonte">${z.por ? 'por ' + esc2(z.por) : ''}${z.hospeda ? `${z.por ? '; ' : ''}hospeda ${z.hospeda} ocorrência(s) de ${esc2(mineral)} na janela` : ''}${z.contra ? '; tem rochas pouco compatíveis' : ''}${z.idadeOk === false ? '; idade fora da faixa típica' : ''}</div></td></tr>`).join('')}</tbody></table>` : '<p class="vazio">Nenhuma unidade geológica mapeada sobre a área nas escalas publicadas pelo SGB.</p>';
    const partes = [['favorável', 'favoráveis'], ['possível', 'possíveis'], ['pouco favorável', 'pouco favoráveis']].filter(([c]) => somaHa(c) >= 0.01).map(([c, pl], i) => `${i ? '' : '<b>'}${VA.fmt.ha(somaHa(c))} (${pctTxt(somaHa(c) / areaTot)}) em litologias ${pl}${i ? '' : '</b>'}`);
    const resumoGeo = temHa && areaTot ? `Na escala ${esc2(Gl.melhorEscala)}, a mais detalhada que cobre a área, ela tem ${partes.length > 1 ? partes.slice(0, -1).join(', ') + ' e ' + partes[partes.length - 1] : partes[0]} para o modelo.` : Gl.melhorEscala ? `O ponto está mapeado na escala ${esc2(Gl.melhorEscala)}.` : '';
    const analogos = (Cx.analogos || []).length ? `<table class="tab"><thead><tr><th>Ocorrência</th><th>Status</th><th>Rocha hospedeira e encaixante</th><th>Alteração</th><th class="num">Distância</th></tr></thead><tbody>${Cx.analogos.map(r => `<tr><td><b>${esc2(r.nome)}</b>${r.prov ? `<div class="fonte">${esc2(r.prov)}</div>` : ''}</td><td>${esc2(r.st)}</td><td>${esc2([r.hosp, r.enc].filter(Boolean).join(' / ') || '—')}</td><td>${esc2(r.alt || '—')}</td><td class="num">${r.d === 0 ? 'dentro' : VA.fmt.km(r.d)}</td></tr>`).join('')}</tbody></table>` : '';
    const st = Object.entries(Cx.porStatus || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${esc2(k.toLowerCase())}`).join(', ');

    /* o que fortalece e o que enfraquece */
    const SG = sinteseGeologica(F), forte = SG.forte.map(esc2), fraco = SG.fraco.map(esc2), insuf = SG.insuf.map(i => `<b>${esc2(i.rot)}:</b> ${esc2(i.txt)}`);

    const geoqHtml = Gq.insuficiente
      ? `<div class="aviso"><b>Cobertura geoquímica pública insuficiente.</b> ${Gq.amostras || 0} amostra(s) com ${esc2((Gq.elementos || []).map(e => e.toUpperCase()).join(', ') || 'os elementos do modelo')} na janela de ${VA.fmt.num(F.janelaKm, 0)} km (bases de rocha, solo e sedimento de corrente do SGB). Sem amostras suficientes não há como separar fundo e anomalia: a geoquímica ficou fora da nota onde não há amostra a menos de 3 km.</div>`
      : `<p>${Gq.amostras} amostra(s) e ${Gq.analises} análise(s) dos elementos do modelo na janela (${Object.entries(Gq.porMaterial || {}).map(([k, n]) => `${n} de ${esc2(k.toLowerCase())}`).join(', ')}; ${VA.fmt.num(Gq.densidade100km2, 1)} amostras por 100 km²)${Gq.pintas ? ` e ${Gq.pintas} concentrado(s) de bateia com pintas de ouro` : ''}. O limiar de anomalia é calculado separadamente para cada elemento, material, unidade e método (P90 e P97 da própria população) — misturar populações cria anomalias falsas.${Gq.truncado ? ' <b>O servidor do SGB limitou a resposta: a contagem é parcial.</b>' : ''}</p>
        ${(Gq.limiares || []).length ? `<div class="tab-rola"><table class="tab"><thead><tr><th>Elemento</th><th>Material</th><th>Método</th><th class="num">Análises</th><th class="num">P90</th><th class="num">P97</th></tr></thead><tbody>${Gq.limiares.map(l => `<tr><td><b>${esc2(l.el.toUpperCase())}</b></td><td>${esc2(l.material || '—')}</td><td>${esc2(l.metodo || '—')}</td><td class="num">${l.n}</td><td class="num">${l.p90 == null ? '<span class="fonte">população pequena</span>' : VA.fmt.num(l.p90, l.p90 < 10 ? 2 : 0) + ' ' + esc2(l.unidade)}</td><td class="num">${l.p97 == null ? '—' : VA.fmt.num(l.p97, l.p97 < 10 ? 2 : 0) + ' ' + esc2(l.unidade)}</td></tr>`).join('')}</tbody></table></div>` : ''}
        ${(Gq.anomalas || []).length ? `<h4>Resultados acima do limiar</h4><div class="tab-rola"><table class="tab"><thead><tr><th>Elemento</th><th class="num">Valor</th><th>Material e método</th><th>Data e projeto</th><th>Local</th></tr></thead><tbody>${Gq.anomalas.slice(0, 20).map(a => `<tr><td><b>${esc2(String(a.el).toUpperCase())}</b>${a.forte ? ' <span class="fonte">≥ P97</span>' : ''}</td><td class="num">${VA.fmt.num(a.valor, a.valor < 10 ? 2 : 0)} ${esc2(a.unidade || '')}</td><td>${esc2(a.material || '—')}<div class="fonte">${esc2(a.metodo || '')}</div></td><td>${esc2(a.data || '—')}<div class="fonte">${esc2(a.projeto || '')}</div></td><td class="mono pequeno">${a.c[1].toFixed(5)}, ${a.c[0].toFixed(5)}<div class="fonte">${a.dist_km === 0 ? 'dentro da área' : 'a ' + VA.fmt.km(a.dist_km)}</div></td></tr>`).join('')}</tbody></table></div>` : '<p class="vazio">Nenhum resultado acima do P90 da sua população.</p>'}`;
    const projetos = (Gq.projetos || []).length ? `<p>Projetos de levantamento geoquímico do SGB que cobrem a janela — os relatórios completos estão no RIGeo:</p><ul class="abr">${Gq.projetos.slice(0, 8).map(p => `<li><b>${esc2(p.nome)}</b>${p.escala ? `, escala ${esc2(p.escala)}` : ''}${p.anos ? `, ${esc2(p.anos)}` : ''}${p.rigeo ? ` — <a href="${esc2(p.rigeo)}" target="_blank" rel="noopener">relatório no RIGeo</a>` : ''}</li>`).join('')}</ul>` : '';
    const levs = (F.levantamentos || []).length ? `<p>Levantamento${F.levantamentos.length > 1 ? 's' : ''} aerogeofísico${F.levantamentos.length > 1 ? 's' : ''} sobre a área: ${F.levantamentos.map(l => `<b>${esc2(l.projeto)}</b>${l.esp ? ` (linhas a cada ${VA.fmt.num(l.esp, 0)} m${l.altura ? ', voo a ' + VA.fmt.num(l.altura, 0) + ' m' : ''}${l.direcao ? ', direção ' + esc2(l.direcao) : ''})` : ''}`).join('; ')}. ${F.resolucaoGeof ? `Feições com menos de ~${VA.fmt.num(F.resolucaoGeof.menorFeicao_m, 0)} m de largura não são resolvidas.` : ''}</p>` : '';

    h += sec('geologia', 'Interpretação geológica integrada') + `
      <p class="lead">O que as bases públicas dizem sobre a geologia da área e do entorno, para ${esc2(mineral)} — e onde elas não bastam. Cada informação traz a escala e a fonte; o que não respondeu fica como lacuna, nunca como ausência.</p>
      <h3>Contexto metalogenético e ocorrências análogas</h3>
      <p>Modelo aplicado: <b>${esc2(F.sistema.nome)}</b>. ${Cx.ocorrencias ? `Até ${VA.fmt.km(Cx.raioKm)} da área há ${Cx.ocorrencias} ocorrência(s) de ${esc2(mineral)} no GEOBANK (${st})` : `Não há ocorrência de ${esc2(mineral)} no GEOBANK até ${VA.fmt.km(Cx.raioKm)}`}${(Cx.provincias || []).length ? `, na ${esc2(Cx.provincias.join(' / '))}` : ''}.${(Cx.provinciaAurifera || []).length ? ` A área está em ${esc2(Cx.provinciaAurifera.join(', '))}.` : ''}${(Cx.rochasHospedeiras || []).length ? ` Rochas hospedeiras e encaixantes registradas nessas ocorrências: ${Cx.rochasHospedeiras.map(([r, n]) => `${esc2(r.toLowerCase())} (${n})`).join(', ')}.` : ''}${(Cx.alteracoes || []).length ? ` Alterações descritas: ${esc2(Cx.alteracoes.join(', ').toLowerCase())}.` : ''}</p>
      ${analogos}
      <h3>Unidades geológicas na área</h3>
      ${resumoGeo ? `<p>${resumoGeo}</p>` : ''}
      ${tabGeo}
      ${cobEsc ? `<p class="fonte">Escalas usadas na janela, da mais detalhada para a mais regional: ${esc2(cobEsc)}. Em cada trecho vale a mais detalhada disponível.</p>` : ''}
      <h3>Estruturas e contatos</h3>
      <p>${Es.n ? `${Es.n} traço(s) estrutural(is) na janela${(Es.tipos || []).length ? ` (${esc2(Es.tipos.join(', ').toLowerCase())})` : ''}, com ${Es.intersecoes} interseção(ões).` : 'Nenhum traço estrutural na janela.'} A base é 1:1.000.000: distâncias a essas estruturas são indicativas, com incerteza da ordem de 1 km. Contatos entre unidades vêm da geologia da melhor escala de cada trecho e entram como evidência ${F.sistema.pesos.contato ? `com peso de ${Math.round(F.sistema.pesos.contato / Object.values(F.sistema.pesos).reduce((a, b) => a + b, 0) * 100)}%` : 'só para os modelos em que o contato controla a mineralização'}.</p>
      ${leituraGeofisica(F, g, aoi, esc2, levs)}
      <h3>Geoquímica</h3>
      ${geoqHtml}
      ${projetos}
      <h3>Síntese: o que fortalece e o que enfraquece</h3>
      <div class="pro-contra"><div><h4>Fortalece</h4>${forte.length ? `<ul class="motivos pro">${forte.map(t => `<li>${t}</li>`).join('')}</ul>` : '<p class="vazio">Nenhuma evidência forte nas bases públicas.</p>'}</div><div><h4>Enfraquece ou limita</h4>${fraco.length ? `<ul class="motivos contra">${fraco.map(t => `<li>${t}</li>`).join('')}</ul>` : '<p class="vazio">Nada relevante.</p>'}</div></div>
      ${insuf.length ? `<h3>Bases insuficientes e próximos levantamentos</h3><ul class="abr">${insuf.map(t => `<li>${t}</li>`).join('')}</ul>` : ''}
      <h3>As evidências cruzadas e o método</h3>
      <div class="fav-minis">${F.camadas.filter(c => c.ok).map(c => `<figure class="fav-mini">${mapaMini(g, VA.favImagem(F, c.id), aoi)}<figcaption><b>${esc2(c.nome)}</b> · peso ${Math.round(c.peso * 100)}%<small>${esc2(FONTE_EVID[c.id] || '')}</small></figcaption></figure>`).join('')}</div>
      <div class="tab-rola"><table class="tab"><thead><tr><th>Evidência</th><th class="num">Peso</th><th>Como vira nota (0 a 1)</th><th>Qualidade do dado (confiabilidade)</th></tr></thead><tbody>${F.camadas.map(c => `<tr${c.ok ? '' : ' class="apagado"'}><td><b>${esc2(c.nome)}</b><div class="fonte">${c.ok ? esc2(FONTE_EVID[c.id] || '') : 'sem dado nesta janela'}</div></td><td class="num">${Math.round(c.peso * 100)}%</td><td>${esc2(COMO_EVID[c.id] || '')}</td><td>${esc2(QUAL_EVID[c.id] || '')}</td></tr>`).join('')}</tbody></table></div>
      <p class="fonte">Grade de ${g.W} × ${g.H} células (${VA.fmt.num(F.janelaKm / Math.max(g.W, g.H) * 1000, 0)} m). Favorabilidade = média ponderada só das evidências presentes em cada célula (exige pelo menos 30% do peso); confiabilidade = soma ponderada da qualidade de cada evidência, com zero onde ela falta — por isso as duas são independentes e uma célula pode ter favorabilidade alta e confiabilidade baixa. Cada evidência entra uma vez: as ocorrências contam como pontos e, na litologia, só elevam a unidade que as hospeda até 0,75. Os alvos são máximos locais acima do P90 com confiabilidade mínima de 25%, a pelo menos 2 km um do outro. É um modelo dirigido por conhecimento, relativo à janela: indica onde as evidências convergem, não teor, tonelagem nem probabilidade de descoberta.${F.erros.length ? ` Fontes que não responderam: ${esc2(F.erros.join('; '))}.` : ''}</p>`;
    return h;
  }
  /* leitura geofísica: as imagens aerogeofísicas do SGB na janela e os percentis na área e em cada alvo */
  const GEOF_INFO = [
    ['k', 'Potássio (K)', 'feldspato potássico, mica, alteração potássica e solos ricos em K'],
    ['th', 'Tório equivalente (eTh)', 'rochas graníticas evoluídas, monazita, lateritas'],
    ['u', 'Urânio equivalente (eU)', 'granitos evoluídos, alteração hidrotermal, fosfatos'],
    ['thk', 'Razão Th/K', 'baixa onde há enriquecimento relativo em potássio'],
    ['asa', 'Amplitude do sinal analítico', 'bordas e topos de corpos magnéticos, independente da direção do campo'],
    ['mag', 'Campo magnético anômalo', 'rochas com magnetita (máficas, formações ferríferas)'],
    ['dv1', '1ª derivada vertical', 'fontes magnéticas rasas, contatos e lineamentos (realça o que está perto da superfície)']];
  function leituraGeofisica(F, g, aoi, esc2, levs) {
    const GF = F.geofisica; if (!GF || !g.G) return '';
    const disp = GEOF_INFO.filter(([id]) => g.G[id]);
    if (!disp.length) return `<h3>Geofísica</h3><p class="vazio">A janela não tem cobertura dos mosaicos aerogeofísicos do SGB.</p>`;
    const pct = v => v == null ? '<span class="fonte">—</span>' : `<span class="pctl" style="background:rgba(194,65,12,${(0.08 + 0.92 * v).toFixed(2)});color:${v >= 0.55 ? '#fff' : '#0d1b2e'}">${Math.round(v * 100)}</span>`;
    const minis = disp.map(([id, nome, diz]) => `<figure class="fav-mini">${mapaMini(g, VA.favImagem(F, 'geo:' + id), aoi, F.alvos)}<figcaption><b>${esc2(nome)}</b> · cobertura ${Math.round((GF.cobertura[id] || 0) * 100)}%<small>alto em: ${esc2(diz)}</small></figcaption></figure>`).join('');
    const espera = [GF.usaGama && GF.gamaTxt ? `na gamaespectrometria, ${GF.gamaTxt}` : null, GF.usaMag && GF.magTxt ? `na magnetometria, ${GF.magTxt}` : null].filter(Boolean).join('; ');
    const zonas = [GF.zonasKAlto != null ? `${GF.zonasKAlto} zona(s) com K alto e Th/K baixo (acima do P90 e abaixo do P30)` : null, GF.zonasMag != null ? `${GF.zonasMag} zona(s) de sinal analítico alto (acima do P92)` : null].filter(Boolean);
    const linhas = [{ id: 'Área', v: GF.naArea }].concat(F.alvos.map(a => ({ id: a.id, v: a.geof || {} })));
    return `<h3>Geofísica</h3>
      ${levs || ''}
      <p>Imagens dos mosaicos aerogeofísicos do Serviço Geológico do Brasil recortadas na janela (azul = baixo, vermelho e magenta = alto; a 1ª derivada em tons de cinza), com os alvos marcados.${espera ? ` Para ${esc2(F.mineral.toLowerCase())}, o modelo procura ${esc2(espera)}.` : ''}${zonas.length ? ` Na janela: ${zonas.join('; ')}.` : ''}</p>
      <div class="fav-minis">${minis}</div>
      <div class="tab-rola"><table class="tab geof"><thead><tr><th></th>${disp.map(([id, nome]) => `<th class="num">${esc2(nome.replace(/ \(.*\)$/, '').replace('Amplitude do sinal analítico', 'Sinal analítico').replace('Campo magnético anômalo', 'Campo mag.').replace('1ª derivada vertical', '1ª deriv.'))}</th>`).join('')}</tr></thead><tbody>${linhas.map(l => `<tr><td><b class="${l.id === 'Área' ? '' : 'fav-id'}">${l.id === 'Área' ? 'Média na área' : l.id}</b></td>${disp.map(([id]) => `<td class="num">${pct(l.v ? l.v[id] : null)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="fonte">Percentil dentro da janela (0 = menor valor, 100 = maior). Os valores vêm da cor das imagens publicadas pelo SGB (as grades numéricas não são servidas): servem para comparar pontos da mesma janela, não como medida física. K alto e Th/K baixo são compatíveis com alteração potássica e com pegmatitos, mas também com granitos e solos ricos em potássio — sozinhos não provam alteração nem mineralização. Domínios, lineamentos e gradientes de detalhe exigem as grades XYZ do levantamento (download no GeoSGB) e interpretação por geofísico.</p>`;
  }
  function mapaMini(g, url, aoi, alvos) {
    const W = 300, H = Math.round(300 * g.H / g.W), bb = g.bbox;
    const P = ([lon, lat]) => [((lon - bb[0]) / (bb[2] - bb[0]) * W).toFixed(1), ((bb[3] - lat) / (bb[3] - bb[1]) * H).toFixed(1)];
    const geom = aoiGeom(aoi);
    const anel = r => 'M' + r.map(P).map(p => p.join(',')).join('L') + 'Z';
    const d = geom.type === 'Polygon' ? geom.coordinates.map(anel).join('') : geom.type === 'MultiPolygon' ? geom.coordinates.map(q => q.map(anel).join('')).join('') : '';
    const marcas = (alvos || []).map(a => { const [x, y] = P(a.c); return `<circle cx="${x}" cy="${y}" r="7" fill="rgba(11,23,48,.82)" stroke="#fff" stroke-width="1.4"/><text x="${x}" y="${+y + 3}" font-size="7.5" font-weight="700" text-anchor="middle" fill="#fff" font-family="Arial">${a.id.slice(1)}</text>`; }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="mini-svg">${url ? `<image href="${url}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none"/>` : ''}<path d="${d}" fill="none" stroke="${alvos ? '#fff' : '#e8590c'}" stroke-width="2"/>${marcas}</svg>`;
  }

  /* ====================================================================== */
  /* RELATÓRIO                                                               */
  /* ====================================================================== */
  VA.relPecas = { mapaGeo, mapaOcorrenciasEstatico, dadosOcorrencias, corStatus, mapaFavHTML, sinteseGeologica, nivelConf, aoiGeom, pctTxt, COR_NIVEL, COR_REQ, COR_CAT, COR_PROC, PARA_QUE, mapaRequerimento };

  VA.relatorioHTML = function (s) {
    const { aoi, analise, avaliacao, finalidade, responsavel } = s;
    const m = VA.metricasAOI(aoi), mun = analise.ctx.municipio, F = analise.local || null, ad = (F && F.adm) || {};
    const agora = new Date(), numero = 'VA-' + agora.toISOString().replace(/[-:T]/g, '').slice(0, 12);
    const local = s.municipios && s.municipios.length > 1 ? s.municipios.map(VA.fmt.munUF).join(', ') : mun ? VA.fmt.munUF(mun) : (analise.ctx.uf || 'Local não identificado');
    const nomesMun = s.municipios && s.municipios.length ? [...new Set(s.municipios.map(x => x.municipio))] : ad.municipio ? [ad.municipio] : [];
    const titulo = nomesMun.length ? (nomesMun.length > 2 ? nomesMun.slice(0, 2).join(', ') + ' e outros' : nomesMun.join(' e ')) + (ad.ufNome ? ', ' + ad.ufNome : mun && mun.uf ? ' — ' + mun.uf : '') : local;
    const base = location.href.replace(/[^/]*$/, '');
    const R = analise.resultados, todos = analise.ordem.map(id => R[id]);
    const ok = todos.filter(r => !['falha', 'sem_base'].includes(r.status));
    const nDentro = ok.reduce((n, r) => n + (r.itens || []).filter(i => i.incide).length, 0), nEntorno = ok.reduce((n, r) => n + (r.itens || []).filter(i => !i.incide && i.distancia_km != null).length, 0);
    const falhas = todos.filter(r => r.status === 'falha'), semBase = todos.filter(r => r.status === 'sem_base'), truncadas = ok.filter(r => r.completude === 'parcial' || (r.dados && r.dados.truncado));
    const filtrados = todos.filter(r => r.filtro);
    const car = R.car_ponto && R.car_ponto.dados && R.car_ponto.dados.car;
    const A = analise.alvo && analise.alvo.mineral ? analise.alvo : null;
    const MO = dadosOcorrencias(analise);
    const bt = analise.bateia;
    const sint = avaliacao.sintese, corSint = COR_NIVEL[sint.classe] || '#6b7280';
    const p = analise.params;
    const REQ = analise.requerimento && !analise.requerimento.erro ? analise.requerimento : null;

    const secoes = {}; const sec = (id, tit) => { secoes[id] = tit; return `<h2 id="${id}"><span class="n">§${id}§</span>${esc(tit)}</h2>`; };
    const evs = l => l.length ? `<span class="evs">${l.map(e => `<a href="#reg-${esc(e)}" class="ev">${esc(e)}</a>`).join('')}</span>` : '';

    /* ---------- 1. finalidade e abrangência ---------- */
    const porSetor = {}; todos.forEach(r => { porSetor[r.camada.setor] = (porSetor[r.camada.setor] || 0) + 1; });
    const orgaos = [...new Set(todos.flatMap(r => String(r.camada.fonte || '').split(/ — | via /)[0].split('/').map(x => x.trim())).filter(Boolean))];
    const raios = [p.setores.energia ? `energia e infraestrutura até ${VA.fmt.num(p.raioEnergiaKm, 0)} km` : null, p.setores.mineracao ? `processos minerários até ${VA.fmt.num(p.raioAnmKm, 0)} km e ocorrências minerais até ${VA.fmt.num(p.raioOcorrenciasKm, 0)} km` : null, p.setores.ambiental ? `meio ambiente até ${VA.fmt.num(p.raioAmbientalKm, 0)} km` : null].filter(Boolean);
    const abrange = [
      `<b>${todos.length} consultas</b> a camadas oficiais em ${Object.keys(porSetor).length} setores: ${VA.SETORES.filter(st => porSetor[st.id]).map(st => `${esc(st.nome)} (${porSetor[st.id]})`).join(', ')}.`,
      `Órgãos e bases: ${esc(orgaos.join(', '))}.`,
      (cp => cp && cp.total > cp.fixas ? `Composição: ${cp.fixas} camadas fixas${cp.pacote ? ` + ${cp.pacote} do pacote de ${esc(cp.pacoteNome)} (${esc(cp.pacoteDescricao)})` : ''}${cp.estado ? ` + ${cp.estado} camada(s) estadual(is) de ${esc(cp.uf)}` : ''}${cp.escolhidas ? ` + ${cp.escolhidas} escolhida(s) pelo operador` : ''}${cp.varredura ? ` + ${cp.varredura} da varredura completa` : ''}.` : null)(analise.ctx.composicao),
      raios.length ? `Raios de busca a partir da área: ${raios.join('; ')}.` : null,
      A ? `Busca dirigida a <b>${esc(A.mineral)}</b> até ${VA.fmt.km(A.raioKm)}: ocorrências no GEOBANK (SGB) e processos da ANM com o mesmo bem.` : finalidade === 'mineracao' && p.alvoModo === 'geral' ? 'Varredura mineral geral: todas as substâncias registradas no entorno.' : null,
      bt ? `Prospecção pela Bateia num raio de ${VA.fmt.km(p.raioBateiaKm)}: geologia, geoquímica, geofísica, relevo e modelos de depósito.` : null,
      REQ ? `Checklist do requerimento: direitos de terceiros, bloqueios, disponibilidade, terras indígenas, UCs, quilombos, assentamentos, faixa de fronteira, áreas militares e urbanas, embargos, cavidades, sítios arqueológicos, APP e servidões; área sem interferência, limite de área da substância e poligonal N-S/L-O.` : null,
      analise.favorab && analise.favorab.grade ? `Inteligência mineral para ${esc(analise.favorab.mineral.toLowerCase())}, numa janela de ${VA.fmt.num(analise.favorab.janelaKm, 0)} km: favorabilidade (${analise.favorab.camadas.filter(c => c.ok).map(c => c.nome.toLowerCase()).join(', ')}), disponibilidade na ANM, confiabilidade dos dados, ranking de oportunidades e interpretação geológica integrada.` : null,
      F ? 'Ficha do local: divisão territorial e indicadores do município (IBGE), clima de 1991 a 2020 (ERA5), distâncias a cidades, capital, rodovias, ferrovia, portos e aeródromos.' : null,
      filtrados.length ? `Filtros do operador em ${filtrados.length} camada(s): ${filtrados.map(r => `${esc(r.camada.nome)} (${esc(r.filtro)})`).join('; ')}.` : null,
      `Consulta feita em ${VA.fmt.dataHora(analise.inicio)}; os dados refletem as bases nesse momento.`
    ].filter(Boolean);
    const lacunasN = falhas.length + semBase.length + truncadas.length;
    let corpo = sec('finalidade', 'Finalidade e abrangência') + `
      <div class="fin">
        <div><h3>Finalidade</h3><p class="fin-dest">${esc(VA.FINALIDADES[finalidade])}${REQ ? ` — local para requerimento${REQ.substancia ? ' de ' + esc(REQ.substancia.toLowerCase()) : ''}` : A ? ` — alvo: ${esc(A.mineral)}` : ''}</p>${s.finalidadeTexto ? `<p class="fin-op">“${esc(s.finalidadeTexto)}”<small>nas palavras do solicitante</small></p>` : ''}</div>
        <div><h3>Para quê</h3><p>${REQ ? 'Saber se esta área pode ser requerida na ANM: se há direitos de terceiros ou áreas vedadas sobre ela, quanto dela sobra, se cabe no limite de área da substância, como fica a poligonal com lados N-S e L-O e quais condicionantes precisam ser resolvidas antes de investir na pesquisa.' : esc(PARA_QUE[finalidade] || PARA_QUE.geral)}${A && !REQ ? ` O foco é ${esc(A.mineral.toLowerCase())}: ocorrências conhecidas, processos com o mesmo bem, modelos de depósito compatíveis e o mapa de favorabilidade que indica onde procurar.` : ''}</p></div>
      </div>
      <h3>O que este relatório abrange</h3>
      <ul class="abr">${abrange.map(x => `<li>${x}</li>`).join('')}</ul>
      <h3>O que fica de fora</h3>
      <p>Titularidade e ônus do imóvel (só a certidão do cartório de registro de imóveis prova), teor, tonelagem ou reserva mineral, vistoria de campo, licenças e outorgas que não constem das bases públicas e consulta formal aos órgãos.</p>
      <div class="kpis">
        <div><b>${ok.length}<small>/${todos.length}</small></b><span>consultas concluídas</span></div>
        <div><b>${nDentro}</b><span>registros com interseção na área</span></div>
        <div><b>${nEntorno}</b><span>registros no entorno</span></div>
        <div class="${lacunasN ? 'k-aviso' : ''}"><b>${lacunasN}</b><span>indisponíveis ou parciais${lacunasN ? ` — <a href="#lacunas">ver quais</a>` : ''}</span></div>
      </div>`;

    /* ---------- requerimento (modo Local para requerimento) ---------- */
    corpo += secaoRequerimento(s, sec, esc);

    /* ---------- 2. parecer preliminar ---------- */
    const ordemNv = nv => (VA.NIVEIS[nv] || { ordem: 9 }).ordem;
    const contra = avaliacao.achados.filter(a => ['impeditivo', 'alerta', 'atencao'].includes(a.nivel)).sort((a, b) => ordemNv(a.nivel) - ordemNv(b.nivel));
    const favor = avaliacao.achados.filter(a => a.nivel === 'oportunidade');
    const item = a => `<li style="--c:${COR_NIVEL[a.nivel]}"><span class="pn">${esc(VA.NIVEIS[a.nivel].rotulo)}</span><b>${esc(a.titulo)}</b><p>${esc(a.texto)}</p>${evs(a.evidencias)}</li>`;
    const contagem = Object.entries(avaliacao.contagem).filter(([, n]) => n).map(([nv, n]) => `<span class="nv" style="--c:${COR_NIVEL[nv]}">${n} ${VA.NIVEIS[nv].rotulo.toLowerCase()}</span>`).join('');
    corpo += sec('parecer', 'Parecer preliminar') + `
      <div class="parecer" style="--c:${corSint}"><p>${esc(sint.texto)}</p><div class="chips">${contagem}</div></div>
      ${coberturaRel(sint, esc)}
      <div class="pro-contra">
        <div><h3>Pontos de atenção</h3>${contra.length ? `<ul>${contra.slice(0, 5).map(item).join('')}</ul>${contra.length > 5 ? `<p class="fonte">+ ${contra.length - 5} na seção <a href="#achados">Achados</a>.</p>` : ''}` : '<p class="vazio">Nenhuma restrição apontada pelas fontes que responderam.</p>'}</div>
        <div><h3>Pontos a favor</h3>${favor.length ? `<ul>${favor.slice(0, 5).map(item).join('')}</ul>${favor.length > 5 ? `<p class="fonte">+ ${favor.length - 5} na seção <a href="#achados">Achados</a>.</p>` : ''}` : '<p class="vazio">Nenhuma oportunidade específica apontada pelas regras.</p>'}</div>
      </div>
      <p class="fonte">Triagem automática sobre dados oficiais. Cada ponto cita os registros que o sustentam (E#, A#); clique para ver o registro.</p>`;

    /* ---------- 3. localização e evidências cartográficas ---------- */
    corpo += sec('mapa', 'Localização e evidências cartográficas') + `
      <p class="lead">A área de interesse sobre imagem de satélite, com todos os registros encontrados dentro dela (linha contínua) e no entorno (tracejada), na cor do setor.</p>
      <div class="so-tela"><div id="mapaInt" class="mapa-int"></div></div>
      <div class="so-impressao">${VA.mapaRelatorio(aoi, analise, { W: 1200, H: 760 })}</div>
      <div class="legenda"><span><i class="ar" style="border-color:#1665d8"></i>área de interesse</span>${Object.entries(COR_SETOR).map(([k, c]) => `<span><i class="ar" style="border-color:${c};background:${c}33"></i>${esc(VA.nomeSetor(k))}</span>`).join('')}</div>
      ${car ? `<p class="fonte">CAR no ponto central: <b class="mono">${esc(car.codigo)}</b>${car.area_ha != null ? `, ${VA.fmt.num(car.area_ha)} ha declarados` : ''}${car.modulos != null ? `, ${VA.fmt.num(car.modulos)} módulos fiscais` : ''}${car.inscricao ? `, inscrito em ${esc(car.inscricao)}` : ''} — consulta pública do SICAR, autodeclaratória, não prova domínio.</p>` : ''}`;

    /* ---------- alvo / ocorrências ---------- */
    if (MO) {
      const porStatus = MO.pontos.reduce((o, q) => { o[q.st] = (o[q.st] || 0) + 1; return o; }, {});
      const legenda = `<div class="legenda">${Object.entries(porStatus).sort((a, b) => b[1] - a[1]).map(([st, n]) => `<span><i class="pt" style="background:${corStatus(st)}"></i>${esc(st)} (${n})</span>`).join('')}${MO.polis.length ? `<span><i class="ar" style="border-color:#b26df0;background:rgba(178,109,240,.15)"></i>processo ANM com ${esc(MO.titulo.toLowerCase())} (${MO.polis.length})</span>` : ''}<span><i class="ar" style="border-color:#1665d8"></i>área de interesse</span>${MO.modo === 'alvo' ? `<span><i class="ar tracejado"></i>raio de ${VA.fmt.km(MO.raioKm)}</span>` : ''}</div>`;
      const linhas = MO.pontos.slice(0, 60).map(q => `<tr id="reg-${esc(q.e)}"><td><span class="ev">${esc(q.e)}</span></td><td><b>${esc(q.t)}</b><div class="fonte">${esc(q.sub)}</div></td><td><span class="dot" style="background:${corStatus(q.st)}"></span>${esc(q.st)}${q.imp ? `<div class="fonte">${esc(q.imp)}</div>` : ''}</td><td class="num">${q.i ? '<b>dentro</b>' : VA.fmt.km(q.d)}</td></tr>`).join('');
      if (A) {
        const sr = A.resumo || {}, mb = VA.alvo.daBateia(bt, A.termos);
        const procs = A.processos.slice(0, 40).map(i => `<tr id="reg-${esc(i.evid)}"><td><span class="ev">${esc(i.evid)}</span></td><td><b>${esc(i.props.PROCESSO)}</b><div class="fonte">${esc(i.props.SUBS || '')}</div></td><td>${esc(i.fase || '—')}<div class="fonte">${esc(i.props.NOME || '')}${i.proprio ? ' — titular de interesse' : ''}</div></td><td class="num">${i.incide ? '<b>dentro</b>' : VA.fmt.km(i.distancia_km)}</td></tr>`).join('');
        corpo += sec('alvo', `Alvo da pesquisa: ${A.mineral}`) + `
          <p class="lead">Busca dirigida a <b>${esc(A.mineral)}</b>${A.termos.length > 1 ? ` (inclui ${esc(A.termos.filter(t => VA.fmt.norm(t) !== VA.fmt.norm(A.mineral)).join(', '))})` : ''} no GEOBANK do Serviço Geológico do Brasil e nos processos da ANM, até ${VA.fmt.km(A.raioKm)} da área.</p>
          <div class="kpis"><div><b>${sr.ocDentro || 0}</b><span>ocorrência(s) dentro da área</span></div><div><b>${sr.ocTotal || 0}</b><span>ocorrências até ${VA.fmt.km(A.raioKm)}</span></div><div><b>${sr.ocMin != null ? VA.fmt.km(sr.ocMin) : '—'}</b><span>distância da mais próxima</span></div><div><b>${sr.procTotal || 0}</b><span>processos ANM com o bem${sr.procDentro ? `, ${sr.procDentro} sobre a área` : ''}</span></div></div>
          ${A.erros.length ? `<div class="aviso">Parte da busca não respondeu: ${esc(A.erros.join('; '))}</div>` : ''}
          ${MO.pontos.length || MO.polis.length ? `<div class="so-tela"><div id="mapaOc" class="mapa-int"></div></div><div class="so-impressao">${mapaOcorrenciasEstatico(aoi, MO)}</div>${legenda}` : `<p class="vazio">Nenhuma ocorrência de ${esc(A.mineral)} nem processo com esse bem até ${VA.fmt.km(A.raioKm)}. A ausência de registro reflete a cobertura dos levantamentos.</p>`}
          ${mb.length ? `<h3>Modelos de depósito compatíveis (Bateia)</h3><p>${mb.slice(0, 4).map(x => `<b>${esc(x.nome)}</b> — compatibilidade ${Math.round(x.ajuste * 100)}%, confiança ${Math.round(x.conf * 100)}%`).join('; ')}.</p>` : ''}
          ${linhas ? `<h3>Ocorrências de ${esc(A.mineral)}</h3><table class="tab lista"><thead><tr><th></th><th>Local e substâncias</th><th>Status</th><th class="num">Distância</th></tr></thead><tbody>${linhas}</tbody></table>${MO.pontos.length > 60 ? `<p class="fonte">+ ${MO.pontos.length - 60} ocorrência(s) no arquivo de dados.</p>` : ''}` : ''}
          ${procs ? `<h3>Processos da ANM com ${esc(A.mineral.toLowerCase())}</h3><table class="tab lista"><thead><tr><th></th><th>Processo</th><th>Fase e titular</th><th class="num">Distância</th></tr></thead><tbody>${procs}</tbody></table>` : ''}`;
      } else {
        const subs = Object.entries((R.sgb_ocorr.dados || {}).porSubst || {}).sort((a, b) => b[1] - a[1]);
        corpo += sec('ocorrencias', 'Ocorrências minerais no entorno') + `
          <p class="lead">Varredura geral: todas as ocorrências cadastradas no GEOBANK (SGB) até ${VA.fmt.km(MO.raioKm)} da área.${subs.length ? ` Substâncias: ${subs.slice(0, 16).map(([sb, n]) => `<b>${esc(sb)}</b> (${n})`).join(', ')}.` : ''}</p>
          <div class="so-tela"><div id="mapaOc" class="mapa-int"></div></div><div class="so-impressao">${mapaOcorrenciasEstatico(aoi, MO)}</div>${legenda}
          <table class="tab lista"><thead><tr><th></th><th>Local e substâncias</th><th>Status</th><th class="num">Distância</th></tr></thead><tbody>${linhas}</tbody></table>
          <p class="fonte">Cadastro de ocorrências: não comprova jazida, teor ou reserva. Para um relatório focado, escolha “Um bem específico” na finalidade.</p>`;
      }
    }

    /* ---------- favorabilidade (bem específico) ---------- */
    corpo += secaoInteligencia(s, sec, esc);

    /* ---------- achados ---------- */
    const grupos = Object.keys(VA.NIVEIS).map(nv => ({ nv, l: avaliacao.achados.filter(a => a.nivel === nv) })).filter(g => g.l.length);
    corpo += sec('achados', 'Achados') + `${filtrados.length ? `<div class="aviso"><b>Filtros aplicados pelo operador.</b> Nestas camadas a análise considerou só os registros que atendem às condições: ${filtrados.map(r => `${esc(r.camada.nome)} (${esc(r.filtro)})`).join('; ')}.</div>` : ''}
      ${grupos.map(g => `<div class="grupo" style="--c:${COR_NIVEL[g.nv]}"><div class="grupo-cab"><i></i>${esc(VA.NIVEIS[g.nv].rotulo)}<span>${g.l.length}</span></div>
      ${g.l.map(a => `<div class="achado"><div class="ac-t">${esc(a.titulo)}<span class="ac-setor">${esc(VA.nomeSetor(a.setor) || '')}</span></div><p>${esc(a.texto)}</p><div class="ac-rod"><span class="cz">${esc(a.certeza)}</span>${evs(a.evidencias)}</div></div>`).join('')}</div>`).join('')}`;

    /* ---------- quadro dentro / fora ---------- */
    corpo += sec('quadro', 'Dentro ou fora — camada por camada') + `<p class="fonte">“Fora” vale para o raio indicado em cada camada; ausência de registro não prova inexistência. Clique num setor para recolher.</p>` +
      VA.SETORES.filter(st => avaliacao.quadro[st.id]).map(st => {
        const l = avaliacao.quadro[st.id], c = k => l.filter(q => q.classe === k).length;
        return `<details class="quadro" ${st.id === 'referencia' ? '' : 'open'}><summary><i style="background:${COR_SETOR[st.id]}"></i><b>${esc(st.nome)}</b><span class="qc">${c('dentro') ? `<em class="sit sit-dentro">${c('dentro')} dentro</em>` : ''}${c('proximo') ? `<em class="sit sit-proximo">${c('proximo')} no entorno</em>` : ''}<em>${c('fora')} fora</em>${c('falha') ? `<em class="sit sit-falha">${c('falha')} sem resposta</em>` : ''}</span></summary>
          <table class="tab"><tbody>${l.map(q => `<tr><td><b>${esc(q.nome)}</b><div class="fonte">${esc(q.fonte)}${R[q.id] && R[q.id].origem && R[q.id].origem !== 'fixas' ? ' — ' + ({ pacote: 'pacote da finalidade', estado: 'camada estadual', escolhidas: 'escolhida pelo operador', varredura: 'varredura completa' }[R[q.id].origem] || 'camada extra') : R[q.id] && R[q.id].extra ? ' — camada extra' : ''}${R[q.id] && R[q.id].filtro ? ' — com filtro' : ''}</div></td><td class="sitc"><span class="sit sit-${q.classe}">${esc(q.classe === 'info' ? 'Informação' : q.situacao)}</span>${q.sev ? `<span class="nv" style="--c:${COR_NIVEL[q.sev]}">${VA.NIVEIS[q.sev].rotulo}</span>` : ''}</td><td class="det">${esc(q.classe === 'info' ? q.situacao : q.resumo || '')}${q.evid.length ? ' ' + evs(q.evid) : ''}</td></tr>`).join('')}</tbody></table></details>`;
      }).join('');

    /* ---------- Bateia ---------- */
    if (bt) corpo += sec('bateia', 'Mineração — Bateia') + `
      <p class="fonte">Resumo da Bateia na mesma área (geologia, ocorrências, geoquímica, geofísica, relevo e modelos de depósito). A aderência mede quanto as evidências da área se parecem com cada modelo de depósito — não é probabilidade de descoberta.</p>
      ${bt.geologia && bt.geologia.pontual && bt.geologia.pontual.length ? `<p><b>Geologia no centro:</b> ${bt.geologia.pontual.map(u => `${esc(u.sigla || '')} ${esc(u.nome || '')} (${esc(u.escala)})${u.litotipos ? ' — ' + esc(u.litotipos) : ''}`).join('; ')}</p>` : ''}
      ${bt.modelos && bt.modelos.length ? `<table class="tab"><thead><tr><th>Modelo de depósito</th><th class="num">Aderência ao modelo</th><th class="num">Confiança</th><th>Evidências favoráveis</th><th>Minérios esperados</th></tr></thead><tbody>${bt.modelos.slice(0, 6).map(x => `<tr${A && VA.alvo.daBateia({ modelos: [x] }, A.termos).length ? ' class="realce"' : ''}><td><b>${esc(x.nome)}</b></td><td class="num">${Math.round(x.ajuste * 100)}% — ${esc(x.classe)}</td><td class="num">${Math.round(x.conf * 100)}%</td><td>${esc((x.favoraveis || []).join(', ') || '—')}</td><td>${esc((x.minerios || []).slice(0, 5).join(', '))}</td></tr>`).join('')}</tbody></table>` : ''}
      ${bt.substancias && bt.substancias.length ? `<p><b>Substâncias registradas na área:</b> ${bt.substancias.slice(0, 12).map(x => `${esc(x.nome)} (${x.total})`).join(', ')}</p>` : ''}
      ${bt.geoquimica && bt.geoquimica.length ? `<p><b>Anomalias geoquímicas:</b> ${bt.geoquimica.map(x => `${esc(x.nome)}${x.razao ? ' ' + VA.fmt.num(x.razao, 1) + '× o limiar' : ''}`).join('; ')}</p>` : ''}
      <p class="fonte">Fontes da Bateia com dados: ${bt.fontes.filter(f => f.status === 'ok').length} de ${bt.fontes.length}.</p>`;

    /* ---------- resultados por fonte ---------- */
    corpo += sec('fontes', 'Resultados por fonte') + `<p class="fonte">Cada fonte consultada, com todos os registros e atributos publicados. Na impressão, tudo é expandido.</p>` + analise.ordem.map(id => {
      const r = R[id], its = (r.itens || []).slice(0, 80);
      const st = { dentro: 'Dentro', proximo: 'Entorno', fora: 'Fora', info: 'Informação', falha: 'Sem resposta', sem_base: 'Sem base' }[r.status];
      return `<details class="fonte-bloco" ${r.status === 'dentro' ? 'open' : ''}><summary><span class="sit sit-${r.status === 'falha' || r.status === 'sem_base' ? 'falha' : r.status}">${esc(st)}</span><b>${esc(r.camada.nome)}</b><span class="fonte">${esc(r.camada.fonte)}</span></summary><div class="fb-corpo"><p class="pequeno">${esc(r.resumo)}</p>
        ${its.length ? its.map(i => `<details class="reg" id="reg-${esc(i.evid)}"><summary><span class="ev">${esc(i.evid)}</span> <b>${esc(i.titulo)}</b>${i.subtitulo ? ` <span class="fonte">${esc(i.subtitulo)}</span>` : ''}<span class="rel">${i.distancia_km != null ? (i.incide ? 'dentro' + (i.sobreposicao_ha ? ', ' + VA.fmt.ha(i.sobreposicao_ha) : '') : 'a ' + VA.fmt.kmItem(i)) : ''}</span></summary>${(i.atributos || []).length ? `<table class="attrs">${i.atributos.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>` : ''}</details>`).join('') + ((r.itens || []).length > 80 ? `<p class="fonte">+ ${(r.itens || []).length - 80} registros no arquivo de dados</p>` : '') : ''}</div></details>`;
    }).join('');

    /* ---------- lacunas, registro, método, limitações ---------- */
    corpo += sec('lacunas', 'Fontes sem resposta e consultas parciais') + (lacunasN ? `<ul class="lacunas">${(() => { const g = {}; falhas.forEach(r => { const k = String(r.erro || 'sem detalhe'); (g[k] = g[k] || []).push(r.camada.nome); }); return Object.entries(g).map(([erro, nomes]) => `<li><b>${esc(nomes.join('; '))}</b><span>${esc(erro)}</span></li>`).join(''); })()}${semBase.map(r => `<li><b>${esc(r.camada.nome)}</b><span>base não instalada no servidor local</span></li>`).join('')}${truncadas.map(r => `<li><b>${esc(r.camada.nome)}</b><span>${esc((r.motivosParcial && r.motivosParcial.length ? r.motivosParcial.join('; ') : 'resultado limitado pelo servidor do órgão') + ' — parcial')}</span></li>`).join('')}</ul>
      <p class="fonte">${falhas.some(r => r.motivo === 'cors' || r.motivo === 'servidor') ? 'Parte das fontes só responde com o servidor local aberto (iniciar.bat). ' : ''}Fontes sem resposta são lacunas: nada foi concluído sobre elas. Repita a análise mais tarde para completá-las.</p>` : '<p>Todas as fontes responderam.</p>');
    corpo += sec('registro', 'Registro de imóveis') + `<p>Titularidade, matrícula e ônus só constam no cartório de registro de imóveis competente. Para esta área, consulte o Mapa do Registro de Imóveis (ONR) em mapa.onr.org.br, identifique o cartório e solicite certidão de inteiro teor (também pelo ridigital.org.br).${R.sigef && R.sigef.itens.length ? ' As parcelas SIGEF listadas trazem o número de matrícula informado na certificação.' : ''} O CAR é autodeclaratório e não comprova domínio.</p>`;
    const trilha = analise.ordem.flatMap(id => R[id].consultas.map(c => `<tr><td>${esc(id)}</td><td class="url">${esc(String(c.url || '').slice(0, 220))}${String(c.url || '').length > 220 ? '…' : ''}</td><td class="num">${c.n == null ? '—' : c.n}</td><td>${c.erro ? esc(c.erro) : 'ok'}</td></tr>`)).concat(A ? A.consultas.map(c => `<tr><td>alvo</td><td class="url">${esc(String(c.url || '').slice(0, 220))}</td><td class="num">${c.n}</td><td>ok</td></tr>`) : []).join('');
    corpo += sec('metodo', 'Método e rastreabilidade') + `<p>Para cada camada, a plataforma consulta o serviço oficial numa caixa envolvente da área acrescida do raio da camada, recebe as geometrias e testa a relação espacial exata com a área (WGS 84/SIRGAS 2000): <b>dentro</b> (interseção, com a área sobreposta quando ambas são polígonos), <b>entorno</b> (até o raio, com a distância mínima) ou <b>fora</b>. Faixas legais aplicadas: cavidades 250 m (CONAMA 347/2004) e APP de curso d’água 30 m (Lei 12.651/2012). Fontes que não respondem ficam como lacuna, nunca como “sem restrição”. Cada registro recebe um identificador (E#; A# para a busca do alvo) usado nos achados.</p>
      <p>Ficha do local: o clima é a média de 1991 a 2020 da reanálise ERA5 (grade de cerca de 25 km); a classificação de Köppen segue Peel et al. (2007) e o índice de aridez, a UNEP (chuva ÷ evapotranspiração de referência FAO-56). Distâncias em linha reta são geodésicas; rotas por estrada vêm do OSRM sobre o OpenStreetMap.</p>
      <p class="fonte">Análise iniciada em ${VA.fmt.dataHora(analise.inicio)} e concluída em ${VA.fmt.dataHora(analise.fim)}. Município: ${esc((mun && mun.fonte) || 'não confirmado')}.</p>
      <details class="trilha"><summary>Requisições feitas (${analise.ordem.reduce((n, id) => n + R[id].consultas.length, 0) + (A ? A.consultas.length : 0)})</summary><table class="tab mini"><thead><tr><th>Camada</th><th>Requisição</th><th class="num">Registros</th><th>Resultado</th></tr></thead><tbody>${trilha}</tbody></table></details>`;
    corpo += sec('limites', 'Limitações') + `<p>Triagem preliminar gerada automaticamente a partir de bases públicas consultadas no momento da emissão. Não substitui certidões, matrícula, consulta formal aos órgãos, vistoria de campo nem parecer de profissional habilitado. As bases têm escalas e defasagens distintas (hidrografia e geologia são regionais). Distâncias e áreas são aproximadas; a altitude é estimada por modelo de superfície. Rede de média tensão: só a das distribuidoras cuja BDGD foi instalada no servidor local.</p>
      ${(VA.PENDENTES || []).length ? `<p class="fonte">Integrações ainda indisponíveis: ${(VA.PENDENTES || []).map(q => `${esc(q.nome)} — ${esc(q.texto)}`).join(' ')}</p>` : ''}`;

    const ordem = [...corpo.matchAll(/<h2 id="([^"]+)">/g)].map(x => x[1]);
    ordem.forEach((id, i) => { corpo = corpo.replace(`§${id}§`, String(i + 1)); });
    const sumario = `<a href="#topo"><span></span>Ficha do local</a>` + ordem.map((id, i) => `<a href="#${id}"><span>${i + 1}</span>${esc(secoes[id])}</a>`).join('');

    const pacote = VA.pacoteEvidencias(s);
    const mapaDados = dadosMapa(aoi, analise);
    const json = o => JSON.stringify(o).replace(/</g, '\\u003c');
    const subt = [`${m.tipo}${m.area_ha != null ? ' de ' + VA.fmt.ha(m.area_ha) : ''}`, ad.imediata ? `região imediata de ${ad.imediata}` : null, ad.regiao ? `Região ${ad.regiao}` : null].filter(Boolean).join(', ');

    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)} · Relatório ${numero}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,500;8..60,600;8..60,700&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="${base}lib/leaflet/leaflet.css">
<style>
:root{--tinta:#0d1b2e;--azul:#1f5fd6;--azul-claro:#e8f0fd;--painel:#edf2f8;--linha:#d3dce8;--linha-2:#e6ecf3;--prata:#5e6d82;--fundo:#dfe5ee;--serif:"Source Serif 4",Georgia,"Times New Roman",serif}
@page{size:A4;margin:12mm 11mm}*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;font:14px/1.6 "IBM Plex Sans","Segoe UI",Arial,sans-serif;color:var(--tinta);background:var(--fundo);font-variant-numeric:tabular-nums}
a{color:var(--azul)}
.barra{position:sticky;top:0;z-index:2000;display:flex;align-items:center;gap:8px;padding:10px 20px;background:rgba(223,229,238,.92);backdrop-filter:blur(6px);border-bottom:1px solid var(--linha)}
.barra .esp{flex:1}.pdf-msg{font-size:12px;color:var(--prata);max-width:520px;text-align:right;line-height:1.35;overflow-wrap:anywhere}.barra button:disabled{opacity:.6;cursor:progress}.barra button{font:inherit;font-weight:600;font-size:13px;border-radius:7px;padding:8px 14px;cursor:pointer;border:1px solid var(--azul);background:#fff;color:var(--azul)}
.barra button.pri{background:var(--azul);color:#fff}.barra button:focus-visible,a:focus-visible,summary:focus-visible{outline:3px solid #8ec5ff;outline-offset:2px}
.quadro-geral{display:grid;grid-template-columns:220px minmax(0,1000px);gap:28px;justify-content:center;padding:26px 20px 70px}
nav.sumario{position:sticky;top:78px;align-self:start;font-size:12.5px;line-height:1.35}
nav.sumario .t{font-weight:600;font-size:12.5px;color:var(--prata);margin:0 0 8px 10px}
nav.sumario a{display:flex;gap:9px;padding:6px 10px;border-radius:6px;color:var(--tinta);text-decoration:none;border-left:2px solid transparent}
nav.sumario a span{color:var(--prata);min-width:14px}
nav.sumario a:hover{background:#fff;border-left-color:var(--azul)}
.folha{background:#fff;box-shadow:0 1px 3px rgba(13,27,46,.08),0 14px 44px rgba(13,27,46,.10);border-radius:4px;overflow:hidden}
.pagina{padding:38px 46px 10px}
/* ---------- capa ---------- */
.cab{display:flex;align-items:center;justify-content:space-between;gap:20px;padding-bottom:18px;border-bottom:3px solid var(--tinta);position:relative}
.cab::after{content:"";position:absolute;left:0;bottom:-3px;width:120px;height:3px;background:var(--azul)}
.cab img{height:58px;width:auto;display:block}
.cab-dir{text-align:right;font-size:12.5px;color:var(--prata);line-height:1.5}.cab-dir b{display:block;color:var(--tinta);font-weight:600;font-size:13.5px}
.titulo{padding:30px 0 22px}
.kicker{font-weight:600;font-size:14px;color:var(--azul)}
h1{font-family:var(--serif);font-weight:600;font-size:46px;line-height:1.05;letter-spacing:-.015em;margin:8px 0 10px;font-optical-sizing:auto}
.subt{font-size:16px;color:#33445e;margin:0}
.alvo-tag{display:inline-flex;align-items:center;gap:8px;font-weight:600;font-size:13px;padding:5px 12px;border-radius:999px;background:#f1eafc;color:#56238f;margin-top:14px}
.alvo-tag i{width:9px;height:9px;border-radius:50%;background:#8e2bd6}
.ficha{background:var(--painel);border-radius:10px;padding:22px 24px 16px;margin-bottom:8px}
.f-visual{display:grid;grid-template-columns:minmax(0,1.85fr) minmax(0,1fr);gap:18px;align-items:stretch}
.f-visual figure{margin:0}
.sat .mapa-rel{border-radius:6px!important}
figcaption{font-size:11.5px;color:var(--prata);margin-top:6px}
.locs{display:grid;grid-template-rows:1fr 1fr;gap:10px;min-height:0}
.loc{display:flex;flex-direction:column;justify-content:center;background:#fff;border-radius:6px;padding:10px 12px 8px}
.loc svg{width:100%;flex:1;min-height:0;max-height:170px}
.f-grade3,.f-grade2{display:grid;gap:0 26px;margin-top:20px;padding-top:18px;border-top:1px solid var(--linha)}
.f-grade3{grid-template-columns:repeat(3,minmax(0,1fr))}.f-grade2{grid-template-columns:repeat(2,minmax(0,1fr))}
.bloco h3{font-family:var(--serif);font-weight:600;font-size:18px;margin:0 0 10px;line-height:1.25}
.bloco dl{display:grid;grid-template-columns:1fr;margin:0}
.bloco dt{font-size:12px;color:var(--prata);margin-top:8px}.bloco dt:first-child{margin-top:0}
.bloco dd{margin:1px 0 0;font-size:13.5px;line-height:1.45;overflow-wrap:anywhere}
.bloco dd small{display:block;font-size:11.5px;color:var(--prata)}
.mono{font-family:"IBM Plex Mono",monospace;font-size:12.5px}
.eco{margin-top:14px}.eco-t{font-size:12px;color:var(--prata);margin-bottom:5px}
.eco-barra{display:flex;height:12px;border-radius:3px;overflow:hidden;background:#fff}.eco-barra i{display:block;height:100%}
.eco-leg{display:flex;flex-wrap:wrap;gap:3px 12px;margin-top:6px;font-size:11.5px;color:#33445e}.eco-leg i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px;vertical-align:-1px}
.kp{display:flex;align-items:baseline;gap:10px;margin-bottom:4px}.kp b{font-family:var(--serif);font-weight:700;font-size:30px;line-height:1;color:var(--azul)}.kp span{font-size:13px;color:#33445e}
.climograma{width:100%;height:auto;display:block;margin:6px 0 2px;font:10.5px "IBM Plex Sans",Arial,sans-serif;fill:var(--prata)}
.clima-leg{display:flex;flex-wrap:wrap;gap:3px 14px;font-size:11.5px;color:var(--prata);margin-bottom:6px}
.clima-leg i{display:inline-block;margin-right:5px;vertical-align:1px}.clima-leg i.b{width:9px;height:9px;background:#86b0ee;border-radius:2px}.clima-leg i.l{width:14px;height:2px;background:#c2410c}
.f-dist{margin-top:20px;padding-top:18px;border-top:1px solid var(--linha)}
table.dist{width:100%;border-collapse:collapse;font-size:13px;background:#fff;border-radius:6px;overflow:hidden}
table.dist th{text-align:left;font-weight:600;font-size:11.5px;color:var(--prata);padding:8px 10px;border-bottom:1px solid var(--linha);background:#f7f9fc}
table.dist td{padding:8px 10px;border-bottom:1px solid var(--linha-2);vertical-align:top}table.dist tr:last-child td{border-bottom:0}
table.dist td:first-child{color:#33445e;width:30%}table.dist td b{font-weight:600}table.dist small{display:block;font-size:11.5px;color:var(--prata)}
table.dist .num,.num{text-align:right;white-space:nowrap}
.f-nota,.f-fontes{font-size:11.5px;color:var(--prata);margin:8px 0 0}.f-fontes{margin-top:14px;padding-top:10px;border-top:1px solid var(--linha)}
.f-nada{font-size:12.5px;color:var(--prata);font-style:italic}
/* ---------- corpo ---------- */
main{padding:6px 46px 40px}
h2{display:flex;align-items:baseline;gap:12px;font-family:var(--serif);font-weight:600;font-size:27px;line-height:1.2;margin:46px 0 16px;padding-bottom:10px;border-bottom:1px solid var(--linha);scroll-margin-top:72px}
h2 .n{color:var(--azul);font-weight:600}
h3{font-family:var(--serif);font-weight:600;font-size:18px;margin:24px 0 8px}
p{margin:8px 0;max-width:80ch}.lead{font-size:15px;color:#22324a}
.fonte{color:var(--prata);font-size:12px}.pequeno{font-size:12.5px}
.fin{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:28px}.fin h3{margin-top:4px}
.fin-dest{font-family:var(--serif);font-size:21px;font-weight:600;line-height:1.25;margin:0}
.fin-op{margin-top:12px;font-style:italic;color:#33445e}.fin-op small{display:block;font-style:normal;font-size:11.5px;color:var(--prata)}
ul.abr{margin:6px 0;padding-left:20px}ul.abr li{margin:5px 0;max-width:84ch}ul.abr li::marker{color:var(--azul)}
.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:22px 0 6px}
.kpis>div{border:1px solid var(--linha);border-radius:8px;padding:14px 16px 12px;background:#fff}
.kpis b{display:block;font-family:var(--serif);font-weight:600;font-size:36px;line-height:1.05;color:var(--tinta)}.kpis b small{font-size:20px;color:var(--prata);font-weight:500}
.kpis span{display:block;font-size:12.5px;color:var(--prata);margin-top:4px}
.kpis .k-aviso{background:#fff8ec;border-color:#efd9ad}
.aviso-inc{border-color:#6d28d9!important;background:#f5f0ff!important;color:#3b1a7a}
.cob-rel{margin-top:12px}.cob-rel table{width:100%}.cob-rel td.est{white-space:nowrap;font-weight:700}.cob-rel .e-completo{color:#187a5e}.cob-rel .e-parcial{color:#a86a00}.cob-rel .e-falhou,.cob-rel .e-sem_base,.cob-rel .e-nao_consultada{color:#6d28d9}.cob-rel .acao{margin:8px 0 0;font-weight:600;color:#3b1a7a}
.parecer{border-left:6px solid var(--c);background:color-mix(in srgb,var(--c) 6%,#fff);border-radius:0 8px 8px 0;padding:16px 20px}
.parecer p{font-family:var(--serif);font-size:22px;font-weight:600;line-height:1.3;margin:0;color:color-mix(in srgb,var(--c) 70%,#0d1b2e);max-width:none}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.nv{display:inline-block;font-size:11.5px;font-weight:600;padding:2px 10px;border-radius:999px;white-space:nowrap;color:var(--c);background:color-mix(in srgb,var(--c) 12%,#fff);border:1px solid color-mix(in srgb,var(--c) 35%,#fff)}
.pro-contra{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:6px}
.pro-contra ul{list-style:none;margin:0;padding:0}
.pro-contra li{border-left:3px solid var(--c);padding:6px 0 8px 12px;margin:0 0 8px}
.pro-contra li b{display:block;font-size:14px;line-height:1.35}.pro-contra li p{margin:3px 0 4px;font-size:13px;color:#33445e}
.pn{font-size:11.5px;font-weight:600;color:var(--c)}
.grupo{margin:16px 0}.grupo-cab{display:flex;align-items:center;gap:8px;font-weight:600;font-size:15px;color:var(--c);margin-bottom:6px}
.grupo-cab i{width:10px;height:10px;border-radius:50%;background:var(--c)}.grupo-cab span{color:var(--prata);font-weight:500}
.achado{border-left:3px solid var(--c);padding:7px 0 9px 14px;margin-left:4px}.achado+.achado{border-top:1px solid var(--linha-2)}
.ac-t{font-weight:600;font-size:14px;display:flex;justify-content:space-between;gap:12px}.ac-setor{font-weight:400;font-size:11.5px;color:var(--prata);white-space:nowrap}
.achado p{margin:3px 0 4px;color:#29364d}
.ac-rod{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center}.cz{font-size:11.5px;color:var(--prata);font-style:italic}
.evs{display:inline-flex;flex-wrap:wrap;gap:3px}
.ev{font-family:"IBM Plex Mono",monospace;font-size:11px;color:var(--azul);background:var(--azul-claro);border-radius:4px;padding:0 5px;text-decoration:none;white-space:nowrap}
a.ev:hover{background:var(--azul);color:#fff}
.tab{width:100%;border-collapse:collapse;font-size:12.5px}.tab th{text-align:left;font-weight:600;color:var(--prata);font-size:11.5px;border-bottom:1px solid var(--linha);padding:6px}.tab td{border-bottom:1px solid var(--linha-2);padding:7px 6px;vertical-align:top}
.tab.mini td{font-size:11.5px;padding:3px 5px}.tab .num{text-align:right}
.tab.lista td:first-child{width:44px}.tab tr.realce td{background:#f6f0fd}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:0}
details.quadro{border:1px solid var(--linha);border-radius:8px;margin:8px 0}
details.quadro>summary{display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;list-style:none;font-size:14px}
details.quadro>summary::-webkit-details-marker{display:none}
details.quadro>summary>i{width:11px;height:11px;border-radius:3px}
.qc{margin-left:auto;display:flex;flex-wrap:wrap;gap:6px;font-size:11.5px;color:var(--prata)}.qc em{font-style:normal}
details.quadro .tab{border-top:1px solid var(--linha)}details.quadro .tab td{padding:7px 12px}
.sitc{width:200px}.sitc .nv{margin-top:3px}.det{color:#33415a}
.sit{display:inline-block;font-size:11px;font-weight:600;padding:1px 8px;border-radius:4px;margin-right:5px}
.sit-dentro{background:#fde2e4;color:#a4161a}.sit-proximo{background:#fff1d6;color:#8a5a00}.sit-fora{background:#e3f4ec;color:#1f6b4f}.sit-info{background:#e7efff;color:#1d4ed8}.sit-falha{background:#eceff3;color:#4b5563}
.rs{display:inline-block;font-size:11px;font-weight:700;border-radius:4px;padding:1px 7px;white-space:nowrap}.rs-impede{background:#fde2e4;color:#a4161a}.rs-ajuste{background:#ffe8d1;color:#9a3d00}.rs-condiciona{background:#fff1d6;color:#7a5300}.rs-atencao{background:#eef2ff;color:#3446a8}.rs-livre{background:#e3f4ec;color:#1f6b4f}.rs-sem_dados{background:#eceff3;color:#4b5563}
.tab.req td:first-child{width:110px}.tab.req td.det{width:34%;color:#33445e}
.btn-acao{font:inherit;font-weight:600;font-size:13px;border-radius:7px;padding:7px 12px;cursor:pointer;border:1px solid var(--azul);background:#fff;color:var(--azul);margin-right:6px}
.mini-acoes{margin:10px 0}
.tab.fav td{vertical-align:top}.fav-id{display:inline-block;background:#0d1b2e;color:#fff;border-radius:999px;padding:1px 9px;font-size:13px}
ul.motivos{margin:0;padding-left:16px}ul.motivos li{margin:2px 0}
.livre{color:#1f6b4f;font-size:12px;margin-top:3px}.onerada{color:#9a3d00;font-size:12px;margin-top:3px}
.fav-minis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.pctl{display:inline-block;min-width:34px;text-align:center;font-weight:600;font-size:12px;padding:1px 6px;border-radius:4px}
.tab.geof td,.tab.geof th{padding:6px 8px}.tab-rola{overflow-x:auto}
.fav-mini{margin:0}.fav-mini .mini-svg{width:100%;height:auto;display:block;border-radius:6px;border:1px solid var(--linha)}
.fav-mini figcaption{font-size:12px;color:#33445e;margin-top:5px}.fav-mini small{display:block;color:var(--prata);font-size:11px}
.legenda i.rampa{width:60px;height:10px;border-radius:2px;background:linear-gradient(90deg,#ffffb2,#fecc5c,#fd8d3c,#f03b20,#bd0026)}
.dois-mapas{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:18px 0 6px}.dois-mapas figure{margin:0}.dois-mapas figcaption{font-size:13px;margin:0 0 6px}.dois-mapas .legenda{font-size:11px;gap:4px 12px}
.cat{display:inline-block;border:1px solid var(--c);color:var(--c);background:color-mix(in srgb,var(--c) 9%,#fff);border-radius:999px;padding:1px 9px;font-size:12px;font-weight:600;white-space:nowrap}
.nota-g{font-family:var(--serif);font-size:22px;font-weight:600}.conf{font-size:13px}.conf-alta{color:#187a5e}.conf-média{color:#a86a00}.conf-baixa,.conf-muito-baixa{color:#b3121d}
ul.motivos.pro li::marker{content:'+  ';color:#187a5e;font-weight:700}ul.motivos.contra li::marker{content:'−  ';color:#b3121d;font-weight:700}ul.motivos.contra{color:#4a5568}ul.motivos+ul.motivos{margin-top:6px}
.kpis b.kpi-txt{font-size:28px;padding-top:6px}tr.apagado td{opacity:.55}h4{font-size:13px;margin:14px 0 6px;color:var(--tinta)}
.legenda i.rampa-conf{background:linear-gradient(90deg,#f0f4f8,#287cbc)}
.fav-marca span{display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:rgba(11,23,48,.85);border:2px solid #fff;color:#fff;font:700 12px Arial}.fav-marca.onerada span{border-color:#ffd166}
.mapa-int.mapa-fav{height:640px}.mapa-int{height:480px;border:1px solid var(--linha);border-radius:8px}
.mapa-est{position:relative;width:100%;background:#1b2433;border-radius:6px;overflow:hidden}.mapa-est img,.mapa-est svg{position:absolute;inset:0;width:100%;height:100%}
.so-impressao{display:none}
.legenda{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:12px;color:var(--prata);margin:8px 0 6px}
.legenda i{display:inline-block;margin-right:6px;vertical-align:-1px}.legenda i.pt{width:10px;height:10px;border-radius:50%;border:1.5px solid #fff;box-shadow:0 0 0 1px #9aa6b8}.legenda i.ar{width:15px;height:11px;border:2px solid}.legenda i.tracejado{border:2px dashed #1665d8}
.vazio{color:var(--prata);font-style:italic}
.aviso{background:#fff7e6;border:1px solid #f0d199;border-radius:6px;padding:10px 12px;font-size:12.5px;margin:10px 0}
details.fonte-bloco{border-bottom:1px solid var(--linha-2)}details.fonte-bloco>summary{display:flex;align-items:baseline;gap:10px;padding:9px 2px;cursor:pointer;list-style:none;flex-wrap:wrap}
details.fonte-bloco>summary::-webkit-details-marker{display:none}details.fonte-bloco>summary .sit{min-width:84px;text-align:center}
.fb-corpo{padding:0 0 10px 96px}
details.reg{border-top:1px solid var(--linha-2);padding:4px 0}details.reg>summary{cursor:pointer;font-size:12.5px}.reg .rel{float:right;color:var(--prata);font-size:12px}
details.reg:target{background:#fff8d6}tr:target td{background:#fff8d6}
.attrs{width:100%;border-collapse:collapse;margin:5px 0 7px}.attrs td{font-size:12px;padding:2px 8px 2px 0;border-bottom:1px dotted var(--linha);vertical-align:top;overflow-wrap:anywhere}.attrs td:first-child{color:var(--prata);width:34%}
.lacunas{padding-left:18px}.lacunas li{margin:6px 0}.lacunas li span{display:block;font-size:12px;color:var(--prata)}
.trilha summary{cursor:pointer;font-size:13px;color:var(--azul);margin:8px 0}
.url{font-family:"IBM Plex Mono",monospace;font-size:10px;word-break:break-all;color:var(--prata)}
footer{padding:14px 46px;font-size:11.5px;color:var(--prata);border-top:1px solid var(--linha);display:flex;justify-content:space-between;gap:12px}
@media screen and (max-width:1260px){.quadro-geral{grid-template-columns:minmax(0,1000px)}nav.sumario{display:none}}
@media screen and (max-width:820px){.fav-minis{grid-template-columns:1fr 1fr}.dois-mapas{grid-template-columns:1fr}.barra{flex-wrap:wrap;padding:8px 12px;gap:6px}.barra .esp{display:none}.barra button{white-space:nowrap;font-size:12px;padding:6px 10px}table.dist th:nth-child(4),table.dist td:nth-child(4){display:none}.pagina,main,footer{padding-left:18px;padding-right:18px}h1{font-size:34px}.f-visual,.f-grade3,.f-grade2,.fin,.pro-contra{grid-template-columns:1fr}.f-grade3>div+div,.f-grade2>div+div{margin-top:18px}.locs{grid-template-columns:1fr 1fr;grid-template-rows:auto}.kpis{grid-template-columns:1fr 1fr}.ficha{padding:16px}.cab img{height:42px}table.dist{font-size:12px}table.dist td,table.dist th{padding:6px}.fb-corpo{padding-left:0}.sitc{width:auto}}
@media print{body{background:#fff;font-size:11.5px}.barra,nav.sumario,.so-tela{display:none!important}.so-impressao{display:block}.quadro-geral{display:block;padding:0}.folha{box-shadow:none;border-radius:0}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .pagina{padding:0}main{padding:0}footer{padding:10px 0}h1{font-size:38px}.titulo{padding:20px 0 14px}
  h2{break-after:avoid;margin-top:26px}h3{break-after:avoid}.bloco,details.reg,.achado,.mapa-est,.mapa-rel,.f-visual,.kpis,.parecer,.pro-contra li,table.dist tr,.tab tr,.dois-mapas figure,.fav-mini{break-inside:avoid}.dois-mapas figcaption{break-after:avoid}
  .ficha{padding:16px 18px 12px}.f-grade3,.f-grade2{gap:0 18px;margin-top:14px;padding-top:12px}.bloco h3{font-size:15.5px}.bloco dd{font-size:12px}.bloco dt{font-size:10.5px;margin-top:5px}.kp b{font-size:24px}h2{font-size:22px}.kpis b{font-size:28px}.parecer p{font-size:18px}
  .bloco dl{grid-template-columns:minmax(0,38%) minmax(0,1fr);column-gap:8px;row-gap:3px}.bloco dt,.bloco dt:first-child{margin-top:0}.bloco dd{margin:0}.bloco dd small{font-size:10px}
  .f-visual{grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:12px}.loc svg{max-height:110px}.cab img{height:46px}.alvo-tag{margin-top:8px}.bloco.f-dist{break-inside:auto}
  table.dist{font-size:11px}table.dist td,table.dist th{padding:5px 8px}.fb-corpo{padding-left:0}}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
</style></head><body>
<div class="barra"><button id="bVoltar">Voltar ao mapa</button><span class="esp"></span><span class="pdf-msg" id="pdfMsg" role="status" aria-live="polite"></span><button id="bJson">Exportar dados (JSON)</button><button id="bGeo">GeoJSON</button><button id="bPrint">Imprimir</button><button class="pri" id="bPdf">Salvar PDF</button></div>
<div class="quadro-geral"><nav class="sumario" aria-label="Sumário"><div class="t">Neste relatório</div>${sumario}</nav>
<div class="folha">
<div class="pagina" id="topo">
  <header class="cab"><img src="${base}assets/logo-horizontal.png" alt="Vip Air Analysis"><div class="cab-dir"><b>Relatório ${numero}</b>emitido em ${VA.fmt.dataHora(agora)}${responsavel ? `<br>responsável: ${esc(responsavel)}` : ''}</div></header>
  <div class="titulo">
    <div class="kicker">Relatório de inteligência territorial — ${esc(VA.FINALIDADES[finalidade])}</div>
    <h1>${esc(titulo)}</h1>
    <p class="subt">${esc(subt)}</p>
    ${REQ ? `<span class="alvo-tag"><i></i>Local para requerimento${REQ.substancia ? ': ' + esc(REQ.substancia) : ''}</span>` : A ? `<span class="alvo-tag"><i></i>Alvo da pesquisa: ${esc(A.mineral)}</span>` : finalidade === 'mineracao' && p.alvoModo === 'geral' ? '<span class="alvo-tag"><i></i>Varredura mineral geral</span>' : ''}
  </div>
  ${fichaHTML(s, F, m)}
</div>
<main>${corpo}</main>
<footer><span>VIP ANALYSIS — Vip Air · versão ${VA.versao}</span><span>${numero} — ${agora.toISOString()}</span></footer>
</div></div>
<script type="application/json" id="dadosPacote">${json(pacote)}</script>
<script type="application/json" id="dadosMapa">${json(mapaDados)}</script>
<script type="application/json" id="dadosOc">${json(MO)}</script>
<script type="application/json" id="dadosReq">${json(analise.requerimento && analise.requerimento.poligonal ? { kml: VA.kmlPoligonos([{ nome: 'Poligonal N-S/L-O sugerida', estilo: 'nslo', feature: analise.requerimento.poligonal.feature }, { nome: 'Área sem interferência nas bases', estilo: 'livre', feature: analise.requerimento.livre && analise.requerimento.livre.feature }].concat(analise.requerimento.bloqueios.map(b => ({ nome: 'Impedimento: ' + b.properties.titulo, estilo: 'onerada', feature: b }))), 'VIP ANALYSIS — requerimento'), csv: VA.memorialCSV(analise.requerimento.poligonal.feature, 'Poligonal N-S/L-O sugerida — ' + VA.fmt.ha(analise.requerimento.poligonal.ha)) } : null)}</script>
<script type="application/json" id="dadosFav">${json(analise.favorab && analise.favorab.grade ? { url: VA.favImagem(analise.favorab, 'fav'), disp: VA.favImagem(analise.favorab, 'disp'), conf: VA.favImagem(analise.favorab, 'conf'), bb: analise.favorab.grade.bbox, proc: analise.favorab.processos || [], alvos: analise.favorab.alvos.map(a => ({ id: a.id, c: a.c, n: Math.round(a.nota * 100), q: Math.round(a.conf * 100), k: a.categoria, s: a.situacao, l: a.categoria === 'Novo requerimento possível', m: a.motivos, x: a.contra })), oc: analise.favorab.ocorrencias } : null)}</script>
<script>
(function(){
  var SRV=${JSON.stringify(VA.Net.proxy.ok ? (VA.Net.proxy.base || (location.origin + '/')) : 'http://localhost:8766/')}, NOME_PDF=${JSON.stringify(`Relatório ${numero} — ${titulo}`).replace(/</g, '\\u003c')};
  var baixar=function(nome,txt,tipo){var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([txt],{type:tipo}));a.download=nome;document.body.appendChild(a);a.click();setTimeout(function(){a.remove()},1500)};
  document.getElementById('bVoltar').onclick=function(){if(window.opener&&!window.opener.closed){window.close();if(!window.closed)window.opener.focus()}else location.href='${base}index.html'};
  document.getElementById('bPrint').onclick=function(){document.querySelectorAll('details').forEach(function(d){d.open=true});setTimeout(function(){window.print()},100)};
  /* PDF pelo servidor local: o Edge/Chrome do computador gera o arquivo, que vai para Documentos > VIP ANALYSIS > relatorios e abre no leitor de PDF */
  var bPdf=document.getElementById('bPdf'),msg=document.getElementById('pdfMsg');
  bPdf.onclick=function(){
    var c=document.documentElement.cloneNode(true);
    c.querySelectorAll('script,.barra,nav.sumario,.so-tela').forEach(function(x){x.remove()});
    c.querySelectorAll('details').forEach(function(d){d.setAttribute('open','')});
    var html='<!doctype html>'+c.outerHTML;
    bPdf.disabled=true;bPdf.textContent='Gerando PDF…';msg.textContent='Isso leva de 10 a 40 segundos (o PDF espera os mapas carregarem).';
    fetch(SRV+'api/pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({html:html,nome:NOME_PDF})})
      .then(function(r){return r.json().then(function(j){if(!r.ok||!j.ok)throw new Error(j.erro||('HTTP '+r.status));return j})})
      .then(function(j){msg.innerHTML=(j.aberto?'PDF aberto no leitor e salvo em ':'PDF salvo em ')+'<b>'+esc(j.arquivo)+'</b> · <a href="'+SRV+j.url.slice(1)+'">baixar uma cópia</a>'})
      .catch(function(e){msg.innerHTML='Não consegui gerar o PDF pelo servidor local ('+esc(e.message)+'). Abrindo a impressão: escolha <b>Salvar como PDF</b>.';document.querySelectorAll('details').forEach(function(d){d.open=true});setTimeout(function(){window.print()},300)})
      .then(function(){bPdf.disabled=false;bPdf.textContent='Salvar PDF'});
  };
  var RQ=JSON.parse(document.getElementById('dadosReq').textContent);if(RQ){var k=document.getElementById('bReqKml'),c=document.getElementById('bReqCsv');if(k)k.onclick=function(){baixar('${numero}-poligonal.kml',RQ.kml,'application/vnd.google-earth.kml+xml')};if(c)c.onclick=function(){baixar('${numero}-memorial.csv',RQ.csv,'text/csv')}}
  document.getElementById('bJson').onclick=function(){baixar('${numero}-dados.json',document.getElementById('dadosPacote').textContent,'application/json')};
  var MD=JSON.parse(document.getElementById('dadosMapa').textContent), MO=JSON.parse(document.getElementById('dadosOc').textContent);
  document.getElementById('bGeo').onclick=function(){var fc={type:'FeatureCollection',features:[Object.assign({},MD.aoi,{properties:{camada:'area_interesse'}})].concat(MD.fc.features)};baixar('${numero}.geojson',JSON.stringify(fc),'application/geo+json')};
  document.addEventListener('click',function(e){var a=e.target.closest('a.ev');if(!a)return;var el=document.getElementById(a.getAttribute('href').slice(1));if(!el)return;var d=el.closest('details.fonte-bloco');if(d)d.open=true;if(el.tagName==='DETAILS')el.open=true});
  var esc=function(t){return String(t==null?'':t).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})};
  var STC={'mina':'#c1121f','garimpo':'#e07b00','nao explotado':'#1665d8','indeterminado':'#7b8794'};
  var norm=function(s){return String(s||'indeterminado').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase()};
  var cor=function(s){return STC[norm(s)]||'#7b8794'};
  var s=document.createElement('script');s.src='${base}lib/leaflet/leaflet.js';
  s.onerror=function(){document.querySelectorAll('.so-tela').forEach(function(x){x.style.display='none'});document.querySelectorAll('.so-impressao').forEach(function(x){x.style.display='block'})};
  s.onload=function(){
    var bases=function(m){var sat=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,maxNativeZoom:18,attribution:'Esri, Maxar'}).addTo(m);var osm=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'});L.control.layers({'Satélite':sat,'OpenStreetMap':osm},{},{position:'topright'}).addTo(m);L.control.scale({imperial:false}).addTo(m)};
    var area=function(m){return L.geoJSON(MD.aoi,{style:{color:'#1665d8',weight:3,fillOpacity:.06},pointToLayer:function(f,ll){return L.circleMarker(ll,{radius:9,color:'#1665d8',weight:3,fillColor:'#fff',fillOpacity:1})}}).addTo(m)};
    var limites=function(){return L.geoJSON(MD.aoi).getBounds()};
    /* cada mapa recebe a vista antes das camadas (evita desenhar caminhos num mapa ainda sem escala) */
    try{
      var m=L.map('mapaInt',{scrollWheelZoom:false});try{m.fitBounds(limites().pad(1.2),{maxZoom:15})}catch(e){m.setView([-10,-50],4)}
      bases(m);var a1=area(m);
      L.geoJSON(MD.fc,{style:function(f){var c=MD.cores[f.properties.s]||'#666';return{color:c,weight:f.properties.i?2.4:1.4,fillColor:c,fillOpacity:f.properties.i?.18:.04,dashArray:f.properties.i?null:'5 4'}},
        pointToLayer:function(f,ll){var c=MD.cores[f.properties.s]||'#666';return L.circleMarker(ll,{radius:f.properties.i?7:5,color:'#fff',weight:1.5,fillColor:c,fillOpacity:.95})},
        onEachFeature:function(f,l){var p=f.properties;l.bindPopup('<b>'+esc(p.e)+' — '+esc(p.c)+'</b><br>'+esc(p.t)+'<br>'+(p.i?'dentro da área'+(p.h?', '+p.h+' ha':''):(p.d!=null?'a '+p.d+' km da área':'')))}}).addTo(m);
      a1.bringToFront();
    }catch(e){console.error('mapa da área',e)}
    try{
      var FV=JSON.parse(document.getElementById('dadosFav').textContent), ef=document.getElementById('mapaFav');
      if(ef&&FV){var mf=L.map(ef,{scrollWheelZoom:false,zoomSnap:.1});var b=[[FV.bb[1],FV.bb[0]],[FV.bb[3],FV.bb[2]]];mf.fitBounds(b,{padding:[2,2]});bases(mf);
        var cf=L.imageOverlay(FV.url,b,{opacity:.8}).addTo(mf),cd=L.imageOverlay(FV.disp,b,{opacity:.85}),cq=L.imageOverlay(FV.conf,b,{opacity:.75});
        var CP={pesquisa:'#ffb020',lavra:'#ff4d5e',disponibilidade:'#c3c9d2',outro:'#ffb020'};
        var cp=L.geoJSON({type:'FeatureCollection',features:FV.proc},{style:function(f){var c=CP[f.properties.classe]||CP.outro;return{color:c,weight:1.6,fillColor:c,fillOpacity:.07}},onEachFeature:function(f,l){var p=f.properties;l.bindPopup('<b>'+esc(p.processo)+'</b><br>'+esc(p.fase||'')+'<br>'+esc(p.titular||'')+'<br>'+esc(p.subs||'')+(p.ha?'<br>'+Number(p.ha).toLocaleString('pt-BR',{maximumFractionDigits:1})+' ha':''))}}).addTo(mf);
        L.control.layers({'Favorabilidade':cf,'Disponibilidade':cd,'Confiabilidade':cq},{'Processos ANM (SIGMINE)':cp},{collapsed:false,position:'topleft'}).addTo(mf);var a3=area(mf);mf.on('baselayerchange',function(){a3.bringToFront()});
        FV.oc.forEach(function(o){L.circleMarker([o.c[1],o.c[0]],{radius:o.alvo?6:4,color:'#fff',weight:1.3,fillColor:o.alvo?'#8e2bd6':'#c9a3f0',fillOpacity:1}).bindPopup(esc(o.nome||'')+'<br>'+esc(o.st||'')).addTo(mf)});
        FV.alvos.forEach(function(t){L.marker([t.c[1],t.c[0]],{icon:L.divIcon({className:'fav-marca'+(t.l?'':' onerada'),html:'<span>'+t.id+'</span>',iconSize:[28,28]})}).bindPopup('<b>'+t.id+' — favorabilidade '+t.n+', confiabilidade '+t.q+'</b><br>'+t.m.map(function(x){return '+ '+esc(x)}).join('<br>')+(t.x.length?'<br>'+t.x.map(function(x){return '− '+esc(x)}).join('<br>'):'')+'<br><b>'+esc(t.k)+'</b> · <i>'+esc(t.s)+'</i>',{maxWidth:340}).addTo(mf)});
        a3.bringToFront()}
    }catch(e){console.error('mapa de favorabilidade',e)}
    try{
      var el=document.getElementById('mapaOc');
      if(el&&MO){
        var mo=L.map(el,{scrollWheelZoom:false});var bb=limites();
        MO.pontos.forEach(function(p){bb.extend([p.c[1],p.c[0]])});
        if(MO.polis.length)bb.extend(L.geoJSON({type:'FeatureCollection',features:MO.polis}).getBounds());
        try{mo.fitBounds(bb.pad(.08),{maxZoom:14})}catch(e){mo.setView([-10,-50],4)}
        bases(mo);var a2=area(mo);var grupo=L.featureGroup().addTo(mo);
        if(MO.modo==='alvo'){var c=a2.getBounds().getCenter();L.circle(c,{radius:MO.raioKm*1000,color:'#1665d8',weight:1.5,dashArray:'6 6',fill:false,interactive:false}).addTo(mo)}
        L.geoJSON({type:'FeatureCollection',features:MO.polis},{style:{color:'#b26df0',weight:1.6,fillOpacity:.14},onEachFeature:function(f,l){var p=f.properties;l.bindPopup('<b>'+esc(p.e)+' — '+esc(p.t)+'</b><br>'+esc(p.n)+'<br>'+(p.i?'sobre a área':'a '+p.d+' km'))}}).addTo(grupo);
        MO.pontos.forEach(function(p){L.circleMarker([p.c[1],p.c[0]],{radius:p.i?8:6,color:'#fff',weight:1.6,fillColor:cor(p.st),fillOpacity:.95}).bindPopup('<b>'+esc(p.e)+' — '+esc(p.t)+'</b><br>'+esc(p.sub)+'<br>'+esc(p.st)+(p.imp?', '+esc(p.imp):'')+'<br>'+(p.i?'dentro da área':'a '+p.d+' km')).addTo(grupo)});
        a2.bringToFront();
      }
    }catch(e){console.error('mapa de ocorrências',e)}
  };
  document.head.appendChild(s);
})();
</script></body></html>`;
  };
})();
