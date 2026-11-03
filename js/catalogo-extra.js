/* VIP ANALYSIS — catálogo ampliado.
   Acrescenta ao catálogo principal todas as camadas que a versão feita no GPT (20/10/2026) tinha e esta não tinha:
   EPE (Webmap completo), ICMBio/INDE (PANs, PRIM-IVT, áreas prioritárias), IBGE BC250 2025, INEA-RJ, SICAR consulta pública
   (APP, reserva legal, vegetação nativa…), INPE (hidrografia e vegetação) e SGB GeoServer.
   Endpoints conferidos a partir do navegador do operador em 22/10/2026 (296 de 312 responderam; os que falharam ficaram de fora
   ou têm equivalente no catálogo principal).
   Camadas daqui são "extras": aparecem no mapa, abrem atributos no clique e entram na análise quando o operador as liga
   ou escolhe em "Camadas extras na análise" — sempre com o mesmo teste dentro / entorno / fora. */
'use strict';

(function () {
  const VA = window.VA;
  const EPEW = VA.URL.EPEW;
  const INDE = VA.URL.INDE;
  const INPE = VA.URL.INPE;
  const SGBGS = 'https://geoservicos.sgb.gov.br/geoserver/ows';
  const IBGE = 'https://geoservicos.ibge.gov.br/geoserver/ows';
  const SICARW = 'https://consulta.car.gov.br/geowebcache/service/wms';
  Object.assign(VA.URL, { SGBGS, IBGE, SICARW });
  const C = VA.CATALOGO;
  const SET = { e: 'energia', m: 'mineracao', f: 'fundiario', a: 'ambiental', r: 'referencia' };
  const EXTRA = () => ({ raioKm: 'entorno', extra: true });
  const add = (setor, grupo, e) => { if (!C.some(c => c.id === e.id)) C.push(Object.assign({ setor, grupo, cors: 'auto', extra: true, analise: EXTRA() }, e)); };
  const geo = g => g === 'P' ? 'ponto' : g === 'L' ? 'linha' : undefined;

  /* ---------------- EPE — Webmap completo (camadas individuais) ---------------- */
  const EPE = [
    ['Geração — expansão planejada (EPE)', 'e', [[1, 'Eólicas (EOL) — expansão planejada', 'P'], [2, 'Fotovoltaicas (UFV) — expansão planejada', 'P'], [3, 'Hidrelétricas (UHE) — expansão planejada', 'P'], [4, 'PCH — expansão planejada', 'P'], [5, 'CGH — expansão planejada', 'P'], [6, 'Termelétricas a biomassa — expansão planejada', 'P'], [7, 'Termelétricas fósseis — expansão planejada', 'P'], [8, 'Termonucleares — expansão planejada', 'P']]],
    ['Geração — base existente (EPE)', 'e', [[12, 'Eólicas (EOL) — existentes', 'P'], [13, 'Fotovoltaicas (UFV) — existentes', 'P'], [14, 'Hidrelétricas (UHE) — existentes', 'P'], [15, 'PCH — existentes', 'P'], [16, 'CGH — existentes', 'P'], [17, 'Termelétricas a biomassa — existentes', 'P'], [18, 'Termelétricas fósseis — existentes', 'P'], [19, 'Termonucleares — existentes', 'P']]],
    ['Sistema elétrico (EPE)', 'e', [[22, 'Subsistemas do Sistema Interligado Nacional'], [25, 'Sistemas isolados', 'P'], [101, 'Torres anemométricas (AMA)', 'P'], [97, 'Estudos de viabilidade hidrelétrica', 'P'], [98, 'Estudos de inventário hidrelétrico e AAI']]],
    ['Combustíveis e biocombustíveis (EPE)', 'e', [[27, 'Plantas de etanol', 'P'], [28, 'Plantas de biodiesel', 'P'], [29, 'Plantas de biometano', 'P'], [32, 'Bases de GLP', 'P'], [33, 'Instalações de processamento', 'P'], [34, 'Terminais de petróleo e derivados', 'P'], [35, 'Ferrovias (combustíveis líquidos)', 'L'], [38, 'Terminais do duto Araucária–Cuiabá', 'P'], [39, 'Duto Araucária–Cuiabá', 'L'], [41, 'Terminais do duto Uberaba–Cuiabá', 'P'], [42, 'Duto Uberaba–Cuiabá', 'L'], [44, 'Terminais do duto Paranaguá–Araucária', 'P'], [45, 'Duto Paranaguá–Araucária', 'L'], [47, 'Duto Paulínia–Uberaba', 'L'], [49, 'Duto Araucária–Itajaí', 'L']]],
    ['Gás natural (EPE)', 'e', [[51, 'Terminais de GNL', 'P'], [52, 'Polos de processamento de gás natural', 'P'], [53, 'Estações de compressão', 'P'], [55, 'Dutos de escoamento', 'L'], [56, 'Gasodutos de transporte', 'L'], [57, 'Gasodutos de distribuição', 'L']]],
    ['Petróleo e gás — exploração e produção (EPE)', 'e', [[60, 'Áreas sob contrato (E&P)'], [61, 'Áreas da União (E&P)'], [63, 'Histórico de blocos ofertados'], [65, 'Oferta permanente — partilha'], [66, 'Oferta permanente — concessão'], [68, 'Bacia efetiva geográfica'], [69, 'Bacia efetiva probabilística'], [70, 'Tipo de fluido predominante'], [71, 'Recursos não convencionais'], [81, 'Polígono do pré-sal legal'], [82, 'Ambiente de E&P'], [83, 'Bacias sedimentares (E&P)'], [84, 'Embasamento']]],
    ['Socioambiental (base EPE)', 'a', [[86, 'Cavernas — CECAV (via EPE)', 'P'], [87, 'Terras indígenas em estudo — FUNAI (via EPE)', 'P'], [88, 'Sítios arqueológicos — IPHAN (via EPE)', 'P'], [89, 'Terras indígenas — FUNAI (via EPE)'], [92, 'Unidades de conservação — MMA (via EPE)'], [93, 'Mapoteca de UCs Eletrobras'], [99, 'Estudo ambiental da área sedimentar do Solimões']]],
    ['Fundiário (base EPE)', 'f', [[90, 'Territórios quilombolas — INCRA (via EPE)'], [91, 'Projetos de assentamento — INCRA (via EPE)']]],
    ['Limites (base EPE)', 'r', [[23, 'Unidades da Federação (EPE)']]]
  ];
  EPE.forEach(([grupo, s, lista]) => lista.forEach(([id, nome, g]) => add(SET[s], grupo, {
    id: 'epe' + id, nome, fonte: 'EPE — Webmap', tipoGeom: geo(g),
    view: { tipo: 'ags', url: EPEW, layers: 'show:' + id }, q: { tipo: 'query', url: EPEW + '/' + id }
  })));

  /* ---------------- ICMBio via INDE ---------------- */
  const ICM = [
    ['Planos de Ação Nacional — espécies ameaçadas (ICMBio)', [
      ['pan_icmbio_abrang_052024_a', 'PANs — todas as áreas de abrangência (mai/2024)'],
      ['pan_cemave_planacap_c3_area_abrang_022023_a', 'PAN Albatrozes e Petréis — 3º ciclo — abrangência'], ['pan_cepta_altoparana_c1_abrang_032024_a', 'PAN Alto Paraná — 1º ciclo — abrangência'],
      ['pan_cemave_ararinhaaz_c2_area_abrang_022023_a', 'PAN Ararinha-azul — 2º ciclo — abrangência'], ['pan_cenap_ariranha_c2_abrang_012023_a', 'PAN Ariranha — 2º ciclo — abrangência'], ['pan_cenap_ariranha_c3_abrang_012024_a', 'PAN Ariranha — 3º ciclo — abrangência'],
      ['pan_cemave_limicolas_c2_area_abrang_022023_a', 'PAN Aves Limícolas Migratórias — abrangência'], ['pan_cemave_limicolas_c2_area_estrat_022023_a', 'PAN Aves Limícolas Migratórias — áreas estratégicas'],
      ['pan_cemave_avmarinhas_c1_area_abrang_022023_a', 'PAN Aves Marinhas — abrangência'], ['pan_cemave_avamazonia_c1_area_abrang_022023_a', 'PAN Aves da Amazônia — abrangência'],
      ['pan_cemave_caatinga_c2_area_abrang_022023_a', 'PAN Aves da Caatinga — 2º ciclo — abrangência'], ['pan_cemave_caatinga_c2_area_estrat_022023_a', 'PAN Aves da Caatinga — 2º ciclo — áreas estratégicas'], ['pan_cemave_caatinga_c3_areas_estrat_112023_a', 'PAN Aves da Caatinga — 3º ciclo — áreas estratégicas'],
      ['pan_cemave_matlantica_c1_area_abrang_022023_a', 'PAN Aves da Mata Atlântica — abrangência'], ['pan_cemave_matlantica_c1_area_estrat_022023_a', 'PAN Aves da Mata Atlântica — 1º ciclo — estratégicas'], ['pan_cemave_matlantica_c2_areas_estrat_012024_a', 'PAN Aves da Mata Atlântica — 2º ciclo — estratégicas'],
      ['pan_cemave_cerrapanta_c1_area_abrang_022023_a', 'PAN Aves do Cerrado e Pantanal — abrangência'], ['pan_cemave_cerrapanta_c1_area_estrat_022023_a', 'PAN Aves do Cerrado e Pantanal — estratégicas'],
      ['pan_cemave_csulinos_c2_area_abrang_022023_a', 'PAN Aves dos Campos Sulinos — abrangência'], ['pan_cepta_baixoiguacu_c1_abrang_012023_a', 'PAN Baixo Iguaçu — abrangência'], ['pan_cenap_canideos_c1_abrang_012023_a', 'PAN Canídeos — abrangência'],
      ['pan_cecav_area_abrangencia_012023_a', 'PAN Cavernas do Brasil — abrangência'], ['pan_ran_cerradoepantanal_c1_area_abrang_022023_a', 'PAN Herpetofauna do Cerrado e Pantanal — abrangência'], ['pan_ran_cerradoepantanal_c1_area_estrat_022023_a', 'PAN Herpetofauna do Cerrado e Pantanal — estratégicas'],
      ['pan_cma_cetaceosmarinhos_c1_abrang_032023_a', 'PAN Cetáceos Marinhos — abrangência'], ['pan_cepsul_corais_c1_area_abrangencia_042024_a', 'PAN Corais — abrangência'], ['pan_cenap_gfelinos_c1_abrang_012023_a', 'PAN Grandes Felinos — abrangência'],
      ['pan_ran_sudeste_c2_area_abrang_022023_a', 'PAN Herpetofauna da Mata Atlântica do Sudeste — abrangência'], ['pan_ran_espinhaco_c2_area_abrang_022023_a', 'PAN Herpetofauna da Serra do Espinhaço — abrangência'], ['pan_ran_espinhaco_c2_area_estrat_022023_a', 'PAN Herpetofauna da Serra do Espinhaço — estratégicas'],
      ['pan_ran_nordeste_c2_area_abrang_022023_a', 'PAN Herpetofauna do Nordeste — abrangência'], ['pan_ran_nordeste_c2_area_estrat_022023_a', 'PAN Herpetofauna do Nordeste — estratégicas'],
      ['pan_ran_sul_c2_area_abrang_022023_a', 'PAN Herpetofauna do Sul — abrangência'], ['pan_ran_sul_c2_area_estrat_022023_a', 'PAN Herpetofauna do Sul — estratégicas'],
      ['pan_cbc_polinizadores_c1_abrang_032023_a', 'PAN Insetos Polinizadores — abrangência'], ['pan_cbc_polinizadores_c1_areas_estrat_102023_a', 'PAN Insetos Polinizadores — estratégicas'],
      ['pan_cepsul_lagoasdosul_c1_abrang_012023_a', 'PAN Lagoas do Sul — abrangência'], ['pan_cma_mamiferosaquaticosamazonicos_c1_abrang_032023_a', 'PAN Mamíferos Aquáticos Amazônicos — abrangência'],
      ['pan_cepta_mogi_c1_abrang_012023_a', 'PAN Mogi/Pardo/Sapucaí-Mirim/Grande — abrangência'], ['pan_cepta_paraibasul_c1_abrang_012023_a', 'PAN Paraíba do Sul — 1º ciclo — abrangência'], ['pan_cepta_paraibasul_c1_area_estrategica_082022_a', 'PAN Paraíba do Sul — 1º ciclo — estratégicas'],
      ['pan_cepta_paraibasul_c2_abrang_022024_a', 'PAN Paraíba do Sul — 2º ciclo — abrangência'], ['pan_cepta_paraibadosul_c2_area_estrat_022024_a', 'PAN Paraíba do Sul — 2º ciclo — estratégicas'],
      ['pan_cemave_patomergulhao_c3_abrang_012024_a', 'PAN Pato-mergulhão — abrangência'], ['pan_cma_peixeboimarinho_c1_abrang_032023_a', 'PAN Peixe-boi Marinho — abrangência'], ['pan_cepam_pxsamazncs_c1_abrang_012023_a', 'PAN Peixes Amazônicos — abrangência'],
      ['pan_cepta_pema_c1_abrang_012023_a', 'PAN Peixes e Eglas da Mata Atlântica — abrangência'], ['pan_cepta_pema_c1_area_estrategica_082022_a', 'PAN Peixes e Eglas da Mata Atlântica — estratégicas'],
      ['pan_cenap_pfelinos_c2_abrang_012023_a', 'PAN Pequenos Felinos — abrangência'], ['pan_cenap_pmamifaa_c1_abrang_012024_a', 'PAN Pequenos Mamíferos de Áreas Abertas — abrangência'], ['pan_cenap_pmamifaa_c1_areas_estrat_012024_a', 'PAN Pequenos Mamíferos de Áreas Abertas — estratégicas'],
      ['pan_cenap_pmamifaf_c1_abrang_012024_a', 'PAN Pequenos Mamíferos de Áreas Florestais — abrangência'], ['pan_cenap_pmamifaf_c1_areas_estrat_012024_a', 'PAN Pequenos Mamíferos de Áreas Florestais — estratégicas'],
      ['pan_cpb_primamaz_c1_abrang_012023_a', 'PAN Primatas Amazônicos — abrangência'], ['pan_cpb_primamazonicos_c1_areas_estrat_022023_a', 'PAN Primatas Amazônicos — estratégicas'], ['pan_cpb_primmtatl_c1_abrang_012023_a', 'PAN Primatas da Mata Atlântica e preguiça-de-coleira — abrangência'],
      ['pan_cpb_primne_c2_abrang_012023_a', 'PAN Primatas do Nordeste — abrangência'], ['pan_cpb_prine_c2_areas_estrat_022023_a', 'PAN Primatas do Nordeste — estratégicas'], ['pan_cepta_rivulideos_c2_abrang_012023_a', 'PAN Rivulídeos — abrangência'],
      ['pan_cpb_sauim_c2_abrang_012023_a', 'PAN Sauim-de-coleira — abrangência'], ['pan_cepta_sfrancisco_c1_abrang_092022_a', 'PAN São Francisco — 1º ciclo — abrangência'], ['pan_cepta_sfrancisco_c2_abrang_012023_a', 'PAN São Francisco — 2º ciclo — abrangência'],
      ['pan_cpb_tata_c1_abrang_012023_a', 'PAN Tamanduá-bandeira e Tatus — abrangência'], ['pan_tamar_tamar_c2_abrang_012023_a', 'PAN Tartarugas Marinhas — abrangência'], ['pan_tamar_pantamar_c2_area_estrat_022023_a', 'PAN Tartarugas Marinhas — estratégicas'],
      ['pan_cma_toninhas_c2_abrang_032023_a', 'PAN Toninhas — abrangência'], ['pan_cenap_ung_c1_abrang_012023_a', 'PAN Ungulados — abrangência']]],
    ['Infraestrutura viária e biodiversidade — PRIM-IVT (ICMBio)', [
      ['compatibilidade_ivt_amazonia_062022_a', 'PRIM-IVT — Amazônia'], ['compatibilidade_ivt_caatinga_062022_a', 'PRIM-IVT — Caatinga'], ['compatibilidade_ivt_cerrado_062022_a', 'PRIM-IVT — Cerrado'],
      ['compatibilidade_ivt_mata_atlantica_062022_a', 'PRIM-IVT — Mata Atlântica'], ['compatibilidade_ivt_pampa_062022_a', 'PRIM-IVT — Pampa'], ['compatibilidade_ivt_pantanal_062022_a', 'PRIM-IVT — Pantanal']]],
    ['Áreas prioritárias para a biodiversidade (2ª atualização)', [['areas_hibridas_2a_atualizacao', 'Áreas prioritárias — zonas híbridas']]]
  ];
  ICM.forEach(([grupo, lista]) => lista.forEach(([t, nome]) => add('ambiental', grupo, {
    id: 'icm_' + t.replace(/_a$/, ''), nome, fonte: 'ICMBio via INDE', rotulo: ['pan', 'nmarea', 'nome_area'],
    view: { tipo: 'wms', url: INDE, layers: 'ICMBio:' + t }, q: { tipo: 'wfs', url: INDE, typeName: 'ICMBio:' + t }
  })));

  /* ---------------- IBGE — Base Cartográfica Contínua 1:250.000 (BC250, 2025) ---------------- */
  const BC = [
    ['Hidrografia (IBGE BC250)', 'a', [['hid_trecho_drenagem_l', 'Trechos de drenagem', 'L'], ['hid_massa_dagua_a', 'Massas d’água'], ['hid_barragem_l', 'Barragens (linha)', 'L'], ['hid_barragem_p', 'Barragens (ponto)', 'P'], ['hid_canal_l', 'Canais (linha)', 'L'], ['hid_canal_a', 'Canais (área)'], ['hid_canal_vala_l', 'Canais e valas (linha)', 'L'], ['hid_canal_vala_a', 'Canais e valas (área)'], ['hid_terreno_sujeito_inundacao_a', 'Terrenos sujeitos a inundação'], ['hid_banco_areia_a', 'Bancos de areia'], ['hid_ilha_a', 'Ilhas'], ['hid_recife_a', 'Recifes'], ['hid_foz_maritima_l', 'Foz marítima (linha)', 'L'], ['hid_foz_maritima_p', 'Foz marítima (ponto)', 'P'], ['hid_foz_maritima_a', 'Foz marítima (área)']]],
    ['Relevo (IBGE BC250)', 'a', [['rel_ponto_cotado_altimetrico_p', 'Pontos cotados altimétricos', 'P'], ['rel_ponto_hipsometrico_p', 'Pontos hipsométricos', 'P'], ['rel_pico_p', 'Picos', 'P'], ['rel_elemento_fisiografico_natural_l', 'Elementos fisiográficos naturais (linha)', 'L'], ['rel_elemento_fisiografico_natural_p', 'Elementos fisiográficos naturais (ponto)', 'P'], ['rel_elemento_fisiografico_natural_a', 'Elementos fisiográficos naturais (área)'], ['rel_alteracao_fisiografica_antropica_l', 'Alterações fisiográficas antrópicas (linha)', 'L'], ['rel_alteracao_fisiografica_antropica_p', 'Alterações fisiográficas antrópicas (ponto)', 'P'], ['rel_alteracao_fisiografica_antropica_a', 'Alterações fisiográficas antrópicas (área)']]],
    ['Energia (IBGE BC250)', 'e', [['enc_trecho_energia_l', 'Trechos de energia (linhas)', 'L'], ['enc_subest_transm_distrib_energia_eletrica_p', 'Subestações de transmissão e distribuição', 'P'], ['enc_est_gerad_energia_eletrica_p', 'Estações geradoras de energia', 'P'], ['enc_hidreletrica_p', 'Hidrelétricas', 'P'], ['enc_termeletrica_p', 'Termelétricas', 'P'], ['dut_trecho_duto_l', 'Trechos de duto', 'L']]],
    ['Transportes (IBGE BC250)', 'e', [['rod_trecho_rodoviario_l', 'Trechos rodoviários', 'L'], ['rod_via_deslocamento_l', 'Vias de deslocamento', 'L'], ['fer_trecho_ferroviario_l', 'Trechos ferroviários', 'L'], ['hdv_trecho_hidroviario_l', 'Trechos hidroviários', 'L'], ['tra_ponte_l', 'Pontes (linha)', 'L'], ['tra_ponte_p', 'Pontes (ponto)', 'P'], ['tra_tunel_l', 'Túneis (linha)', 'L'], ['tra_tunel_p', 'Túneis (ponto)', 'P'], ['tra_travessia_l', 'Travessias (linha)', 'L'], ['tra_travessia_p', 'Travessias (ponto)', 'P'], ['tra_passagem_elevada_viaduto_l', 'Passagens elevadas e viadutos (linha)', 'L'], ['tra_passagem_elevada_viaduto_p', 'Passagens elevadas e viadutos (ponto)', 'P'], ['tra_passagem_nivel_p', 'Passagens de nível', 'P'], ['tra_obra_de_arte_viaria_l', 'Obras de arte viárias (linha)', 'L'], ['tra_obra_de_arte_viaria_p', 'Obras de arte viárias (ponto)', 'P'], ['tra_estrut_transporte_p', 'Estruturas de transporte', 'P'], ['aer_complexo_aeroportuario_p', 'Complexos aeroportuários', 'P'], ['aer_pista_ponto_pouso_l', 'Pistas e pontos de pouso (linha)', 'L'], ['aer_pista_ponto_pouso_p', 'Pistas e pontos de pouso (ponto)', 'P'], ['hdv_complexo_portuario_p', 'Complexos portuários', 'P'], ['hdv_atracadouro_terminal_l', 'Atracadouros e terminais (linha)', 'L'], ['hdv_atracadouro_terminal_p', 'Atracadouros e terminais (ponto)', 'P'], ['hdv_eclusa_p', 'Eclusas', 'P']]],
    ['Extração mineral (IBGE BC250)', 'm', [['eco_ext_mineral_p', 'Extração mineral (ponto)', 'P'], ['eco_ext_mineral_a', 'Extração mineral (área)']]],
    ['Limites e localidades (IBGE BC250)', 'r', [['lml_municipio_a', 'Municípios'], ['lml_unidade_federacao_a', 'Unidades da Federação'], ['lml_pais_a', 'País'], ['lml_area_politico_administrativa_a', 'Áreas político-administrativas'], ['lml_outros_limites_oficiais_l', 'Outros limites oficiais', 'L'], ['lml_area_densamente_edificada_a', 'Áreas densamente edificadas'], ['lml_capital_p', 'Capitais', 'P'], ['lml_cidade_p', 'Cidades', 'P'], ['lml_vila_p', 'Vilas', 'P'], ['lml_aglomerado_rural_p', 'Aglomerados rurais', 'P'], ['lml_aglomerado_rural_isolado_p', 'Aglomerados rurais isolados', 'P'], ['lml_posic_geo_localidade_p', 'Posicionamento geográfico de localidades', 'P']]]
  ];
  BC.forEach(([grupo, s, lista]) => lista.forEach(([t, nome, g]) => add(SET[s], grupo, {
    id: 'bc250_' + t, nome: nome + ' (BC250 2025)', fonte: 'IBGE — BC250 2025', tipoGeom: geo(g), rotulo: ['nome', 'tipotrechodrenagem', 'tipotrechorod', 'codtrechorodov'], minZoom: g ? 9 : 7,
    view: { tipo: 'wms', url: IBGE, layers: 'CCAR:BC250_2025_' + t }, q: { tipo: 'wfs', url: IBGE, typeName: 'CCAR:BC250_2025_' + t }
  })));

  /* ---------------- INEA (RJ) via INDE ---------------- */
  [['GPL_IMOVEIS_CAR_ME', 'Imóveis CAR nas microbacias (INEA)', 'f'], ['gpl_car_lago_lagoa_natural', 'Lagos e lagoas naturais — CAR (INEA)', 'a'], ['gpl_car_manguezal', 'Manguezal — CAR (INEA)', 'a'], ['gpt_car_nascente', 'Nascentes — CAR (INEA)', 'a', 'P'], ['gpl_r2r_reserva_legal_jun_19_me', 'R2R — reserva legal (INEA)', 'a'], ['gpl_r2r_ucs_mun_2020_me', 'R2R — UCs municipais (INEA)', 'a'], ['gpl_reserva_legal_jun_19_me', 'Reserva legal — jun/2019 (INEA)', 'a'], ['gpl_car_energia_eletrica', 'Reservatórios de energia até 2001 — CAR (INEA)', 'a'], ['gpl_car_restinga', 'Restinga — CAR (INEA)', 'a'], ['gpl_car_topo_morro', 'Topo de morro — CAR (INEA)', 'a'], ['gpl_car_declividade_45', 'Declividade acima de 45° — CAR (INEA)', 'a'], ['gpl_car_uso_restrito_decliv_25a45', 'Uso restrito, declividade 25–45° — CAR (INEA)', 'a'], ['gpl_car_banhado_inundacao', 'Banhado e inundação — CAR (INEA)', 'a']]
    .forEach(([t, nome, s, g]) => add(SET[s], 'Rio de Janeiro — INEA', {
      id: 'inea_' + t.toLowerCase(), nome, fonte: 'INEA via INDE', apenasUF: 'RJ', tipoGeom: geo(g),
      view: { tipo: 'wms', url: INDE, layers: 'INEA:' + t }, q: { tipo: 'wfs', url: INDE, typeName: 'INEA:' + t }
    }));

  /* ---------------- SICAR — consulta pública (mapas WMS; não entram no cruzamento vetorial) ---------------- */
  const SICAR = [
    ['CAR — imóveis e territórios (consulta pública)', 'f', [['iru', 'Imóveis rurais (IRU)'], ['ast', 'Imóveis de assentamento da reforma agrária'], ['pct', 'Territórios de povos e comunidades tradicionais'], ['brasil', 'Limite Brasil (CAR)'], ['estado', 'Limites estaduais (CAR)'], ['municipio', 'Limites municipais (CAR)']]],
    ['CAR — uso do solo e reserva legal (consulta pública)', 'a', [['vegetacao_nativa', 'Remanescente de vegetação nativa'], ['area_consolidada', 'Área consolidada'], ['area_pousio', 'Área de pousio'], ['arl_proposta', 'Reserva legal proposta'], ['arl_averbada', 'Reserva legal averbada'], ['arl_aprovada_nao_averbada', 'Reserva legal aprovada e não averbada'], ['terra_indigena', 'Terras indígenas (CAR)'], ['unidade_conservacao', 'Unidades de conservação (CAR)'], ['area_embargada', 'Áreas embargadas (CAR)']]],
    ['CAR — APP e hidrografia declaradas (consulta pública)', 'a', [['rio_ate_10', 'Curso d’água natural até 10 m'], ['app_rio_ate_10', 'APP de rios até 10 m'], ['app_escadinha_rio_ate_10', 'APP a recompor — rios até 10 m'], ['rio_10_a_50', 'Curso d’água natural de 10 a 50 m'], ['app_rio_10_a_50', 'APP de rios de 10 a 50 m'], ['app_escadinha_rio_10_a_50', 'APP a recompor — rios de 10 a 50 m'], ['rio_50_a_200', 'Curso d’água natural de 50 a 200 m'], ['app_rio_50_a_200', 'APP de rios de 50 a 200 m'], ['app_escadinha_rio_50_a_200', 'APP a recompor — rios de 50 a 200 m'], ['rio_200_a_600', 'Curso d’água natural de 200 a 600 m'], ['app_rio_200_a_600', 'APP de rios de 200 a 600 m'], ['app_escadinha_rio_200_a_600', 'APP a recompor — rios de 200 a 600 m'], ['rio_acima_600', 'Curso d’água natural acima de 600 m'], ['app_rio_acima_600', 'APP de rios acima de 600 m'], ['app_escadinha_rio_acima_600', 'APP a recompor — rios acima de 600 m'], ['nascente_olho_dagua', 'Nascentes e olhos d’água perenes'], ['app_nascente_olho_dagua', 'APP de nascentes e olhos d’água'], ['app_escadinha_nascente_olho_dagua', 'APP a recompor — nascentes'], ['lago_natural', 'Lagos e lagoas naturais'], ['app_lago_natural', 'APP de lagos e lagoas naturais'], ['app_escadinha_lago_natural', 'APP a recompor — lagos e lagoas'], ['reservatorio_artificial_decorrente_barramento', 'Reservatórios artificiais (barramento)'], ['app_reservatorio_artificial_decorrente_barramento', 'APP de reservatórios artificiais'], ['reservatorio_geracao_energia_ate_24_08_2001', 'Reservatórios de energia até 24/08/2001'], ['app_reservatorio_geracao_energia_ate_24_08_2001', 'APP de reservatórios de energia até 24/08/2001'], ['vereda', 'Veredas'], ['app_vereda', 'APP de veredas'], ['app_escadinha_vereda', 'APP a recompor — veredas'], ['manguezal', 'Manguezais'], ['app_manguezal', 'APP de manguezais'], ['banhado', 'Banhados'], ['app_banhado', 'APP de banhados'], ['restinga', 'Restingas'], ['app_restinga', 'APP de restingas'], ['area_topo_morro', 'Topos de morro'], ['app_area_topo_morro', 'APP de topos de morro'], ['area_altitude_superior_1800', 'Áreas com altitude acima de 1.800 m'], ['app_area_altitude_superior_1800', 'APP de altitude acima de 1.800 m'], ['borda_chapada', 'Bordas de chapada'], ['app_borda_chapada', 'APP de bordas de chapada'], ['area_declividade_maior_45', 'Declividade acima de 45°'], ['app_area_declividade_maior_45', 'APP de declividade acima de 45°']]]
  ];
  SICAR.forEach(([grupo, s, lista]) => lista.forEach(([t, nome]) => add(SET[s], grupo, {
    id: 'carw_' + t, nome: 'CAR · ' + nome, fonte: 'SICAR — consulta pública (WMS)', minZoom: 10, analise: null,
    view: { tipo: 'wms', url: SICARW, layers: 'consulta_publica:' + t }, q: null, soMapa: true
  })));

  /* ---------------- INPE — TerraBrasilis (hidrografia e vegetação) ---------------- */
  [['prodes-caatinga-nb:hydrography', 'Hidrografia — Caatinga (INPE)'], ['prodes-cerrado-nb:hydrography', 'Hidrografia — Cerrado (INPE)'], ['vegetation-cerrado:hydrography', 'Grade hidrográfica — Cerrado (INPE)'], ['prodes-legal-amz:hydrography', 'Hidrografia — Amazônia Legal (INPE)'], ['prodes-amazon-nb:hydrography_biome', 'Hidrografia — bioma Amazônia (INPE)'], ['prodes-pampa-nb:hydrography', 'Hidrografia — Pampa (INPE)'], ['prodes-pantanal-nb:hydrography', 'Hidrografia — Pantanal (INPE)'], ['prodes-mata-atlantica-nb:hydrography', 'Hidrografia — Mata Atlântica (INPE)']]
    .forEach(([t, nome]) => add('ambiental', 'Recursos hídricos', { id: 'inpe_' + t.replace(/[^a-z0-9]+/gi, '_'), nome, fonte: 'INPE — TerraBrasilis', tipoGeom: 'linha', minZoom: 9, view: { tipo: 'wms', url: INPE, layers: t }, q: { tipo: 'wfs', url: INPE, typeName: t } }));
  add('ambiental', 'Vegetação, uso do solo e desmatamento', { id: 'inpe_veg_cerrado', nome: 'Tipos de vegetação — ecorregiões do Cerrado (INPE)', fonte: 'INPE — TerraBrasilis', view: { tipo: 'wms', url: INPE, layers: 'vegetation-cerrado:vegetation_types' }, q: { tipo: 'wfs', url: INPE, typeName: 'vegetation-cerrado:vegetation_types' } });
  add('ambiental', 'Vegetação, uso do solo e desmatamento', { id: 'prodes_amz_legal', nome: 'Desmatamento anual PRODES — Amazônia Legal (INPE)', fonte: 'INPE — PRODES', rotulo: ['year', 'class_name'], view: { tipo: 'wms', url: INPE, layers: 'prodes-legal-amz:yearly_deforestation' }, q: { tipo: 'wfs', url: INPE, typeName: 'prodes-legal-amz:yearly_deforestation' } });

  /* ---------------- SGB — GeoServer (versões vetoriais que responderam) ---------------- */
  [['geosgb:litoestratigrafia_25k', 'Litoestratigrafia 1:25.000 (SGB, vetorial)', 'mineracao', 'Geologia (SGB)'], ['geosgb:litoestratigrafia_50k', 'Litoestratigrafia 1:50.000 (SGB, vetorial)', 'mineracao', 'Geologia (SGB)'], ['geosgb:litoestratigrafia_150k', 'Litoestratigrafia 1:150.000 (SGB, vetorial)', 'mineracao', 'Geologia (SGB)'], ['geosgb:ocorrencias_fossiliferas', 'Ocorrências fossilíferas (SGB)', 'ambiental', 'Patrimônio espeleológico, arqueológico e paleontológico', 'P'], ['gestao-territorial:suscet_movimento_de_massa', 'Suscetibilidade a movimentos de massa (SGB, vetorial)', 'ambiental', 'Solos, relevo e riscos'], ['gestao-territorial:suscet_corrida_de_massa', 'Suscetibilidade a corrida de massa (SGB, vetorial)', 'ambiental', 'Solos, relevo e riscos'], ['gestao-territorial:suscet_enxurrada', 'Suscetibilidade a enxurrada (SGB, vetorial)', 'ambiental', 'Solos, relevo e riscos'], ['gestao-territorial:suscet_inundacao', 'Suscetibilidade a inundação (SGB, vetorial)', 'ambiental', 'Solos, relevo e riscos']]
    .forEach(([t, nome, setor, grupo, g]) => add(setor, grupo, { id: 'sgbgs_' + t.split(':')[1], nome, fonte: 'SGB — GeoServer', tipoGeom: geo(g), rotulo: ['sigla', 'nome', 'nome_unidade', 'classe', 'suscetibilidade'], view: { tipo: 'wms', url: SGBGS, layers: t }, q: { tipo: 'wfs', url: SGBGS, typeName: t } }));

  /* ---------------- CAR nacional no ponto (consulta oficial por coordenada) ---------------- */
  add('fundiario', 'Imóveis rurais', {
    id: 'car_ponto', nome: 'CAR nacional — cadastro no ponto (consulta pública SICAR)', fonte: 'SFB — SICAR (consulta por coordenada)', cors: 'proxy', extra: false,
    view: null, q: { tipo: 'carponto' }, analise: { contexto: true, especial: 'carponto' },
    descricao: 'Consulta oficial por coordenada do centro da área: código CAR, município, área declarada, módulos fiscais e data. Não traz o limite do imóvel (só a caixa envolvente) e não substitui o cruzamento com os perímetros do CAR.'
  });

  /* ---------------- PANs: uma verificação só, no lugar das 67 camadas ----------------
     A camada consolidada de abrangência do ICMBio (mai/2024) diz numa consulta quais planos cobrem a área.
     As áreas estratégicas (onde os planos preveem ações concretas) já são verificadas sempre, pela camada fixa
     "Áreas estratégicas dos PAN" — aqui não se repete essa consulta. */
  add('ambiental', 'Planos de Ação Nacional — espécies ameaçadas (ICMBio)', {
    id: 'icm_pans', nome: 'Planos de Ação Nacional que abrangem a área (ICMBio)', fonte: 'ICMBio via INDE', rotulo: ['pan'],
    view: { tipo: 'wms', url: INDE, layers: 'ICMBio:pan_icmbio_abrang_052024_a' },
    q: { tipo: 'pans', url: INDE, typeName: 'ICMBio:pan_icmbio_abrang_052024_a', campos: 'idpan,pan,centro,bioma' },
    analise: { contexto: true, especial: 'pans', extra: true },
    descricao: `Uma consulta no lugar das ${ICM[0][1].length} camadas de PAN: lista os planos para espécies ameaçadas cuja abrangência cobre a área. As áreas estratégicas já entram sempre, pela camada fixa do ICMBio.`
  });

  /* ---------------- pacotes por finalidade e regionais ----------------
     Camadas opcionais que entram sozinhas conforme a finalidade escolhida (e o estado da área), além das fixas. */
  VA.PACOTES = {
    mineracao: { nome: 'pesquisa mineral', descricao: 'geologia em todas as escalas, geoquímica e recursos minerais do Serviço Geológico e áreas de extração mineral do IBGE',
      ids: ['sgb_diamante', 'sgb_litio', 'sgb_geo25', 'sgb_geo50', 'sgb_geo150', 'sgb_geo250', 'sgb_geoUF', 'sgb_geo1m', 'sgb_geocron', 'sgb_petro', 'sgb_paleo', 'sgb_tecams', 'sgb_bacias', 'sgb_geoq', 'sgb_geoq_int', 'sgb_geoq_bd', 'bc250_eco_ext_mineral_p', 'bc250_eco_ext_mineral_a'] },
    solar: { nome: 'energia', descricao: 'geração planejada, gás natural e combustíveis da EPE',
      ids: [1, 2, 3, 4, 5, 6, 7, 8, 51, 52, 53, 55, 56, 57, 27, 28, 29, 32, 33, 34, 35, 38, 39, 41, 42, 44, 45, 47, 49].map(n => 'epe' + n) },
    terra: { nome: 'terra', descricao: 'quais planos de ação nacional para espécies ameaçadas (ICMBio) abrangem a área, numa consulta só', ids: ['icm_pans'] }
  };
  /* camadas estaduais: entram quando a área está no estado (hoje, INEA no Rio de Janeiro) */
  VA.PACOTES_UF = {};
  C.filter(c => c.apenasUF && c.q && !c.soMapa).forEach(c => { (VA.PACOTES_UF[c.apenasUF] = VA.PACOTES_UF[c.apenasUF] || []).push(c.id); });
  /* na varredura completa, as 67 camadas de PAN dão lugar à verificação única */
  VA.FORA_DA_VARREDURA = new Set(ICM[0][1].map(([t]) => 'icm_' + t.replace(/_a$/, '')));

  /* ---------------- integrações que ainda exigem complementação ---------------- */
  VA.PENDENTES = [
    { nome: 'INCRA — download de SIGEF/SNCI e Acervo Fundiário', url: 'https://sigef.incra.gov.br/', texto: 'Em 29/10/2026 os endereços certificacao.incra.gov.br e acervofundiario.incra.gov.br saíram do DNS (não existem mais na internet; o SIGEF continua no ar, mas sem download em lote). As bases já baixadas continuam funcionando; para uma UF nova, use “Importar .zip” com o shapefile obtido por outro caminho.' },
    { nome: 'IBAMA — áreas embargadas federais', url: 'https://servicos.ibama.gov.br/ctf/publico/areasembargadas/ConsultaPublicaAreasEmbargadas.php', texto: 'Sem serviço geográfico público verificado. Embargos do ICMBio estão no catálogo; os do IBAMA exigem consulta no portal.' },
    { nome: 'GeoBahia (INEMA)', url: 'https://geobahia.inema.ba.gov.br/', texto: 'Serviço indisponível nas verificações de 20 e 21/10/2026.' },
    { nome: 'Registro de imóveis e matrículas (ONR)', url: 'https://mapa.onr.org.br/', texto: 'Serviços do ONR exigem token; matrícula e ônus só por certidão do cartório.' },
    { nome: 'APP — delimitação legal detalhada', url: 'https://www.car.gov.br/', texto: 'As APP declaradas no CAR estão como mapas (WMS). A delimitação legal completa (topo de morro, nascentes, larguras reais) exige levantamento em campo.' },
    { nome: 'SGB GeoServer — litoestratigrafia 1:100 mil/1:250 mil/1:1 milhão, geodiversidade, SIAGAS, bacias, domínios hidrogeológicos, sedimentos de corrente', url: 'https://geoservicos.sgb.gov.br/geoserver/web/', texto: 'O banco de dados do GeoServer do SGB não respondeu em 22/10/2026; essas camadas estão no catálogo pela via ArcGIS do SGB (geoportal), que funciona.' },
    { nome: 'ICMBio — autos de infração', url: 'https://geoservicos.inde.gov.br/', texto: 'Serviço com erro interno (coluna inexistente no banco do ICMBio) em 22/10/2026.' },
    { nome: 'INPE — focos de queimadas', url: 'https://terrabrasilis.dpi.inpe.br/queimadas/portal/', texto: 'A camada de focos não está mais publicada no GeoServer do TerraBrasilis.' }
  ];
})();
