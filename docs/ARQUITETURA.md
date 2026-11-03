# VIP ANALYSIS — arquitetura (v0.3)

## Princípios

1. **Fonte oficial em tempo real, nada simulado.** Cada resultado guarda a requisição, a data/hora e o número de registros. Fonte que falhou vira *lacuna* com motivo — nunca “sem restrição”.
2. **Direto primeiro, servidor só quando precisa.** ANM, SGB, EPE, INDE, CAR, FUNAI, DNIT, INPE e IBGE liberam o navegador (CORS testado da máquina do operador em 21/10/2026). A ANEEL/SIGEL bloqueia: vai pelo proxy local. Se um domínio bloquear, o cliente memoriza e passa a usar o proxy.
3. **Uma camada = um registro no catálogo.** Desenho, consulta, análise e regra legal ficam juntos em `js/catalogo.js`. Acrescentar uma camada não exige mexer no motor.
4. **Achado com evidência.** Toda afirmação do relatório aponta para `E#` (registro de uma fonte), com grau de certeza: comprovado, indício, critério de triagem, ausência de registro ou não verificado.

## Fluxo

```
área (desenho/coordenada/arquivo) ──► VA.analisar(aoi, parâmetros)
   │                                     │  para cada camada com `analise` dos setores ligados (6 em paralelo):
   │                                     │    consulta bbox(área + raio) → interseção exata (Turf) → distância → sobreposição (ha)
   │                                     │    faixas legais: caverna 250 m, curso d’água 30 m
   │                                     │    pós-processamento por tema (ANM, UC, CAR, SIGEF, PRODES, geologia…)
   │                                     ▼
   │                         resultados {status dentro|proximo|fora|info|falha|sem_base, itens E#}
   │                                     ▼
   ├──► Bateia (iframe, postMessage) ──► VA.avaliar(finalidade) → achados + quadro dentro/fora por setor
   │                                     ▼
   └────────────────────────────► relatório · prompt de IA · pacote JSON · GeoJSON
```

## Catálogo (`js/catalogo.js` + `js/catalogo-extra.js`)

445 camadas: Energia e Infraestrutura 126 · Mineração 52 · Fundiário 27 · Ambiental 220 · Referência 20.
- **103 curadas** entram sempre na análise (com pós-processamento e regra legal próprios).
- **269 extras** (`extra: true`) entram quando o operador as liga no mapa ou marca em *Camadas extras*: teste genérico dentro / entorno (raio `entornoKm`) / fora, com todos os atributos.
- **57 só de mapa** (`soMapa`: mosaicos WMS do SICAR por tema), sem consulta vetorial pública.

A v0.3 nasceu de uma varredura da versão feita no ChatGPT (379 camadas): 312 endpoints dela foram testados do navegador do operador em 22/10/2026; os 296 que responderam entraram aqui; os que falharam estão em `VA.PENDENTES`, com o motivo, e aparecem na interface.

```js
{
  id: 'canie', setor: 'ambiental', grupo: 'Patrimônio espeleológico…', nome: 'Cavernas — CANIE', fonte: 'ICMBio/CECAV via INDE',
  view: { tipo: 'wms', url, layers },              // ags | wms | img (ImageServer) | xyz | overpass | local
  q:    { tipo: 'wfs', url, typeName },            // query | identify | wfs | overpass | local
  cors: 'auto' | 'proxy',  uf: true (camada por UF) | ufCampo: 'UF' (filtro opcional por UF)
  tipoGeom: 'ponto' | 'linha',  minZoom, rotulo: [campos],
  analise: { raioKm: número | 'energia' | 'anm' | 'ocorrencias' | 'ambiental', contexto: true, especial: 'caverna', max, contagem, opcional },
  regra:   { incide: S(mineração, solar, terra, geral), proximo: S(...), alcanceKm, bufferM: 250, nota: 'base legal' }
}
```

`contexto: true` = só informa o valor no local (geologia, bioma, irradiação, distribuidora, solos…).
`q.tipo` também aceita `carponto` (SICAR por coordenada, via proxy) e `bdgd` (rede de distribuição no servidor local).
WFS: pede `srsName=EPSG:4326` e bbox com CRS explícito (ordem lon/lat garantida), com recuo para a forma antiga e GML.
ArcGIS: os apelidos dos campos (`?f=json`) viram os rótulos dos atributos.

## Servidor local (`servidor.py`, só biblioteca padrão)

| Rota | Função |
|---|---|
| `GET /proxy?url=` | proxy GET restrito à lista `PERMITIDOS`, cache de 12 h, TLS com `truststore` opcional |
| `GET /api/status` | identificação + bases instaladas |
| `GET /api/bases/consulta?fonte&uf&bbox&max&tol` | GeoJSON das parcelas SIGEF/SNCI no retângulo (índice em grade de 0,05°) |
| `GET /api/bases/estado` · `POST /api/bases/baixar` · `POST /api/bases/importar` | gerência das bases por UF |
| `GET /api/bdgd/estado` | leitor instalado?, distribuidoras instaladas (contagem por camada), tarefas em andamento |
| `GET /api/bdgd/distribuidoras` | lista da ANEEL no ArcGIS Online (dono `aneel_aneel`, tipo File Geodatabase), a base mais recente por **código de agente**; cache de 24 h |
| `POST /api/bdgd/preparar` · `baixar?item=` · `importar?nome=` · `remover?slug=` | instala o `pyogrio`; baixa/importa e converte a BDGD; remove |
| `GET /api/bdgd/consulta?camada=ssdmt\|sub\|untrmt&bbox&max&tol` | GeoJSON da rede no retângulo, de todas as distribuidoras instaladas que cobrem a região |

Bases em `dados/<fonte>_<uf>/` e `dados/bdgd_<distribuidora>__<camada>/`: `base.shp/.shx/.dbf/.cpg/.prj`, `indice.bin` (caixas + deslocamentos, grade de 0,05°) e `meta.json`. Leitor próprio de shapefile/DBF (pontos, linhas e polígonos; anéis por orientação; codificação pelo `.cpg`), sem dependências.

### BDGD (rede de distribuição)

A BDGD é publicada pela ANEEL como File Geodatabase por distribuidora (título `Nome_Código_AAAA-MM-DD_Vnn_publicação`). Estrutura conferida numa base real V11 (referência 2025-12-31): `SSDMT` (linhas: COD_ID, CTMT, SUB, FAS_CON, COMP, ARE_LOC, TIP_CND, POS…), `CTMT` (tabela: COD_ID, NOME, SUB, TEN_NOM, TEN_OPE…), `SUB` (polígonos: COD_ID, NOME, POS, DIST), `UNTRMT` (pontos: COD_ID, CTMT, SUB, POT_NOM, FAS_CON_P, TIP_TRAFO, MUN…), todas em SIRGAS 2000 geográfico (EPSG 4674).
O servidor lê com `pyogrio` (GDAL, via `/vsizip/`, em lotes de 50 mil), junta o circuito (nome e tensão do CTMT) a cada segmento e transformador, e grava as três camadas como bases indexadas. O navegador traduz os códigos: `TEN_NOM` → kV (tabela TTEN) e `POT_NOM` → kVA (TPOTAPRT), conforme o Manual da BDGD (tabela do projeto bdgd2opendss, licença MIT).
Análise: `bdgd_mt` (raio 5 km: distância à rede, alimentadores no raio, trecho trifásico mais próximo), `bdgd_sub` (25 km), `bdgd_trafo` (1 km, potência instalada). Sem BDGD instalada, o resultado é *sem_base*, nunca “fora”.

## Navegador

- **Topografia** (`js/topografia.js`): blocos Terrarium (AWS Terrain Tiles) → curvas de nível (marching squares), relevo sombreado e declividade em classes, a partir do zoom 10. Cota: Open-Meteo (Copernicus GLO-90), com recuo para o Terrarium.
- **Estudos** (IndexedDB `vip-analysis`, lojas `estudos` e `relatorios`): área, parâmetros e relatórios ficam no navegador do operador.

## Bateia dentro da VIP

`bateia/bateia.html` é a Bateia original + `ponte-vip.js` (age só dentro de iframe):
- VIP → Bateia: `{tipo:'vip:analisar', lat, lon, raioKm, poligono, nome}`
- Bateia → VIP: `bateia:pronta`, `bateia:inicio`, `bateia:resultado {resumo}`, `bateia:erro`
O resumo traz fontes, substâncias, modelos de depósito (ajuste/confiança), geologia, anomalias geoquímicas e evidências; entra em `analise.bateia`, nas regras e no relatório.

## Limites conhecidos e próximos passos

- **Capacidade da rede**: a BDGD dá a rede física; margem de capacidade de alimentadores e subestações não é pública (consulta de acesso à distribuidora). Próximo passo possível: estimar carregamento a partir das energias mensais do CTMT/UNTRMT, com ressalvas.
- **Registro de imóveis**: os serviços do ONR exigem token; a plataforma usa a matrícula informada na certificação SIGEF e orienta a certidão de inteiro teor.
- **Fora do ar na verificação**: IBAMA (embargos), GEOBahia, WFS do Acervo Fundiário (INCRA). Entram no catálogo quando voltarem.
- **Bases estaduais** (ex.: zoneamentos, APAs estaduais não cadastradas no CNUC) entram por estado, conforme a prioridade de uso.
- **VIP PROSPECTING**: reaproveita catálogo + motor + Bateia para varrer áreas livres na ANM com potencial mineral e sem impeditivos.
