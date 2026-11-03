/* VIP ANALYSIS — catálogo de camadas por setor.
   Todas as fontes abaixo foram testadas a partir do navegador do operador em 21–22/10/2026 (análise real em Salgadinho-PB).
   cors:'proxy' = o órgão bloqueia acesso direto do navegador; a consulta usa o servidor local.
   view  = como desenhar no mapa (ags: export dinâmico ArcGIS · wms · img: ImageServer · xyz · overpass · local)
   q     = como consultar (query de camada · identify de serviço · wfs · overpass · local)
   analise = participa da análise da área (raioKm de busca; contexto:true = só informa o valor no local)
   regra = severidade por finalidade quando a área INCIDE ou está PRÓXIMA (alcanceKm), com a base legal. */
'use strict';

(function () {
  const VA = window.VA;
  const ANM = 'https://geo.anm.gov.br/arcgis/rest/services/';
  const SGB = 'https://geoportal.sgb.gov.br/server/rest/services/';
  const SGBI = 'https://geoportal.sgb.gov.br/image/rest/services/';
  const SIGEL = 'https://sigel.aneel.gov.br/arcgis/rest/services/';
  const EPE = 'https://gisepeprd2.epe.gov.br/arcgis/rest/services/';
  const EPEW = EPE + 'SMA/WMS_Webmap_EPE/MapServer';
  const INDE = 'https://geoservicos.inde.gov.br/geoserver/ows';
  const CAR = 'https://geoserver.car.gov.br/geoserver/sicar/ows';
  const FUNAI = 'https://geoserver.funai.gov.br/geoserver/ows';
  const DNIT = 'https://servicos.dnit.gov.br/dnitgeo/geoserver/ows';
  const INPE = 'https://terrabrasilis.dpi.inpe.br/geoserver/ows';
  VA.URL = { ANM, SGB, SGBI, SIGEL, EPE, EPEW, INDE, CAR, FUNAI, DNIT, INPE };

  /* severidade por finalidade: mineração, solar/energia, terra, geral */
  const S = (m, s = m, t = s, g = t) => ({ mineracao: m, solar: s, terra: t, geral: g });

  /* construtores */
  const L = (svc, ids, o = {}) => Object.assign({ view: { tipo: 'ags', url: svc, layers: 'show:' + ids }, q: String(ids).includes(',') ? { tipo: 'identify', url: svc, layers: 'all:' + ids } : { tipo: 'query', url: svc + '/' + ids } }, o);
  const SV = (svc, o = {}) => Object.assign({ view: { tipo: 'ags', url: svc }, q: { tipo: 'identify', url: svc, layers: 'all' } }, o);
  const W = (base, layer, o = {}) => Object.assign({ view: { tipo: 'wms', url: base, layers: layer }, q: { tipo: 'wfs', url: base, typeName: layer } }, o);
  const IMG = (svc, o = {}) => Object.assign({ view: { tipo: 'img', url: svc } }, o);

  VA.SETORES = [
    { id: 'energia', nome: 'Energia e Infraestrutura', cor: '#1665d8' },
    { id: 'mineracao', nome: 'Mineração', cor: '#b7791f' },
    { id: 'fundiario', nome: 'Fundiário', cor: '#2f855a' },
    { id: 'ambiental', nome: 'Ambiental', cor: '#2b8a6e' },
    { id: 'referencia', nome: 'Referência e Território', cor: '#5a6b85' }
  ];

  const C = [];
  const add = (setor, grupo, lista) => lista.forEach(e => C.push(Object.assign({ setor, grupo, cors: 'auto' }, e)));

  /* ============================== ENERGIA E INFRAESTRUTURA ============================== */
  add('energia', 'Transmissão — rede existente', [
    L(SIGEL + 'PORTAL/Transmiss%C3%A3o/MapServer', 1, { id: 'sigel_lt', nome: 'Linhas de transmissão (ONS/ANEEL)', fonte: 'ANEEL — SIGEL', cors: 'proxy', tipoGeom: 'linha', rotulo: ['Name'], analise: { raioKm: 'energia', especial: 'lt' }, regra: { incide: S('atencao', 'atencao', 'atencao', 'informativo'), nota: 'Faixa de servidão de LT: uso restrito sob os cabos; travessia exige anuência da transmissora.' } }),
    L(SIGEL + 'PORTAL/Transmiss%C3%A3o/MapServer', 3, { id: 'sigel_se', nome: 'Subestações (ONS/ANEEL)', fonte: 'ANEEL — SIGEL', cors: 'proxy', tipoGeom: 'ponto', rotulo: ['Name'], analise: { raioKm: 'energia', especial: 'se' } }),
    L(EPEW, 21, { id: 'epe_lt', nome: 'Linhas de transmissão existentes (EPE)', fonte: 'EPE — Webmap', tipoGeom: 'linha', rotulo: ['Nome', 'Tensao'], analise: { raioKm: 'energia', especial: 'lt' } }),
    L(EPEW, 20, { id: 'epe_se', nome: 'Subestações existentes (EPE)', fonte: 'EPE — Webmap', tipoGeom: 'ponto', rotulo: ['Nome', 'Tensao'], analise: { raioKm: 'energia', especial: 'se' } })
  ]);
  add('energia', 'Transmissão — expansão planejada', [
    L(EPEW, 10, { id: 'epe_lt_plan', nome: 'Linhas de transmissão planejadas (EPE)', fonte: 'EPE — Webmap', tipoGeom: 'linha', rotulo: ['Nome', 'Tensao', 'Ano_Planej'], analise: { raioKm: 'energia', especial: 'lt_plan' } }),
    L(EPEW, 9, { id: 'epe_se_plan', nome: 'Subestações planejadas (EPE)', fonte: 'EPE — Webmap', tipoGeom: 'ponto', rotulo: ['Nome', 'Tensao', 'Ano_Opera'], analise: { raioKm: 'energia', especial: 'se_plan' } }),
    SV(SIGEL + 'DadosAbertos/DUP/MapServer', { id: 'sigel_dup', nome: 'Áreas com declaração de utilidade pública — DUP (ANEEL)', fonte: 'ANEEL — SIGEL', cors: 'proxy', analise: { raioKm: 0.5 }, regra: { incide: S('alerta'), nota: 'Área declarada de utilidade pública para servidão ou desapropriação de empreendimento elétrico.' } }),
    L(SIGEL + 'BDIT/Feature_ADS_Area_Desenvolvimento_Subestacao/MapServer', 0, { id: 'sigel_ads', nome: 'Áreas de desenvolvimento de subestação (ANEEL)', fonte: 'ANEEL — SIGEL', cors: 'proxy', analise: { raioKm: 1 }, regra: { incide: S('atencao'), nota: 'Área reservada ao desenvolvimento de subestação.' } })
  ]);
  add('energia', 'Distribuição — média e baixa tensão', [
    { id: 'bdgd_mt', nome: 'Rede de média tensão — alimentadores (BDGD/ANEEL)', fonte: 'ANEEL — BDGD da distribuidora (servidor local)', view: { tipo: 'bdgd', camada: 'ssdmt' }, q: { tipo: 'bdgd', camada: 'ssdmt' }, tipoGeom: 'linha', minZoom: 12, analise: { raioKm: 5, especial: 'bdgd_mt', max: 6000 }, regra: { incide: S('atencao', 'informativo', 'atencao', 'informativo'), nota: 'Rede de distribuição cruza a área: respeitar as distâncias de segurança da norma da distribuidora; o remanejamento da rede é pedido à distribuidora e, em regra, custeado pelo interessado.' } },
    { id: 'bdgd_sub', nome: 'Subestações de distribuição (BDGD/ANEEL)', fonte: 'ANEEL — BDGD da distribuidora (servidor local)', view: { tipo: 'bdgd', camada: 'sub' }, q: { tipo: 'bdgd', camada: 'sub' }, minZoom: 9, rotulo: ['NOME'], analise: { raioKm: 25, especial: 'bdgd_sub' } },
    { id: 'bdgd_trafo', nome: 'Transformadores de média tensão (BDGD/ANEEL)', fonte: 'ANEEL — BDGD da distribuidora (servidor local)', view: { tipo: 'bdgd', camada: 'untrmt' }, q: { tipo: 'bdgd', camada: 'untrmt' }, tipoGeom: 'ponto', minZoom: 14, analise: { raioKm: 1, especial: 'bdgd_trafo', max: 3000 } },
    { id: 'osm_rede', nome: 'Redes elétricas mapeadas — inclui média tensão (OpenStreetMap)', fonte: 'OpenStreetMap (colaborativo)', view: { tipo: 'overpass' }, q: { tipo: 'overpass' }, tipoGeom: 'linha', minZoom: 12, analise: { raioKm: 3, especial: 'osm', opcional: 'osm' } },
    L(SIGEL + 'PORTAL/Distribui%C3%A7%C3%A3o/MapServer', 1, { id: 'sigel_dist', nome: 'Área de atuação das distribuidoras (ANEEL)', fonte: 'ANEEL — SIGEL', cors: 'proxy', analise: { contexto: true, especial: 'distribuidora' } }),
    L(SIGEL + 'Geracao_distribuida/GD_Sigel/MapServer', 0, { id: 'sigel_gd', nome: 'Geração distribuída — unidades conectadas (ANEEL)', fonte: 'ANEEL — SIGEL', cors: 'proxy', tipoGeom: 'ponto', minZoom: 11, rotulo: ['NomAgente', 'DscModalidade'], analise: { raioKm: 2, contagem: true } })
  ]);
  add('energia', 'Usinas existentes', [
    L(SIGEL + 'PORTAL/UFV/MapServer', 0, { id: 'sigel_ufv', nome: 'Usinas fotovoltaicas (ANEEL)', fonte: 'ANEEL — SIGEL', cors: 'proxy', tipoGeom: 'ponto', rotulo: ['NOME', 'POT_KW'], analise: { raioKm: 'energia', especial: 'ufv' } }),
    L(SIGEL + 'PORTAL/UFV/MapServer', 2, { id: 'sigel_parque', nome: 'Parques solares — polígonos (ANEEL)', fonte: 'ANEEL — SIGEL', cors: 'proxy', rotulo: ['NOME', 'POT_MW', 'FASE'], analise: { raioKm: 2 }, regra: { incide: S('alerta'), nota: 'Área ocupada por parque solar outorgado.' } }),
    L(SIGEL + 'PORTAL/UFV/MapServer', 1, { id: 'sigel_ufv_lt', nome: 'LT de interesse restrito de usinas (ANEEL)', fonte: 'ANEEL — SIGEL', cors: 'proxy', tipoGeom: 'linha', rotulo: ['NOME_RESP', 'TENSAO_KV'], analise: { raioKm: 'energia', especial: 'lt' } }),
    L(SIGEL + 'PORTAL/UFV/MapServer', 4, { id: 'sigel_ufv_se', nome: 'Subestações de usinas solares (ANEEL)', fonte: 'ANEEL — SIGEL', cors: 'proxy', rotulo: ['NOME_RESP', 'REL_TENSAO', 'POT_MVA'], analise: { raioKm: 'energia', especial: 'se' } }),
    L(SIGEL + 'PORTAL/Parques_E%C3%B3licos/MapServer', '2,3,4,5', { id: 'sigel_eol', nome: 'Parques eólicos (ANEEL)', fonte: 'ANEEL — SIGEL', cors: 'proxy', tipoGeom: 'ponto', analise: { raioKm: 'energia' } }),
    L(SIGEL + 'PORTAL/Parques_E%C3%B3licos/MapServer', 0, { id: 'sigel_aerog', nome: 'Aerogeradores (ANEEL)', fonte: 'ANEEL — SIGEL', cors: 'proxy', tipoGeom: 'ponto', minZoom: 10 }),
    L(SIGEL + 'PORTAL/Camadas/MapServer', '1,3,5', { id: 'sigel_hidro', nome: 'Hidrelétricas UHE, PCH e CGH (ANEEL)', fonte: 'ANEEL — SIGEL', cors: 'proxy', tipoGeom: 'ponto', analise: { raioKm: 'energia' } }),
    L(SIGEL + 'PORTAL/Camadas/MapServer', 2, { id: 'sigel_ute', nome: 'Termelétricas (ANEEL)', fonte: 'ANEEL — SIGEL', cors: 'proxy', tipoGeom: 'ponto', analise: { raioKm: 'energia' } }),
    L(EPEW, '12,13,14,15,16,17,18,19', { id: 'epe_usinas', nome: 'Usinas em operação — todas as fontes (EPE)', fonte: 'EPE — Webmap', tipoGeom: 'ponto', analise: { raioKm: 'energia' } })
  ]);
  add('energia', 'Usinas planejadas', [
    L(EPEW, '1,2,3,4,5,6,7,8', { id: 'epe_usinas_plan', nome: 'Usinas planejadas — leilões e expansão (EPE)', fonte: 'EPE — Webmap', tipoGeom: 'ponto', analise: { raioKm: 'energia' } })
  ]);
  add('energia', 'Recurso solar e eólico', [
    L(EPEW, 107, { id: 'epe_ghi', nome: 'Irradiação global horizontal — média anual (INPE/EPE)', fonte: 'INPE — Atlas Solar (EPE)', analise: { contexto: true, especial: 'irradiacao' } }),
    L(EPEW, 109, { id: 'epe_incl', nome: 'Irradiação no plano inclinado — média anual (INPE/EPE)', fonte: 'INPE — Atlas Solar (EPE)', analise: { contexto: true, especial: 'irradiacao' } }),
    L(EPEW, 108, { id: 'epe_dni', nome: 'Irradiação direta normal — média anual (INPE/EPE)', fonte: 'INPE — Atlas Solar (EPE)' }),
    L(EPEW, 103, { id: 'epe_vento100', nome: 'Velocidade do vento a 100 m (Global Wind Atlas/EPE)', fonte: 'EPE — Webmap', q: null }),
    L(EPEW, 104, { id: 'epe_vento150', nome: 'Velocidade do vento a 150 m (Global Wind Atlas/EPE)', fonte: 'EPE — Webmap', q: null }),
    SV(SIGEL + 'PORTAL/Incid%C3%AAncia_solar_no_Brasil/MapServer', { id: 'sigel_solar', nome: 'Incidência solar no Brasil (ANEEL)', fonte: 'ANEEL — SIGEL', cors: 'proxy', q: null })
  ]);
  add('energia', 'Gás, combustíveis e dutos', [
    L(EPEW, '55,56,57', { id: 'epe_gas', nome: 'Gasodutos de transporte, distribuição e escoamento (EPE)', fonte: 'EPE — Webmap', tipoGeom: 'linha', analise: { raioKm: 'energia' }, regra: { incide: S('alerta'), nota: 'Faixa de servidão de duto: restrição de escavação e uso.' } }),
    L(EPEW, 54, { id: 'epe_citygate', nome: 'Pontos de entrega de gás — city gates (EPE)', fonte: 'EPE — Webmap', tipoGeom: 'ponto', analise: { raioKm: 'energia' } }),
    L(ANM + 'SIGMINE/concessoes_comunicacao/MapServer', 3, { id: 'anm_oleodutos', nome: 'Oleodutos (ANM)', fonte: 'ANM — SIGMINE', tipoGeom: 'linha', analise: { raioKm: 1 }, regra: { incide: S('alerta'), nota: 'Faixa de servidão de duto.' } }),
    L(EPEW, '27,28,29', { id: 'epe_bio', nome: 'Usinas de etanol, biodiesel e biometano (EPE)', fonte: 'EPE — Webmap', tipoGeom: 'ponto' }),
    L(EPEW, 31, { id: 'epe_bases', nome: 'Bases de distribuição de combustíveis (EPE)', fonte: 'EPE — Webmap', tipoGeom: 'ponto' })
  ]);
  add('energia', 'Transportes e logística', [
    W(DNIT, 'vgeo:vw_snv_rod', { id: 'dnit_snv', nome: 'Rodovias federais — SNV (DNIT)', fonte: 'DNIT', tipoGeom: 'linha', rotulo: ['Codigo_BR', 'Nome_Tipo_Trecho', 'Superficie_Federal'], analise: { raioKm: 15, especial: 'acesso', max: 300 } }),
    L(ANM + 'SIGMINE/transportes/MapServer', 1, { id: 'anm_rodovias', nome: 'Rodovias (base ANM/IBGE)', fonte: 'ANM — SIGMINE', tipoGeom: 'linha', rotulo: ['NMRodovia'], analise: { raioKm: 'energia', especial: 'acesso' } }),
    W(DNIT, 'vgeo:vw_faixa_dominio', { id: 'dnit_faixa', nome: 'Faixa de domínio de rodovias (DNIT)', fonte: 'DNIT', analise: { raioKm: 0.2 }, regra: { incide: S('alerta'), nota: 'Faixa de domínio e área non aedificandi de rodovia (Lei 6.766/1979, art. 4º, III-A).' } }),
    L(ANM + 'SIGMINE/transportes/MapServer', 2, { id: 'anm_ferrovias', nome: 'Ferrovias', fonte: 'ANM — SIGMINE', tipoGeom: 'linha', analise: { raioKm: 'energia' } }),
    L(ANM + 'SIGMINE/transportes/MapServer', 0, { id: 'anm_portos', nome: 'Portos', fonte: 'ANM — SIGMINE', tipoGeom: 'ponto' }),
    W(DNIT, 'vgeo:vw_aerodromos', { id: 'dnit_aero', nome: 'Aeródromos', fonte: 'DNIT/ANAC', tipoGeom: 'ponto', analise: { raioKm: 10 } }),
    W(DNIT, 'vgeo:vw_dutovias', { id: 'dnit_dutos', nome: 'Dutovias', fonte: 'DNIT', tipoGeom: 'linha' })
  ]);

  /* ===================================== MINERAÇÃO ===================================== */
  add('mineracao', 'Direitos minerários (ANM)', [
    L(ANM + 'SIGMINE/dados_anm/MapServer', 0, { id: 'anm_proc', nome: 'Processos minerários ativos (SIGMINE)', fonte: 'ANM — SIGMINE (diário)', padrao: true, ufCampo: 'UF', rotulo: ['PROCESSO', 'FASE', 'SUBS', 'NOME'], analise: { raioKm: 'anm', especial: 'anm', max: 2000 } }),
    L(ANM + 'SIGMINE/dados_anm/MapServer', 1, { id: 'anm_fonte', nome: 'Áreas de proteção de fonte', fonte: 'ANM — SIGMINE', analise: { raioKm: 0.1 }, regra: { incide: S('alerta', 'atencao', 'atencao', 'atencao'), nota: 'Perímetro de proteção de fonte de água mineral (Código de Águas Minerais).' } }),
    L(ANM + 'SIGMINE/dados_anm/MapServer', 2, { id: 'anm_arrend', nome: 'Arrendamentos', fonte: 'ANM — SIGMINE', analise: { raioKm: 0.1 }, regra: { incide: S('informativo'), nota: 'Direito minerário arrendado a terceiro.' } }),
    L(ANM + 'SIGMINE/dados_anm/MapServer', 3, { id: 'anm_bloq', nome: 'Áreas de bloqueio', fonte: 'ANM — SIGMINE', rotulo: ['NMBloqueio', 'NMInstituicao'], analise: { raioKm: 0.1 }, regra: { incide: S('impeditivo', 'informativo', 'informativo', 'informativo'), nota: 'Bloqueio restringe a outorga de títulos minerários (normalmente em favor de empreendimento de utilidade pública).' } }),
    L(ANM + 'SIGMINE/dados_anm/MapServer', 4, { id: 'anm_garimp', nome: 'Reservas garimpeiras', fonte: 'ANM — SIGMINE', rotulo: ['NMReservaGarimpeira'], analise: { raioKm: 0.1 }, regra: { incide: S('atencao', 'informativo', 'informativo', 'informativo'), nota: 'Área sob regime de permissão de lavra garimpeira (Lei 7.805/1989).' } }),
    L(ANM + 'Producao/Estoque_%C3%81reas_Disponibilidade/MapServer', 0, { id: 'anm_estoque', nome: 'Áreas em disponibilidade — estoque (ANM)', fonte: 'ANM — Produção', rotulo: ['PROCESSO', 'Descr_Even'], analise: { raioKm: 1 }, regra: { incide: S('oportunidade', 'informativo', 'informativo', 'informativo'), nota: 'Área devolvida à ANM e ofertada em procedimento de disponibilidade.' } }),
    L(ANM + 'Producao/%C3%81reas_Disponibilidade___Resultado/MapServer', 0, { id: 'anm_disp_res', nome: 'Disponibilidade — resultado das ofertas (ANM)', fonte: 'ANM — Produção', rotulo: ['PROCESSO', 'Regime'], analise: { raioKm: 1 }, regra: { incide: S('informativo') } }),
    L(ANM + 'Producao/Processos_Miner%C3%A1rios_Inativos/MapServer', 0, { id: 'anm_inativos', nome: 'Processos minerários inativos — histórico (ANM)', fonte: 'ANM — Produção', rotulo: ['PROCESSO'], minZoom: 9, analise: { raioKm: 0.1, contagem: true } }),
    L(ANM + 'Producao/Barragens_Dashboard_Publico/MapServer', 0, { id: 'anm_barragens', nome: 'Barragens de mineração (ANM)', fonte: 'ANM — SIGBM', tipoGeom: 'ponto', rotulo: ['NMBarragem', 'NMMinerador', 'DSCategoriaRisco'], analise: { raioKm: 10 }, regra: { proximo: S('atencao', 'atencao', 'atencao', 'informativo'), alcanceKm: 10, nota: 'Barragem de mineração a montante pode gerar mancha de inundação (PNSB, Lei 12.334/2010).' } }),
    SV(ANM + 'Producao/Empreendimentos/MapServer', { id: 'anm_empreend', nome: 'Empreendimentos minerários — minas, usinas, pilhas (ANM)', fonte: 'ANM — RAL', rotulo: ['_camada', 'Substancia', 'Processos'], analise: { raioKm: 5 } }),
    SV(ANM + 'PEM_Minas_MinCriticos2025_v1/MapServer', { id: 'anm_mincrit', nome: 'Minas de minerais críticos e estratégicos (ANM 2025)', fonte: 'ANM — PEM', tipoGeom: 'ponto', rotulo: ['SUBSTANCIA', 'NOME', 'MUNICIPIO'], analise: { raioKm: 20 } }),
    SV(ANM + 'PEM_Ocorremincriticos1/MapServer', { id: 'anm_ocrit', nome: 'Ocorrências de minerais críticos (ANM)', fonte: 'ANM — PEM', tipoGeom: 'ponto', rotulo: ['SUBSTANCIA', 'ROCHAS_HOS', 'MUNICIPIO'], analise: { raioKm: 10 } })
  ]);
  add('mineracao', 'Recursos minerais (SGB)', [
    L(SGB + 'geologia/ocorrencias/MapServer', 0, { id: 'sgb_ocorr', nome: 'Ocorrências minerais — GEOBANK (SGB)', fonte: 'SGB — GEOBANK', padrao: true, tipoGeom: 'ponto', rotulo: ['SUBSTANCIAS', 'TOPONIMIA', 'STATUS_ECONOMICO'], analise: { raioKm: 'ocorrencias', especial: 'ocorrencias', max: 2000 } }),
    { id: 'sgb_recmin', nome: 'Depósitos com recurso — PDAC 2026 (SGB)', fonte: 'SGB — Recursos Minerais do Brasil', view: { tipo: 'ags', url: SGB + 'pdac/pdac_2023_mineral_resources/MapServer' }, q: { tipo: 'query', url: SGB + 'Hosted/RecMin_PDAC_2026/FeatureServer/0' }, tipoGeom: 'ponto', rotulo: ['name', 'commodities', 'class_dp'], analise: { raioKm: 50 } },
    SV(SGB + 'Prov%C3%ADncias_e_Distritos_Aur%C3%ADferos_do_Brasil/MapServer', { id: 'sgb_ouro', nome: 'Províncias e distritos auríferos (SGB)', fonte: 'SGB', analise: { contexto: true } }),
    SV(SGB + 'geologia/diamante_brasil/MapServer', { id: 'sgb_diamante', nome: 'Diamante no Brasil (SGB)', fonte: 'SGB' }),
    SV(SGB + 'sigs_especiais/litio/MapServer', { id: 'sgb_litio', nome: 'Lítio — projeto especial (SGB)', fonte: 'SGB' }),
    SV(SGB + 'geologia/furos_sondagem/MapServer', { id: 'sgb_furos', nome: 'Furos de sondagem (SGB)', fonte: 'SGB', tipoGeom: 'ponto', analise: { raioKm: 10, contagem: true } })
  ]);
  add('mineracao', 'Geologia (SGB)', [
    SV(SGB + 'geologia/litoestratigrafia_100000/MapServer', { id: 'sgb_geo100', nome: 'Litoestratigrafia 1:100.000', fonte: 'SGB', analise: { contexto: true, especial: 'geologia' } }),
    SV(SGB + 'geologia/litoestratigrafia_25000/MapServer', { id: 'sgb_geo25', nome: 'Litoestratigrafia 1:25.000', fonte: 'SGB' }),
    SV(SGB + 'geologia/litoestratigrafia_50000/MapServer', { id: 'sgb_geo50', nome: 'Litoestratigrafia 1:50.000', fonte: 'SGB' }),
    SV(SGB + 'geologia/litoestratigrafia_150000/MapServer', { precisaoKm: 0.15, id: 'sgb_geo150', nome: 'Litoestratigrafia 1:150.000', fonte: 'SGB' }),
    SV(SGB + 'geologia/litoestratigrafia_250000/MapServer', { precisaoKm: 0.25, id: 'sgb_geo250', nome: 'Litoestratigrafia 1:250.000', fonte: 'SGB' }),
    SV(SGB + 'geologia/litoestratigrafia_estados/MapServer', { id: 'sgb_geoUF', nome: 'Mapas geológicos estaduais', fonte: 'SGB' }),
    SV(SGB + 'geologia/litoestratigrafia_1000000/MapServer', { precisaoKm: 1, id: 'sgb_geo1m', nome: 'Litoestratigrafia 1:1.000.000', fonte: 'SGB' }),
    SV(SGB + 'geologia/Estruturas_GIS_Brasil_2004/MapServer', { precisaoKm: 1, id: 'sgb_estr', nome: 'Estruturas — falhas, zonas de cisalhamento, lineamentos', fonte: 'SGB', tipoGeom: 'linha', rotulo: ['NMESTRUTUR', 'TIPO_ESTRU'], analise: { raioKm: 5 } }),
    SV(SGB + 'geologia/afloramentos/MapServer', { id: 'sgb_aflor', nome: 'Afloramentos descritos (GEOBANK)', fonte: 'SGB — GEOBANK', tipoGeom: 'ponto', rotulo: ['Toponímia', 'Município'], minZoom: 9, analise: { raioKm: 3, contagem: true } }),
    SV(SGB + 'geologia/geocronologia/MapServer', { id: 'sgb_geocron', nome: 'Geocronologia', fonte: 'SGB', tipoGeom: 'ponto' }),
    SV(SGB + 'geologia/petrografia/MapServer', { id: 'sgb_petro', nome: 'Petrografia', fonte: 'SGB', tipoGeom: 'ponto' }),
    SV(SGB + 'geologia/paleo/MapServer', { id: 'sgb_paleo', nome: 'Paleontologia (SGB)', fonte: 'SGB', tipoGeom: 'ponto' }),
    SV(SGB + 'sigs_especiais/tecams/MapServer', { precisaoKm: 5, id: 'sgb_tecams', nome: 'Mapa tectônico da América do Sul', fonte: 'SGB/CGMW' }),
    SV(SGB + 'geologia/bacias_sedimentares/MapServer', { precisaoKm: 1, id: 'sgb_bacias', nome: 'Bacias sedimentares', fonte: 'SGB' }),
    SV(SGB + 'gestaoterritorial/geodiversidade_1000000/MapServer', { precisaoKm: 1, id: 'sgb_geodiv', nome: 'Geodiversidade 1:1.000.000', fonte: 'SGB', rotulo: ['SIGLA_UNID', 'NOME_UNIDA', 'COD_UNIGEO'], analise: { contexto: true } })
  ]);
  add('mineracao', 'Geoquímica (SGB)', [
    SV(SGB + 'geologia/geoq_externa/MapServer', { id: 'sgb_geoq', nome: 'Sedimentos de corrente e concentrados de bateia', fonte: 'SGB', tipoGeom: 'ponto', minZoom: 8 }),
    SV(SGB + 'geoquimica/geoquimica_integrada/MapServer', { id: 'sgb_geoq_int', nome: 'Geoquímica integrada', fonte: 'SGB', tipoGeom: 'ponto', minZoom: 8 }),
    SV(SGB + 'gestaoterritorial/geoquimica_baixa_densidade/MapServer', { id: 'sgb_geoq_bd', nome: 'Geoquímica de baixa densidade', fonte: 'SGB' })
  ]);
  const GEOF = [['geofisica_mag', 'Campo magnético anômalo'], ['geofisica_sinal', 'Amplitude do sinal analítico'], ['geofisica_1dv', 'Primeira derivada vertical'], ['geofisica_kperc', 'Potássio (K)'], ['geofisica_eth', 'Tório equivalente (eTh)'], ['geofisica_eu', 'Urânio equivalente (eU)'], ['geofisica_thk', 'Razão Th/K'], ['geofisica_ct', 'Contagem total (gama)'], ['geofisica_ternario', 'Ternário K–eTh–eU'], ['geofisica_anomalia_bouguer_brasil', 'Anomalia Bouguer']];
  add('mineracao', 'Geofísica (SGB)', GEOF.map(([svc, nome]) => IMG(SGBI + svc + '/ImageServer', { id: 'gf_' + svc.replace('geofisica_', ''), nome, fonte: 'SGB — aerogeofísica' })).concat([
    SV(SGB + 'geofisica/aerogeofisica/MapServer', { id: 'sgb_aerolev', nome: 'Projetos aerogeofísicos (cobertura)', fonte: 'SGB', rotulo: ['Projeto', 'Método(s) geofísico(s)'], analise: { contexto: true, especial: 'aerolev' } }),
    SV(SGB + 'geofisica/gravimetria/MapServer', { id: 'sgb_grav', nome: 'Estações gravimétricas', fonte: 'SGB', tipoGeom: 'ponto', minZoom: 8 }),
    SV(SGB + 'Cartas_de_Anomalia/MapServer', { id: 'sgb_cartas', nome: 'Cartas de anomalia', fonte: 'SGB' }),
    SV(SGB + 'geofisica/sismos/MapServer', { id: 'sgb_sismos', nome: 'Sismos (SGB)', fonte: 'SGB', tipoGeom: 'ponto' })
  ]));

  /* ===================================== FUNDIÁRIO ===================================== */
  add('fundiario', 'Imóveis rurais', [
    W(CAR, 'sicar:sicar_imoveis_{uf}', { id: 'car', nome: 'CAR — imóveis rurais (SICAR), por UF', fonte: 'SFB — SICAR', uf: true, padrao: false, rotulo: ['cod_imovel', 'status_imovel', 'condicao'], analise: { raioKm: 0.05, especial: 'car', max: 300 } }),
    { id: 'sigef', nome: 'SIGEF — parcelas certificadas (base da UF no servidor local)', fonte: 'INCRA — SIGEF', uf: true, view: { tipo: 'local', fonte: 'sigef' }, q: { tipo: 'local', fonte: 'sigef' }, minZoom: 11, rotulo: ['nome_area', 'registro_m', 'situacao_i'], analise: { raioKm: 0.05, especial: 'sigef' } },
    { id: 'snci', nome: 'SNCI — imóveis certificados até 2013 (base da UF no servidor local)', fonte: 'INCRA — SNCI', uf: true, view: { tipo: 'local', fonte: 'snci' }, q: { tipo: 'local', fonte: 'snci' }, minZoom: 11, analise: { raioKm: 0.05, especial: 'sigef' } },
    L(ANM + 'SIGMINE/planejamento_cadastro/MapServer', 1, { id: 'anm_certpub', nome: 'Imóveis certificados públicos (INCRA)', fonte: 'INCRA via ANM', rotulo: ['NMImovelCertificado', 'NRCertificacao'], analise: { raioKm: 0.05 }, regra: { incide: S('alerta', 'alerta', 'impeditivo', 'alerta'), nota: 'Imóvel público certificado: não pode ser adquirido de particular.' } })
  ]);
  add('fundiario', 'Áreas de regime especial', [
    L(ANM + 'SIGMINE/planejamento_cadastro/MapServer', 0, { id: 'anm_assent', nome: 'Assentamentos de reforma agrária (INCRA)', fonte: 'INCRA via ANM', rotulo: ['NMAssentamento', 'DSSituacao'], analise: { raioKm: 3 }, regra: { incide: S('alerta', 'alerta', 'impeditivo', 'alerta'), nota: 'Lotes de reforma agrária são inegociáveis por 10 anos (CF, art. 189); uso por terceiros depende do INCRA.' } }),
    L(ANM + 'SIGMINE/sociedade_cultura/MapServer', 3, { id: 'anm_quilombo', nome: 'Territórios quilombolas (INCRA)', fonte: 'INCRA via ANM', rotulo: ['NMTerritorioQuilombola', 'DSProcesso'], analise: { raioKm: 10 }, regra: { incide: S('alerta', 'alerta', 'impeditivo', 'alerta'), proximo: S('atencao', 'atencao', 'informativo', 'informativo'), alcanceKm: 5, nota: 'Título coletivo e inalienável (ADCT, art. 68; Decreto 4.887/2003); consulta prévia às comunidades (Convenção OIT 169).' } }),
    W(FUNAI, 'Funai:tis_poligonais', { id: 'funai_ti', nome: 'Terras indígenas (FUNAI)', fonte: 'FUNAI', rotulo: ['terrai_nome', 'fase_ti', 'etnia_nome'], analise: { raioKm: 10 }, regra: { incide: S('impeditivo'), proximo: S('atencao', 'atencao', 'informativo', 'informativo'), alcanceKm: 10, nota: 'Pesquisa e lavra em TI dependem de autorização do Congresso Nacional (CF, art. 231, §3º); proximidade pode exigir componente indígena no licenciamento (Portaria Interministerial 60/2015).' } }),
    W(FUNAI, 'Funai:tis_pontos', { id: 'funai_ti_pt', nome: 'Terras indígenas em estudo — pontos (FUNAI)', fonte: 'FUNAI', tipoGeom: 'ponto', analise: { raioKm: 10 }, regra: { proximo: S('atencao'), alcanceKm: 10, nota: 'Terra indígena em fase de estudo: limites ainda não definidos.' } }),
    W(FUNAI, 'Funai:aldeias_pontos', { id: 'funai_aldeias', nome: 'Aldeias indígenas (FUNAI)', fonte: 'FUNAI', tipoGeom: 'ponto', analise: { raioKm: 10 } }),
    W(INDE, 'SPU:vw_app_trecho_terreno_marginal_a_05102026', { id: 'spu_marginal', nome: 'Terrenos marginais de rios federais (SPU)', fonte: 'SPU via INDE', analise: { raioKm: 0.1 }, regra: { incide: S('alerta'), nota: 'Bem da União (CF, art. 20): uso depende de cessão/autorização da SPU.' } }),
    W(INDE, 'SPU:vw_app_espelho_dagua_federal_a_05102026', { id: 'spu_espelho', nome: 'Espelhos d’água federais (SPU)', fonte: 'SPU via INDE' }),
    W(INDE, 'SPU:vw_app_trecho_terreno_marinha_a_05102026', { id: 'spu_marinha', nome: 'Terrenos de marinha (SPU)', fonte: 'SPU via INDE', analise: { raioKm: 0.1 }, regra: { incide: S('alerta'), nota: 'Terreno de marinha: domínio da União (regime de ocupação/aforamento).' } })
  ]);
  add('fundiario', 'Limites e áreas de uso restrito', [
    L(ANM + 'SIGMINE/estrutura_territorial/MapServer', 3, { id: 'anm_fronteira', nome: 'Faixa de fronteira (150 km)', fonte: 'IBGE via ANM', analise: { raioKm: 0.1 }, regra: { incide: S('alerta', 'atencao', 'alerta', 'informativo'), nota: 'Lei 6.634/1979: pesquisa/lavra e aquisição de imóvel rural por estrangeiro exigem assentimento prévio do Conselho de Defesa Nacional.' } }),
    L(ANM + 'SIGMINE/informacao_militar/MapServer', 0, { id: 'anm_militar', nome: 'Áreas militares', fonte: 'Defesa via ANM', rotulo: ['NMAreaMilitar'], analise: { raioKm: 2 }, regra: { incide: S('impeditivo', 'impeditivo', 'impeditivo', 'alerta'), nota: 'Área sob administração militar.' } }),
    L(ANM + 'SIGMINE/sociedade_cultura/MapServer', 0, { id: 'anm_urbana', nome: 'Áreas urbanas (IBGE)', fonte: 'IBGE via ANM', rotulo: ['NMAreaUrbana', 'DSTipo'], analise: { raioKm: 2 }, regra: { incide: S('alerta', 'atencao', 'informativo', 'informativo'), proximo: S('atencao', 'informativo', 'informativo', 'informativo'), alcanceKm: 1, nota: 'Uso condicionado ao plano diretor e ao zoneamento municipal.' } }),
    L(ANM + 'SIGMINE/geociencias/MapServer', 1, { id: 'anm_cnen', nome: 'Áreas da CNEN', fonte: 'CNEN via ANM', analise: { raioKm: 1 }, regra: { incide: S('alerta', 'informativo', 'informativo', 'informativo'), nota: 'Área de interesse nuclear (CNEN).' } }),
    L(ANM + 'SIGMINE/estrutura_territorial/MapServer', 0, { id: 'anm_amazonia', nome: 'Amazônia Legal', fonte: 'IBGE via ANM', analise: { contexto: true } })
  ]);

  /* ===================================== AMBIENTAL ===================================== */
  add('ambiental', 'Áreas protegidas', [
    W(INDE, 'MMA:cnuc_2026_03', { id: 'cnuc', nome: 'Unidades de conservação — todas as esferas e RPPN (CNUC/MMA, mar/2026)', fonte: 'MMA — CNUC via INDE', padrao: true, rotulo: ['nome_uc', 'categoria', 'esfera'], analise: { raioKm: 'ambiental', especial: 'uc' } }),
    W(INDE, 'ICMBio:limiteucsfederais_a', { id: 'icmbio_ucfed', nome: 'UCs federais — limites oficiais (ICMBio)', fonte: 'ICMBio via INDE' }),
    L(EPEW, 94, { id: 'epe_aves', nome: 'Áreas de concentração de aves migratórias (ICMBio)', fonte: 'ICMBio via EPE', analise: { raioKm: 1 }, regra: { incide: S('atencao'), nota: 'Área sensível para aves migratórias (relevante para LTs e eólicas).' } }),
    W(INDE, 'ICMBio:pan_icmbio_areas_estrat_052024_a', { id: 'icmbio_pan', nome: 'Áreas estratégicas dos PAN — espécies ameaçadas (ICMBio)', fonte: 'ICMBio via INDE', rotulo: ['pan', 'nmarea'], analise: { raioKm: 0.1 }, regra: { incide: S('atencao'), nota: 'Área estratégica de Plano de Ação Nacional para espécies ameaçadas.' } })
  ]);
  const PRIOR = [['caatinga_2a_atualizacao', 'Caatinga'], ['cerrado_pantanal_2a_atualizacao', 'Cerrado e Pantanal'], ['mataatlantica_2a_atualiz', 'Mata Atlântica'], ['amazonia_2a_atualizacao', 'Amazônia'], ['pampa_2a_atualizacao', 'Pampa'], ['zcm_2a_atualiz', 'Zona costeira e marinha']];
  add('ambiental', 'Áreas prioritárias para a biodiversidade (2ª atualização)', PRIOR.map(([t, n]) => W(INDE, 'ICMBio:' + t, { id: 'prior_' + t.split('_')[0], nome: 'Áreas prioritárias — ' + n, fonte: 'MMA/ICMBio via INDE', rotulo: ['nome_area', 'import_bio', 'prior_acao'], analise: { raioKm: 0.1, especial: 'prioritaria' }, regra: { incide: S('atencao', 'atencao', 'informativo', 'informativo'), nota: 'Área prioritária para conservação (Portaria MMA 463/2018): pode gerar condicionantes no licenciamento.' } })));
  add('ambiental', 'Patrimônio espeleológico, arqueológico e paleontológico', [
    W(INDE, 'ICMBio:canie_052026_p', { id: 'canie', nome: 'Cavernas — CANIE (ICMBio/CECAV, mai/2026)', fonte: 'ICMBio/CECAV via INDE', padrao: true, tipoGeom: 'ponto', rotulo: ['nome', 'municipio', 'nvl_valida'], analise: { raioKm: 5, especial: 'caverna' }, regra: { incide: S('alerta', 'alerta', 'atencao', 'atencao'), proximo: S('atencao', 'informativo', 'informativo', 'informativo'), alcanceKm: 1, bufferM: 250, nota: 'Área de influência de cavidade: projeção horizontal + 250 m até estudo específico (Res. CONAMA 347/2004).' } }),
    W(DNIT, 'vgeo:vw_iphan_sitios_arq', { id: 'iphan', nome: 'Sítios arqueológicos (IPHAN)', fonte: 'IPHAN via DNIT', tipoGeom: 'ponto', rotulo: ['Identificacao', 'Classificacao', 'Codigo_IPHAN'], analise: { raioKm: 3 }, regra: { incide: S('alerta', 'alerta', 'atencao', 'atencao'), proximo: S('atencao', 'atencao', 'informativo', 'informativo'), alcanceKm: 1, nota: 'Bens arqueológicos protegidos (Lei 3.924/1961); licenciamento com avaliação do IPHAN (IN IPHAN 1/2015).' } }),
    L(ANM + 'SIGMINE/geociencias/MapServer', 3, { id: 'anm_paleo', nome: 'Sítios paleontológicos', fonte: 'ANM — SIGMINE', analise: { raioKm: 1 }, regra: { incide: S('alerta', 'atencao', 'atencao', 'atencao'), nota: 'Depósitos fossilíferos são bens da União (Decreto-Lei 4.146/1942).' } }),
    SV(SGB + 'gestaoterritorial/geossit/MapServer', { id: 'sgb_geossit', nome: 'Geossítios (SGB)', fonte: 'SGB', tipoGeom: 'ponto', analise: { raioKm: 5 } })
  ]);
  add('ambiental', 'Recursos hídricos', [
    W(DNIT, 'vgeo:vw_drenagem', { id: 'ana_drenagem', nome: 'Cursos d’água — hidrografia (ANA)', fonte: 'ANA via DNIT', tipoGeom: 'linha', minZoom: 9, rotulo: ['Nome', 'Ordem', 'Dominialidade'], analise: { raioKm: 1, especial: 'app', max: 400 } }),
    W(DNIT, 'vgeo:vw_massa_dagua', { id: 'ana_massas', nome: 'Massas d’água — lagos e reservatórios (ANA)', fonte: 'ANA via DNIT', rotulo: ['Nome', 'Origem', 'Dominialidade'], analise: { raioKm: 1 }, regra: { incide: S('alerta'), proximo: S('atencao', 'atencao', 'informativo', 'informativo'), alcanceKm: 0.1, nota: 'Entorno de lagos e reservatórios é APP (Lei 12.651/2012, art. 4º, II e III).' } }),
    SV(SGB + 'hidrologia/Dominios_hidrogeologicos_Brasil/MapServer', { precisaoKm: 1, id: 'sgb_hidrogeo', nome: 'Domínios hidrogeológicos (SGB)', fonte: 'SGB', rotulo: ['DOM', 'NOME_UNIDA'], analise: { contexto: true } }),
    SV(SGB + 'hidrologia/SIAGAS_MODDAD/MapServer', { id: 'sgb_siagas', nome: 'Poços tubulares — SIAGAS (SGB)', fonte: 'SGB — SIAGAS', tipoGeom: 'ponto', rotulo: ['str_nome_ponto', 'str_natureza_ponto', 'num_profundidade'], minZoom: 9, analise: { raioKm: 5, contagem: true } }),
    SV(SGB + 'hidrologia/fontes_hidrominerais/MapServer', { id: 'sgb_fontes', nome: 'Fontes hidrominerais (SGB)', fonte: 'SGB', tipoGeom: 'ponto', analise: { raioKm: 5 } }),
    SV(SGB + 'hidrologia/Mapa_Midrogeologico_Paraiba/MapServer', { id: 'sgb_hidro_pb', nome: 'Mapa hidrogeológico da Paraíba (SGB)', fonte: 'SGB' })
  ]);
  const BIOMAS = [['caatinga', 'Caatinga'], ['cerrado', 'Cerrado'], ['mata-atlantica', 'Mata Atlântica'], ['pampa', 'Pampa'], ['pantanal', 'Pantanal']];
  add('ambiental', 'Vegetação, uso do solo e desmatamento', [
    W(INPE, 'prodes-brasil-nb:biomas_brasil', { id: 'biomas', nome: 'Biomas (IBGE/INPE)', fonte: 'INPE — TerraBrasilis', rotulo: ['bioma'], analise: { contexto: true, especial: 'bioma' } }),
    SV(EPE + 'SMA/MapBiomas_2024/MapServer', { id: 'mapbiomas', nome: 'Cobertura e uso da terra — MapBiomas 2024 (EPE)', fonte: 'MapBiomas via EPE', analise: { contexto: true, especial: 'mapbiomas' } })
  ].concat(BIOMAS.map(([b, n]) => W(INPE, `prodes-${b}-nb:yearly_deforestation`, { id: 'prodes_' + b, nome: 'Desmatamento anual PRODES — ' + n + ' (INPE)', fonte: 'INPE — PRODES', rotulo: ['year', 'class_name', 'area_km'], analise: { raioKm: 0.05, especial: 'prodes' }, regra: { incide: S('atencao', 'alerta', 'alerta', 'atencao'), nota: 'Supressão de vegetação detectada por satélite: verificar autorização (ASV) e eventual passivo ambiental.' } }))).concat([
    W(INPE, 'prodes-amazon-nb:yearly_deforestation_biome', { id: 'prodes_amazonia', nome: 'Desmatamento anual PRODES — Amazônia (INPE)', fonte: 'INPE — PRODES', analise: { raioKm: 0.05, especial: 'prodes' }, regra: { incide: S('atencao', 'alerta', 'alerta', 'atencao'), nota: 'Supressão de vegetação detectada por satélite.' } }),
    W(INPE, 'deter-amz:deter_amz', { id: 'deter_amz', nome: 'Alertas DETER — Amazônia (INPE)', fonte: 'INPE — DETER', analise: { raioKm: 0.05 }, regra: { incide: S('alerta'), nota: 'Alerta recente de desmatamento/degradação.' } }),
    W(INPE, 'deter-cerrado-nb:deter_cerrado', { id: 'deter_cerrado', nome: 'Alertas DETER — Cerrado (INPE)', fonte: 'INPE — DETER', analise: { raioKm: 0.05 }, regra: { incide: S('alerta'), nota: 'Alerta recente de desmatamento.' } })
  ]));
  add('ambiental', 'Solos, relevo e riscos', [
    SV(SGB + 'pronasolos/IBGE_solos_250k/MapServer', { id: 'solos', nome: 'Solos 1:250.000 (IBGE)', fonte: 'IBGE via SGB/PronaSolos', rotulo: ['legenda', 'textura'], analise: { contexto: true } }),
    SV(SGB + 'pronasolos/suscetibilidade_erosao_hidrica/MapServer', { id: 'erosao', nome: 'Suscetibilidade à erosão hídrica', fonte: 'SGB/PronaSolos' }),
    SV(SGB + 'gestaoterritorial/padrao_relevo/MapServer', { id: 'relevo_padrao', nome: 'Padrões de relevo (SGB)', fonte: 'SGB', analise: { contexto: true } }),
    SV(SGB + 'gestaoterritorial/risco/MapServer', { id: 'sgb_risco', nome: 'Setores de risco geológico (SGB)', fonte: 'SGB', analise: { raioKm: 1 }, regra: { incide: S('atencao'), nota: 'Setor de risco geológico mapeado (movimento de massa, inundação ou erosão).' } }),
    SV(SGB + 'gestaoterritorial/inundacao/MapServer', { id: 'sgb_inund', nome: 'Suscetibilidade a inundação (SGB)', fonte: 'SGB' }),
    SV(SGB + 'gestaoterritorial/corrida_de_massa/MapServer', { id: 'sgb_massa', nome: 'Suscetibilidade a corrida de massa (SGB)', fonte: 'SGB' })
  ]);
  add('ambiental', 'Fiscalização', [
    W(INDE, 'ICMBio:embargos_icmbio', { id: 'icmbio_embargos', nome: 'Áreas embargadas (ICMBio)', fonte: 'ICMBio via INDE', analise: { raioKm: 0.1 }, regra: { incide: S('impeditivo', 'impeditivo', 'impeditivo', 'alerta'), nota: 'Área sob embargo administrativo: atividades vedadas até a regularização.' } })
  ]);

  /* ================================ REFERÊNCIA E TERRITÓRIO ================================ */
  add('referencia', 'Limites', [
    L(ANM + 'SIGMINE/estrutura_territorial/MapServer', 2, { id: 'ref_mun', nome: 'Municípios', fonte: 'IBGE via ANM', padrao: true }),
    L(ANM + 'SIGMINE/estrutura_territorial/MapServer', 1, { id: 'ref_uf', nome: 'Estados', fonte: 'IBGE via ANM' }),
    L(ANM + 'SIGMINE/estrutura_territorial/MapServer', 5, { id: 'ref_sedes', nome: 'Sedes municipais', fonte: 'IBGE via ANM', tipoGeom: 'ponto' }),
    W(DNIT, 'vgeo:vw_distritos', { id: 'ref_distritos', nome: 'Distritos', fonte: 'IBGE via DNIT', tipoGeom: 'ponto' })
  ]);
  add('referencia', 'Relevo e rótulos', [
    IMG(SGBI + 'relevo_30m/ImageServer', { id: 'ref_relevo30', nome: 'Relevo SRTM 30 m (SGB)', fonte: 'SGB' }),
    { id: 'ref_rotulos', nome: 'Rótulos de cidades e limites (Esri)', fonte: 'Esri', view: { tipo: 'xyz', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', maxNativeZoom: 19 } },
    { id: 'ref_estradas', nome: 'Estradas e rótulos (Esri)', fonte: 'Esri', view: { tipo: 'xyz', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', maxNativeZoom: 19 } }
  ]);

  VA.CATALOGO = C;
  VA.camada = id => C.find(c => c.id === id);
  VA.nomeSetor = id => (VA.SETORES.find(s => s.id === id) || { nome: id }).nome;

  /* Mapas-base */
  VA.BASES = [
    { id: 'esri_sat', nome: 'Satélite (Esri)', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', max: 19, esriAuto: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer', attr: 'Imagens © Esri, Maxar, Earthstar Geographics', rotulos: true },
    { id: 'esri_sat_puro', nome: 'Satélite sem rótulos (Esri)', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', max: 19, esriAuto: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer', attr: 'Imagens © Esri, Maxar, Earthstar Geographics' },
    { id: 'osm', nome: 'OpenStreetMap — padrão', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', max: 19, attr: '© colaboradores do OpenStreetMap' },
    { id: 'osm_hot', nome: 'OpenStreetMap — humanitário', url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', max: 19, attr: '© OpenStreetMap · estilo Humanitarian OSM Team' },
    { id: 'opentopo', nome: 'Topográfico — OpenTopoMap', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', max: 17, attr: '© OpenStreetMap, SRTM · OpenTopoMap (CC-BY-SA)' },
    { id: 'esri_topo', nome: 'Topográfico — Esri', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', max: 19, attr: '© Esri e colaboradores' },
    { id: 'esri_hill', nome: 'Relevo sombreado — Esri', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}', max: 16, attr: '© Esri, USGS, NASA' },
    { id: 'esri_shaded', nome: 'Relevo sombreado colorido — Esri', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}', max: 13, attr: '© Esri' },
    { id: 'esri_terreno', nome: 'Terreno — Esri', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}', max: 13, attr: '© Esri, USGS, NOAA' },
    { id: 'esri_ruas', nome: 'Ruas — Esri', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', max: 19, attr: '© Esri e colaboradores' },
    { id: 'esri_natgeo', nome: 'National Geographic — Esri', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}', max: 16, attr: '© Esri, National Geographic' },
    { id: 'cyclosm', nome: 'CyclOSM — vias e trilhas', url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', max: 19, attr: '© OpenStreetMap · CyclOSM' },
    { id: 'carto_claro', nome: 'Claro — CARTO Positron', url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', max: 19, attr: '© OpenStreetMap, © CARTO' },
    { id: 'carto_escuro', nome: 'Escuro — CARTO Dark Matter', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', max: 19, attr: '© OpenStreetMap, © CARTO' },
    { id: 'carto_voyager', nome: 'Voyager — CARTO', url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', max: 19, attr: '© OpenStreetMap, © CARTO' },
    { id: 'google_sat', nome: 'Google — satélite (chave própria)', google: { mapType: 'satellite' } },
    { id: 'google_hib', nome: 'Google — satélite com nomes (chave própria)', google: { mapType: 'satellite', layerTypes: ['layerRoadmap'] } }
  ];
})();
