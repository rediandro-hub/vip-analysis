/* VIP ANALYSIS — alvo da pesquisa mineral.
   Na finalidade "Pesquisa / lavra mineral" o operador escolhe entre varredura geral e um mineral, minério ou gema
   específico. Com um alvo, a plataforma busca as ocorrências dele no GEOBANK (SGB) e os processos da ANM com essa
   substância num raio maior, e o relatório ganha uma seção e um mapa próprios. */
'use strict';

(function () {
  const VA = window.VA;
  const N = s => VA.fmt.norm(String(s == null ? '' : s));

  /* sinônimos e minerais-minério (com acento: o mesmo texto serve para a consulta SQL e para a comparação) */
  const SIN = [
    ['Ouro', ['Ouro', 'Minério de ouro']],
    ['Prata', ['Prata']],
    ['Cobre', ['Cobre', 'Minério de cobre', 'Calcopirita', 'Malaquita', 'Bornita']],
    ['Ferro', ['Ferro', 'Minério de ferro', 'Hematita', 'Magnetita', 'Itabirito']],
    ['Manganês', ['Manganês', 'Minério de manganês', 'Pirolusita']],
    ['Níquel', ['Níquel', 'Minério de níquel', 'Garnierita']],
    ['Cobalto', ['Cobalto']],
    ['Lítio', ['Lítio', 'Espodumênio', 'Lepidolita', 'Petalita', 'Ambligonita', 'Minério de lítio']],
    ['Tântalo', ['Tântalo', 'Tantalita', 'Columbita', 'Coltan']],
    ['Nióbio', ['Nióbio', 'Columbita', 'Pirocloro']],
    ['Estanho', ['Estanho', 'Cassiterita']],
    ['Tungstênio', ['Tungstênio', 'Scheelita', 'Wolframita']],
    ['Berilo', ['Berilo', 'Berílio', 'Água marinha', 'Água-marinha', 'Esmeralda', 'Heliodoro', 'Morganita']],
    ['Turmalina', ['Turmalina']],
    ['Esmeralda', ['Esmeralda']],
    ['Água marinha', ['Água marinha', 'Água-marinha']],
    ['Ametista', ['Ametista']],
    ['Diamante', ['Diamante']],
    ['Titânio', ['Titânio', 'Ilmenita', 'Rutilo', 'Anatásio']],
    ['Zircônio', ['Zircônio', 'Zirconita', 'Zircão']],
    ['Cromo', ['Cromo', 'Cromita']],
    ['Chumbo', ['Chumbo', 'Galena']],
    ['Zinco', ['Zinco', 'Esfalerita']],
    ['Molibdênio', ['Molibdênio', 'Molibdenita']],
    ['Vanádio', ['Vanádio']],
    ['Urânio', ['Urânio']],
    ['Terras raras', ['Terras raras', 'Monazita', 'Xenotímio', 'Cério', 'Lantânio', 'Ítrio', 'Neodímio']],
    ['Bauxita', ['Bauxita', 'Alumínio']],
    ['Fosfato', ['Fosfato', 'Apatita', 'Fosforita', 'Fósforo']],
    ['Potássio', ['Potássio', 'Silvinita', 'Silvita']],
    ['Gipsita', ['Gipsita', 'Gesso']],
    ['Calcário', ['Calcário', 'Dolomito', 'Calcita']],
    ['Caulim', ['Caulim', 'Caulinita']],
    ['Feldspato', ['Feldspato', 'Albita', 'Microclínio']],
    ['Mica', ['Mica', 'Muscovita', 'Biotita', 'Vermiculita']],
    ['Quartzo', ['Quartzo', 'Cristal de rocha', 'Quartzo rosa', 'Quartzo hialino']],
    ['Grafita', ['Grafita']],
    ['Granito', ['Granito', 'Rocha ornamental']],
    ['Mármore', ['Mármore']]
  ];
  VA.ALVOS_COMUNS = SIN.map(s => s[0]);

  VA.alvo = {
    /* termos de busca para um alvo digitado/escolhido (com o original e os sinônimos) */
    termos(alvo) {
      const a = String(alvo || '').trim(); if (!a) return [];
      const na = N(a), out = [a];
      SIN.forEach(([nome, lista]) => { if (lista.some(x => N(x) === na) || N(nome) === na) out.push(...lista); });
      return [...new Map(out.map(t => [N(t), t])).values()].filter(t => N(t).length >= 3);
    },
    /* o texto (ex.: "Berílio, Caulim, Tântalo" ou "MINÉRIO DE OURO") contém algum termo? */
    casa(texto, termos) { const n = N(texto); return termos.some(t => n.includes(N(t))); },
    /* condição SQL (ArcGIS) para um campo: com e sem acento, em maiúsculas */
    sql(campo, termos) {
      const v = new Set(); termos.forEach(t => { v.add(t.toUpperCase()); v.add(N(t).toUpperCase()); });
      return '(' + [...v].map(t => `UPPER(${campo}) LIKE '%${t.replace(/'/g, "''")}%'`).join(' OR ') + ')';
    }
  };

  /* lista de minerais para o campo de escolha: GEOBANK do estado de trabalho + os comuns */
  let cacheLista = {};
  VA.alvo.lista = async function () {
    const uf = VA.mapa.uf;
    if (cacheLista[uf]) return cacheLista[uf];
    let doGeobank = [];
    try {
      const j = await VA.Net.json(`${VA.URL.SGB}geologia/ocorrencias/MapServer/0/query?where=${encodeURIComponent(`UF='${uf}'`)}&outFields=SUBSTANCIAS&returnGeometry=false&f=json`, { timeout: 30000 });
      doGeobank = [...new Set((j.features || []).flatMap(f => String(f.attributes.SUBSTANCIAS || '').split(/\s*[,;]\s*/)).map(s => s.trim()).filter(Boolean))];
    } catch (e) { /* só os comuns */ }
    const todos = [...new Map(doGeobank.concat(VA.ALVOS_COMUNS).map(s => [N(s), s])).values()].sort((a, b) => a.localeCompare(b, 'pt'));
    cacheLista[uf] = { todos, doGeobank: new Set(doGeobank.map(N)) };
    return cacheLista[uf];
  };

  /* busca do alvo: ocorrências no GEOBANK e processos da ANM com a substância, num raio próprio */
  /* nome como aparece nas bases (ex.: "turmalina" → "Turmalina", "tantalo" → "Tântalo") */
  VA.alvo.canonico = function (alvo) {
    const a = String(alvo || '').trim(), na = N(a); if (!a) return '';
    const listas = Object.values(cacheLista).flatMap(l => l.todos).concat(VA.ALVOS_COMUNS);
    const achou = listas.find(s => N(s) === na);
    return achou || a.charAt(0).toUpperCase() + a.slice(1);
  };
  VA.analisarAlvo = async function (aoi, params, aoProgresso) {
    const mineral = VA.alvo.canonico(params.alvoAtivo || params.alvoMineral);
    const termos = VA.alvo.termos(mineral);
    const raio = Math.max(1, +params.raioAlvoKm || 30);
    const bbox = VA.geo.bboxBuffer(aoi.geometry, raio);
    const out = { mineral, termos, raioKm: raio, ocorrencias: [], processos: [], bateia: [], consultas: [], erros: [], consultadoEm: new Date().toISOString() };
    if (!termos.length) return out;
    const medir = f => VA.geo.distanciaKm(aoi, f);
    let n = 0;
    const rotOc = p => [p.TOPONIMIA, p.MUNICIPIO && (p.MUNICIPIO + (p.UF ? '-' + p.UF : ''))].filter(Boolean).join(' · ') || 'Ocorrência';
    if (aoProgresso) aoProgresso(`Buscando ocorrências de ${mineral} no GEOBANK (SGB)…`);
    try {
      const fc = await VA.ags.query(VA.URL.SGB + 'geologia/ocorrencias/MapServer/0', { bbox, where: VA.alvo.sql('SUBSTANCIAS', termos), max: 3000 });
      out.consultas.push({ fonte: 'SGB — GEOBANK', url: fc._url, n: fc.features.length });
      fc.features.filter(f => VA.alvo.casa(f.properties.SUBSTANCIAS, termos)).forEach(f => {
        const d = medir(f); if (d == null || d > raio) return;
        const p = f.properties;
        out.ocorrencias.push({ evid: 'A' + (++n), titulo: rotOc(p), subtitulo: [p.SUBSTANCIAS, p.STATUS_ECONOMICO, p.IMPORTANCIA].filter(Boolean).join(' · '), distancia_km: d, incide: d === 0, feature: f, props: p, atributos: VA.attrsLimpos(p, 40) });
      });
      out.ocorrencias.sort((a, b) => a.distancia_km - b.distancia_km);
    } catch (e) { out.erros.push('GEOBANK: ' + e.message); }
    if (aoProgresso) aoProgresso(`Buscando processos da ANM com ${mineral}…`);
    try {
      const fc = await VA.ags.query(VA.URL.ANM + 'SIGMINE/dados_anm/MapServer/0', { bbox, where: VA.alvo.sql('SUBS', termos), max: 1500, maxOffset: 0.0002 });
      out.consultas.push({ fonte: 'ANM — SIGMINE', url: fc._url, n: fc.features.length });
      const interesse = (params.titulares || '').split(/[;,\n]/).map(N).filter(s => s.length > 2);
      fc.features.filter(f => VA.alvo.casa(f.properties.SUBS, termos)).forEach(f => {
        const d = medir(f); if (d == null || d > raio) return;
        const p = f.properties;
        out.processos.push({ evid: 'A' + (++n), titulo: `${p.PROCESSO} — ${p.FASE || 'fase não informada'}`, subtitulo: [p.SUBS, p.NOME, p.AREA_HA ? VA.fmt.ha(p.AREA_HA) : null].filter(Boolean).join(' · '), distancia_km: d, incide: d === 0, proprio: interesse.some(t => N(p.NOME).includes(t)), fase: p.FASE, feature: f, props: p, atributos: VA.attrsLimpos(p, 40) });
      });
      out.processos.sort((a, b) => a.distancia_km - b.distancia_km);
    } catch (e) { out.erros.push('ANM: ' + e.message); }
    const dentro = l => l.filter(i => i.incide).length;
    out.resumo = { ocDentro: dentro(out.ocorrencias), ocTotal: out.ocorrencias.length, ocMin: out.ocorrencias.length ? out.ocorrencias[0].distancia_km : null,
      procDentro: dentro(out.processos), procTotal: out.processos.length,
      porStatus: out.ocorrencias.reduce((m, i) => { const k = i.props.STATUS_ECONOMICO || 'Não informado'; m[k] = (m[k] || 0) + 1; return m; }, {}) };
    return out;
  };

  /* modelos da Bateia que têm o alvo entre os minérios esperados */
  VA.alvo.daBateia = function (bateia, termos) {
    if (!bateia || !termos || !termos.length) return [];
    return (bateia.modelos || []).filter(m => (m.minerios || []).some(x => VA.alvo.casa(x, termos)));
  };
})();
