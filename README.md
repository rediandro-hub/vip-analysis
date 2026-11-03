# VIP ANALYSIS — v0.4.2

Plataforma de inteligência territorial da Vip Air. Você define a área (ponto, polígono, retângulo, círculo, coordenada ou arquivo), a plataforma consulta **em tempo real** os serviços oficiais, testa se a área está **dentro ou fora** de cada camada e entrega achados com evidências rastreáveis, relatório técnico interativo e pacote para IA. A **Bateia** (prospecção mineral) roda dentro do setor de Mineração.

## Como executar

Requisitos: Windows e Python 3.8+ (para a BDGD, Python 3.9+). Não há etapa de build nem instalação de dependências JavaScript.

```bash
git clone https://github.com/rediandro-hub/vip-analysis.git
cd vip-analysis
```

No Windows, dê dois cliques em **`iniciar.bat`**. O navegador abrirá em `http://localhost:8766/`. Mantenha a janela do servidor local aberta enquanto usa a plataforma.

As bases oficiais pesadas não fazem parte do repositório. SIGEF/SNCI e BDGD são baixadas ou importadas pelo usuário e ficam fora do código-fonte. Estudos, relatórios, chaves e preferências permanecem no navegador do usuário e não devem ser publicados.

Opcional no Windows: `pip install truststore` para resolver certificados incompletos de alguns órgãos. A rede de média tensão (BDGD) usa o leitor `pyogrio`, cuja instalação é oferecida pela interface.

O indicador no topo mostra **● Servidor local ativo**. Sem ele, o mapa e a maioria das fontes continuam funcionando, mas **ANEEL/SIGEL**, **SICAR por coordenada**, as **bases SIGEF/SNCI** e a **BDGD** ficam indisponíveis.

## Testes e documentação

- **Suíte automatizada:** abra `http://localhost:8766/testes.html`. Os 17 cenários usam fontes simuladas, sem internet, e verificam conclusões críticas, listas parciais, recorte geométrico, favorabilidade, cache e pacote JSON.
- **Arquitetura:** consulte [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).
- **Módulo Bateia:** consulte [`bateia/LEIAME-bateia.md`](bateia/LEIAME-bateia.md).

## Novidades da v0.4.2 — segurança das conclusões

Princípio: **falha não é ausência**. Nas decisões críticas, fonte que não respondeu, devolveu lista parcial ou cuja base não está instalada não sustenta conclusão positiva.

- **Fontes críticas por finalidade.** Cada finalidade tem as fontes sem as quais não há conclusão:
  - *Pesquisa / lavra mineral* e *Local para requerimento*: processos minerários (SIGMINE), áreas em disponibilidade, áreas de bloqueio, áreas militares, terras indígenas e unidades de conservação;
  - *Aquisição ou arrendamento de terra*: CAR, terras indígenas, quilombos, assentamentos, unidades de conservação e embargos do ICMBio (SIGEF/SNCI são *importantes*: se faltarem, a pendência fica declarada, sem travar);
  - *Usina solar*: terras indígenas, unidades de conservação, parques geradores e dutos (SIGEL) e processos minerários;
  - *Due diligence geral*: processos minerários, terras indígenas, unidades de conservação e CAR.
- **Parecer inconclusivo** (cor roxa, nunca verde): se uma fonte crítica falhou ou veio parcial, o parecer diz *Resultado inconclusivo: faltam evidências críticas para concluir* e nomeia a fonte. Impeditivo encontrado continua impeditivo, citando o que ficou sem verificação. A conclusão positiva agora diz *Nenhuma restrição identificada nas fontes críticas consultadas com sucesso*.
- **Quadro "Fontes críticas"** no painel, no parecer do relatório e nos slides: cada fonte com *verificada*, *parcial*, *sem resposta* ou *base não instalada*, o motivo e a próxima ação. No painel, o botão **Repetir a fonte crítica sem resposta** refaz só essas consultas.
- **Lista parcial é lacuna.** Quando o servidor do órgão corta a lista ou uma geometria não pode ser processada, a fonte fica *parcial* e o parecer crítico fica inconclusivo. A revisão das mensagens secundárias de ausência continua descrita em “Limitações conhecidas”.
- **Área livre do requerimento com status:**
  - *confirmada* — todas as fontes descontadas (SIGMINE, disponibilidade, bloqueio, área militar, terra indígena, UC de proteção integral) responderam por inteiro;
  - *potencial, não definitiva* — alguma delas falhou: a área aparece tracejada em roxo, com o que falta descontar, e **a poligonal N-S/L-O não é gerada**;
  - *não calculada* — o recorte geométrico falhou: o número fica em branco (antes, a área inteira podia aparecer como livre).
- **Inteligência mineral — disponibilidade verificada na janela inteira.** Terras indígenas, UCs, bloqueios, áreas militares, estoque de disponibilidade, quilombos, assentamentos, áreas urbanas e reservas garimpeiras agora são consultados nos ~40 km da janela (antes, só no raio da análise: um alvo a 15 km podia cair numa terra indígena sem aviso). Se a consulta da ANM ou de uma restrição crítica falhar ou vier parcial, o mapa mostra a classe **não verificada** (hachurada) e nenhum alvo vira *Novo requerimento possível*: a categoria passa a ser **Disponibilidade não verificada**, com o aviso *A favorabilidade apresentada não comprova disponibilidade para requerimento*. Cada alvo informa também quanto da zona dele está sem processo.
- **Pintas de ouro em bateia:** a contagem agora vem do campo certo (*quantidade*); registro sem contagem é descartado (antes, contava como 1 pinta).
- **Geologia de detalhe que não respondeu** (1:25.000 a 1:250.000) aparece como lacuna, em vez de sumir.
- **ANM sempre ao vivo e idade do cache.** Consultas à ANM não usam o cache de 12 h do servidor local (prioridade de protocolo depende do dado do momento). Quando outra fonte crítica vem do cache, o quadro informa a idade da resposta.
- **Pacote de evidências (JSON):** cada fonte traz *completude* e motivo, a origem (ao vivo ou cache, com idade); há um bloco *decisao* (classe, se é conclusiva, fontes críticas e próxima ação) e o requerimento traz o status da área livre e o motivo de a poligonal não ter sido gerada.
- **Testes de segurança:** abra `http://localhost:8766/testes.html` — 17 cenários simulados (fontes falhando, listas parciais, recorte com erro, ANM da janela fora do ar, pintas, cache, pacote JSON) rodam no navegador, sem internet, e mostram *passou/falhou* em cada verificação.

## Limitações conhecidas na v0.4.2

A auditoria independente confirmou os 17 testes fornecidos, mas também identificou pontos que permanecem no roadmap de correção:

- a distância polígono–polígono ainda pode ser superestimada em determinadas geometrias;
- a união de sobreposições ainda limita o processamento a 400 feições;
- algumas mensagens secundárias de ausência podem aparecer mesmo quando a fonte está parcial, embora o parecer crítico fique inconclusivo;
- uma AOI autointersectada ainda pode ser aceita durante a edição manual;
- áreas que cruzam divisas estaduais ainda usam apenas a UF do centro para selecionar pacotes estaduais.

Essas limitações não devem ser ocultadas em pareceres técnicos. Novas contribuições devem incluir testes de regressão e preservar a regra de que falha de consulta não comprova ausência.

## Novidades da v0.4.1 — fontes por finalidade

- **Pacote por finalidade.** Além das 102 camadas fixas, cada finalidade puxa sozinha as camadas opcionais que importam para ela:
  - *Pesquisa / lavra mineral* (inclusive *Local para requerimento*): +18 — geologia em todas as escalas (1:25.000 a 1:1.000.000 e mapas estaduais), geocronologia, petrografia, paleontologia, mapa tectônico e bacias sedimentares, geoquímica (sedimentos de corrente, geoquímica integrada e de baixa densidade) e recursos minerais (diamante, lítio) do Serviço Geológico, e áreas de extração mineral do IBGE;
  - *Usina solar / geração de energia*: +29 — geração planejada, gás natural e combustíveis da EPE;
  - *Aquisição ou arrendamento de terra*: +1 — os Planos de Ação Nacional para espécies ameaçadas numa consulta só (quais planos abrangem a área), no lugar das 67 camadas separadas. As áreas estratégicas dos planos continuam entre as fixas, em todas as finalidades;
  - *Due diligence geral*: só as fixas.
- **Camadas estaduais só no estado.** As 13 camadas do INEA entram sozinhas quando a área está no Rio de Janeiro (e não entram fora dele, nem se escolhidas à mão).
- **Varredura completa** (em *Camadas extras na análise*): soma todas as camadas consultáveis do catálogo (cerca de 280 no total). A análise fica 3 a 4 vezes mais demorada.
- **Contador claro**: acima do botão *Analisar*, a composição das fontes — ex.: *102 fixas + 18 do pacote de pesquisa mineral = 120*. O relatório traz a mesma composição em *Finalidade e abrangência*, e o quadro *Dentro ou fora* marca as camadas que vieram do pacote, do estado ou da varredura.

## Novidades da v0.4.0 — slides

- **Gerar slides** (no lugar de *Prompt para IA*, depois de concluída a análise): monta numa nova aba uma apresentação enxuta, com o mesmo conteúdo do relatório:
  - capa (município, finalidade, coordenadas, área, satélite em página inteira e os mapas do estado e da mesorregião);
  - finalidade e abrangência; viabilidade do requerimento (mapa, números e o que exige ação); parecer preliminar; alvo da pesquisa (ou ocorrências no entorno); oportunidades (mapa de favorabilidade ocupando a altura toda do slide); ranking dos alvos; interpretação geológica; achados; próximos passos e ressalvas;
  - cada slide só aparece quando a análise tem aquele dado (sem requerimento, sem slide de requerimento; sem bem específico, sem oportunidades);
  - o título de cada slide é a conclusão (ex.: *Pode requerer, com ajustes na poligonal*), não o nome da seção.
- Na aba dos slides: **Apresentar** (tela cheia; setas, espaço ou clique avançam, Esc sai), **Salvar PDF** (uma página 16:9 por slide, salva em `relatorios` e aberta no leitor) e **Baixar PowerPoint** (.pptx editável, salvo na mesma pasta e aberto no PowerPoint). As apresentações ficam no histórico, junto com os relatórios.
- **Mapa de favorabilidade maior e com os processos da ANM**: a janela analisada passou de cerca de 20 km para cerca de 40 km de lado (65% do raio do alvo para cada lado, de 10 a 25 km), com células de 200 m em vez de ~275 m — os filões e corredores aparecem inteiros. Os processos do SIGMINE na janela (requerimento ou pesquisa, lavra, disponibilidade) são desenhados sobre o mapa, no relatório (com legenda e, no mapa interativo, camada *Processos ANM* com número, fase, titular e substância) e nos slides. O mapa interativo agora enquadra a janela inteira, sem margens sobrando.

## Novidades da v0.3.9 — inteligência mineral e revisão do comitê

- **Salvar PDF abre o arquivo no leitor.** O botão *Salvar PDF* do relatório pede ao servidor local que o Edge (ou o Chrome) do computador gere o PDF, já com os mapas carregados; o arquivo vai para `Documentos\VIP ANALYSIS\relatorios` (ou `C:\Users\<você>\VIP ANALYSIS\relatorios`) e abre sozinho no leitor de PDF padrão. A barra mostra onde foi salvo e um link para baixar uma cópia. Se o servidor não estiver aberto, cai na impressão do navegador (*Salvar como PDF*). *Imprimir* continua mandando para a impressora.
- **Capa: estado e mesorregião.** No lugar do Brasil, o mapa de cima mostra o estado com a mesorregião em destaque e o de baixo, a mesorregião com o município em destaque. O espaço vazio sob a imagem de satélite acabou.
- **Inteligência mineral** (*Um bem específico* e *Local para requerimento*), refeita a partir da revisão do geólogo:
  - **três produtos separados**: *onde procurar* (favorabilidade geológica), *onde é possível atuar* (disponibilidade: processos de terceiros por fase, oferta pública, áreas condicionadas e restritas) e *com que segurança* (confiabilidade: escala da geologia, espaçamento do aerolevantamento, densidade de amostras). A confiabilidade não entra na nota de favorabilidade;
  - **ranking de oportunidades**: cada alvo com nota de favorabilidade, confiabilidade, fatores favoráveis e desfavoráveis, situação no SIGMINE e via de acesso (*novo requerimento possível*, *aquisição, cessão ou parceria*, *parceria com o titular*, *oferta pública*, *restrito*);
  - **geologia na melhor escala disponível** em cada trecho (1:25.000, 1:50.000, 1:100.000, 1:150.000, 1:250.000 ou 1:1.000.000), com a área em hectares e a porcentagem de cada unidade dentro da área e a classe para o modelo (favorável, possível, pouco favorável); unidades que hospedam ocorrências conhecidas; **contatos** entre unidades e **interseções de estruturas**;
  - **contexto metalogenético e ocorrências análogas**: status, rochas hospedeiras e encaixantes, alterações descritas, províncias auríferas do SGB (para ouro);
  - **geofísica** com sete imagens (K, eTh, eU, Th/K, sinal analítico, campo magnético e 1ª derivada vertical), o levantamento que cobre a área (projeto, espaçamento e altura de voo) e o limite de resolução; percentis na área e em cada alvo; aviso de que K alto e Th/K baixo não provam alteração;
  - **geoquímica** de rocha, solo e sedimento de corrente com limiar de anomalia calculado por população (elemento, material, unidade e método: P90 e P97); tabela das amostras anômalas com material, método, data e projeto; projetos do SGB que cobrem a janela com link para o relatório no RIGeo; quando faltam amostras, o relatório conclui **“cobertura geoquímica pública insuficiente”** em vez de tratar a falta como ausência;
  - **síntese** do que fortalece e do que enfraquece, **bases insuficientes e próximos levantamentos**, e a tabela de pesos e de qualidade de cada evidência (cada evidência entra uma vez).
- **Correções de método apontadas pelo comitê**: o quadrado de requerimento em volta de um ponto é calibrado pela área geodésica e nunca passa do limite (antes saía com 2.009 ha para um limite de 2.000); distâncias a feições de base 1:1.000.000 aparecem como “cerca de” ou “menos de”, sem metros falsamente precisos; a área sobreposta por CAR e por desmatamento (PRODES) é a união das sobreposições, por ano no PRODES, sem somar o mesmo hectare duas vezes; CAR é descrito como cadastro autodeclarado, que não equivale a proprietário; o CAR no ponto central é desenhado como caixa envolvente, não como limite do imóvel; “livre” virou “sem interferência nas bases consultadas”; Bateia mostra “aderência ao modelo”, não probabilidade.

## Novidades da v0.3.8

- **Localizador do topo busca cidade e lugar**, não só coordenada. Digite o município (ex.: *Picuí PB*): aparece a lista do IBGE e, ao escolher, o mapa vai até o limite do município. Para serras, fazendas, rios, povoados e minas, a lista oferece *Procurar em lugares* (OpenStreetMap); o lugar escolhido pode virar ponto de análise com um clique. Coordenadas continuam funcionando como antes (decimal, GMS e UTM).
- **Busca de processos minerários** na barra do mapa, ao lado do Mapa-base: número do processo (ex.: *846123/2019*), nome da empresa ou do titular, em todo o Brasil ou só no estado de trabalho. Mostra quantos processos, titulares e hectares, a divisão por fase, a lista (com download em CSV) e desenha todos no mapa. Cada processo abre uma ficha com fase, titular, substância, área e último evento, e os botões *Usar como área de interesse*, *Outros processos do titular*, *Copiar nº* e *Cadastro Mineiro* (o número vai copiado: cole no campo e digite o código da imagem).
- **Local para requerimento** (finalidade *Pesquisa / lavra mineral*): roda todos os setores e todas as camadas com regra de restrição e responde se dá para requerer a área na ANM:
  - **veredito**: pode requerer, pode com ajustes, pode com condicionantes, não requerer ou inconclusivo (quando o SIGMINE, a FUNAI, o cadastro de UCs ou as áreas de bloqueio não respondem);
  - **checklist**: direitos minerários de terceiros, áreas em disponibilidade e estoque, bloqueios, reservas garimpeiras, proteção de fonte, terras indígenas, UCs (proteção integral impede; uso sustentável condiciona; zona de amortecimento), quilombos, assentamentos, faixa de fronteira, áreas militares e urbanas, CNEN, terrenos da União, embargos, cavidades, sítios arqueológicos, APP e faixas de servidão — cada item com a evidência e o que fazer;
  - **área livre**: desconta processos de terceiros, disponibilidade, bloqueios, terra indígena, UC de proteção integral e área militar;
  - **limite de área da substância** (50 ha para gemas, feldspato, mica, areia e construção civil; 1.000 ha para rochas ornamentais e demais; 2.000 ha para metálicos, fertilizantes, carvão e diamante; 10.000 ha na Amazônia Legal);
  - **lados N-S e L-O**: confere a poligonal e gera uma **poligonal N-S/L-O sugerida** sobre a área livre, com KML e memorial de vértices (SIRGAS 2000) para conferência;
  - para **ponto**, analisa um quadrado N-S/L-O com a área pretendida (ou o máximo da substância), centrado no ponto.
- **Mapa de favorabilidade** para *Um bem específico*: cruza, numa grade em volta da área, ocorrências do bem e do mesmo sistema mineral (GEOBANK), litologia (1:100.000 do SGB), estruturas, gamaespectrometria (K, eTh, eU, Th/K), magnetometria (campo anômalo e sinal analítico) e geoquímica de sedimento de corrente, com os pesos do sistema mineral do bem (pegmatitos e gemas, ouro, ferro e manganês, cobre, máfico-ultramáficas, carbonatitos, diamante, minerais industriais). Resultado: mapa de calor no mapa e no relatório, até seis **alvos (F1, F2…)** com coordenadas, por que cada um se destaca e se a área está livre ou onerada no SIGMINE, as camadas cruzadas lado a lado e uma **leitura geofísica** com as seis imagens aerogeofísicas e o percentil de cada alvo.

## Novidades da v0.3.7 — relatório para investidor

- **Capa nova**, no padrão claro: logo, título com o município e o estado, e um painel com a **ficha completa do local**:
  - imagem de satélite da área e dois mapas de localização (o estado no Brasil e o município no estado);
  - **localização**: município e código IBGE, estado, região, região intermediária e imediata, meso e microrregião, bioma, Amazônia Legal e faixa de fronteira;
  - **coordenadas** em decimal, graus-minutos-segundos e UTM (fuso, meridiano central, SIRGAS 2000) e **altitude**;
  - **área e geometria**: tipo, área, perímetro, vértices e entorno pesquisado;
  - **o município em números** (IBGE): população do Censo 2022, área, densidade, PIB, PIB por habitante e a composição da economia (serviços, administração pública, agropecuária, indústria);
  - **clima** da normal 1991–2020: classificação de Köppen calculada, gráfico de chuva e temperatura mês a mês, chuva anual e estação chuvosa, meses secos, índice de aridez e irradiação solar;
  - **distâncias e acessos**, em linha reta, direção e **por estrada com tempo estimado**: sede do município (e a cidade mais próxima, se for outra), capital do estado, rodovia federal (com o tipo de pavimento quando o DNIT responde), ferrovia, porto marítimo público, terminal portuário, aeródromo público (pista e pavimento), pista privada mais próxima, via mais próxima e, quando o setor de energia é analisado, linha de transmissão, subestação e rede de média tensão.
- **1. Finalidade e abrangência**: a finalidade e o texto do solicitante, **para quê** o relatório serve, **o que ele abrange** (quantas consultas, em quais setores, órgãos, raios, alvo, Bateia, filtros, data) e **o que fica de fora**; quatro indicadores (consultas concluídas, registros com interseção, no entorno, indisponíveis).
- **2. Parecer preliminar**: o veredito da triagem, com os **pontos de atenção** e os **pontos a favor** lado a lado, cada um com as evidências.
- **3. Localização e evidências cartográficas**: o mapa interativo (e a versão estática na impressão).
- Impressão/PDF em A4 reorganizada: capa e ficha nas duas primeiras páginas.
- Fontes novas da ficha: IBGE (Localidades, Censo, PIB dos Municípios, malhas), ERA5 via Open-Meteo, ANM/SIGMINE (sedes, rodovias, ferrovias, portos), ANAC via DNIT (aeródromos) e OSRM/OpenStreetMap (rotas). A ficha roda em paralelo com a análise; se alguma fonte não responder, o item fica de fora e a ficha diz qual.

## Novidades da v0.3.6

- **Alvo da pesquisa mineral**: na finalidade *Pesquisa / lavra mineral*, escolha **Varredura geral** ou **Um bem específico** (mineral, minério ou gema — a lista traz o que o GEOBANK registra no estado). Se não escolher, a plataforma pergunta antes de analisar ou gerar o relatório. Com um alvo, ela busca as ocorrências dele no GEOBANK e os processos da ANM com essa substância num raio próprio (30 km por padrão), considerando sinônimos e minerais-minério (ex.: lítio → espodumênio, lepidolita; tântalo → tantalita, columbita; berilo → água-marinha, esmeralda). O resultado aparece no painel, no mapa (roxo), nos achados (A#) e numa seção própria do relatório.
- **Relatório novo**: capa com o local, o veredito e a imagem da área; sumário lateral; achados agrupados por nível; **mapa das ocorrências** do bem pesquisado (ou de todas, na varredura geral) com legenda por status (mina, garimpo, não explotado); quadro dentro/fora recolhível por setor; lacunas reunidas numa seção própria; versão para impressão com mapas estáticos.
- **Mostrar só este estado** agora recorta **todas** as camadas (WMS, imagens ArcGIS, bases locais, BDGD e topografia) no limite da UF; as camadas com campo de UF continuam vindo filtradas do servidor.
- **Mapa-base** saiu da aba Camadas e foi para a barra do mapa, ao lado de *Mineração · Bateia*.
- *Topografia calculada* e *Rede de distribuição (BDGD)* viraram retângulos que abrem e fecham, como os setores.
- **Bateia** com o mapa ocupando toda a altura da aba.
- Logo na proporção original (emblema sobre o nome).

## Novidades da v0.3.5

- **INCRA fora do ar**: desde 29/10/2026 os endereços `certificacao.incra.gov.br` (download de SIGEF/SNCI) e `acervofundiario.incra.gov.br` não existem mais na internet (conferido no DNS do Google; o próprio servidor de nomes do INCRA responde que o nome não existe). O erro agora diz isso com clareza, em vez de “getaddrinfo failed”. Bases já baixadas continuam funcionando; para uma UF nova, use **Importar .zip** com o shapefile obtido por outro caminho, até o INCRA voltar.
- Quando a pasta Documentos está no **OneDrive**, as bases vão para `C:\Users\<você>\VIP ANALYSIS\dados` (as que já estavam no OneDrive são movidas sozinhas).

## Novidades da v0.3.4 — Filtros

Botão **Filtros** no canto direito, acima do mapa (ou **filtrar** em cada camada ligada, em Camadas):

1. **Setor** — Energia e Infraestrutura, Mineração, Fundiário, Ambiental, Referência e Território.
2. **Camada** — as ligadas no mapa aparecem primeiro; escolher uma desligada a liga ao aplicar.
3. **Condições da camada** — cada tipo de camada traz as suas:
   - *Processos minerários ativos (SIGMINE) e demais camadas da ANM com fase e substância*: fase (disponibilidade, requerimento/autorização de pesquisa, requerimento de lavra, concessão de lavra, licenciamento, lavra garimpeira…), substância, uso, titular, ano e área;
   - *GEOBANK (SGB)*: mineral/substância, status econômico (garimpo, mina…), importância, classe utilitária e município;
   - *Unidades de conservação*: categoria, grupo, esfera e UF;
   - *BDGD*: tensão, fases, alimentador e distribuidora;
   - *qualquer outra camada*: **+ Filtrar por outro campo**, com a lista de valores existentes (no estado de trabalho) ou busca por texto e intervalo para números.

O filtro muda o desenho no mapa e a ficha do clique. A análise e o relatório só usam os filtros se você marcar **“Aplicar os filtros também à análise e ao relatório”** — assim uma restrição não some da triagem sem querer; quando marcado, o relatório lista os filtros usados. Os filtros ficam guardados no navegador; o botão mostra quantas camadas estão filtradas.

## Novidades da v0.3.3

- Tela inicial mais limpa: o cartão da área só aparece depois que a área é definida (o botão *estudos salvos* foi para o cartão *Finalidade*).
- **Google com teto de uso**: 90.000 blocos por mês (a cota grátis é de 100.000) e 6.000 por dia, ajustáveis; ao atingir, o mapa volta sozinho para o Esri. O uso aparece em Camadas › Mapa-base. Saiu a opção *Google — terreno*.
- **Satélite Esri sem o cinza “Map data not yet available”**: onde o Esri não tem imagem no zoom pedido, a plataforma usa a imagem mais detalhada que existe ali e a amplia.
- Camadas: *Topografia calculada* e *Rede de distribuição (BDGD)* ficam abaixo da lista, depois de *Referência e Território*. Na BDGD, as distribuidoras do estado de trabalho aparecem primeiro.
- Bases baixadas em `Documentos\VIP ANALYSIS\dados`, valendo para todas as versões (as da v0.3.2 são trazidas sozinhas); se a janela de uma versão antiga estiver aberta, o `iniciar.bat` avisa para fechá-la.
- Logo maior.

## Novidades da v0.3.2

- **A área se define só pelas ferramentas do topo** (Ponto, Polígono, Retângulo, Círculo, Importar ou coordenada digitada). Aí acendem **Analisar área** e **Gerar relatório ↗**.
- **Clique em qualquer elemento do mapa** e aparece a informação dele: resultados da análise (todos os que estão naquele ponto, com atributos, situação dentro/entorno e o E#), alimentadores e transformadores da BDGD, parcelas SIGEF/SNCI; nas camadas de imagem (SIGMINE, UCs…), a ficha consulta o que há no ponto.
- **Gerar relatório abre uma nova aba** e o relatório é gerado nela: progresso fonte a fonte, espera da Bateia (com opção de seguir sem ela) e, no fim, o relatório completo. Ele fica guardado no navegador: recarregar a aba ou abrir pelo histórico (*estudos salvos*) mostra o mesmo relatório.
- Relatório com **ocorrências minerais do SGB** em destaque e botão **Voltar ao mapa**.
- Logo maior e com a proporção original; polígonos muito maiores que a área (município, bioma) ficam só com o contorno, para não tingir o mapa; camadas de referência ligadas no mapa não entram mais sozinhas na análise.

## O que mudou desde a v0.2 (varredura da versão feita no ChatGPT)

Tudo o que a outra versão tinha e esta não tinha foi incorporado; o que ela tinha e não funciona hoje ficou registrado como pendência, com o motivo.

| Item | Como ficou na v0.3 |
|---|---|
| Catálogo | **445 camadas** (eram 147): Energia 126 · Mineração 52 · Fundiário 27 · Ambiental 220 · Referência 20. Entraram as camadas individuais da EPE (geração, combustíveis, gás, E&P, socioambiental), PANs e áreas do ICMBio, a **BC250 do IBGE (67 temas)**, o INEA-RJ, os 57 mapas do **SICAR** (APP, reserva legal, vegetação nativa, uso restrito…), hidrografia e vegetação do INPE e o GeoServer do SGB. |
| Camadas na análise | 103 entram sempre; outras **269 podem entrar**: ligue a camada no mapa ou marque em **Camadas extras** — cada uma ganha o teste dentro / entorno / fora. |
| Ficha da camada | Botão **ⓘ** em cada camada: órgão, serviço, metadados oficiais e link do serviço. Legenda das fases do SIGMINE fixa. |
| CAR por coordenada | Consulta oficial do SICAR no ponto: código do imóvel, município, área, módulos fiscais, inscrição e retificação. Aparece na ficha do clique, na análise e no relatório. |
| Cota e topografia | Cota no centro da área e no clique (Copernicus GLO-90). **Curvas de nível** com intervalo à escolha, **relevo sombreado** e **declividade em classes** (Embrapa), calculados no navegador. |
| Área | Vértices **editáveis** em UTM ou graus, com bloqueio de polígono que se cruza; arquivo com várias feições pede qual usar. |
| Resultados | Cada registro abre com **todos os atributos** (nomes legíveis do serviço) e há filtro por texto em cada fonte. |
| Estudos | **Salvar estudo** e histórico de relatórios no próprio navegador; reabrir restaura área e parâmetros. |
| Relatório | KPIs, finalidade descrita, cota, CAR, **mapa interativo** (e estático para impressão), atributos dos registros, método, pendências e dados embutidos para exportar. |
| **Rede de média tensão (BDGD)** | A outra versão tinha MT de 3 estados fixos. Aqui, **qualquer distribuidora publicada pela ANEEL** (114 na lista de 27/10/2026): a BDGD oficial da ANEEL é baixada pelo servidor local e vira camadas de alimentadores (com tensão e fases), subestações e transformadores — e entra na análise (distância à rede, trecho trifásico, subestação de distribuição mais próxima). |

## Rede de distribuição — BDGD (ANEEL)

Em **Camadas › Rede de distribuição — BDGD**:

1. **Instalar leitor** (só na primeira vez; instala o `pyogrio`, cerca de 30 MB).
2. **Adicionar distribuidora** → escolha a da sua região (a análise sugere o nome pela área de atuação da ANEEL) → **Instalar**. Bases grandes demoram: Energisa PB ~590 MB, Neoenergia Coelba ~2 GB.
3. Pronto: ligue **Rede de média tensão — alimentadores**, **Subestações de distribuição** e **Transformadores de média tensão** (aparecem a partir do zoom 12, 9 e 14). A análise passa a medir a distância à rede.

Se o download pelo servidor falhar, baixe a BDGD em dadosabertos-aneel.opendata.arcgis.com (busque “BDGD” + nome da distribuidora) e use **Importar .zip**.

Limite importante: a BDGD mostra **onde está a rede**, não a **capacidade disponível**. Para minigeração distribuída, a viabilidade de conexão continua dependendo da consulta de acesso à distribuidora.

## Uso rápido

| Ação | Como |
|---|---|
| Ver um elemento | Clique nele no mapa: atributos do elemento; num lugar vazio, coordenadas, município, cota, CAR e o que as camadas ligadas dizem ali |
| Coordenada | Campo do topo: `-7.0812, -36.8423` · `7°04'52"S 36°50'32"O` · `24S 738333 9216722` |
| Desenhar | Ponto, Polígono (clique no 1º vértice para fechar), Retângulo, Círculo; **Editar** ajusta vértices |
| Importar | KML, KMZ, GeoJSON ou shapefile compactado (.zip) |
| Analisar | Defina a área no topo, escolha a finalidade e os setores e clique em **Analisar área** (resultados no painel) ou **Gerar relatório ↗** (nova aba) |
| Evidências | Clique em qualquer `E#` para localizar o registro no mapa |
| Saídas | Relatório (interativo, PDF), Slides (apresentação, PDF e PowerPoint), Pacote de evidências (JSON), GeoJSON |

## Bases SIGEF/SNCI por estado

O WFS do Acervo Fundiário do INCRA está fora do ar, então a plataforma guarda o shapefile da UF no seu computador (`dados/`). Em **Camadas › Bases do INCRA**: **Baixar do INCRA** ou **Importar .zip** (se o INCRA exigir login gov.br, baixe o shapefile da UF no portal e importe).

## Pendências (registradas na própria plataforma, em Camadas)

IBAMA (embargos) e GeoBahia sem serviço público funcionando; ONR exige token (matrícula só por certidão); APP legal completa não é publicada como dado; parte do GeoServer do SGB e os autos do ICMBio com erro no servidor do órgão; focos de queimadas saíram do TerraBrasilis.

## Estrutura

```
index.html            interface (com o mapa-base na barra do mapa)
relatorio.html        aba do relatório (gerado nela, com progresso; reabre pelo histórico)
css/app.css           tema da marca (claro/escuro)
lib/                  bibliotecas (Leaflet, Geoman, Turf, proj4, JSZip, toGeoJSON, shpjs) — funciona sem CDN
js/util.js            rede (direto → servidor local), ArcGIS, WFS/GML, geometria, coordenadas
js/catalogo.js        camadas principais por setor: como desenhar, consultar, analisar e a regra legal
js/catalogo-extra.js  camadas incorporadas da varredura (EPE, ICMBio, IBGE BC250, INEA, SICAR, INPE, SGB) e pendências
js/mapa.js            mapas-base, camadas, ficha do ponto, CAR por coordenada, régua, bases locais
js/topografia.js      curvas de nível, relevo sombreado, declividade e cota
js/bdgd.js            BDGD da ANEEL: consulta, tradução dos códigos (tensão, potência) e painel
js/alvo.js            alvo da pesquisa mineral: sinônimos, busca no GEOBANK e na ANM
js/analise.js         motor: dentro/entorno/fora por camada, distâncias, sobreposição, faixas legais
js/regras.js          achados por finalidade com evidências e grau de certeza; quadro dentro/fora
js/relatorio.js       relatório interativo, pacote de evidências e prompt de IA
js/bateia.js          ponte com a Bateia (lado da VIP)
js/app.js             interface: área, parâmetros, execução, resultados, camadas, estudos e saídas
js/pagina-relatorio.js  lado da aba do relatório: progresso, espera da Bateia, relatório guardado
bateia/               a Bateia completa + ponte-vip.js
servidor.py           servidor local: proxy restrito com cache de 12 h, bases SIGEF/SNCI e BDGD
dados/                bases instaladas (criado ao baixar/importar)
cache/                cache do proxy (pode apagar a qualquer momento)
```

## Licença

Este projeto é distribuído sob a [licença MIT](LICENSE). As bibliotecas de terceiros em `lib/` e os dados oficiais consultados permanecem sujeitos às suas respectivas licenças, termos de uso e atribuições.
