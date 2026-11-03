/* VIP ANALYSIS — Local para requerimento.
   Com a finalidade "Pesquisa / lavra mineral" e o modo "Local para requerimento", a análise roda todas as camadas
   com regra de restrição e esta etapa transforma o resultado num checklist do requerimento de pesquisa na ANM:
   área livre (descontando direitos de terceiros, bloqueios, terras indígenas, UCs de proteção integral, áreas
   militares e em disponibilidade), limite de área pela substância (Portaria DNPM 155/2016, art. 42, com a
   redação das Resoluções ANM 49/2020 e 135/2023), poligonal com lados N-S e L-O verdadeiros (SIRGAS 2000)
   e as condicionantes de cada camada. Gera a poligonal N-S/L-O sugerida e o memorial para conferência. */
'use strict';

(function () {
  const VA = window.VA, N = s => VA.fmt.norm(s);

  /* ---------------- limite de área pela substância ---------------- */
  const GEMAS = /turmalin|esmerald|agua.?marinha|ametist|topazio|citrino|opala|granada|crisoberil|alexandrit|kunzit|morganit|heliodor|rubelit|indicolit|gema|pedra (decorativa|de colecao|preciosa)|cristal de rocha|quartzo (rosa|hialino|fume)|agata|calcedonia|jaspe|amazonit/;
  const G1 = /ouro|prata|cobre|ferro|mangan|niquel|cobalto|litio|espodumen|lepidolit|petalit|ambligonit|tantal|columbit|niobio|pirocloro|estanho|cassiterit|tungst|scheelit|wolframit|cromo|cromit|chumbo|galena|zinco|esfalerit|molibd|vanadio|titanio|ilmenit|rutilo|anatasio|zirc|terras raras|monazit|xenotim|bauxit|aluminio|platina|paladio|bismuto|antimonio|metal|fosfat|apatit|fosforit|potassio|silvinit|silvit|carvao|diamante|turfa|sal.?gema|rochas? (betuminos|pirobetuminos)/;
  const G2 = /feldspato|mica|muscovit|areia|cascalho|saibro|argila|brita|pedra britada|agua mineral|agua potavel|calcario (corretivo|para corretivo)|rocha para (paralelepipedo|meio.?fio)|cerâmica vermelha|ceramica vermelha/;
  VA.limiteRequerimento = function (subst, amazonia) {
    const s = N(subst);
    if (!s) return { ha: null, grupo: null, texto: 'Informe a substância para conferir o limite: 50 ha (gemas exceto diamante, feldspato, mica, areia e materiais de uso imediato na construção civil), 1.000 ha (rochas ornamentais e demais substâncias) ou 2.000 ha (metálicos, fertilizantes, carvão e diamante; 10.000 ha na Amazônia Legal).' };
    if (/uranio|torio/.test(s)) return { ha: 0, grupo: 'monopolio', texto: 'Minérios nucleares são monopólio da União (CF, art. 177, V): não se requer pesquisa na ANM.' };
    if (/^berilo$|^berilio$/.test(s)) return { ha: 50, grupo: 'II', texto: 'Berilo como gema (água-marinha, esmeralda, heliodoro): até 50 ha. Como minério de berílio (uso industrial), o limite é 2.000 ha — defina o uso no requerimento.', ambiguo: true };
    if (/^quartzo$/.test(s)) return { ha: 50, grupo: 'II', texto: 'Quartzo como gema ou pedra decorativa: até 50 ha. Quartzo industrial entra em “demais substâncias”: até 1.000 ha.', ambiguo: true };
    if (/diamante/.test(s) || (G1.test(s) && !GEMAS.test(s))) return { ha: amazonia ? 10000 : 2000, grupo: 'I', texto: `Metálicos, fertilizantes, carvão, diamante, turfa e sal-gema: até ${amazonia ? '10.000 ha (Amazônia Legal)' : '2.000 ha'}.` };
    if (GEMAS.test(s) || G2.test(s)) return { ha: 50, grupo: 'II', texto: 'Gemas (exceto diamante), pedras decorativas, feldspato, mica, areia e materiais de uso imediato na construção civil: até 50 ha.' };
    if (/caulim|caulin/.test(s) && amazonia) return { ha: 10000, grupo: 'III', texto: 'Caulim na Amazônia Legal: até 10.000 ha.' };
    return { ha: 1000, grupo: 'III', texto: 'Rochas ornamentais e de revestimento e demais substâncias: até 1.000 ha.' };
  };

  /* ---------------- geometria ---------------- */
  const graus = (m, lat) => [m / (111320 * Math.cos(lat * Math.PI / 180)), m / 110574];
  /* quadrado N-S/L-O com a área pedida, centrado no ponto */
  /* o tamanho é ajustado pela área geodésica (a mesma que a ANM calcula), para não passar do limite da substância */
  VA.quadradoNSLO = function (lon, lat, ha) {
    const fazer = lado => { const [dx, dy] = graus(lado / 2, lat); return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[lon - dx, lat + dy], [lon + dx, lat + dy], [lon + dx, lat - dy], [lon - dx, lat - dy], [lon - dx, lat + dy]]] } }; };
    let lado = Math.sqrt(ha * 10000), f = fazer(lado);
    for (let k = 0; k < 6; k++) { const a = turf.area(f) / 10000; if (Math.abs(a - ha) / ha < 1e-5) break; lado *= Math.sqrt(ha / a); f = fazer(lado); }
    if (turf.area(f) / 10000 > ha) { lado *= 0.99999; f = fazer(lado); }
    return f;
  };
  /* lados fora dos rumos N-S e L-O verdadeiros (tolerância de ~1 m no deslocamento do lado) */
  VA.ladosForaNSLO = function (feat) {
    const g = feat.geometry; if (!/Polygon/.test(g.type)) return null;
    const aneis = g.type === 'Polygon' ? g.coordinates : g.coordinates.flat();
    let n = 0, total = 0;
    aneis.forEach(r => { for (let i = 1; i < r.length; i++) { const [x0, y0] = r[i - 1], [x1, y1] = r[i]; total++; const [tx, ty] = graus(1, y0); if (Math.abs(x1 - x0) > tx && Math.abs(y1 - y0) > ty) n++; } });
    return { fora: n, total };
  };
  /* contém (Polygon/MultiPolygon) — com caixa envolvente para acelerar */
  function dentroDe(feat) {
    const bb = turf.bbox(feat);
    return (x, y) => x >= bb[0] && x <= bb[2] && y >= bb[1] && y <= bb[3] && turf.booleanPointInPolygon([x, y], feat);
  }
  /* poligonal N-S/L-O: células de uma grade em graus; entram as que têm centro e cantos dentro da região.
     Fica a maior parte contínua, com os buracos preenchidos; o contorno sai só com lados N-S e L-O. */
  VA.poligonalNSLO = function (regiao, { maxCel = 160 } = {}) {
    if (!regiao || !regiao.geometry) return null;
    const bb = turf.bbox(regiao), latm = (bb[1] + bb[3]) / 2;
    const areaM = turf.area(regiao); if (areaM < 100) return null;
    let cel = Math.max(5, Math.sqrt(areaM) / 30);
    const [kx, ky] = graus(1, latm);
    let nx = Math.ceil((bb[2] - bb[0]) / (cel * kx)), ny = Math.ceil((bb[3] - bb[1]) / (cel * ky));
    if (Math.max(nx, ny) > maxCel) { cel *= Math.max(nx, ny) / maxCel; nx = Math.ceil((bb[2] - bb[0]) / (cel * kx)); ny = Math.ceil((bb[3] - bb[1]) / (cel * ky)); }
    const dx = cel * kx, dy = cel * ky, x0 = bb[0], y1 = bb[3];
    const dentro = dentroDe(regiao);
    const canto = new Uint8Array((nx + 1) * (ny + 1));
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) canto[j * (nx + 1) + i] = dentro(x0 + i * dx, y1 - j * dy) ? 1 : 0;
    const cel1 = new Uint8Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const c = (a, b) => canto[b * (nx + 1) + a];
      if (c(i, j) && c(i + 1, j) && c(i, j + 1) && c(i + 1, j + 1) && dentro(x0 + (i + .5) * dx, y1 - (j + .5) * dy)) cel1[j * nx + i] = 1;
    }
    /* maior parte contínua (vizinhança de 4), buracos preenchidos e sem cantos que só se tocam na diagonal
       (a poligonal tem de ser um anel simples) */
    const sel = new Uint8Array(nx * ny); sel.set(cel1);
    const viz = (q, f) => { const i = q % nx, j = (q / nx) | 0; if (i > 0) f(q - 1); if (i < nx - 1) f(q + 1); if (j > 0) f(q - nx); if (j < ny - 1) f(q + nx); };
    let nc = 0, preenchidas = 0;
    for (let volta = 0; volta < 12; volta++) {
      const comp = new Int32Array(nx * ny).fill(-1); let melhor = -1, tamMelhor = 0; nc = 0;
      for (let k = 0; k < nx * ny; k++) {
        if (!sel[k] || comp[k] >= 0) continue;
        const pilha = [k]; comp[k] = nc; let t = 0;
        while (pilha.length) { const q = pilha.pop(); t++; viz(q, r => { if (sel[r] && comp[r] < 0) { comp[r] = nc; pilha.push(r); } }); }
        if (t > tamMelhor) { tamMelhor = t; melhor = nc; } nc++;
      }
      if (melhor < 0) return null;
      for (let k = 0; k < nx * ny; k++) sel[k] = comp[k] === melhor ? 1 : 0;
      const fora = new Uint8Array(nx * ny), pilha = [];
      const semente = k => { if (!sel[k] && !fora[k]) { fora[k] = 1; pilha.push(k); } };
      for (let a = 0; a < nx; a++) { semente(a); semente((ny - 1) * nx + a); }
      for (let b = 0; b < ny; b++) { semente(b * nx); semente(b * nx + nx - 1); }
      while (pilha.length) viz(pilha.pop(), r => { if (!sel[r] && !fora[r]) { fora[r] = 1; pilha.push(r); } });
      for (let k = 0; k < nx * ny; k++) if (!sel[k] && !fora[k]) { sel[k] = 1; preenchidas++; }
      let tirou = 0;
      for (let b = 0; b < ny - 1; b++) for (let a = 0; a < nx - 1; a++) {
        const k = b * nx + a, A = sel[k], B = sel[k + 1], C = sel[k + nx], D = sel[k + nx + 1];
        if (A && D && !B && !C) { sel[k + nx + 1] = 0; tirou++; } else if (B && C && !A && !D) { sel[k + nx] = 0; tirou++; }
      }
      if (!tirou) break;
    }
    /* contorno: arestas orientadas (interior à esquerda), encadeadas */
    const em = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && sel[j * nx + i];
    const saidas = new Map(), chave = (i, j) => i + ',' + j;
    const add = (a, b) => { const k = chave(a[0], a[1]); if (!saidas.has(k)) saidas.set(k, []); saidas.get(k).push(b); };
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (!em(i, j)) continue;  // vértices em (coluna, linha) da grade; linha cresce para o sul
      if (!em(i, j - 1)) add([i + 1, j], [i, j]);      // lado norte, de leste para oeste
      if (!em(i - 1, j)) add([i, j], [i, j + 1]);      // lado oeste, de norte para sul
      if (!em(i, j + 1)) add([i, j + 1], [i + 1, j + 1]); // lado sul, de oeste para leste
      if (!em(i + 1, j)) add([i + 1, j + 1], [i + 1, j]); // lado leste, de sul para norte
    }
    /* começa no vértice mais a noroeste */
    let ini = null; saidas.forEach((v, k) => { const [i, j] = k.split(',').map(Number); if (!ini || j < ini[1] || (j === ini[1] && i < ini[0])) ini = [i, j]; });
    const anel = [ini]; let atual = ini, ant = null, guarda = 0;
    while (guarda++ < 200000) {
      const l = saidas.get(chave(atual[0], atual[1])); if (!l || !l.length) break;
      let idx = 0;
      if (l.length > 1 && ant) { const d0 = [atual[0] - ant[0], atual[1] - ant[1]]; idx = l.findIndex(p => { const d = [p[0] - atual[0], p[1] - atual[1]]; return d0[0] * d[1] - d0[1] * d[0] < 0; }); if (idx < 0) idx = 0; }
      const prox = l.splice(idx, 1)[0];
      ant = atual; atual = prox;
      if (atual[0] === ini[0] && atual[1] === ini[1]) break;
      anel.push(atual);
    }
    /* remove vértices colineares */
    const v = anel.filter((p, k) => { const a = anel[(k - 1 + anel.length) % anel.length], b = anel[(k + 1) % anel.length]; return !((a[0] === p[0] && p[0] === b[0]) || (a[1] === p[1] && p[1] === b[1])); });
    /* contorno no sentido anti-horário (norte para cima), como pede o GeoJSON, a partir do vértice mais a noroeste */
    const coords = v.map(([i, j]) => [+(x0 + i * dx).toFixed(7), +(y1 - j * dy).toFixed(7)]);
    coords.push(coords[0]);
    const feat = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } };
    return { feature: feat, ha: turf.area(feat) / 10000, vertices: v.length, celula_m: cel, buracosPreenchidos_ha: preenchidas * cel * cel / 10000, partes: nc };
  };

  /* memorial para conferência: vértices em graus, minutos e segundos (SIRGAS 2000) */
  function gms(v, pos, neg) { const s = v < 0 ? neg : pos, a = Math.abs(v), g = Math.floor(a), mf = (a - g) * 60, m = Math.floor(mf), sec = (mf - m) * 60; return `${s === neg ? '-' : ''}${String(g).padStart(2, '0')}°${String(m).padStart(2, '0')}'${sec.toFixed(3).padStart(6, '0').replace('.', ',')}"`; }
  VA.memorialCSV = function (feat, titulo) {
    const r = feat.geometry.coordinates[0].slice(0, -1);
    const linhas = [`# ${titulo || 'Poligonal N-S/L-O'} — SIRGAS 2000 (EPSG:4674) — gerado pela VIP ANALYSIS ${VA.versao}; confira o formato exigido pelo REPEM antes de protocolar`, 'Vertice;Latitude;Longitude;Latitude_decimal;Longitude_decimal'];
    r.forEach(([x, y], i) => linhas.push(`${i + 1};${gms(y, '', '-')};${gms(x, '', '-')};${y.toFixed(7)};${x.toFixed(7)}`));
    return '﻿' + linhas.join('\r\n');
  };
  VA.kmlPoligonos = function (itens, nome) {
    const anel = g => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map(p => `<Polygon><outerBoundaryIs><LinearRing><coordinates>${p[0].map(c => c[0] + ',' + c[1] + ',0').join(' ')}</coordinates></LinearRing></outerBoundaryIs>${p.slice(1).map(h => `<innerBoundaryIs><LinearRing><coordinates>${h.map(c => c[0] + ',' + c[1] + ',0').join(' ')}</coordinates></LinearRing></innerBoundaryIs>`).join('')}</Polygon>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${VA.fmt.esc(nome)}</name>
<Style id="nslo"><LineStyle><color>ff1a1a1a</color><width>3</width></LineStyle><PolyStyle><color>3300aaff</color></PolyStyle></Style>
<Style id="livre"><LineStyle><color>ff2e9d3a</color><width>2</width></LineStyle><PolyStyle><color>552e9d3a</color></PolyStyle></Style>
<Style id="onerada"><LineStyle><color>ff2020d0</color><width>2</width></LineStyle><PolyStyle><color>552020d0</color></PolyStyle></Style>
${itens.filter(x => x.feature).map(x => `<Placemark><name>${VA.fmt.esc(x.nome)}</name><styleUrl>#${x.estilo}</styleUrl><MultiGeometry>${anel(x.feature.geometry)}</MultiGeometry></Placemark>`).join('\n')}</Document></kml>`;
  };

  /* ---------------- checklist ---------------- */
  const SIT = { livre: 'Sem impedimento', impede: 'Impede', ajuste: 'Exige ajuste', condiciona: 'Condicionante', atencao: 'Atenção', sem_dados: 'Sem resposta' };
  VA.SIT_REQ = SIT;
  const BLOQUEIAM = ['anm_proc', 'anm_estoque', 'anm_bloq', 'funai_ti', 'cnuc', 'anm_militar'];

  VA.avaliarRequerimento = function (analise, aoi, p) {
    const R = analise.resultados, itens = [];
    const ok = id => R[id] && !['falha', 'sem_base'].includes(R[id].status);
    const dentro = id => ok(id) ? (R[id].itens || []).filter(i => i.incide) : [];
    const perto = id => ok(id) ? (R[id].itens || []).filter(i => !i.incide && i.distancia_km != null) : [];
    const ev = l => l.map(i => i.evid).filter(Boolean);
    const nomes = (l, n = 3) => { const u = [...new Set(l.map(i => i.titulo))]; return u.slice(0, n).join('; ') + (u.length > n ? ` e mais ${u.length - n}` : ''); };
    const add = (criterio, situacao, detalhe, evid = [], acao = '') => itens.push({ criterio, situacao, detalhe, evid, acao });
    /* fonte pendente: não respondeu, sem base instalada ou resposta parcial (truncada) — não comprova ausência */
    const semResposta = id => !R[id] || (R[id].completude ? R[id].completude !== 'completo' : ['falha', 'sem_base'].includes(R[id].status));
    const comoFalhou = id => !R[id] ? 'não foi consultada' : R[id].completude === 'parcial' ? `respondeu só em parte (${(R[id].motivosParcial || []).join('; ')})` : R[id].completude === 'sem_base' ? 'não tem base instalada' : 'não respondeu';
    const poli = /Polygon/.test(aoi.geometry.type);
    const areaHa = poli ? turf.area(aoi) / 10000 : 0;
    const amazonia = ok('anm_amazonia') ? R.anm_amazonia.status === 'dentro' || (R.anm_amazonia.itens || []).some(i => i.incide) : !!(analise.local && analise.local.territorio && analise.local.territorio.amazoniaLegal);
    const subst = p.reqSubstancia || '';
    const lim = VA.limiteRequerimento(subst, amazonia);

    /* 1. direitos minerários de terceiros */
    const proc = dentro('anm_proc'), terceiros = proc.filter(i => !i.proprio), proprios = proc.filter(i => i.proprio);
    const emDisp = terceiros.filter(i => i.disponivel);
    if (semResposta('anm_proc')) add('Direitos minerários de terceiros (SIGMINE)', 'sem_dados', `O SIGMINE ${comoFalhou('anm_proc')}: não dá para saber se a área está livre.`, [], 'Repita a análise; sem isso o requerimento pode ser indeferido por interferência.');
    else if (!terceiros.length) add('Direitos minerários de terceiros (SIGMINE)', 'livre', proprios.length ? `Só processos do titular de interesse: ${nomes(proprios)}.` : 'Nenhum processo ativo de terceiros sobre a área.', ev(proprios));
    else add('Direitos minerários de terceiros (SIGMINE)', 'ajuste', `${terceiros.length} processo(s) de terceiros sobre a área: ${nomes(terceiros)}. A parte sobreposta tem prioridade de quem protocolou antes.`, ev(terceiros), 'Requeira só a área livre (poligonal sugerida abaixo). O SIGAREAS retira as interferências; se não sobrar área, o requerimento é indeferido.');
    if (emDisp.length) add('Áreas em disponibilidade', 'impede', `${nomes(emDisp)} em disponibilidade: a ANM oferta essas áreas em leilão ou edital, não por requerimento.`, ev(emDisp), 'Acompanhe as ofertas públicas da ANM (leilão eletrônico de áreas).');
    const est = dentro('anm_estoque');
    if (est.length) add('Estoque de áreas em disponibilidade (ANM)', 'impede', `${nomes(est)}: área no estoque de disponibilidade.`, ev(est), 'Só por oferta pública da ANM.');
    const bloq = dentro('anm_bloq');
    if (bloq.length) add('Áreas de bloqueio (ANM)', 'impede', `Bloqueio: ${nomes(bloq)}. Restringe a outorga de títulos minerários.`, ev(bloq), 'Consulte a ANM sobre o alcance do bloqueio antes de protocolar.');
    else if (ok('anm_bloq')) add('Áreas de bloqueio (ANM)', 'livre', 'Nenhuma área de bloqueio sobre a área.');
    const garimp = dentro('anm_garimp');
    if (garimp.length) add('Reservas garimpeiras', 'condiciona', `Reserva garimpeira: ${nomes(garimp)}. Prevalece o regime de permissão de lavra garimpeira (PLG).`, ev(garimp), 'Avalie requerer PLG em vez de autorização de pesquisa.');
    const fonte = dentro('anm_fonte');
    if (fonte.length) add('Áreas de proteção de fonte (água mineral)', 'condiciona', `${nomes(fonte)}: atividades restritas para proteger a fonte.`, ev(fonte));

    /* 2. terras indígenas, UCs, comunidades */
    const ti = dentro('funai_ti'), tiPerto = perto('funai_ti'), tiEstudo = dentro('funai_ti_pt').concat(perto('funai_ti_pt'));
    if (semResposta('funai_ti')) add('Terras indígenas (FUNAI)', 'sem_dados', `A base da FUNAI ${comoFalhou('funai_ti')}.`, [], 'Confira no mapa da FUNAI antes de protocolar.');
    else if (ti.length) add('Terras indígenas (FUNAI)', 'impede', `Sobre ${nomes(ti)}. Mineração em terra indígena não está regulamentada (CF, art. 231, § 3º).`, ev(ti), 'Exclua a parte em terra indígena.');
    else add('Terras indígenas (FUNAI)', tiPerto.length || tiEstudo.length ? 'atencao' : 'livre', tiPerto.length || tiEstudo.length ? `Fora de terra indígena; ${nomes(tiPerto.concat(tiEstudo))} a ${VA.fmt.km(Math.min(...tiPerto.concat(tiEstudo).map(i => i.distancia_km)))}.` : 'Nenhuma terra indígena sobre a área nem no entorno pesquisado.', ev(tiPerto.concat(tiEstudo)), tiPerto.length || tiEstudo.length ? 'No licenciamento pode ser exigido o componente indígena (consulta à FUNAI).' : '');
    const uc = dentro('cnuc'), ucInt = uc.filter(i => i.integral), ucSust = uc.filter(i => !i.integral), ucPerto = perto('cnuc').filter(i => i.distancia_km <= 3);
    if (semResposta('cnuc')) add('Unidades de conservação', 'sem_dados', `O cadastro de UCs ${comoFalhou('cnuc')}.`, [], 'Confira no CNUC/MMA.');
    else if (ucInt.length) add('Unidades de conservação', 'impede', `Dentro de UC de proteção integral: ${nomes(ucInt)}. Mineração vedada (Lei 9.985/2000).`, ev(ucInt), 'Exclua a parte dentro da UC.');
    else if (ucSust.length) add('Unidades de conservação', 'condiciona', `Dentro de UC de uso sustentável: ${nomes(ucSust)}. Depende do plano de manejo e da anuência do órgão gestor.`, ev(ucSust), 'Leia o plano de manejo (zoneamento) antes de investir.');
    else add('Unidades de conservação', ucPerto.length ? 'atencao' : 'livre', ucPerto.length ? `Fora de UC; ${nomes(ucPerto)} a menos de 3 km (zona de amortecimento).` : 'Nenhuma UC sobre a área nem a menos de 3 km.', ev(ucPerto), ucPerto.length ? 'O licenciamento pede ciência ou autorização do gestor da UC (Res. CONAMA 428/2010).' : '');
    const quil = dentro('anm_quilombo'), quilP = perto('anm_quilombo');
    if (quil.length) add('Territórios quilombolas', 'condiciona', `Sobre ${nomes(quil)}.`, ev(quil), 'Exige consulta prévia, livre e informada (Convenção 169 da OIT) e anuência da comunidade.');
    else if (quilP.length) add('Territórios quilombolas', 'atencao', `${nomes(quilP)} a ${VA.fmt.km(quilP[0].distancia_km)}.`, ev(quilP));
    const ass = dentro('anm_assent');
    if (ass.length) add('Assentamentos de reforma agrária', 'condiciona', `Sobre ${nomes(ass)}.`, ev(ass), 'A pesquisa e a lavra dependem de anuência do INCRA e acordo com os assentados.');

    /* 3. limites e áreas especiais */
    if (dentro('anm_fronteira').length) add('Faixa de fronteira', 'condiciona', 'Dentro da faixa de 150 km da fronteira.', ev(dentro('anm_fronteira')), 'Só empresa com maioria de capital nacional, com assentimento prévio do Conselho de Defesa Nacional (Lei 6.634/1979).');
    const mil = dentro('anm_militar');
    if (mil.length) add('Áreas militares', 'impede', `Sobre ${nomes(mil)}.`, ev(mil), 'Exclua a parte em área militar ou obtenha anuência do Ministério da Defesa.');
    const urb = dentro('anm_urbana');
    if (urb.length) add('Áreas urbanas', 'condiciona', `Sobre ${nomes(urb)}.`, ev(urb), 'Confira a lei de uso e ocupação do solo do município; conflito provável com a lavra.');
    if (dentro('anm_cnen').length) add('Áreas da CNEN', 'condiciona', 'Área sob interesse da Comissão Nacional de Energia Nuclear.', ev(dentro('anm_cnen')), 'Consulte a CNEN.');
    const spu = dentro('spu_marginal').concat(dentro('spu_marinha'));
    if (spu.length) add('Terrenos da União (SPU)', 'condiciona', `Sobre ${nomes(spu)}.`, ev(spu), 'Uso de bem da União exige autorização da SPU.');

    /* 4. ambientais que não impedem o requerimento, mas pesam no licenciamento */
    const emb = dentro('icmbio_embargos');
    if (emb.length) add('Áreas embargadas', 'condiciona', `Embargo sobre a área: ${nomes(emb)}. Atividades vedadas até a regularização.`, ev(emb), 'Levante o motivo do embargo antes de investir.');
    const cav = dentro('canie'), cavP = perto('canie').filter(i => i.distancia_km <= 0.25);
    if (cav.length || cavP.length) add('Cavidades naturais', 'condiciona', `${nomes(cav.concat(cavP))} a menos de 250 m.`, ev(cav.concat(cavP)), 'Raio de 250 m protegido até estudo espeleológico (CONAMA 347/2004).');
    const arq = dentro('iphan');
    if (arq.length) add('Sítios arqueológicos', 'condiciona', `Sobre ${nomes(arq)}.`, ev(arq), 'Exige avaliação de impacto ao patrimônio (IPHAN) no licenciamento.');
    if (R.ana_drenagem && R.ana_drenagem.dados && R.ana_drenagem.dados.provavelAPP) add('APP de curso d’água', 'atencao', 'Curso d’água a menos de 30 m: provável área de preservação permanente.', ev((R.ana_drenagem.itens || []).filter(i => i.incide)), 'Intervenção em APP só com autorização (Lei 12.651/2012).');
    const serv = dentro('dnit_faixa').concat(dentro('sigel_dup'), dentro('sigel_parque'), dentro('sigel_lt'), dentro('epe_lt'));
    if (serv.length) add('Faixas de servidão e domínio', 'atencao', `${nomes(serv)} sobre a área.`, ev(serv), 'Lavra sob linhas, dutos e faixas de rodovia exige anuência do responsável.');

    /* 5. área livre */
    let livre = null, bloqueios = [];
    if (poli) {
      const bloqueiam = [];
      BLOQUEIAM.forEach(id => dentro(id).forEach(i => {
        if (id === 'anm_proc' && i.proprio) return;
        if (id === 'cnuc' && !i.integral) return;
        if (i.feature && i.feature.geometry && /Polygon/.test(i.feature.geometry.type)) bloqueiam.push(Object.assign({ type: 'Feature', properties: { id, titulo: i.titulo, evid: i.evid } }, { geometry: i.feature.geometry }));
      }));
      bloqueios = bloqueiam;
      let resto = { type: 'Feature', properties: {}, geometry: aoi.geometry }, erroRecorte = null;
      try {
        for (const b of bloqueiam) { const d = turf.difference(turf.featureCollection([resto, b])); if (!d) { resto = null; break; } resto = d; }
      } catch (e) { erroRecorte = `falha no recorte geométrico (${e.message || e}) ao descontar ${bloqueiam.length} restrição(ões)`; }
      /* status da área livre: confirmada só se todas as fontes descontadas responderam por inteiro e o recorte não falhou */
      const pendentes = BLOQUEIAM.filter(semResposta);
      const status = erroRecorte ? 'indeterminada' : pendentes.length ? 'potencial' : 'confirmada';
      const haLivre = erroRecorte ? null : resto ? turf.area(resto) / 10000 : 0;
      livre = { feature: erroRecorte ? null : resto, ha: haLivre, fracao: areaHa && haLivre != null ? haLivre / areaHa : null, onerada_ha: haLivre != null ? Math.max(0, areaHa - haLivre) : null,
        status, pendentes: pendentes.map(id => ({ id, nome: R[id] ? R[id].camada.nome : (VA.camada(id) || {}).nome || id, como: comoFalhou(id) })), erro: erroRecorte };
      pendentes.filter(id => !itens.some(i => i.situacao === 'sem_dados' && R[id] && i.criterio.indexOf(R[id].camada.nome.split(' (')[0]) === 0)).forEach(id => {
        if (['anm_proc', 'funai_ti', 'cnuc'].includes(id)) return;   // já têm item próprio
        add(R[id] ? R[id].camada.nome : id, 'sem_dados', `A fonte ${comoFalhou(id)}: as áreas dela não puderam ser descontadas da área livre.`, [], 'Repita a análise; sem isso a área livre não é definitiva.');
      });
      if (erroRecorte) add('Cálculo da área livre', 'sem_dados', `Não foi possível recortar a área: ${erroRecorte}.`, [], 'Simplifique ou corrija a geometria da área e analise de novo.');
    }

    /* 6. limite de área e geometria */
    if (lim.grupo === 'monopolio') add('Substância', 'impede', lim.texto);
    else if (lim.ha && poli) {
      const ref = livre && livre.ha != null ? livre.ha : areaHa;
      add('Limite de área para a substância', ref > lim.ha * 1.0005 ? 'ajuste' : 'livre', `${VA.fmt.ha(ref)} ${livre && livre.ha != null && livre.ha < areaHa ? (livre.status === 'confirmada' ? 'livres' : 'livres pelas fontes que responderam') : 'na área'}; limite de ${VA.fmt.num(lim.ha, 0)} ha. ${lim.texto}`, [], ref > lim.ha ? `Reduza a poligonal para no máximo ${VA.fmt.num(lim.ha, 0)} ha ou divida em requerimentos distintos.` : '');
    } else add('Limite de área para a substância', 'atencao', lim.texto);
    const lados = poli ? VA.ladosForaNSLO(aoi) : null;
    if (lados) add('Lados N-S e L-O verdadeiros', lados.fora ? 'ajuste' : 'livre', lados.fora ? `${lados.fora} de ${lados.total} lado(s) inclinados. A ANM só aceita poligonal com lados nos rumos N-S e L-O verdadeiros, em SIRGAS 2000.` : 'Todos os lados estão nos rumos N-S e L-O.', [], lados.fora ? 'Use a poligonal N-S/L-O sugerida (KML e memorial abaixo) e confira com o técnico responsável.' : '');

    /* poligonal sugerida: sobre a área livre, já respeitando o limite de área quando possível */
    let poligonal = null, poligonalBloqueada = null;
    if (poli && livre && livre.status !== 'confirmada') poligonalBloqueada = livre.status === 'indeterminada' ? 'o recorte da área livre falhou' : `a área livre não foi confirmada (${livre.pendentes.map(x => x.nome).join(', ')})`;
    else if (poli) {
      const base = livre && livre.feature ? livre.feature : aoi;
      try { poligonal = VA.poligonalNSLO(base); } catch (e) { poligonal = null; }
      if (poligonal && lim.ha && poligonal.ha > lim.ha * 1.0005) poligonal.excedeLimite = true;
    }

    /* sem poligonal, as ações não podem mandar usar a "poligonal sugerida" */
    if (poligonalBloqueada) itens.forEach(i => {
      if (!i.acao) return;
      const a0 = i.acao;
      i.acao = i.acao.replace(/\s*\(poligonal sugerida abaixo\)/, '').replace(/Use a poligonal N-S\/L-O sugerida \(KML e memorial abaixo\) e confira com o técnico responsável\./, 'A poligonal N-S/L-O só é gerada quando a área livre for confirmada; depois, confira com o técnico responsável.');
      if (i.acao !== a0 && !/só é gerada/.test(i.acao)) i.acao += ' A poligonal sugerida só é gerada quando todas as fontes do desconto responderem.';
    });
    /* veredito */
    const tem = s => itens.some(i => i.situacao === s);
    /* toda fonte usada no desconto da área livre participa do veredito */
    const chave = BLOQUEIAM.filter(semResposta);
    let classe, texto;
    if (livre && livre.ha != null && livre.ha < Math.min(1, areaHa * 0.02)) { classe = 'impede'; texto = 'Não requerer: não sobra área sem interferência — toda a área está onerada ou em local vedado.'; }
    else if (tem('impede') && !(livre && livre.ha >= 1)) { classe = 'impede'; texto = 'Não requerer: há impedimento sobre a área.'; }
    else if (tem('impede') || tem('ajuste')) { classe = 'ajuste'; texto = `Pode requerer, com ajustes na poligonal${livre && livre.ha != null ? ` — ${VA.fmt.ha(livre.ha)} sem interferência nas bases consultadas (${VA.fmt.num(livre.fracao * 100, 0)}% da área)` : ''}.`; }
    else if (tem('condiciona')) { classe = 'condiciona'; texto = 'Pode requerer, com condicionantes a resolver antes de investir na pesquisa.'; }
    else { classe = 'livre'; texto = 'Pode requerer: nenhum impedimento nas bases consultadas (sujeito à análise de interferência da ANM).'; }
    if (livre && livre.status === 'indeterminada' && classe !== 'impede') { classe = 'inconclusivo'; texto = 'Resultado inconclusivo: o cálculo da área livre falhou. A área apresentada não representa a área livre definitiva.'; }
    else if (chave.length && classe !== 'impede') { classe = 'inconclusivo'; texto = `Resultado inconclusivo: ${chave.map(id => R[id] ? R[id].camada.nome : id).join(', ')} — ${chave.length > 1 ? 'fontes que participam' : 'fonte que participa'} do cálculo da área livre e não ${chave.length > 1 ? 'foram validadas' : 'foi validada'}. A área apresentada não representa a área livre definitiva.`; }
    const ordem = { impede: 0, ajuste: 1, sem_dados: 2, condiciona: 3, atencao: 4, livre: 5 };
    itens.sort((a, b) => ordem[a.situacao] - ordem[b.situacao]);
    return { classe, texto, itens, livre, bloqueios, poligonal, poligonalBloqueada, pendentes: chave, limite: lim, substancia: subst, area_ha: areaHa, amazonia, lados, ponto: !!p.reqPonto, haPedido: p.reqHaUsado || null,
      contagem: Object.fromEntries(Object.keys(SIT).map(k => [k, itens.filter(i => i.situacao === k).length])) };
  };

  /* rótulo único da área livre para painel, relatório e slides: 'potencial' nunca aparece como área definitiva */
  VA.livreInfo = function (Q) {
    const L = Q && Q.livre;
    if (!L) return { ha: null, status: null, rotulo: 'área livre não calculada', curto: 'área livre não calculada', nota: '' };
    const pct = L.fracao != null ? ` (${VA.fmt.num(L.fracao * 100, 0)}%)` : '';
    if (L.status === 'indeterminada' || L.ha == null) return { ha: null, status: 'indeterminada', rotulo: 'área livre não calculada', curto: 'área livre não calculada', nota: L.erro || 'o recorte geométrico falhou' };
    if (L.status === 'potencial') return { ha: L.ha, status: 'potencial', rotulo: `área livre potencial, não definitiva${pct}`, curto: `potencial, não definitiva${pct}`, nota: `ainda falta descontar: ${L.pendentes.map(x => `${x.nome} (${x.como})`).join('; ')}` };
    return { ha: L.ha, status: 'confirmada', rotulo: `sem interferência nas bases${pct}`, curto: `sem interferência nas bases${pct}`, nota: '' };
  };
})();
