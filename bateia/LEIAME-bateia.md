# Bateia — prospecção mineral por coordenada

Bateia é uma plataforma web aberta que recebe **coordenadas, um nome de lugar ou um arquivo KML/KMZ/GeoJSON** e devolve, em segundos, tudo o que as bases públicas sabem sobre aquela área: geologia, estruturas, ocorrências e depósitos minerais, direitos minerários, geoquímica, geofísica, relevo, imagens de satélite, um bloco 3D e uma estimativa de potencial por modelo de depósito — cada afirmação marcada como **observada, derivada, inferida ou lacuna**, com a fonte.

O projeto foi desenhado a partir de um estudo de engenharia reversa do Leapfrog Geo/Evo (Seequent), do Datamine Studio RM, do GeoSGB/GEOBANK, do USGS mrdata e do Macrostrat (ver o documento do estudo de caso).

---

## Como abrir

O programa é **um único arquivo**: `bateia.html`. Não há instalação nem servidor próprio; ele consulta direto os servidores públicos (SGB, ANM, USGS, NOAA, ESA…) pelo navegador.

| Jeito | Como |
|---|---|
| **Windows (recomendado)** | Dê dois cliques em `iniciar.bat`. Se o Python estiver instalado, ele abre um servidor local e o navegador em `http://localhost:8765/bateia.html`. Sem Python, abre o arquivo direto. |
| **macOS / Linux** | No terminal: `sh iniciar.sh` |
| **Direto** | Dois cliques em `bateia.html` (Chrome, Edge ou Firefox atualizados). Funciona na maioria dos casos; se alguma fonte falhar, use o `iniciar`. |
| **Publicar na internet** | Arraste a pasta para <https://app.netlify.com/drop> ou envie `bateia.html` (renomeado para `index.html`) para um repositório no GitHub Pages. Fica com um link para compartilhar. |

Precisa de internet. Navegador recomendado: Chrome ou Edge (o bloco 3D usa WebGL).

---

## Como usar

1. Digite a localização no campo do topo. Formatos aceitos:
   - decimal: `-7.080444, -36.844558`
   - graus/minutos/segundos: `7°04'49"S 36°50'40"W`
   - UTM: `24M 738085 9216806` (zona, faixa, E, N)
   - nome: `Salgadinho PB`, `Serra Pelada`
2. Escolha o **raio** (1 a 40 km) e clique em **Analisar** — ou clique em qualquer ponto do mapa e em “Analisar este ponto”.
3. Para uma poligonal (por exemplo o polígono de um processo ANM ou o limite da lavra), use **KML / KMZ** e escolha o arquivo exportado do Google Earth, do SIGMINE ou do QGIS. Pontos viram ponto + raio; linhas viram uma faixa; polígonos são analisados pelo contorno.
4. Acompanhe a barra **“X de 20 fontes com dados”** (clique nela para ver cada fonte).
5. Navegue pelas abas:

| Aba | O que mostra |
|---|---|
| **Síntese** | Resumo em texto, coordenadas em 3 formatos, situação legal (processo ANM no ponto, restrições), minérios registrados e os modelos de depósito mais compatíveis. |
| **Geologia** | Unidade litoestratigráfica no ponto (1:100 mil → 1:1 milhão, a melhor escala disponível), unidades da área com % de ocupação, contexto tectônico, kimberlitos, roseta de estruturas e afloramentos descritos por geólogos do SGB. |
| **Minérios** | Tabela de substâncias (SGB + USGS + ANM + bateia), ocorrências com status e rocha hospedeira, depósitos com recurso mais próximos, processos ANM (fase, titular, área) e restrições territoriais. |
| **Geoquímica** | Sedimentos de corrente do SGB (33 elementos), limiar regional robusto, razão máximo/limiar por elemento, amostras anômalas e minerais pesados em concentrados de bateia (ouro, cassiterita, columbita-tantalita, turmalina, scheelita…). |
| **Geofísica** | Aerolevantamento que cobre o ponto (com link para baixar os dados), 10 mosaicos do SGB (magnetometria, sinal analítico, 1ª derivada, K, eTh, eU, Th/K, contagem total, ternário, Bouguer), EMAG2v3 e estações gravimétricas. |
| **Relevo e 3D** | Hipsometria, declividade, drenagem (fluxo D8), perfis W–E e N–S, orientação das encostas e o **bloco 3D** com satélite, geologia, geofísica ou Sentinel-2 por cima e as ocorrências como pinos. |
| **Espectral** | Cena Sentinel-2 mais limpa dos últimos 18 meses: cor verdadeira, composição de razões e índices de óxido de ferro, ferro ferroso, argilominerais (OH), gossan e NDVI. |
| **Potencial** | 13 modelos de sistemas minerais (pegmatito LCT e gemas, ouro orogênico, escarnito de W, ferro, Cu-Au, Ni-Cr-PGE, Sn-greisen, terras raras/carbonatito, diamante, urânio, Ba-F-Pb-Zn, minerais industriais e plácers) com cada evidência explicada. |
| **Evidências** | Livro de evidências filtrável e situação de cada fonte (tempo de resposta, erro, fora da cobertura). |
| **Relatório** | Relatório completo para baixar (HTML) ou imprimir/salvar em PDF, e exportações GeoJSON, KML, CSV (ocorrências e geoquímica) e JSON. |

### Menu do mapa (botão direito)

Clique com o **botão direito** em qualquer ponto do mapa (no celular, **toque longo**). O clique simples abre um atalho com “Analisar este ponto” e “Mais opções”. A ficha abre sobre o mapa e o mapa se desloca para o ponto não ficar escondido.

| Opção | O que faz |
|---|---|
| **Informações do local** | Sítio, distrito/povoado, município, estado, CEP e altitude; unidade geológica do SGB no ponto (melhor escala disponível) e domínio tectônico; se o ponto está dentro de processo ANM; ocorrência mineral mais próxima e resumo num raio de 10 km; **data, resolução e fornecedor da imagem de satélite Esri** no ponto, com botões para comparar no Google Maps e no Google Earth. |
| **Informações da ANM** | Processo(s) que contêm o ponto: número, fase, substância, uso, titular, área, ano e último evento — com botão para ver o polígono no mapa e **baixar o polígono em KML**. Se o ponto estiver livre, lista os processos mais próximos (até 2 km) com a distância até o limite. Mostra restrições no ponto (UC, terra indígena, quilombola, área urbana, bloqueio, reserva garimpeira, cavernas e sítios arqueológicos a 300 m). |
| **Coordenadas e cartografia** | Decimal, graus decimais, GMS, graus e minutos (formato de GPS), UTM (E, N, zona, faixa, meridiano central), MGRS, convergência meridiana, fator de escala, altitude e as **folhas topográficas do IBGE** de 1:1.000.000 a 1:25.000 (toque para ver o limite da folha). Cada valor tem botão de copiar; exporta o ponto em **GPX** (GPS de mão) e KML. |
| **Ocorrências minerais próximas** | Lista com distância e rumo (5, 10, 20 ou 50 km), substâncias mais frequentes, marcadores no mapa e os depósitos com recurso mais próximos. |
| **Geofísica no ponto** | Os 10 mosaicos aerogeofísicos do SGB lidos no pixel (magnetometria, sinal analítico, 1ª derivada, K, eTh, eU, Th/K, contagem total, ternário, Bouguer), o aerolevantamento que cobre o ponto, EMAG2 e a estação gravimétrica mais próxima. |
| **Marcar e analisar** | Análise completa das 20 fontes, com o raio escolhido ali mesmo (1 a 40 km). |
| **Desenhar polígono para análise** | Clique os vértices; duplo clique, Enter ou botão direito conclui e roda a análise do polígono. Mostra área e perímetro enquanto desenha e baixa o polígono em KML. |
| **Perfil topográfico a partir daqui** | Clique o ponto final: gráfico de altitude × distância (passe o mouse para ver o ponto no mapa), subida e descida acumuladas, inclinação média e máxima, rumo; exporta CSV e KML e analisa uma faixa de 1 km ao longo do perfil. |
| **Medir distância e área** | Distância acumulada, trecho e rumo, e área se o traçado for fechado. |
| **Salvar em Meus pontos** | Guarda o ponto com nome, categoria (alvo, amostra, afloramento, lavra/garimpo, acesso) e observação. Em **Meus pontos** dá para ir, analisar, apagar e exportar todos em KML, GPX ou CSV. |
| **Abrir no Google Maps / Google Earth** | Abre o mesmo ponto numa nova aba. |

Teclas: **Esc** fecha o menu, cancela o desenho ou fecha a ficha; **Enter** conclui; **Backspace** desfaz o último vértice.

### Mapa-base e imagens do Google

Em **Camadas → Mapa-base** há o satélite da Esri (padrão), dois topográficos, ruas e três opções do Google: **satélite**, **satélite com nomes** (estradas e lugares por cima) e **terreno**. A escolha fica guardada no navegador.

Com o satélite Esri ligado, a linha de créditos no pé do mapa mostra a **data da imagem no centro da tela** (por exemplo, “Imagem do centro: 23/02/2026 · 34 cm · Vantor” em São José da Batalha). O Google não divulga a data das imagens dele.

O Google só libera as imagens para outros programas pela **Map Tiles API**, com uma chave do próprio usuário:

1. No [Google Cloud Console](https://console.cloud.google.com/google/maps-apis/api-list), crie um projeto e cadastre o faturamento (exigido pelo Google mesmo dentro da cota grátis).
2. Ative a **Map Tiles API**.
3. Em **Credenciais**, crie uma chave de API e restrinja-a à Map Tiles API e ao endereço `http://localhost:8765/*` (é o endereço que o `iniciar.bat`/`iniciar.sh` abre) ou ao domínio onde a Bateia estiver publicada.
4. Na Bateia, escolha uma opção do Google em Camadas (ou clique em “Imagens do Google: configurar a chave”), cole a chave e clique em **Testar e usar**.

A cota grátis do Google é de 100 mil blocos de imagem por mês (uma tela cheia usa 20 a 40); acima disso o Google cobra US$ 0,60 por mil. A chave fica só no navegador e só é enviada a `tile.googleapis.com`. O logotipo e os créditos do Google aparecem no mapa enquanto as imagens dele estão ligadas, como os termos exigem. Se a chave falhar, a Bateia explica o motivo (chave inválida, API não ativada, faturamento, restrição de endereço) e continua com a Esri.

O botão **Camadas** no mapa liga os mapas oficiais (geologia em 3 escalas, estruturas, todas as ocorrências, processos ANM, os 10 mosaicos aerogeofísicos e o EMAG2) e os produtos calculados (relevo, declividade, drenagem, índices Sentinel-2), com controle de opacidade.

---

## Fontes de dados

| Fonte | O que vem dela | Cobertura |
|---|---|---|
| SGB — Litoestratigrafia 1:100 mil, 1:250 mil, 1:1 milhão | unidades, litotipos, idades, ambiente tectônico, cores do mapa | Brasil |
| SGB — Estruturas GIS Brasil | falhas, zonas de cisalhamento, lineamentos | Brasil |
| SGB/CGMW — Mapa Tectônico da América do Sul | domínio, ciclo, kimberlitos, diques, suturas | América do Sul |
| SGB — GEOBANK Afloramentos | descrições de campo, rochas, geólogo, projeto | Brasil |
| SGB — GEOBANK Ocorrências | substâncias, status, hospedeira, morfologia | Brasil |
| SGB — Recursos Minerais do Brasil (PDAC 2026) | depósitos com recurso, tipo, porte, titular | Brasil |
| SGB — Geoquímica exploratória | sedimento de corrente (ICP), concentrados de bateia, pintas de ouro | Brasil |
| SGB — Aerogeofísica (10 ImageServers) e projetos | magnetometria e gamaespectrometria nacionais | Brasil |
| SGB — Gravimetria | estações terrestres (ar livre, Bouguer) | Brasil |
| ANM — SIGMINE | processos ativos, bloqueios, reservas garimpeiras, UCs, TIs, quilombolas, cavernas, áreas urbanas | Brasil |
| USGS — MRDS | ocorrências e minas do mundo | Mundo (forte nos EUA) |
| Macrostrat | geologia global | Mundo |
| NOAA NCEI — EMAG2v3 | anomalia magnética global | Mundo |
| AWS Terrain Tiles / Copernicus GLO-90 | modelo de elevação e altitude | Mundo |
| ESA Sentinel-2 L2A (Element 84 Earth Search) | 6 bandas de reflectância (10–20 m) | Mundo |
| USGS ComCat | sismos M ≥ 2,5 desde 1970 | Mundo |
| OpenStreetMap / Nominatim | município, busca por nome | Mundo |
| Esri World Imagery, OpenTopoMap | mapas-base | Mundo |
| Esri World Imagery Metadata | data, resolução e fornecedor de cada imagem | Mundo |
| Google Map Tiles API (opcional, chave do usuário) | satélite, satélite com nomes e terreno do Google | Mundo |

Fora do Brasil a plataforma usa as fontes globais e marca as brasileiras como “fora da cobertura”.

---

## Método

- **Evidência rotulada.** Toda frase da análise é *observada* (veio de uma base), *derivada* (calculada pela Bateia a partir de dados observados), *inferida* (interpretação por modelo) ou *lacuna* (dado ausente). **Ausência de registro não é ausência de minério.**
- **Geoquímica.** Limiar regional = máximo entre mediana + 2·MAD (em log) e o percentil 90, calculado no entorno (2× o raio, mínimo 10 km). Valores abaixo do limite de detecção entram como metade do limite; elementos com ≥ 70 % de valores censurados não geram razão.
- **Aerogeofísica.** Os ImageServers do SGB entregam imagens coloridas; a Bateia converte a cor do pixel em posição relativa na escala nacional (0–100 %). É uma leitura **relativa**, não a grandeza física (nT, %K, ppm).
- **Relevo.** Declividade e sombreamento pelo método de Horn; drenagem por acumulação de fluxo D8.
- **Espectral.** Razões de banda clássicas (B04/B02, B11/B12, B11/B04, B12/B08 + B03/B04) só nos pixels expostos (NDVI < 0,35).
- **Potencial.** Cada modelo soma evidências ponderadas (litologia, ocorrências, ANM, geoquímica, concentrados, estruturas, idade, tectônica, gamaespectrometria, magnetometria, gravimetria, espectral). A nota é suavizada para 20 % quando há poucas evidências (encolhimento bayesiano, K = 2,5), e a **confiança** é a fração do peso que tinha dados.

---

## Limitações

- As bases são regionais (1:100 mil a 1:5 milhões). A Bateia aponta onde olhar; não substitui mapeamento de detalhe, amostragem, geofísica terrestre e sondagem.
- Posições de ocorrências antigas podem ter centenas de metros de erro.
- A situação dos processos ANM muda todo dia: confirme no SIGMINE antes de requerer.
- Os servidores públicos às vezes ficam lentos ou fora do ar; a fonte aparece como “erro” e o restante segue válido. Basta analisar de novo mais tarde.
- A pontuação de potencial é uma hipótese a ser validada por geólogo responsável.

---

## Código-fonte

```
codigo-fonte/
  build.py            junta tudo em dist/bateia.html
  src/index.html      estrutura da página
  src/app.css         visual (tema claro/escuro, celular, impressão)
  src/js/00-core.js   utilidades, rede, estatística, livro de evidências
  src/js/10-coords.js coordenadas (decimal, GMS, UTM), KML/KMZ/GeoJSON, área de interesse
  src/js/20-providers.js  as 20 fontes de dados
  src/js/30-analysis.js   relevo, espectral, geofísica, geoquímica, substâncias
  src/js/40-models.js     modelos de sistemas minerais
  src/js/50-map.js        mapa e camadas
  src/js/60-render.js     abas
  src/js/70-viewer3d.js   bloco 3D (three.js)
  src/js/80-report.js     relatório e exportações
  src/js/85-pontos.js     menu do botão direito, fichas do ponto, polígono, perfil, medição e Meus pontos
  src/js/90-app.js        orquestração
```

Para alterar: edite os arquivos em `src/` e rode `python3 build.py`. Para testar sem compilar, sirva a pasta `src/` (`python -m http.server`) e abra `index.html`.

**Adicionar uma fonte:** escreva uma função `async (ctx) => ({ _n, ... })` em `20-providers.js`, registre-a em `B.PROVIDERS` e use `ctx.L.add('obs', tema, texto, fonte, {url})` para lançar evidências.
**Adicionar um modelo de depósito:** inclua um objeto em `B.MODELOS` (`40-models.js`) com a lista de evidências e pesos.

Bibliotecas (via CDN): Leaflet 1.9.4, proj4js 2.9.0, JSZip 3.10.1, geotiff.js 2.1.3, three.js r128.

Os dados pertencem às respectivas instituições (SGB, ANM, USGS, NOAA, ESA/Copernicus, OpenStreetMap, Esri) e seguem as licenças de cada uma; cite a fonte ao usar os resultados.
