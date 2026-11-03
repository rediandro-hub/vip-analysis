/* VIP ANALYSIS — inteligência mineral para um bem específico.
   Responde, com os dados públicos disponíveis, três perguntas separadas:
     ONDE PROCURAR — favorabilidade geológica: cruza numa grade em volta da área as evidências que o sistema mineral
       do bem associa a ele: ocorrências (GEOBANK), litologia na melhor escala disponível em cada trecho (1:25.000 a
       1:1.000.000), unidades que hospedam as ocorrências conhecidas, contatos litológicos, estruturas e suas
       interseções, gamaespectrometria, magnetometria (campo anômalo, sinal analítico e 1ª derivada vertical) e
       geoquímica (rocha, solo e sedimento de corrente, anomalias definidas pela própria população de amostras);
     ONDE É POSSÍVEL ATUAR — disponibilidade: processos ativos do SIGMINE na janela (fase e via de acesso) e as
       restrições territoriais já levantadas pela análise;
     COM QUE SEGURANÇA — confiabilidade dos dados, independente da favorabilidade: escala da geologia, espaçamento
       das linhas do aerolevantamento, densidade de amostras.
   O cruzamento dos três dá o ranking de oportunidades. Cada evidência entra uma vez: as ocorrências pesam como
   pontos (proximidade) e, para a litologia, só como indício de rocha hospedeira, com peso limitado.
   É um modelo dirigido por conhecimento (knowledge-driven), relativo à janela: aponta onde as evidências
   convergem; não indica teor, tonelagem nem probabilidade de descoberta. */
'use strict';

(function () {
  const VA = window.VA, N = s => VA.fmt.norm(s);
  const SGB = 'https://geoportal.sgb.gov.br/server/rest/services/';
  const SGBI = 'https://geoportal.sgb.gov.br/image/rest/services/';
  const GEOF = { k: 'geofisica_kperc', th: 'geofisica_eth', u: 'geofisica_eu', thk: 'geofisica_thk', asa: 'geofisica_sinal', mag: 'geofisica_mag', dv1: 'geofisica_1dv' };
  /* escalas da litoestratigrafia do SGB, da mais detalhada para a mais regional, com a qualidade relativa */
  /* restrições consultadas na janela inteira: [camada, crítica para a disponibilidade, tipo] */
  const RESTR_JANELA = [['anm_bloq', true, 'restrito'], ['anm_militar', true, 'restrito'], ['funai_ti', true, 'restrito'], ['cnuc', true, null], ['anm_estoque', true, 'disponibilidade'],
    ['anm_quilombo', false, 'condicionado'], ['anm_assent', false, 'condicionado'], ['anm_urbana', false, 'condicionado'], ['anm_garimp', false, 'condicionado']];
  const ESCALAS = [['25000', '1:25.000', 1], ['50000', '1:50.000', 0.95], ['100000', '1:100.000', 0.85], ['150000', '1:150.000', 0.75], ['250000', '1:250.000', 0.6], ['1000000', '1:1.000.000', 0.35]];

  /* ---------------- sistemas minerais (pesos documentados no relatório) ---------------- */
  const inv = v => v == null ? null : 1 - v;
  const media = (...l) => { const v = l.filter(x => x != null && !isNaN(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const SIS = {
    pegmatito: {
      nome: 'Pegmatitos e granitos evoluídos (gemas, lítio, tântalo, estanho, berilo)',
      alvo: /turmalin|beril|agua.?marinha|esmerald|heliodor|morganit|litio|espodumen|lepidolit|petalit|ambligonit|tantal|columbit|coltan|estanho|cassiterit|feldspato|mica|muscovit|quartzo|caulim|granada|topazio|amazonit|rubelit|indicolit/,
      familia: /turmalin|beril|agua.?marinha|esmerald|litio|espodumen|lepidolit|tantal|columbit|cassiterit|estanho|feldspato|mica|muscovit|quartzo|caulim|pegmat|granada|amazonit/,
      lito: [[/pegmat/, 1], [/leucogran|granito (a duas micas|peraluminoso|tipo s)|muscovita.?granito/, 0.85], [/granada.?biotita.?xisto|micaxist|biotita.?xisto|xisto/, 0.7], [/quartzit/, 0.45], [/granit|monzogran|sienogran/, 0.5], [/metaconglomerad/, 0.35], [/gnaiss|migmat/, 0.3], [/aluvi|cascalh|coluvi/, 0.35]],
      contraLito: /basalt|gabro|ultramafic|calcari|arenit|sediment/,
      idade: [480, 650],
      pesos: { oc: 0.28, lito: 0.24, gama: 0.18, estr: 0.08, contato: 0.05, geoq: 0.12, mag: 0.05 },
      gama: g => media(g.k, inv(g.thk)), gamaTxt: 'potássio alto e razão Th/K baixa (feldspato potássico e mica, típicos de pegmatito)',
      mag: g => inv(g.asa), magTxt: 'sinal analítico baixo (pegmatitos não são magnéticos)',
      elementos: ['li', 'be', 'cs', 'ta', 'nb', 'sn', 'rb', 'b']
    },
    ouro: {
      nome: 'Ouro orogênico e veios hidrotermais',
      alvo: /ouro|prata|antimon|scheelit|tungst|arsenopir/,
      familia: /ouro|prata|cobre|tungst|scheelit|antimon|arsen|bismut/,
      lito: [[/metavulc|greenstone|xisto verde|metabasalt|komat|anfibolit|metamafic|metaultramafic/, 0.9], [/formacao ferrifera|ferrifer|itabir|bif|jaspilit/, 0.8], [/veio de quartzo|quartzo.?veio/, 0.9], [/xisto|filito|metassediment|metagrauvac|turbidit|metapelit|metachert/, 0.6], [/tonalit|granodior|granit/, 0.4], [/conglomerad|aluvi|cascalh/, 0.5]],
      contraLito: /arenit|calcari|sediment|cobertura|laterit/,
      idade: null,
      pesos: { oc: 0.22, estr: 0.20, lito: 0.15, contato: 0.06, gama: 0.13, mag: 0.10, geoq: 0.14 },
      gama: g => media(g.k, inv(g.thk)), gamaTxt: 'K alto com Th/K baixo (padrão compatível com alteração potássica, que precisa ser confirmada)',
      mag: g => media(g.grad, g.dv1), magTxt: 'gradiente magnético forte (contatos e zonas de cisalhamento)',
      elementos: ['au', 'as', 'sb', 'bi', 'w', 'te', 'ag', 'cu', 'pb', 'zn']
    },
    ferro: {
      nome: 'Formações ferríferas e manganês',
      alvo: /ferro|hematit|magnetit|itabir|mangan|pirolusit|gondit/,
      familia: /ferro|hematit|magnetit|mangan/,
      lito: [[/formacao ferrifera|ferrifer|itabir|bif|jaspilit|hematit/, 1], [/gondit|mangan/, 0.9], [/metavulc|xisto|filito|quartzit/, 0.3]],
      contraLito: /granit|gnaiss|arenit/,
      pesos: { oc: 0.28, lito: 0.30, mag: 0.30, geoq: 0.12 },
      gama: () => null, mag: g => media(g.asa, g.mag), magTxt: 'anomalia magnética alta (minerais de ferro magnéticos)',
      elementos: ['fe', 'mn', 'v', 'ti']
    },
    cobre: {
      nome: 'Cobre, molibdênio e cobalto (pórfiro e óxido de ferro-cobre-ouro)',
      alvo: /cobre|calcopir|malaquit|bornit|molibd|cobalto/,
      familia: /cobre|ouro|molibd|cobalto|ferro|zinco|chumbo/,
      lito: [[/brecha|skarn|calcissilic|iocg/, 0.85], [/metavulc|basalt|andesit|riolit|dacit|vulcan/, 0.6], [/gabro|diorit|tonalit|granodior|porfir/, 0.6], [/formacao ferrifera|anfibolit/, 0.5], [/xisto|gnaiss/, 0.3]],
      contraLito: /arenit|calcari|cobertura/,
      pesos: { oc: 0.22, mag: 0.18, gama: 0.18, estr: 0.13, contato: 0.05, lito: 0.10, geoq: 0.14 },
      gama: g => media(g.k, g.k, inv(g.thk)), gamaTxt: 'potássio alto (padrão compatível com alteração potássica, a confirmar)',
      mag: g => media(g.asa, g.mag), magTxt: 'anomalia magnética e sinal analítico altos',
      elementos: ['cu', 'mo', 'au', 'co', 'zn', 'pb']
    },
    ultramafico: {
      nome: 'Rochas máficas e ultramáficas (níquel, cromo, cobalto, platina)',
      alvo: /niquel|garnierit|cromo|cromit|platina|paladio|talco|amianto|vermiculit/,
      familia: /niquel|cromo|cobalto|platina|talco|cobre|vermiculit/,
      lito: [[/ultramafic|serpentin|peridot|dunit|piroxenit|komat|harzburg|talco|cromitit/, 1], [/gabro|norit|anortosit|mafic|anfibolit|basalt/, 0.6]],
      contraLito: /granit|arenit|calcari/,
      pesos: { oc: 0.28, lito: 0.30, mag: 0.20, gama: 0.10, geoq: 0.12 },
      gama: g => media(inv(g.k), inv(g.th)), gamaTxt: 'K e Th baixos (rochas pobres em potássio e tório)',
      mag: g => media(g.asa, g.mag), magTxt: 'anomalia magnética alta',
      elementos: ['ni', 'cr', 'co', 'cu']
    },
    carbonatito: {
      nome: 'Carbonatitos e rochas alcalinas (fosfato, terras raras, nióbio)',
      alvo: /fosfat|apatit|fosforit|terras raras|monazit|xenotim|pirocloro|niobio|vermiculit|titanio|anatasio/,
      familia: /fosfat|apatit|terras raras|monazit|niobio|titanio|vermiculit|barita|fluorit/,
      lito: [[/carbonatit/, 1], [/fosforit/, 0.9], [/alcalin|sienito|nefelin|fonolit|foidit|ijolit|kamafugit|lamprofir/, 0.8]],
      pesos: { oc: 0.28, lito: 0.25, gama: 0.20, mag: 0.15, geoq: 0.12 },
      gama: g => media(g.th, g.u), gamaTxt: 'tório e urânio altos',
      mag: g => media(g.asa, g.mag), magTxt: 'anomalia magnética (corpos alcalinos)',
      elementos: ['p', 'la', 'ce', 'nb', 'y', 'th', 'ba']
    },
    diamante: {
      nome: 'Diamante (kimberlitos e conglomerados)',
      alvo: /diamante/,
      familia: /diamante|ouro/,
      lito: [[/kimberl|lamproit/, 1], [/conglomerad|metaconglomerad/, 0.6], [/aluvi|cascalh/, 0.6]],
      pesos: { oc: 0.40, lito: 0.30, mag: 0.20, estr: 0.10 },
      gama: () => null, mag: g => g.asa, magTxt: 'anomalias magnéticas pontuais (possíveis corpos intrusivos)',
      elementos: []
    },
    industrial: {
      nome: 'Rochas e minerais industriais',
      alvo: /calcari|marmore|dolomit|gipsit|gesso|granito|rocha ornamental|quartzit|ardosia|argila|areia|cascalho|grafit|caulim|barita|fluorit|magnesit|bentonit|diatomit|talco/,
      familia: null, lito: null, pesos: { oc: 0.40, lito: 0.60 },
      gama: () => null, mag: () => null, elementos: []
    }
  };
  const LITO_IND = { calcari: [[/calcar|marmore|dolomit|carbonat/, 1]], marmore: [[/marmore|calcar|dolomit/, 1]], gipsit: [[/gipsit|evaporit|anidrit/, 1]], gesso: [[/gipsit|evaporit/, 1]], granito: [[/granit|charnoc|sienit|monzon/, 0.9], [/gnaiss|migmat/, 0.6]], quartzit: [[/quartzit/, 1]], ardosia: [[/ardosia|filito/, 1]], argila: [[/argil|aluvi|cobertura|lamit/, 0.9]], areia: [[/aluvi|areia|arenit|cobertura/, 0.9]], grafit: [[/grafit|paragnaiss|xisto grafitoso/, 1]], caulim: [[/caulin|pegmat|granit|arcosi/, 0.8]] };
  function sistemaDe(mineral) {
    const n = N(mineral);
    for (const [id, s] of Object.entries(SIS)) if (s.alvo.test(n)) {
      if (id === 'industrial') { const k = Object.keys(LITO_IND).find(x => n.includes(x)); return Object.assign({ id }, s, { lito: k ? LITO_IND[k] : [[new RegExp(n.slice(0, 6)), 1]] }); }
      return Object.assign({ id }, s);
    }
    return { id: 'generico', nome: 'Modelo genérico (ocorrências, litologia citada e estruturas)', alvo: null, familia: null, lito: [], pesos: { oc: 0.40, lito: 0.30, estr: 0.15, gama: 0.075, geoq: 0.075 }, gama: g => g.k, gamaTxt: 'potássio alto', mag: () => null, elementos: [] };
  }
  VA.sistemaMineral = sistemaDe;
  VA.NOMES_EVID = { oc: 'Ocorrências minerais', lito: 'Litologia', contato: 'Contatos litológicos', estr: 'Estruturas e interseções', gama: 'Gamaespectrometria', mag: 'Magnetometria', geoq: 'Geoquímica' };

  /* ---------------- utilidades ---------------- */
  const rgbToRel = (r, g, b, tipo) => {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), v = mx / 255, s = mx ? (mx - mn) / mx : 0;
    if (tipo === 'gray') return mx < 3 ? null : (r + g + b) / 765;
    if (s < 0.18) return v > 0.88 ? 1 : null;
    let h; const d = mx - mn;
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360; if (h > 245) h -= 360;
    return Math.min(1, Math.max(0, (240 - h) / 300));
  };
  function percentis(arr) {
    const v = []; for (let k = 0; k < arr.length; k++) if (!isNaN(arr[k])) v.push(arr[k]);
    if (v.length < 10) return null;
    v.sort((a, b) => a - b);
    const out = new Float32Array(arr.length).fill(NaN), n = v.length;
    for (let k = 0; k < arr.length; k++) {
      const x = arr[k]; if (isNaN(x)) continue;
      let lo = 0, hi = n; while (lo < hi) { const m = (lo + hi) >> 1; if (v[m] < x) lo = m + 1; else hi = m; }
      let hi2 = lo; while (hi2 < n && v[hi2] === x) hi2++;
      out[k] = ((lo + hi2) / 2) / n;
    }
    return out;
  }
  const quantil = (arr, q) => { const v = []; arr.forEach(x => { if (!isNaN(x)) v.push(x); }); if (!v.length) return NaN; v.sort((a, b) => a - b); return v[Math.min(v.length - 1, Math.floor(q * v.length))]; };
  async function imagemGrade(svc, bb, W, H, tipo) {
    const p = new URLSearchParams({ f: 'image', bbox: bb.map(v => v.toFixed(6)).join(','), bboxSR: '4326', imageSR: '4326', size: `${W},${H}`, format: 'png', interpolation: 'RSP_NearestNeighbor' });
    const r = await VA.Net.obter(`${SGBI}${svc}/ImageServer/exportImage?${p}`, { binario: true, timeout: 40000 });
    if (!/image/.test(r.tipo || '')) throw new Error('resposta sem imagem');
    const bmp = await createImageBitmap(r.blob);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data, out = new Float32Array(W * H).fill(NaN);
    let n = 0;
    for (let k = 0; k < W * H; k++) { if (d[k * 4 + 3] < 128) continue; const v = rgbToRel(d[k * 4], d[k * 4 + 1], d[k * 4 + 2], tipo || 'rainbow'); if (v != null) { out[k] = v; n++; } }
    return n / (W * H) > 0.15 ? out : null;
  }
  /* polígono → células da grade cujo centro cai dentro (varredura por linha, regra par-ímpar; buracos respeitados).
     Muito mais rápido que testar ponto a ponto quando a grade tem dezenas de milhares de células. */
  function rasterizar(geom, W, H, bb, dx, dy, marcar) {
    const polys = !geom ? [] : geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
    for (const poly of polys) {
      const linhas = [];
      for (const anel of poly) for (let t = 1; t < anel.length; t++) {
        const [x0, y0] = anel[t - 1], [x1, y1] = anel[t]; if (y0 === y1) continue;
        const ja = Math.max(0, Math.ceil((bb[3] - Math.max(y0, y1)) / dy - 0.5)), jb = Math.min(H - 1, Math.floor((bb[3] - Math.min(y0, y1)) / dy - 0.5));
        for (let j = ja; j <= jb; j++) (linhas[j] = linhas[j] || []).push(x0, y0, x1, y1);
      }
      linhas.forEach((ed, j) => {
        const y = bb[3] - (j + 0.5) * dy, xs = [];
        for (let e = 0; e < ed.length; e += 4) { const y0 = ed[e + 1], y1 = ed[e + 3]; if ((y0 <= y) !== (y1 <= y)) xs.push(ed[e] + (y - y0) * (ed[e + 2] - ed[e]) / (y1 - y0)); }
        xs.sort((a, b) => a - b);
        for (let t = 0; t + 1 < xs.length; t += 2) {
          const ia = Math.max(0, Math.ceil((xs[t] - bb[0]) / dx - 0.5)), ib = Math.min(W - 1, Math.floor((xs[t + 1] - bb[0]) / dx - 0.5));
          for (let i = ia; i <= ib; i++) marcar(j * W + i);
        }
      });
    }
  }
  /* distância (km) de cada célula ao segmento mais próximo */
  function distLinhas(linhas, W, H, centro) {
    const out = new Float32Array(W * H).fill(Infinity), latm = centro(0, (H / 2) | 0)[1], kx = 111.32 * Math.cos(latm * Math.PI / 180), ky = 110.57;
    const segs = [];
    linhas.forEach(l => { for (let i = 1; i < l.length; i++) segs.push([l[i - 1][0] * kx, l[i - 1][1] * ky, l[i][0] * kx, l[i][1] * ky]); });
    if (!segs.length) return out;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const [lon, lat] = centro(i, j), px = lon * kx, py = lat * ky; let m = Infinity;
      for (const [x0, y0, x1, y1] of segs) { const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy; let t = L2 ? ((px - x0) * dx + (py - y0) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t)); const ex = x0 + t * dx - px, ey = y0 + t * dy - py, d2 = ex * ex + ey * ey; if (d2 < m) m = d2; }
      out[j * W + i] = Math.sqrt(m);
    }
    return out;
  }
  /* distância (km) de cada célula até células marcadas (transformada de distância em duas passadas) */
  function distMarcadas(marca, W, H, celKmX, celKmY) {
    const INF = 1e9, d = new Float32Array(W * H);
    for (let k = 0; k < W * H; k++) d[k] = marca[k] ? 0 : INF;
    const dg = Math.hypot(celKmX, celKmY);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = j * W + i; let v = d[k]; if (i > 0) v = Math.min(v, d[k - 1] + celKmX); if (j > 0) { v = Math.min(v, d[k - W] + celKmY); if (i > 0) v = Math.min(v, d[k - W - 1] + dg); if (i < W - 1) v = Math.min(v, d[k - W + 1] + dg); } d[k] = v; }
    for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) { const k = j * W + i; let v = d[k]; if (i < W - 1) v = Math.min(v, d[k + 1] + celKmX); if (j < H - 1) { v = Math.min(v, d[k + W] + celKmY); if (i < W - 1) v = Math.min(v, d[k + W + 1] + dg); if (i > 0) v = Math.min(v, d[k + W - 1] + dg); } d[k] = v; }
    return d;
  }
  /* pontos onde dois traços estruturais se cruzam */
  function intersecoes(linhas) {
    const segs = []; linhas.forEach((l, li) => { for (let i = 1; i < l.length; i++) segs.push([l[i - 1], l[i], li]); });
    const out = [];
    for (let a = 0; a < segs.length && out.length < 400; a++) for (let b = a + 1; b < segs.length; b++) {
      const [p, q, la] = segs[a], [r, s, lb] = segs[b]; if (la === lb) continue;
      const d = (q[0] - p[0]) * (s[1] - r[1]) - (q[1] - p[1]) * (s[0] - r[0]); if (!d) continue;
      const t = ((r[0] - p[0]) * (s[1] - r[1]) - (r[1] - p[1]) * (s[0] - r[0])) / d, u = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / d;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
    return out;
  }
  const kmEntre = (a, b) => { const kx = 111.32 * Math.cos(a[1] * Math.PI / 180); return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 110.57); };
  const PESO_STATUS = s => { const n = N(s); return /mina/.test(n) ? 1 : /garimp/.test(n) ? 0.9 : /deposit|jazida/.test(n) ? 0.85 : /indicio/.test(n) ? 0.5 : 0.7; };
  const num = x => { const v = parseFloat(String(x == null ? '' : x).replace(',', '.')); return isNaN(v) ? null : v; };
  const limpo = x => { const s = String(x == null ? '' : x).trim(); return !s || /^null$/i.test(s) ? '' : s; };
  const VIA = fase => {
    const n = N(fase);
    if (/disponib/.test(n)) return { classe: 'disponibilidade', via: 'oferta pública da ANM (leilão ou edital)', fator: 0.5 };
    if (/concessao de lavra|requerimento de lavra|licenciamento|lavra garimpeira|registro de extracao/.test(n)) return { classe: 'lavra', via: 'parceria com o titular (direito em fase de lavra)', fator: 0.4 };
    if (/autorizacao de pesquisa|requerimento de pesquisa|direito de requerer/.test(n)) return { classe: 'pesquisa', via: 'aquisição, cessão ou parceria com o titular', fator: 0.6 };
    return { classe: 'outro', via: 'negociação com o titular', fator: 0.5 };
  };

  /* ---------------- cálculo ---------------- */
  VA.favorabilidade = async function (aoi, analise, p, aoProgresso) {
    const mineral = VA.alvo.canonico(p.alvoAtivo), termos = VA.alvo.termos(mineral), sis = sistemaDe(mineral);
    const avisar = t => aoProgresso && aoProgresso(t);
    const poli = /Polygon/.test(aoi.geometry.type);
    const b0 = turf.bbox(aoi), kmLado = Math.max((b0[2] - b0[0]) * 111.32 * Math.cos(b0[1] * Math.PI / 180), (b0[3] - b0[1]) * 110.57);
    /* janela larga (65% do raio do alvo para cada lado, de 10 a 25 km; com o raio padrão de 30 km, ~40 km de lado):
       os filões e corredores aparecem inteiros */
    const folga = Math.min(25, Math.max(10, kmLado * 2, (+p.raioAlvoKm || 30) * 0.65));
    const bb = VA.geo.bboxBuffer(aoi.geometry, folga);
    const wKm = (bb[2] - bb[0]) * 111.32 * Math.cos(((bb[1] + bb[3]) / 2) * Math.PI / 180), hKm = (bb[3] - bb[1]) * 110.57;
    /* células de ~200 m (até 240 × 240) */
    const W = Math.max(60, Math.min(240, Math.round(wKm / 0.2))), H = Math.max(60, Math.min(240, Math.round(W * hKm / wKm)));
    const dx = (bb[2] - bb[0]) / W, dy = (bb[3] - bb[1]) / H, celKmX = wKm / W, celKmY = hKm / H, celHa = celKmX * celKmY * 100;
    const centro = (i, j) => [bb[0] + (i + 0.5) * dx, bb[3] - (j + 0.5) * dy];
    const n = W * H, c0 = VA.geo.centro(aoi);
    /* distância plana com o fator de longitude do centro da janela (erro desprezível dentro de 50 km) */
    const kxJ = 111.32 * Math.cos(((bb[1] + bb[3]) / 2) * Math.PI / 180), dKm = (a, b) => Math.hypot((a[0] - b[0]) * kxJ, (a[1] - b[1]) * 110.57);
    const celDe = c => { const i = Math.floor((c[0] - bb[0]) / dx), j = Math.floor((bb[3] - c[1]) / dy); return i < 0 || j < 0 || i >= W || j >= H ? null : [i, j]; };
    /* aplica fn(k, distKm) nas células a até raioKm de um ponto */
    const vizinhas = (c, raioKm, fn) => {
      const ri = Math.ceil(raioKm / celKmX), rj = Math.ceil(raioKm / celKmY), ic = Math.floor((c[0] - bb[0]) / dx), jc = Math.floor((bb[3] - c[1]) / dy);
      for (let j = Math.max(0, jc - rj); j <= Math.min(H - 1, jc + rj); j++) for (let i = Math.max(0, ic - ri); i <= Math.min(W - 1, ic + ri); i++) { const d = dKm(centro(i, j), c); if (d <= raioKm) fn(j * W + i, d); }
    };
    const out = { mineral, termos, sistema: { id: sis.id, nome: sis.nome, pesos: sis.pesos, elementos: sis.elementos }, janelaKm: Math.max(wKm, hKm), camadas: [], erros: [], consultadoEm: new Date().toISOString() };
    const guardar = (nome, pr) => Promise.resolve(pr).catch(e => { out.erros.push(`${nome}: ${e.message}`); return null; });
    const envelope = { xmin: bb[0], ymin: bb[1], xmax: bb[2], ymax: bb[3], spatialReference: { wkid: 4326 } };
    const pequeno = [c0[0] - 0.05, c0[1] - 0.05, c0[0] + 0.05, c0[1] + 0.05];
    /* o identify devolve no máximo ~1.000 resultados: janela grande vai em blocos 2 × 2 */
    const identifyBlocos = async (layers, layerDefs) => {
      const nb = Math.max(wKm, hKm) > 25 ? 2 : 1, mx = (bb[2] - bb[0]) / nb, my = (bb[3] - bb[1]) / nb, pedidos = [];
      for (let a = 0; a < nb; a++) for (let b = 0; b < nb; b++) {
        const q = [bb[0] + a * mx, bb[1] + b * my, bb[0] + (a + 1) * mx, bb[1] + (b + 1) * my];
        pedidos.push(VA.ags.identify(SGB + 'geologia/geoq_externa/MapServer', { geom: { xmin: q[0], ymin: q[1], xmax: q[2], ymax: q[3], spatialReference: { wkid: 4326 } }, tipo: 'esriGeometryEnvelope', bbox: q, layers, layerDefs, returnGeometry: false }));
      }
      const r = await Promise.all(pedidos), vistos = new Set(), fc = { type: 'FeatureCollection', features: [], _truncado: r.some(x => x._truncado) };
      r.forEach(x => x.features.forEach(f => { const a = f.properties, k = [a._camadaId, a.amostra, a.numero_de_campo, a.analito, a.latitude, a.longitude, a.valor].join('|'); if (!vistos.has(k)) { vistos.add(k); fc.features.push(f); } }));
      return fc;
    };

    avisar(`Inteligência mineral: geologia, geofísica e geoquímica para ${mineral}…`);
    const geofIds = Object.keys(GEOF);
    const camposLito = 'SIGLA,NOME,LITOTIPOS,HIERARQUIA,IDADE_MIN,IDADE_MAX,AMBIENTE_TECTONICO,LEGENDA';
    const camadasGeoq = sis.elementos.length ? [18, 19, 20] : [];
    const defs = Object.fromEntries(camadasGeoq.map(l => [l, `analito IN (${sis.elementos.map(e => `'${e}'`).join(',')})`]));
    /* restrições na janela inteira (a análise só olhou a área e o raio dela): sem isso um alvo a 15 km pode cair em
       terra indígena ou bloqueio sem que o mapa mostre. Falha ou lista parcial deixa a disponibilidade sem verificação. */
    const pRestrJan = Promise.all(RESTR_JANELA.map(async ([id]) => {
      const c = VA.camada(id); if (!c) return { id, erro: 'camada fora do catálogo' };
      try { const fc = await VA.consultarCamada(c, { bbox: bb, max: 2000, maxOffset: 0.0005, filtrar: false }); return { id, fc, truncado: !!fc._truncado }; }
      catch (e) { return { id, erro: e.message || String(e) }; }
    }));
    const [ocorrJan, estr, geoq, geoqProj, pintas, anmJan, aerolev, provAu, ...resto] = await Promise.all([
      guardar('Ocorrências (GEOBANK)', VA.ags.query(SGB + 'geologia/ocorrencias/MapServer/0', { bbox: bb, outFields: 'SUBSTANCIAS,STATUS_ECONOMICO,TOPONIMIA,IMPORTANCIA,ROCHAS_HOSPEDEIRAS,ROCHAS_ENCAIXANTES,TIPOS_ALTERACAO', max: 2000 })),
      guardar('Estruturas (SGB)', VA.ags.query(SGB + 'geologia/Estruturas_GIS_Brasil_2004/MapServer/0', { bbox: VA.geo.bboxBuffer({ type: 'Polygon', coordinates: [[[bb[0], bb[1]], [bb[2], bb[1]], [bb[2], bb[3]], [bb[0], bb[3]], [bb[0], bb[1]]]] }, 5), outFields: 'TIPO_ESTRU,NMESTRUTUR', maxOffset: 0.0005, max: 1000 })),
      camadasGeoq.length ? guardar('Geoquímica (SGB)', identifyBlocos('all:' + camadasGeoq.join(','), defs)) : null,
      guardar('Projetos geoquímicos (SGB)', VA.ags.identify(SGB + 'geologia/geoq_externa/MapServer', { geom: envelope, tipo: 'esriGeometryEnvelope', bbox: bb, layers: 'all:11', returnGeometry: false })),
      sis.id === 'ouro' ? guardar('Pintas de ouro em bateia (SGB)', identifyBlocos('all:14')) : null,
      guardar('Processos ANM na janela', VA.ags.query(VA.URL.ANM + 'SIGMINE/dados_anm/MapServer/0', { bbox: bb, outFields: 'PROCESSO,FASE,NOME,SUBS,AREA_HA,ULT_EVENTO', maxOffset: 0.0002, max: 4000 })),
      guardar('Aerolevantamentos (SGB)', VA.ags.identify(SGB + 'geofisica/aerogeofisica/MapServer', { geom: { x: c0[0], y: c0[1], spatialReference: { wkid: 4326 } }, tipo: 'esriGeometryPoint', bbox: pequeno, tolerance: 1, returnGeometry: false })),
      sis.id === 'ouro' ? guardar('Províncias auríferas (SGB)', VA.ags.identify(SGB + 'Prov%C3%ADncias_e_Distritos_Aur%C3%ADferos_do_Brasil/MapServer', { geom: { x: c0[0], y: c0[1], spatialReference: { wkid: 4326 } }, tipo: 'esriGeometryPoint', bbox: pequeno, tolerance: 2, returnGeometry: false })) : null,
      ...ESCALAS.map(([k, esc]) => sis.lito ? guardar(`Litologia ${esc} (SGB)`, VA.ags.query(SGB + `geologia/litoestratigrafia_${k}/MapServer/0`, { bbox: bb, outFields: camposLito, maxOffset: k === '1000000' ? 0.002 : 0.0004, max: 2500 })) : null),
      ...geofIds.map(id => guardar('Geofísica ' + id.toUpperCase() + ' (SGB)', imagemGrade(GEOF[id], bb, W, H, id === 'dv1' ? 'gray' : 'rainbow')))
    ]);
    const litos = resto.slice(0, ESCALAS.length), geof = resto.slice(ESCALAS.length);
    const restrJan = await pRestrJan;
    const G = {}; geofIds.forEach((id, k) => { G[id] = geof[k]; });
    /* escala sem cobertura devolve lista vazia (não é erro); erro de consulta fica visível: a geologia de detalhe
       pode existir e não ter sido usada */
    out.erros = out.erros.map(e => /^Litologia 1:(25|50|100|150|250)\.000/.test(e) ? e.replace(/^(Litologia [^:]+:[^ ]+ \(SGB\)): /, '$1 não respondeu — a geologia desta escala pode existir e não foi usada: ') : e);
    avisar('Inteligência mineral: cruzando as evidências…');
    const E = {}, Q = {};   // evidência (0–1) e qualidade do dado (0–1) por célula

    /* ===== ocorrências do bem e do mesmo sistema mineral ===== */
    const ocorr = [];
    ((analise.alvo && analise.alvo.ocorrencias) || []).forEach(o => { const g = o.feature.geometry; if (g && g.type === 'Point') ocorr.push({ c: g.coordinates, w: PESO_STATUS(o.props.STATUS_ECONOMICO), alvo: true, nome: o.titulo, st: o.props.STATUS_ECONOMICO, subs: o.props.SUBSTANCIAS, props: o.props }); });
    if (ocorrJan) ocorrJan.features.forEach(f => {
      const g = f.geometry, pr = f.properties; if (!g || g.type !== 'Point') return;
      const doAlvo = VA.alvo.casa(pr.SUBSTANCIAS, termos), fam = sis.familia && sis.familia.test(N(pr.SUBSTANCIAS));
      if (!doAlvo && !fam) return;
      if (doAlvo && ocorr.some(o => o.alvo && kmEntre(o.c, g.coordinates) < 0.02)) return;
      ocorr.push({ c: g.coordinates, w: PESO_STATUS(pr.STATUS_ECONOMICO) * (doAlvo ? 1 : 0.6), alvo: doAlvo, nome: [pr.TOPONIMIA, pr.SUBSTANCIAS].filter(Boolean).join(' · '), st: pr.STATUS_ECONOMICO, subs: pr.SUBSTANCIAS, props: pr });
    });
    const naJanela = o => o.c[0] >= bb[0] && o.c[0] <= bb[2] && o.c[1] >= bb[1] && o.c[1] <= bb[3];
    if (ocorrJan || analise.alvo) {
      E.oc = new Float32Array(n); Q.oc = new Float32Array(n).fill(0.6);
      ocorr.forEach(o => vizinhas(o.c, 7, (k, d) => { const v = o.w * Math.exp(-d / 1.2); if (v > E.oc[k]) E.oc[k] = v; }));
    }

    /* ===== litologia na melhor escala de cada trecho ===== */
    const unidades = [], unidadeDe = new Int32Array(n).fill(-1);
    let distContato = null;
    const cobertura = {};
    if (sis.lito) {
      litos.forEach((fc, e) => { if (!fc) return; fc.features.forEach(f => { if (!f.geometry) return; const pr = f.properties; unidades.push({ f, e, escala: ESCALAS[e][1], q: ESCALAS[e][2], sigla: limpo(pr.SIGLA), nome: limpo(pr.NOME) || limpo(pr.SIGLA), litotipos: limpo(pr.LITOTIPOS), hierarquia: limpo(pr.HIERARQUIA), idade: [num(pr.IDADE_MIN), num(pr.IDADE_MAX)], ambiente: limpo(pr.AMBIENTE_TECTONICO), bb: turf.bbox(f) }); }); });
      /* na mesma escala, o polígono menor vence (corpos e intrusões desenhados por cima da unidade encaixante) */
      unidades.forEach(u => { u.bbArea = (u.bb[2] - u.bb[0]) * (u.bb[3] - u.bb[1]); });
      unidades.sort((a, b) => a.e - b.e || a.bbArea - b.bbArea);
      for (let u = unidades.length - 1; u >= 0; u--) rasterizar(unidades[u].f.geometry, W, H, bb, dx, dy, k => { unidadeDe[k] = u; });
      for (let k = 0; k < n; k++) if (unidadeDe[k] >= 0) cobertura[unidades[unidadeDe[k]].escala] = (cobertura[unidades[unidadeDe[k]].escala] || 0) + 1;
      /* nota de cada unidade: pelo modelo e, à parte, por hospedar ocorrências conhecidas do bem */
      unidades.forEach(u => {
        const txt = N([u.litotipos, u.nome, u.sigla, u.hierarquia].join(' ')), lit = u.litotipos.split(/\s*[,;]\s*/).filter(Boolean);
        u.s = 0.12; u.por = ''; u.contra = !!(sis.contraLito && sis.contraLito.test(txt));
        (sis.lito || []).forEach(([re, v]) => { if (v > u.s && re.test(txt)) { u.s = v; const l = lit.find(x => re.test(N(x))); u.por = l ? l.toLowerCase() : ''; } });
        if (termos.some(t => txt.includes(N(t)))) { u.s = Math.max(u.s, 0.9); u.por = u.por || termos[0].toLowerCase(); }
        if (sis.idade && u.idade[0] != null && u.idade[1] != null) u.idadeOk = u.idade[1] >= sis.idade[0] && u.idade[0] <= sis.idade[1];
      });
      ocorr.filter(o => o.alvo && naJanela(o)).forEach(o => {
        const i = Math.floor((o.c[0] - bb[0]) / dx), j = Math.floor((bb[3] - o.c[1]) / dy); if (i < 0 || j < 0 || i >= W || j >= H) return;
        const u = unidades[unidadeDe[j * W + i]]; if (!u) return;
        u.hospeda = (u.hospeda || 0) + 1; (u.hospedaNomes = u.hospedaNomes || []).push(o.nome);
      });
      /* rocha hospedeira conhecida: peso limitado (a ocorrência já conta como ponto) */
      unidades.forEach(u => { if (u.hospeda && u.s < 0.75) { u.s = 0.75; u.empirico = true; } });
      E.lito = new Float32Array(n).fill(NaN); Q.lito = new Float32Array(n);
      for (let k = 0; k < n; k++) { const u = unidades[unidadeDe[k]]; if (u) { E.lito[k] = u.s; Q.lito[k] = u.q; } }
      /* contatos entre unidades diferentes (na mesma escala) */
      if (sis.pesos.contato) {
        const marca = new Uint8Array(n); let tem = 0;
        for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
          const k = j * W + i, a = unidadeDe[k]; if (a < 0) continue; const ua = unidades[a];
          [i < W - 1 ? k + 1 : -1, j < H - 1 ? k + W : -1].forEach(r => { if (r < 0) return; const b = unidadeDe[r]; if (b < 0 || b === a) return; const ub = unidades[b]; if (ub.e !== ua.e || (ub.sigla && ub.sigla === ua.sigla)) return; marca[k] = 1; marca[r] = 1; tem++; });
        }
        if (tem) { const d = distMarcadas(marca, W, H, celKmX, celKmY); E.contato = new Float32Array(n); Q.contato = new Float32Array(n); for (let k = 0; k < n; k++) { E.contato[k] = unidadeDe[k] >= 0 ? Math.exp(-d[k] / 0.5) : NaN; Q.contato[k] = unidadeDe[k] >= 0 ? unidades[unidadeDe[k]].q * 0.8 : 0; } distContato = d; }
      }
    }

    /* ===== estruturas e interseções (base 1:1.000.000) ===== */
    let distEstr = null, distInter = null, inter = [];
    if (estr && estr.features.length) {
      const linhas = [];
      estr.features.forEach(f => { const g = f.geometry; if (!g) return; (g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []).forEach(l => linhas.push(l)); });
      distEstr = distLinhas(linhas, W, H, centro);
      inter = intersecoes(linhas).filter(c => c[0] >= bb[0] - 0.05 && c[0] <= bb[2] + 0.05 && c[1] >= bb[1] - 0.05 && c[1] <= bb[3] + 0.05);
      if (inter.length) { distInter = new Float32Array(n).fill(99); inter.forEach(x => vizinhas(x, 8, (k, d) => { if (d < distInter[k]) distInter[k] = d; })); }
      E.estr = new Float32Array(n); Q.estr = new Float32Array(n).fill(0.35);
      for (let k = 0; k < n; k++) E.estr[k] = Math.max(Math.exp(-distEstr[k] / 1.0), distInter ? Math.exp(-distInter[k] / 1.5) : 0);
    }
    out.estruturas = { n: estr ? estr.features.length : 0, intersecoes: inter.length, escala: '1:1.000.000', tipos: estr ? [...new Set(estr.features.map(f => f.properties.TIPO_ESTRU).filter(Boolean))].slice(0, 6) : [] };

    /* ===== geofísica (percentis na janela; qualidade pelo espaçamento das linhas de voo) ===== */
    const levs = (aerolev ? aerolev.features : []).map(f => f.properties).map(a => ({ projeto: limpo(a.Projeto), metodos: limpo(a['Método(s) geofísico(s)']), esp: num(a['Espaçamento das linhas de vôo (m)']), altura: num(a['Altura do vôo (m)']), direcao: limpo(a['Direção das linhas de vôo']) })).filter(x => x.projeto).sort((a, b) => (a.esp || 1e9) - (b.esp || 1e9));
    const esp = levs.length ? levs[0].esp : null, qGeof = esp == null ? 0.5 : esp <= 250 ? 1 : esp <= 500 ? 0.85 : esp <= 1000 ? 0.65 : 0.5;
    const P = {}; Object.entries(G).forEach(([id, g]) => { if (g) P[id] = percentis(g); });
    if (P.mag) {
      const gr = new Float32Array(n).fill(NaN);
      for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) { const k = j * W + i, a = G.mag[k + 1] - G.mag[k - 1], b = G.mag[k + W] - G.mag[k - W]; if (!isNaN(a) && !isNaN(b)) gr[k] = Math.hypot(a, b); }
      P.grad = percentis(gr);
    }
    const valorCel = (fn, k) => { const g = {}; ['k', 'th', 'u', 'thk', 'asa', 'mag', 'grad', 'dv1'].forEach(id => { g[id] = P[id] && !isNaN(P[id][k]) ? P[id][k] : null; }); const v = fn(g); return v == null || isNaN(v) ? NaN : v; };
    if (sis.pesos.gama && (P.k || P.th)) { E.gama = new Float32Array(n); Q.gama = new Float32Array(n); for (let k = 0; k < n; k++) { E.gama[k] = valorCel(sis.gama, k); Q.gama[k] = isNaN(E.gama[k]) ? 0 : qGeof; } }
    if (sis.pesos.mag && (P.asa || P.mag || P.dv1)) { E.mag = new Float32Array(n); Q.mag = new Float32Array(n); for (let k = 0; k < n; k++) { E.mag[k] = valorCel(sis.mag, k); Q.mag[k] = isNaN(E.mag[k]) ? 0 : qGeof; } }
    out.levantamentos = levs.slice(0, 4);
    out.resolucaoGeof = esp ? { espacamento_m: esp, menorFeicao_m: Math.round(esp / 2), altura_m: levs[0].altura } : null;

    /* ===== geoquímica: anomalias pela população de cada elemento, material e método ===== */
    const amostras = [];
    if (geoq) geoq.features.forEach(f => {
      const a = f.properties, lat = num(a.latitude), lon = num(a.longitude), v0 = num(a.valor); if (lat == null || lon == null || v0 == null) return;
      const menor = /</.test(limpo(a.qualificador));
      amostras.push({ id: limpo(a.amostra) || limpo(a.numero_de_campo), campo: limpo(a.numero_de_campo), c: [lon, lat], el: String(a.analito || '').toLowerCase(), v: menor ? v0 / 2 : v0, valor: v0, menor, unidade: limpo(a.unidade), material: limpo(a.classe) || String(a._camada || '').replace(/^query_all_/, '').replace(/_/g, ' '), metodo: [limpo(a.leitura), limpo(a.abertura)].filter(Boolean).join(' · '), data: limpo(a.data_de_analise), projeto: limpo(a.projeto_publicacao) || limpo(a.projeto_amostragem), lab: limpo(a.laboratorio) });
    });
    const grupos = {}; amostras.forEach(a => { const g = [a.el, N(a.material), a.unidade, N(a.metodo)].join('|'); (grupos[g] = grupos[g] || []).push(a); });
    const limiares = [];
    Object.values(grupos).forEach(l => {
      const vals = l.filter(a => !a.menor).map(a => a.v).sort((x, y) => x - y);
      if (vals.length < 10) { l.forEach(a => { a.populacao = 'insuficiente'; }); limiares.push({ el: l[0].el, material: l[0].material, unidade: l[0].unidade, metodo: l[0].metodo, n: l.length, p90: null }); return; }
      const p90 = vals[Math.floor(0.9 * vals.length)], p97 = vals[Math.min(vals.length - 1, Math.floor(0.97 * vals.length))], mx = vals[vals.length - 1];
      limiares.push({ el: l[0].el, material: l[0].material, unidade: l[0].unidade, metodo: l[0].metodo, n: l.length, p90, p97 });
      l.forEach(a => { a.populacao = 'ok'; if (!a.menor && a.v > p90 && mx > p90) { a.anomala = true; a.forte = a.v >= p97; a.nota = Math.min(1, 0.55 + 0.45 * (a.v - p90) / (mx - p90 || 1)); } });
    });
    const pintasL = (pintas ? pintas.features : []).map(f => f.properties).map(a => ({ c: [num(a.longitude), num(a.latitude)], n: num(a.quantidade) != null ? num(a.quantidade) : num(a.valor), data: limpo(a.data_de_analise), projeto: limpo(a.projeto_publicacao) || limpo(a.projeto_amostragem) })).filter(x => x.c[0] != null && x.c[1] != null && x.n != null && x.n > 0);
    const anomalas = amostras.filter(a => a.anomala).concat(pintasL.map(x => ({ c: x.c, el: 'au', material: 'concentrado de bateia (pintas)', valor: x.n, unidade: 'pintas', nota: Math.min(1, 0.6 + 0.1 * x.n), anomala: true, data: x.data, projeto: x.projeto, metodo: 'contagem de pintas' })));
    if (sis.pesos.geoq && (amostras.length || pintasL.length)) {
      E.geoq = new Float32Array(n); Q.geoq = new Float32Array(n);
      /* pontos amostrados distintos (uma amostra tem vários elementos analisados) */
      const pts = [...new Map(amostras.map(a => a.c).concat(pintasL.map(x => x.c)).map(c => [c[0].toFixed(5) + ',' + c[1].toFixed(5), c])).values()];
      const perto = new Uint16Array(n), m = new Float32Array(n);
      pts.forEach(c => vizinhas(c, 3, k => { perto[k]++; }));
      anomalas.forEach(a => vizinhas(a.c, 6, (k, d) => { const v = a.nota * Math.exp(-d / 1.5); if (v > m[k]) m[k] = v; }));
      /* sem amostra a menos de 3 km: sem evidência (não é "anomalia zero") */
      for (let k = 0; k < n; k++) { E.geoq[k] = perto[k] ? m[k] : NaN; Q.geoq[k] = perto[k] >= 3 ? 1 : perto[k] ? 0.6 : 0; }
    }
    const areaJanKm2 = wKm * hKm, amostrasUnicas = new Set(amostras.map(a => a.id)).size;
    out.geoquimica = {
      amostras: amostrasUnicas, analises: amostras.length, porMaterial: Object.fromEntries(Object.entries(amostras.reduce((o, a) => { (o[a.material] = o[a.material] || new Set()).add(a.id); return o; }, {})).map(([k, v]) => [k, v.size])),
      densidade100km2: amostrasUnicas / areaJanKm2 * 100, limiares: limiares.sort((a, b) => a.el.localeCompare(b.el)), pintas: pintasL.length,
      anomalas: anomalas.sort((a, b) => (b.nota || 0) - (a.nota || 0)).slice(0, 40).map(a => ({ c: a.c, el: a.el, material: a.material, valor: a.valor, menor: a.menor, unidade: a.unidade, metodo: a.metodo, data: a.data, projeto: a.projeto, forte: !!a.forte, dist_km: poli && turf.booleanPointInPolygon(a.c, aoi) ? 0 : VA.geo.distanciaKm(aoi, turf.point(a.c)) })),
      projetos: (geoqProj ? geoqProj.features : []).map(f => f.properties).map(a => ({ nome: limpo(a['Nome do Projeto']), escala: limpo(a['Escala do Projeto']), anos: [limpo(a['Ano Início']), limpo(a['Ano Final'])].filter(Boolean).join('–'), rigeo: limpo(a['URL Rigeo']) })).filter(x => x.nome),
      truncado: !!(geoq && geoq._truncado), elementos: sis.elementos,
      insuficiente: amostrasUnicas < 10
    };

    /* ===== combinação: favorabilidade (só evidência) e confiabilidade (só qualidade do dado), separadas ===== */
    const pesoTot = Object.values(sis.pesos).reduce((a, b) => a + b, 0);
    Object.entries(sis.pesos).forEach(([id, w]) => out.camadas.push({ id, nome: id === 'lito' ? 'Litologia (melhor escala disponível)' : VA.NOMES_EVID[id], peso: w / pesoTot, ok: !!E[id] }));
    const usadas = out.camadas.filter(c => c.ok);
    if (!usadas.length) throw new Error('nenhuma evidência disponível na janela');
    const fav = new Float32Array(n).fill(NaN), conf = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      let s = 0, w = 0, q = 0;
      usadas.forEach(c => { const v = E[c.id][k], pw = sis.pesos[c.id]; if (!isNaN(v)) { s += pw * v; w += pw; q += pw * (Q[c.id] ? Q[c.id][k] : 0.5); } });
      conf[k] = q / pesoTot; if (w / pesoTot >= 0.3) fav[k] = s / w;
    }

    /* ===== disponibilidade: SIGMINE na janela e restrições já levantadas pela análise ===== */
    const procs = anmJan ? anmJan.features.filter(f => f.geometry) : [];
    const R = analise.resultados || {}, restr = [], estoque = [];
    const juntar = (ids, tipo, filtro) => ids.forEach(id => ((R[id] && R[id].itens) || []).forEach(it => { if (it.feature && it.feature.geometry && /Polygon/.test(it.feature.geometry.type) && (!filtro || filtro(it))) restr.push({ tipo, nome: it.titulo, camada: R[id].camada.nome, f: it.feature, bb: turf.bbox(it.feature) }); }));
    juntar(['funai_ti', 'anm_militar', 'anm_bloq'], 'restrito'); juntar(['cnuc'], 'restrito', it => it.integral);
    juntar(['cnuc'], 'condicionado', it => !it.integral); juntar(['anm_quilombo', 'anm_assent', 'anm_urbana', 'anm_garimp'], 'condicionado');
    /* o que veio da janela inteira (duplicatas da análise só repintam a mesma célula) */
    const pendentesDisp = [], secundariasDisp = [];
    const nomeCam = id => (VA.camada(id) || {}).nome || id;
    if (!anmJan) pendentesDisp.push({ id: 'anm_proc', nome: 'Processos minerários (SIGMINE) na janela', como: 'não respondeu' });
    else if (anmJan._truncado) pendentesDisp.push({ id: 'anm_proc', nome: 'Processos minerários (SIGMINE) na janela', como: 'devolveu lista parcial (limite de registros do servidor)' });
    restrJan.forEach(r => {
      const def = RESTR_JANELA.find(x => x[0] === r.id), critica = def[1];
      if (r.erro || r.truncado) { (critica ? pendentesDisp : secundariasDisp).push({ id: r.id, nome: nomeCam(r.id), como: r.erro ? `não respondeu (${r.erro})` : 'devolveu lista parcial' }); if (r.erro) out.erros.push(`${nomeCam(r.id)} na janela: ${r.erro}`); }
      (r.fc ? r.fc.features : []).forEach(f => {
        if (!f.geometry || !/Polygon/.test(f.geometry.type)) return;
        let bbF; try { bbF = turf.bbox(f); } catch (e) { return; }
        const p = f.properties || {}, c = VA.camada(r.id);
        const nome = r.id === 'cnuc' ? VA.ucInfo(p).nome : (c && c.rotulo ? c.rotulo.map(k => p[k]).filter(Boolean).join(' · ') : '') || c.nome;
        if (r.id === 'anm_estoque') { estoque.push({ f, bb: bbF, nome: p.PROCESSO || nome }); return; }
        const tipo = r.id === 'cnuc' ? (VA.ucInfo(p).integral ? 'restrito' : 'condicionado') : def[2];
        restr.push({ tipo, nome, camada: c.nome, f, bb: bbF });
      });
    });
    const procBB = procs.map(f => ({ f, bb: turf.bbox(f), via: VIA(f.properties.FASE) }));
    const disp = new Uint8Array(n);   // 0 sem processo, 1 pesquisa, 2 lavra, 3 disponibilidade, 4 condicionado, 5 restrito, 6 não verificada
    const CL = { pesquisa: 1, lavra: 2, disponibilidade: 3, outro: 1 };
    procBB.forEach(pr => rasterizar(pr.f.geometry, W, H, bb, dx, dy, k => { if (CL[pr.via.classe] > disp[k]) disp[k] = CL[pr.via.classe]; }));
    estoque.forEach(e => rasterizar(e.f.geometry, W, H, bb, dx, dy, k => { if (disp[k] < 3) disp[k] = 3; }));
    restr.forEach(r => { const v = r.tipo === 'restrito' ? 5 : 4; rasterizar(r.f.geometry, W, H, bb, dx, dy, k => { if (v > disp[k]) disp[k] = v; }); });
    /* fonte crítica pendente: onde nada foi encontrado, a situação é desconhecida — nunca "sem processo" */
    const verificada = !pendentesDisp.length;
    if (!verificada) for (let k = 0; k < n; k++) if (disp[k] === 0) disp[k] = 6;
    const contaDisp = [0, 0, 0, 0, 0, 0, 0]; for (let k = 0; k < n; k++) contaDisp[disp[k]]++;
    const soAnm = pendentesDisp.some(x => x.id === 'anm_proc');
    out.disponibilidade = { semProcesso_pct: contaDisp[0] / n, pesquisa_pct: contaDisp[1] / n, lavra_pct: contaDisp[2] / n, disponibilidade_pct: contaDisp[3] / n, condicionado_pct: contaDisp[4] / n, restrito_pct: contaDisp[5] / n, desconhecido_pct: contaDisp[6] / n,
      processos: procs.length, restricoesConsultadas: restr.length, estoque: estoque.length, truncado: !!(anmJan && anmJan._truncado), verificada, pendentes: pendentesDisp, secundariasPendentes: secundariasDisp,
      aviso: verificada ? null : soAnm ? 'Disponibilidade não verificada: a consulta ANM desta janela não foi concluída. A favorabilidade apresentada não comprova disponibilidade para requerimento.'
        : `Disponibilidade não verificada: ${pendentesDisp.map(x => `${x.nome} ${x.como}`).join('; ')}. A favorabilidade apresentada não comprova disponibilidade para requerimento.` };

    /* ===== alvos: máximos locais da favorabilidade, com confiabilidade mínima ===== */
    const lim = quantil(fav, 0.9), raio = Math.max(2, Math.round(1 / ((celKmX + celKmY) / 2)));
    const bom = k => !isNaN(fav[k]) && fav[k] >= lim && conf[k] >= 0.25;
    const cand = [];
    for (let k = 0; k < n; k++) {
      if (!bom(k)) continue;
      const i0 = k % W, j0 = (k / W) | 0; let max = true;
      for (let b = -raio; b <= raio && max; b++) for (let a = -raio; a <= raio; a++) { const ii = i0 + a, jj = j0 + b; if ((a || b) && ii >= 0 && jj >= 0 && ii < W && jj < H && fav[jj * W + ii] > fav[k]) { max = false; break; } }
      if (max) cand.push(k);
    }
    cand.sort((a, b) => fav[b] - fav[a]);
    const picos = [];
    for (const k of cand) { if (picos.length >= 10) break; const c = centro(k % W, (k / W) | 0); if (picos.some(q => kmEntre(centro(q % W, (q / W) | 0), c) < 2)) continue; picos.push(k); }
    const grupoDe = new Int32Array(n).fill(-1); let ng = 0;
    for (let k = 0; k < n; k++) { if (!bom(k) || grupoDe[k] >= 0) continue; const pilha = [k]; grupoDe[k] = ng; while (pilha.length) { const q = pilha.pop(), i = q % W, j = (q / W) | 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue; const r = jj * W + ii; if (grupoDe[r] < 0 && bom(r)) { grupoDe[r] = ng; pilha.push(r); } } } ng++; }
    const celulas = picos.map(() => 0), zonaDisp = picos.map(() => [0, 0, 0, 0, 0, 0, 0]);
    for (let k = 0; k < n; k++) { if (grupoDe[k] < 0) continue; let m = -1, md = Infinity; picos.forEach((q, t) => { if (grupoDe[q] !== grupoDe[k]) return; const d = Math.hypot((q % W) - (k % W), ((q / W) | 0) - ((k / W) | 0)); if (d < md) { md = d; m = t; } }); if (m >= 0) { celulas[m]++; zonaDisp[m][disp[k]]++; } }
    const aoiPt = c => { try { return poli && turf.booleanPointInPolygon(c, aoi); } catch (e) { return false; } };
    const alvos = picos.map((k, t) => {
      const c = centro(k % W, (k / W) | 0), pro = [], contra = [];
      const u = unidades[unidadeDe[k]];
      if (E.oc && E.oc[k] >= 0.35) { const o = ocorr.slice().sort((a, b) => kmEntre(c, a.c) - kmEntre(c, b.c))[0]; if (o) pro.push(`${o.alvo ? (o.st || 'ocorrência') + ' de ' + mineral.toLowerCase() : 'ocorrência do mesmo sistema mineral (' + (o.subs || '') + ')'} a ${VA.fmt.km(kmEntre(c, o.c))}${o.nome ? ' — ' + o.nome : ''}`); }
      else contra.push('sem ocorrência conhecida do bem a menos de 1,5 km');
      if (u) {
        if (u.s >= 0.5) pro.push(`${u.nome}${u.sigla && u.sigla !== u.nome ? ' (' + u.sigla + ')' : ''}${u.por ? ': ' + u.por : ''}${u.empirico ? ' — unidade que hospeda ocorrência conhecida' : ''} (geologia ${u.escala})`);
        else contra.push(`${u.nome} (${u.escala}): rocha pouco associada ao modelo`);
        if (u.q < 0.6) contra.push(`geologia disponível só na escala ${u.escala} neste trecho`);
        if (u.idadeOk === false) contra.push('idade da unidade fora da faixa típica do modelo');
      } else if (sis.lito) contra.push('sem geologia mapeada neste trecho');
      if (distContato && E.contato && E.contato[k] >= 0.4) pro.push(`contato entre unidades geológicas ${distContato[k] < 0.15 ? 'no ponto' : 'a cerca de ' + VA.fmt.km(distContato[k])} (geologia ${u ? u.escala : 'regional'})`);
      if (E.estr && E.estr[k] >= 0.4) pro.push(distInter && distInter[k] < 2 ? `perto de interseção de estruturas regionais (mapa 1:1.000.000, a ~${VA.fmt.num(Math.max(1, Math.round(distInter[k])), 0)} km)` : distEstr[k] < 1 ? 'estrutura regional (falha ou zona de cisalhamento, mapa 1:1.000.000) a menos de 1 km' : `estrutura regional (mapa 1:1.000.000) a cerca de ${VA.fmt.num(Math.round(distEstr[k]), 0)} km`);
      if (E.gama && !isNaN(E.gama[k])) { if (E.gama[k] >= 0.65 && sis.gamaTxt) pro.push(sis.gamaTxt); else if (E.gama[k] < 0.35) contra.push('gamaespectrometria sem a assinatura esperada'); }
      else if (sis.pesos.gama) contra.push('sem gamaespectrometria');
      if (E.mag && !isNaN(E.mag[k]) && E.mag[k] >= 0.65 && sis.magTxt) pro.push(sis.magTxt);
      if (E.geoq && !isNaN(E.geoq[k])) { if (E.geoq[k] >= 0.35) { const a = anomalas.slice().sort((x, y) => kmEntre(c, x.c) - kmEntre(c, y.c))[0]; if (a) pro.push(`anomalia de ${String(a.el).toUpperCase()} em ${a.material} a ${VA.fmt.km(kmEntre(c, a.c))}`); } else contra.push('amostras geoquímicas próximas sem anomalia'); }
      else if (sis.pesos.geoq) contra.push('sem amostra geoquímica pública a menos de 3 km');
      const pr = procBB.find(x => c[0] >= x.bb[0] && c[0] <= x.bb[2] && c[1] >= x.bb[1] && c[1] <= x.bb[3] && turf.booleanPointInPolygon(c, x.f));
      const rs = restr.find(r => c[0] >= r.bb[0] && c[0] <= r.bb[2] && c[1] >= r.bb[1] && c[1] <= r.bb[3] && turf.booleanPointInPolygon(c, r.f));
      let categoria, fator, situacao;
      if (rs && rs.tipo === 'restrito') { categoria = 'Restrito'; fator = 0; situacao = `${rs.camada}: ${rs.nome}`; contra.push(`dentro de ${rs.camada.toLowerCase()}`); }
      else if (pr) { const v = pr.via; categoria = v.classe === 'disponibilidade' ? 'Oferta pública (ANM)' : v.classe === 'lavra' ? 'Parceria com o titular' : 'Aquisição, cessão ou parceria'; fator = v.fator; situacao = `${pr.f.properties.PROCESSO} — ${String(pr.f.properties.FASE || '').toLowerCase()}, ${pr.f.properties.NOME}`; }
      else if (!verificada) { categoria = 'Disponibilidade não verificada'; fator = 0.5; situacao = soAnm ? 'consulta ANM da janela não concluída: não se sabe se há processo' : `sem verificação: ${pendentesDisp.map(x => x.nome).join(', ')}`; contra.push('disponibilidade não verificada'); }
      else { categoria = 'Novo requerimento possível'; fator = 1; situacao = 'sem processo ativo no SIGMINE'; }
      const zd = zonaDisp[t], zt = zd.reduce((a, b) => a + b, 0) || 1;
      const zona = { livre_pct: zd[0] / zt, ocupada_pct: (zd[1] + zd[2] + zd[3]) / zt, condicionada_pct: zd[4] / zt, restrita_pct: zd[5] / zt, desconhecida_pct: zd[6] / zt };
      if (categoria === 'Novo requerimento possível' && zona.livre_pct < 0.5) { situacao += ` · só ${Math.round(zona.livre_pct * 100)}% da zona do alvo está sem processo`; contra.push(`${Math.round((1 - zona.livre_pct) * 100)}% da zona do alvo tem processo ou restrição`); }
      if (rs && rs.tipo === 'condicionado') { contra.push(`condicionante: ${rs.camada.toLowerCase()} (${rs.nome})`); fator = Math.min(fator, 0.7); situacao += ` · condicionante: ${rs.camada.toLowerCase()}`; }
      const geofAlvo = Object.fromEntries(['k', 'th', 'u', 'thk', 'asa', 'mag', 'dv1'].map(id => [id, P[id] && !isNaN(P[id][k]) ? +P[id][k].toFixed(2) : null]));
      const contrib = Object.fromEntries(usadas.map(x => [x.id, isNaN(E[x.id][k]) ? null : +E[x.id][k].toFixed(2)]));
      return { c: [+c[0].toFixed(6), +c[1].toFixed(6)], nota: fav[k], conf: conf[k], oportunidade: fav[k] * fator, categoria, situacao, livre: verificada && !pr && !(rs && rs.tipo === 'restrito'), zona,
        processo: pr ? pr.f.properties : null, area_ha: celulas[t] * celHa, motivos: pro, contra, contrib, geof: geofAlvo, unidade: u ? { sigla: u.sigla, nome: u.nome, escala: u.escala } : null,
        dist_km: aoiPt(c) ? 0 : VA.geo.distanciaKm(aoi, turf.point(c)) };
    });
    /* ranking de oportunidades: favorabilidade × acesso ao direito; F1 é a melhor oportunidade */
    out.alvos = alvos.sort((a, b) => b.oportunidade - a.oportunidade || b.nota - a.nota).map((a, i) => Object.assign(a, { id: 'F' + (i + 1), rank: i + 1 }));

    /* ===== geologia da área (ha por unidade, na melhor escala que a cobre) ===== */
    const naArea = [];
    if (unidades.length) {
      if (poli) {
        const toca = unidades.filter(u => { try { return turf.booleanIntersects(u.f, aoi); } catch (e) { return false; } });
        const melhor = toca.length ? Math.min(...toca.map(u => u.e)) : -1;
        const areaAoi = turf.area(aoi) / 10000;
        /* área de cada unidade sem contar duas vezes polígonos sobrepostos: o que já foi atribuído sai do restante */
        let resto = aoi;
        toca.filter(u => u.e === melhor).forEach(u => {
          let ha = 0;
          if (resto) try { const x = turf.intersect(turf.featureCollection([resto, u.f])); ha = x ? turf.area(x) / 10000 : 0; if (x) resto = turf.difference(turf.featureCollection([resto, u.f])); } catch (e) { ha = 0; }
          if (ha < 0.01) return;
          const chave = u.sigla || u.nome, ja = naArea.find(z => z.chave === chave);
          if (ja) ja.ha += ha; else naArea.push({ chave, sigla: u.sigla, nome: u.nome, litotipos: u.litotipos, escala: u.escala, ha, s: u.s, por: u.por, hospeda: u.hospeda || 0, empirico: !!u.empirico, contra: !!u.contra, ambiente: u.ambiente, idade: u.idade, idadeOk: u.idadeOk });
        });
        naArea.forEach(z => { z.pct = z.ha / areaAoi; });
      } else {
        const i = Math.min(W - 1, Math.max(0, Math.floor((c0[0] - bb[0]) / dx))), j = Math.min(H - 1, Math.max(0, Math.floor((bb[3] - c0[1]) / dy))), u = unidades[unidadeDe[j * W + i]];
        if (u) naArea.push({ chave: u.sigla, sigla: u.sigla, nome: u.nome, litotipos: u.litotipos, escala: u.escala, ha: null, pct: 1, s: u.s, por: u.por, hospeda: u.hospeda || 0, empirico: !!u.empirico, contra: !!u.contra, ambiente: u.ambiente, idade: u.idade, idadeOk: u.idadeOk });
      }
    }
    naArea.sort((a, b) => (b.ha || 0) - (a.ha || 0));
    naArea.forEach(z => { z.classe = z.s >= 0.75 ? 'favorável' : z.s >= 0.45 ? 'possível' : 'pouco favorável'; });
    const melhorEscala = naArea.length ? naArea[0].escala : null;
    out.geologia = { naArea, melhorEscala, cobertura: Object.fromEntries(Object.entries(cobertura).map(([e, c]) => [e, c / n])),
      hospedeiras: unidades.filter(u => u.hospeda).map(u => ({ sigla: u.sigla, nome: u.nome, escala: u.escala, n: u.hospeda, ocorrencias: (u.hospedaNomes || []).slice(0, 4) })),
      insuficiente: !melhorEscala || /250\.000|1\.000\.000/.test(melhorEscala) };

    /* ===== contexto metalogenético e depósitos análogos (até o raio do alvo) ===== */
    const reg = ((analise.alvo && analise.alvo.ocorrencias) || []).map(o => ({ nome: o.titulo, st: o.props.STATUS_ECONOMICO || 'Indeterminado', hosp: limpo(o.props.ROCHAS_HOSPEDEIRAS), enc: limpo(o.props.ROCHAS_ENCAIXANTES), alt: limpo(o.props.TIPOS_ALTERACAO), morf: limpo(o.props.MORFOLOGIA), prov: limpo(o.props.PROVINCIA), d: o.distancia_km }));
    const contar = l => l.reduce((m, x) => { if (x) x.split(/\s*[,;]\s*/).forEach(t => { const k = t.trim(); if (k) m[k] = (m[k] || 0) + 1; }); return m; }, {});
    const provAuNome = provAu && provAu.features.length ? [...new Set(provAu.features.map(f => limpo(f.properties.PROV_AURIF || f.properties.DISTRITO || f.properties.NOME || f.properties.Nome)).filter(Boolean))] : [];
    const hospRegiao = contar(reg.map(r => r.hosp).concat(reg.map(r => r.enc)));
    const txtArea = N(naArea.map(z => z.litotipos + ' ' + z.nome).join(' '));
    const hospNaArea = Object.keys(hospRegiao).filter(h => N(h).split(/\s+/).filter(x => x.length > 5).some(x => txtArea.includes(x.slice(0, 7))));
    out.contexto = { raioKm: analise.alvo ? analise.alvo.raioKm : null, ocorrencias: reg.length, porStatus: reg.reduce((m, r) => { m[r.st] = (m[r.st] || 0) + 1; return m; }, {}),
      provincias: Object.entries(contar(reg.map(r => r.prov))).sort((a, b) => b[1] - a[1]).map(x => x[0]).slice(0, 3), provinciaAurifera: provAuNome,
      analogos: reg.filter(r => /mina|garimp|deposit/.test(N(r.st)) || r.hosp || r.enc || r.alt).sort((a, b) => a.d - b.d).slice(0, 10),
      rochasHospedeiras: Object.entries(hospRegiao).sort((a, b) => b[1] - a[1]).slice(0, 6), alteracoes: Object.entries(contar(reg.map(r => r.alt))).sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]), hospedeirasNaArea: hospNaArea };

    /* ===== leitura geofísica da área ===== */
    const dentroAoi = new Uint8Array(n); let nAoi = 0;
    if (poli) rasterizar(aoi.geometry, W, H, bb, dx, dy, k => { if (!dentroAoi[k]) { dentroAoi[k] = 1; nAoi++; } });
    if (!nAoi) { const i = Math.min(W - 1, Math.max(0, Math.floor((c0[0] - bb[0]) / dx))), j = Math.min(H - 1, Math.max(0, Math.floor((bb[3] - c0[1]) / dy))); dentroAoi[j * W + i] = 1; nAoi = 1; }
    const mediaAoi = A => { if (!A) return null; let s = 0, c = 0; for (let k = 0; k < n; k++) if (dentroAoi[k] && !isNaN(A[k])) { s += A[k]; c++; } return c ? s / c : null; };
    const zonas = (fn, minCel) => { const m = new Uint8Array(n); for (let k = 0; k < n; k++) if (fn(k)) m[k] = 1; let z = 0; const vis = new Uint8Array(n); for (let k = 0; k < n; k++) { if (!m[k] || vis[k]) continue; let t = 0; const pil = [k]; vis[k] = 1; while (pil.length) { const q = pil.pop(); t++; const i = q % W, j = (q / W) | 0; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, b]) => { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= W || jj >= H) return; const r = jj * W + ii; if (m[r] && !vis[r]) { vis[r] = 1; pil.push(r); } }); } if (t >= minCel) z++; } return z; };
    const minZona = Math.max(3, Math.round(0.25 / (celKmX * celKmY)));   // zonas de pelo menos 0,25 km²
    out.geofisica = {
      cobertura: Object.fromEntries(Object.entries(G).map(([id, a]) => [id, a ? a.reduce((m, v) => m + (isNaN(v) ? 0 : 1), 0) / n : 0])),
      naArea: Object.fromEntries(['k', 'th', 'u', 'thk', 'asa', 'mag', 'dv1'].map(id => [id, mediaAoi(P[id])])),
      zonasKAlto: P.k && P.thk ? zonas(k => P.k[k] >= 0.9 && P.thk[k] <= 0.3, minZona) : null,
      zonasMag: P.asa ? zonas(k => P.asa[k] >= 0.92, minZona) : null,
      gamaTxt: sis.gamaTxt || '', magTxt: sis.magTxt || '', usaGama: !!sis.pesos.gama, usaMag: !!sis.pesos.mag
    };
    out.ocorrencias = ocorr.filter(naJanela).map(o => ({ c: o.c, alvo: o.alvo, st: o.st, nome: o.nome }));
    out.grade = { W, H, bbox: bb, final: fav, fav, conf, disp, E, G, limite: lim, p60: quantil(fav, 0.6), p75: quantil(fav, 0.75), p97: quantil(fav, 0.97) };
    out.coberturaMedia = conf.reduce((a, b) => a + b, 0) / n;
    out.confAoi = mediaAoi(conf);
    out.favAoiPct = mediaAoi(percentis(fav));
    out.processosJanela = procs.length;
    /* processos da ANM na janela, para desenhar sobre o mapa de favorabilidade */
    out.processos = procs.slice(0, 1500).map(f => { let g = f.geometry; try { g = VA.geo.simplificarAte(g, 80); } catch (e) { } const pr = f.properties, v = VIA(pr.FASE);
      return { type: 'Feature', geometry: g, properties: { processo: pr.PROCESSO, fase: pr.FASE, titular: pr.NOME, subs: pr.SUBS, ha: pr.AREA_HA, classe: v.classe } }; });
    return out;
  };

  /* ---------------- imagens (PNG) da grade ---------------- */
  const RAMPA = [[0, [255, 255, 178]], [0.35, [254, 204, 92]], [0.6, [253, 141, 60]], [0.8, [240, 59, 32]], [1, [189, 0, 38]]];
  const corRampa = t => { for (let i = 1; i < RAMPA.length; i++) if (t <= RAMPA[i][0]) { const [a, ca] = RAMPA[i - 1], [b, cb] = RAMPA[i], f = (t - a) / (b - a); return ca.map((v, k) => Math.round(v + (cb[k] - v) * f)); } return RAMPA[RAMPA.length - 1][1]; };
  const COR_DISP = [null, [245, 166, 35, 150], [196, 30, 58, 160], [107, 114, 128, 150], [234, 200, 60, 120], [76, 29, 149, 185], [139, 92, 246, 70]];
  VA.COR_DISP = ['transparente', '#f5a623', '#c41e3a', '#6b7280', '#eac83c', '#4c1d95', '#8b5cf6'];
  VA.favImagem = function (F, camada) {
    if (!F || !F.grade) return null;
    const g = F.grade, { W, H } = g, c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d'), img = ctx.createImageData(W, H), d = img.data;
    const fav = g.fav || g.final;
    if (camada === 'final' || camada === 'fav') {
      const lo = g.p60, hi = Math.max(g.p97, lo + 1e-6);
      for (let k = 0; k < W * H; k++) { const v = fav[k]; if (isNaN(v) || v < lo) continue; const t = Math.min(1, (v - lo) / (hi - lo)); const [r, gg, b] = corRampa(t); d[k * 4] = r; d[k * 4 + 1] = gg; d[k * 4 + 2] = b; d[k * 4 + 3] = Math.round(90 + 150 * t); }
    } else if (camada === 'disp') {
      for (let k = 0; k < W * H; k++) {
        const v = g.disp ? g.disp[k] : 0, cor = COR_DISP[v]; if (!cor) continue;
        /* não verificada: hachura diagonal, para não se confundir com nenhuma classe conhecida */
        const a = v === 6 && ((k % W) + ((k / W) | 0)) % 4 < 2 ? 150 : cor[3];
        d[k * 4] = cor[0]; d[k * 4 + 1] = cor[1]; d[k * 4 + 2] = cor[2]; d[k * 4 + 3] = a;
      }
    } else if (camada === 'conf') {
      for (let k = 0; k < W * H; k++) { const t = Math.max(0, Math.min(1, g.conf[k])); d[k * 4] = Math.round(240 - 200 * t); d[k * 4 + 1] = Math.round(244 - 120 * t); d[k * 4 + 2] = Math.round(248 - 60 * t); d[k * 4 + 3] = 255; }
    } else if (/^geo:/.test(camada)) {
      /* imagem aerogeofísica na paleta do SGB (azul = baixo → magenta = alto); 1ª derivada em cinza */
      const id = camada.slice(4), A = g.G && g.G[id]; if (!A) return null;
      for (let k = 0; k < W * H; k++) {
        const v = A[k]; if (isNaN(v)) { d[k * 4] = 233; d[k * 4 + 1] = 237; d[k * 4 + 2] = 242; d[k * 4 + 3] = 255; continue; }
        if (id === 'dv1') { const x = Math.round(255 * v); d[k * 4] = x; d[k * 4 + 1] = x; d[k * 4 + 2] = x; d[k * 4 + 3] = 255; continue; }
        const h = ((240 - 300 * v) % 360 + 360) % 360 / 60, x = 1 - Math.abs(h % 2 - 1), q = [[1, x, 0], [x, 1, 0], [0, 1, x], [0, x, 1], [x, 0, 1], [1, 0, x]][Math.floor(h) % 6];
        d[k * 4] = Math.round(q[0] * 255); d[k * 4 + 1] = Math.round(q[1] * 255); d[k * 4 + 2] = Math.round(q[2] * 255); d[k * 4 + 3] = 255;
      }
    } else {
      const E = g.E[camada]; if (!E) return null;
      for (let k = 0; k < W * H; k++) { const v = E[k]; if (isNaN(v)) { d[k * 4] = 233; d[k * 4 + 1] = 237; d[k * 4 + 2] = 242; d[k * 4 + 3] = 255; continue; } const t = Math.max(0, Math.min(1, v)); d[k * 4] = Math.round(243 - 232 * t); d[k * 4 + 1] = Math.round(246 - 185 * t); d[k * 4 + 2] = Math.round(250 - 105 * t); d[k * 4 + 3] = 255; }
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  };
})();
