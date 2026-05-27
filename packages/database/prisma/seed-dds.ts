/**
 * Seed: 20 DDS de exemplo (sistema — companyId = null)
 * Execute: cd packages/database && npx tsx prisma/seed-dds.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DDS_LIST = [
  // ── TRABALHO EM ALTURA (4) ───────────────────────────────────────────────
  {
    title: 'Uso correto do cinto de segurança',
    category: 'HEIGHT_WORK',
    tags: ['cinto','altura','EPI','NR-35','queda'],
    duration: 15,
    order: 1,
    content: `**Objetivo**
Orientar os trabalhadores sobre o uso correto do cinto de segurança tipo paraquedista em trabalhos em altura acima de 2 metros.

**Riscos envolvidos**
- Queda de altura com risco de morte ou lesões graves
- Uso incorreto resultando em trauma por impacto do cinto
- Cinto danificado ou fora do prazo de validade

**Medidas de prevenção**
- Inspecionar o cinto antes de cada uso (fivelas, costuras, tiras e talabarte)
- Ajustar o cinto ao corpo antes de subir — não ajuste na altura
- Conectar o talabarte a ponto de ancoragem resistente (mínimo 15 kN)
- Manter o talabarte o mais curto possível para limitar a queda livre
- Nunca usar cinto tipo abdominal para trabalho em altura
- Substituir o cinto imediatamente após uma queda, mesmo sem danos visíveis

**Legislação aplicável**
NR-35 (Trabalho em Altura) — Portaria MTE nº 313/2012

**Mensagem final**
O cinto de segurança é sua última linha de defesa. Use sempre, use correto. Sua família espera você em casa!`,
  },
  {
    title: 'Trabalho em andaimes — inspeção antes do uso',
    category: 'HEIGHT_WORK',
    tags: ['andaime','altura','inspeção','queda','NR-18'],
    duration: 15,
    order: 2,
    content: `**Objetivo**
Orientar sobre os procedimentos de inspeção obrigatória de andaimes antes do início das atividades.

**Riscos envolvidos**
- Colapso do andaime por montagem inadequada
- Queda de trabalhadores por piso defeituoso ou sem guarda-corpo
- Queda de materiais e ferramentas sobre outras pessoas

**Medidas de prevenção**
- Inspecionar visualmente todos os componentes antes de subir
- Verificar fixação das braçadeiras e encaixes das peças
- Confirmar que o piso (tábuas ou chapas) está firme e sem buracos
- Checar presença e integridade dos guarda-corpos (h ≥ 1,20 m) e rodapé (h ≥ 20 cm)
- Não trabalhar em andaime quando estiver carregado acima da capacidade
- Confirmar nivelamento e apoio estável sobre o solo

**Legislação aplicável**
NR-18 item 18.14 — Andaimes e Plataformas de Trabalho

**Mensagem final**
Dois minutos de inspeção podem evitar um acidente que muda uma vida para sempre. Inspecione sempre!`,
  },
  {
    title: 'Linha de vida horizontal — ancoragem e utilização',
    category: 'HEIGHT_WORK',
    tags: ['linha de vida','ancoragem','altura','NR-35','EPI'],
    duration: 20,
    order: 3,
    content: `**Objetivo**
Ensinar o uso correto da linha de vida horizontal em coberturas, telhados e estruturas planas.

**Riscos envolvidos**
- Queda em superfícies inclinadas ou escorregadias
- Ancoragem insuficiente cedendo durante a queda
- Choque de impacto ao final da queda caso o talabarte seja muito longo

**Medidas de prevenção**
- Utilizar cabo de aço ou corda certificada com resistência mínima de 15 kN
- Instalar a linha de vida acima do nível dos ombros do trabalhador sempre que possível
- Limitar o número de trabalhadores por trecho de linha conforme projeto
- Usar conector deslizante (cabo guia) de forma que o talabarte fique curto
- Nunca improvisar pontos de ancoragem — use estruturas dimensionadas

**Legislação aplicável**
NR-35 | NBR 14626 (Dispositivos de Ancoragem)

**Mensagem final**
A linha de vida salva vidas somente quando está instalada corretamente. Confira antes de confiar!`,
  },
  {
    title: 'Proibições no trabalho em altura — o que nunca fazer',
    category: 'HEIGHT_WORK',
    tags: ['altura','proibição','segurança','queda','NR-35'],
    duration: 10,
    order: 4,
    content: `**Objetivo**
Reforçar as proibições mais importantes que todo trabalhador em altura deve conhecer.

**Riscos envolvidos**
- Queda livre sem proteção adequada
- Perda de equilíbrio por postura inadequada ou distração
- Choque por contato com partes energizadas próximas

**Medidas de prevenção — O que NUNCA fazer:**
- NUNCA subir sem cinto de segurança paraquedista conectado
- NUNCA trabalhar em altura com sintomas de vertigem, enjoo ou sob efeito de medicamentos
- NUNCA jogar materiais ou ferramentas de cima para baixo
- NUNCA apoiar escadas em superfícies instáveis ou a ângulos incorretos (ideal: 75°)
- NUNCA trabalhar em altura durante tempestades, raios ou ventos fortes
- NUNCA remover proteções coletivas (guarda-corpos, redes) sem autorização

**Legislação aplicável**
NR-35 | NR-18 item 18.3 (Medidas Preventivas)

**Mensagem final**
Na altura, não há segunda chance. Respeite as proibições — elas existem porque alguém pagou um preço muito alto por não respeitá-las.`,
  },

  // ── EPIs (3) ─────────────────────────────────────────────────────────────
  {
    title: 'Capacete de segurança — uso e conservação',
    category: 'PPE',
    tags: ['capacete','EPI','cabeça','proteção','NR-6'],
    duration: 10,
    order: 1,
    content: `**Objetivo**
Orientar sobre a obrigatoriedade, uso correto e conservação do capacete de segurança em obras de construção civil.

**Riscos envolvidos**
- Traumatismo cranioencefálico por queda de objetos
- Choque elétrico (para capacetes classe B)
- Lesões por impacto lateral da cabeça contra estruturas

**Medidas de prevenção**
- Usar o capacete durante toda a permanência na área de obra, sem exceção
- Ajustar o carnê interno para firmeza sem apertar excessivamente
- Verificar diariamente fissuras, rachaduras ou deformações no casco
- Não pintar, furar, colar adesivos no casco (altera a resistência)
- Substituir após qualquer impacto forte, mesmo sem dano visível
- Substituir a cada 5 anos ou conforme prazo do fabricante

**Legislação aplicável**
NR-6 (EPI) | NBR 8221 (Capacetes de Segurança)

**Mensagem final**
O capacete pesa menos de 400g. Uma lesão na cabeça pode pesar por toda a vida. Use sempre!`,
  },
  {
    title: 'Calçado de segurança — escolha correta e uso',
    category: 'PPE',
    tags: ['bota','calçado','EPI','pé','NR-6','perfuração'],
    duration: 10,
    order: 2,
    content: `**Objetivo**
Orientar sobre os tipos de calçado de segurança e como usar corretamente para proteção dos pés.

**Riscos envolvidos**
- Perfuração do pé por pregos ou ferragens
- Esmagamento por queda de materiais pesados
- Torção e quedas em superfícies molhadas ou instáveis
- Choque elétrico (sem calçado dielétrico)

**Medidas de prevenção**
- Usar calçado com biqueira de aço (CA válido) quando há risco de queda de objetos
- Usar calçado com palmilha anti-perfuração em locais com pregos e ferragens no chão
- Usar calçado dielétrico próximo a sistemas elétricos
- Inspecionar o calçado diariamente — sola solta ou furada deve ser substituída
- Amarrar bem os cadarços para evitar torção
- Nunca usar chinelos ou tênis comum em obra

**Legislação aplicável**
NR-6 (EPI) | NBR ISO 20345 (Calçado de Segurança)

**Mensagem final**
Seus pés carregam você por toda a vida. Proteja-os com o calçado correto todos os dias!`,
  },
  {
    title: 'Protetor auditivo — quando e como usar',
    category: 'PPE',
    tags: ['protetor auditivo','EPI','ruído','surdez','NR-6','NR-15'],
    duration: 10,
    order: 3,
    content: `**Objetivo**
Alertar sobre os danos causados pelo ruído excessivo e como o protetor auditivo deve ser usado corretamente.

**Riscos envolvidos**
- Perda auditiva progressiva e irreversível (PAIR)
- Zumbido crônico nos ouvidos
- Estresse, distúrbios do sono e hipertensão

**Medidas de prevenção**
- Usar protetor auditivo em áreas com ruído superior a 85 dB(A)
- Inserir corretamente o protetor tipo espuma: enrolar, inserir e segurar 20s
- Para protetor concha: ajustar para cobrir completamente as orelhas
- Limpar e armazenar adequadamente após cada uso
- Substituir quando deformado, rasgado ou com elasticidade reduzida
- Não retirar o protetor em nenhum momento na área ruidosa — a proteção cai drasticamente

**Legislação aplicável**
NR-6 | NR-15 Anexo 1 (Ruído Contínuo)

**Mensagem final**
A surdez não dói enquanto acontece — você só percebe quando já é tarde. Proteja sua audição hoje!`,
  },

  // ── FERRAMENTAS (3) ──────────────────────────────────────────────────────
  {
    title: 'Uso seguro de esmerilhadeira angular',
    category: 'TOOLS',
    tags: ['esmerilhadeira','rebarbadora','disco','corte','ferramentas'],
    duration: 15,
    order: 1,
    content: `**Objetivo**
Orientar sobre os riscos do uso da esmerilhadeira angular (rebarbadora) e as medidas de segurança obrigatórias.

**Riscos envolvidos**
- Fragmentação do disco causando projeção de estilhaços
- Corte ou amputação por contato com o disco em movimento
- Incêndio por faíscas em locais com materiais inflamáveis
- Lesão ocular por projeção de partículas

**Medidas de prevenção**
- Usar óculos de proteção e protetor facial, luvas de raspa e avental
- Verificar se o disco é compatível com a máquina (diâmetro e rpm máximo)
- Inspecionar o disco antes do uso — discos trincados ou lascados devem ser descartados
- Nunca retirar a proteção do disco
- Segurar a máquina com as duas mãos; manter firme durante o uso
- Nunca usar disco de corte para esmerilhar (lixar) — use disco próprio
- Aguardar o disco parar completamente antes de pousar a máquina

**Legislação aplicável**
NR-12 (Máquinas e Equipamentos) | NR-6 (EPI)

**Mensagem final**
A esmerilhadeira é uma das ferramentas que mais causam acidentes graves em obras. Respeito e atenção em cada uso!`,
  },
  {
    title: 'Inspeção de ferramentas manuais antes do uso',
    category: 'TOOLS',
    tags: ['ferramentas manuais','marreta','chave','inspeção','manutenção'],
    duration: 10,
    order: 2,
    content: `**Objetivo**
Criar o hábito de inspecionar ferramentas manuais antes do uso para evitar acidentes.

**Riscos envolvidos**
- Fratura de cabo causando projeção da parte metálica
- Cortes por ferramentas com gumes expostos ou quebrados
- Lesões por uso inadequado da ferramenta para função incorreta

**Medidas de prevenção**
- Inspecionar cabo, corpo e gume antes de cada uso
- Substituir imediatamente ferramentas com cabos trincados, soltos ou lascados
- Nunca usar chave de boca como martelo
- Guardar ferramentas cortantes com a lâmina protegida (bainha)
- Não transportar ferramentas no bolso — use cinto ou bolsa de ferramentas
- Devolver ao almoxarifado ferramentas danificadas com etiqueta de "DEFEITO"

**Legislação aplicável**
NR-18 item 18.20 (Ferramentas Manuais)

**Mensagem final**
Ferramenta boa e conservada é sinal de profissional cuidadoso. Cuide dos seus instrumentos de trabalho!`,
  },
  {
    title: 'Segurança no uso de furadeira e parafusadeira',
    category: 'TOOLS',
    tags: ['furadeira','parafusadeira','ferramentas elétricas','choque'],
    duration: 10,
    order: 3,
    content: `**Objetivo**
Orientar sobre o uso seguro de ferramentas elétricas portáteis como furadeiras e parafusadeiras.

**Riscos envolvidos**
- Choque elétrico por cabo ou plugue danificado
- Projeção de fragmentos de broca quebrada
- Perfuração de tubulações ou fiações ocultas na parede

**Medidas de prevenção**
- Inspecionar cabo de alimentação antes de ligar — cabos pelados são emergência
- Usar broca/bit compatível com o material a ser perfurado
- Verificar com detector de metais/fiações antes de furar paredes
- Usar óculos de proteção ao perfurar concreto, cerâmica ou metal
- Nunca segurar a peça sendo perfurada com a mão livre — use torno ou grampo
- Desconectar da tomada antes de trocar brocas ou acessórios

**Legislação aplicável**
NR-12 | NR-10 (quando há risco elétrico)

**Mensagem final**
Dois segundos de descuido com uma ferramenta elétrica podem resultar em um choque que dura a vida toda. Atenção sempre!`,
  },

  // ── ELÉTRICA (2) ─────────────────────────────────────────────────────────
  {
    title: 'Perigos da eletricidade na construção civil',
    category: 'ELECTRICAL',
    tags: ['eletricidade','choque','NR-10','tensão','fiação'],
    duration: 20,
    order: 1,
    content: `**Objetivo**
Alertar sobre os principais riscos elétricos presentes nas obras de construção civil.

**Riscos envolvidos**
- Choque elétrico — pode causar parada cardíaca, queimaduras e morte
- Arco elétrico — explosão de plasma que provoca queimaduras gravíssimas
- Incêndio por curto-circuito em fiação improvisada ou sobrecarregada

**Medidas de prevenção**
- Nunca fazer instalações ou reparos elétricos sem habilitação NR-10
- Manter distância mínima de segurança de redes de MT/AT (min. 3 m para redes de 13,8 kV)
- Usar apenas extensões e conectores em bom estado, com aterramento
- Não sobrecarregar tomadas e benjamins — instale circuitos adicionais
- Desligar o disjuntor e sinalizar antes de qualquer trabalho elétrico (LOTO)
- Relatar imediatamente fios expostos, faíscas ou cheiro de queimado

**Legislação aplicável**
NR-10 (Segurança em Instalações Elétricas)

**Mensagem final**
A eletricidade não avisa — ela age em milissegundos. Respeite-a e nunca a subestime!`,
  },
  {
    title: 'LOTO — Bloqueio e etiquetagem antes de manutenção',
    category: 'ELECTRICAL',
    tags: ['LOTO','bloqueio','energia','NR-10','manutenção','segurança'],
    duration: 15,
    order: 2,
    content: `**Objetivo**
Ensinar o procedimento de LOTO (Lockout/Tagout) para isolamento seguro de energia antes de manutenções.

**Riscos envolvidos**
- Energização acidental durante manutenção causando choque elétrico
- Partida inesperada de equipamento prendendo o trabalhador
- Liberação de energia armazenada (capacitores, molas, pressão hidráulica)

**Medidas de prevenção**
- DESLIGAR o equipamento pelo controle operacional
- ISOLAR a fonte de energia (desligar o disjuntor ou chave seccionadora)
- BLOQUEAR com cadeado individual — cada trabalhador usa seu próprio cadeado
- ETIQUETAR com etiqueta de "BLOQUEADO — NÃO ENERGIZAR"
- TESTAR o equipamento para confirmar que está sem energia
- Somente o trabalhador que colocou o cadeado pode retirá-lo

**Legislação aplicável**
NR-10 item 10.6 (Procedimentos de Trabalho)

**Mensagem final**
Seu cadeado no disjuntor é a garantia de que ninguém vai energizar o sistema enquanto você está trabalhando. Nunca pule esse passo!`,
  },

  // ── ESCAVAÇÃO (2) ────────────────────────────────────────────────────────
  {
    title: 'Segurança em valas e escavações',
    category: 'EXCAVATION',
    tags: ['vala','escavação','solapamento','colapso','NR-18'],
    duration: 20,
    order: 1,
    content: `**Objetivo**
Alertar sobre os riscos de solapamento e colapso em valas e escavações e as medidas de prevenção.

**Riscos envolvidos**
- Solapamento e desmoronamento — a terra pode desmoronar sem aviso prévio
- Soterramento causando asfixia e morte em minutos
- Queda de materiais, veículos ou equipamentos sobre trabalhadores na vala

**Medidas de prevenção**
- Em valas com mais de 1,25 m de profundidade: usar escoramento ou taludes
- Nunca entrar em vala sem inspeção prévia de um responsável técnico
- Manter borda da vala livre de materiais escavados (min. 0,60 m de distância)
- Proibir circulação de veículos pesados próximo às bordas
- Prever escada a cada 25 m para saída de emergência
- Monitorar o clima — solo encharcado ou após chuvas forte exige nova vistoria

**Legislação aplicável**
NR-18 item 18.7 (Escavações, Fundações e Desmonte de Rochas)

**Mensagem final**
Uma vala sem escoramento adequado é uma armadilha mortal. Não entre até ter a garantia de que está seguro!`,
  },
  {
    title: 'Espaço confinado — riscos em tubulões e poços',
    category: 'EXCAVATION',
    tags: ['espaço confinado','tubulão','poço','oxigênio','NR-33'],
    duration: 20,
    order: 2,
    content: `**Objetivo**
Alertar sobre os riscos específicos de espaços confinados em obras de fundação.

**Riscos envolvidos**
- Atmosfera deficiente em oxigênio (abaixo de 19,5%) causando inconsciência em segundos
- Gases tóxicos (CO, H2S) acumulados no interior
- Solapamento das paredes do tubulão

**Medidas de prevenção**
- Nunca entrar em espaço confinado sem medição de gases com detector calibrado
- Manter ventilação forçada durante todo o tempo de permanência
- Trabalho sempre com vigia externo equipado e comunicando com o trabalhador interno
- Usar equipamento de proteção respiratória autônoma quando necessário
- Plano de resgate estabelecido antes de qualquer entrada
- Autorização de Entrada Segura (Permissão de Trabalho) obrigatória

**Legislação aplicável**
NR-33 (Segurança e Saúde em Espaços Confinados)

**Mensagem final**
Em espaço confinado, o que você não consegue ver pode te matar. Meça, ventile, comunique — sempre!`,
  },

  // ── PRIMEIROS SOCORROS (2) ───────────────────────────────────────────────
  {
    title: 'O que fazer em caso de acidente — primeiros passos',
    category: 'FIRST_AID',
    tags: ['primeiros socorros','acidente','SAMU','emergência'],
    duration: 15,
    order: 1,
    content: `**Objetivo**
Orientar todos os trabalhadores sobre os primeiros passos a seguir quando ocorre um acidente na obra.

**Riscos envolvidos**
- Agravamento da lesão por movimentação incorreta da vítima
- Perda de tempo precioso por falta de organização no atendimento
- Contaminação por manuseio sem proteção

**Medidas de prevenção — Sequência de ação:**
1. **PROTEGER** — garanta que a cena está segura para você e para a vítima
2. **CHAMAR** — acione o socorro: SAMU 192 | Bombeiros 193 | Emergência 190
3. **SOCORRER** — realize apenas o que você está treinado para fazer
4. Nunca remover vítima de queda de altura suspeita de lesão na coluna
5. Controlar hemorragia: pressão direta com pano limpo — não remover
6. Queimaduras: água fria por 10 minutos — nunca pasta de dente ou manteiga
7. Registrar horário do acidente e primeiros atendimentos realizados

**Legislação aplicável**
NR-18 item 18.30 (Emergências) | NR-7 (PCMSO)

**Mensagem final**
Em uma emergência, manter a calma salva vidas. Saiba o que fazer ANTES de precisar!`,
  },
  {
    title: 'RCP — Ressuscitação Cardiopulmonar básica',
    category: 'FIRST_AID',
    tags: ['RCP','parada cardíaca','coração','emergência','primeiros socorros'],
    duration: 20,
    order: 2,
    content: `**Objetivo**
Ensinar os passos básicos da RCP (Ressuscitação Cardiopulmonar) para situações de parada cardiorrespiratória.

**Riscos envolvidos**
- Parada cardíaca por choque elétrico, soterramento ou trauma grave
- Cada minuto sem RCP reduz 10% a chance de sobrevivência

**Medidas de prevenção — Técnica de RCP:**
1. **Confirmar** que a vítima está inconsciente e não respira normalmente
2. **Chamar socorro** imediatamente — SAMU 192
3. **Posicionar** a vítima de costas em superfície firme
4. **Comprimir** o centro do peito: 30 compressões fortes (5-6 cm de profundidade)
   - Frequência: 100 a 120 compressões por minuto
   - Braços estendidos, peso do corpo nas compressões
5. **Ventilar** (se treinado): 2 respirações boca a boca após 30 compressões
6. Continuar até a chegada do socorro ou até o DEA estar disponível

**Legislação aplicável**
Resolução CFM 1825/2007 | Recomendações AHA 2020

**Mensagem final**
RCP correta pode dobrar a chance de sobrevivência. Treine, mantenha a calma e aja rápido!`,
  },

  // ── SEGURANÇA GERAL (2) ──────────────────────────────────────────────────
  {
    title: 'Ordem e limpeza na obra — 5S na construção',
    category: 'GENERAL_SAFETY',
    tags: ['5S','organização','limpeza','acidente','housekeeping'],
    duration: 10,
    order: 1,
    content: `**Objetivo**
Conscientizar sobre a importância da organização e limpeza do canteiro para a segurança de todos.

**Riscos envolvidos**
- Tropeços e quedas por entulho, ferramentas e fios no chão
- Incêndio por acúmulo de materiais inflamáveis
- Dificuldade de evacuação em emergências por obstáculos nas rotas

**Medidas de prevenção**
- Limpar a área de trabalho ao final de cada turno
- Recolher pregos, arames e ferramentas do chão imediatamente
- Manter corredores e saídas de emergência sempre desobstruídos (min. 1,20 m de largura)
- Separar e destinar entulho diariamente — não deixar acumular
- Identificar e sinalizar materiais e equipamentos com etiquetas
- "Se não está usando, guarde. Se está quebrado, descarte ou repare."

**Legislação aplicável**
NR-18 item 18.2 (Organização do Canteiro)

**Mensagem final**
Um canteiro limpo e organizado não é luxo — é segurança. Cuide do seu espaço de trabalho!`,
  },
  {
    title: 'Comunicação de acidentes e quase-acidentes',
    category: 'GENERAL_SAFETY',
    tags: ['CAT','comunicação','acidente','quase-acidente','prevenção'],
    duration: 10,
    order: 2,
    content: `**Objetivo**
Orientar sobre a obrigatoriedade e importância de comunicar todos os acidentes e quase-acidentes ocorridos na obra.

**Riscos envolvidos**
- Subnotificação de acidentes impossibilita a prevenção
- Quase-acidentes ignorados tornam-se acidentes graves

**Medidas de prevenção**
- Comunicar IMEDIATAMENTE qualquer acidente ao encarregado ou responsável de segurança
- Emitir CAT (Comunicação de Acidente de Trabalho) em até 24 horas para acidentes com lesão
- Relatar quase-acidentes — situações em que "quase" aconteceu algo grave
- Nunca tentar esconder um acidente — isso prejudica a vítima e a empresa
- Participar das investigações de acidentes para identificar causas e evitar repetição
- Preencher relatório de quase-acidente mesmo quando não há lesão

**Legislação aplicável**
CLT Art. 169 | Lei 8.213/91 | NR-5 (CIPA)

**Mensagem final**
Todo quase-acidente é um aviso. Comunicar é proteger a si mesmo e aos seus colegas!`,
  },

  // ── INCÊNDIO (2) ─────────────────────────────────────────────────────────
  {
    title: 'Uso correto do extintor de incêndio',
    category: 'FIRE',
    tags: ['extintor','incêndio','fogo','PQPS','CO2'],
    duration: 15,
    order: 1,
    content: `**Objetivo**
Ensinar como usar corretamente o extintor de incêndio para combate a princípios de incêndio.

**Riscos envolvidos**
- Princípios de incêndio que podem se alastrar rapidamente
- Uso inadequado do extintor agravando o incêndio ou causando lesões
- Intoxicação por fumaça ou agente extintor

**Medidas de prevenção — Técnica PASS:**
1. **P** — Puxar o pino de segurança
2. **A** — Apontar o bico para a base das chamas (não para o topo)
3. **S** — Apertar o gatilho
4. **S** — Varrer o jato da base ao topo das chamas

**Tipos de extintor e uso:**
- Pó Químico Seco (PQS): classe A (sólidos), B (líquidos), C (elétrico)
- CO₂: classe B e C (não deixa resíduo — bom para equipamentos)
- Água: apenas classe A (sólidos) — nunca em fogo elétrico

**Legislação aplicável**
NBR 12693 (Extintores) | NR-23 (Proteção Contra Incêndio)

**Mensagem final**
Você tem em média 60 segundos para combater um princípio de incêndio. Saiba usar o extintor antes que precise!`,
  },
  {
    title: 'Prevenção de incêndio na obra — boas práticas',
    category: 'FIRE',
    tags: ['incêndio','prevenção','solda','inflamável','chama','NR-23'],
    duration: 15,
    order: 2,
    content: `**Objetivo**
Criar hábitos de prevenção de incêndio no canteiro de obras, especialmente durante atividades geradoras de faíscas.

**Riscos envolvidos**
- Ignição de materiais inflamáveis por faíscas de solda ou esmeril
- Incêndio por armazenamento inadequado de tintas, solventes e combustíveis
- Propagação rápida em materiais temporários da obra (lona, madeira, papelão)

**Medidas de prevenção**
- Retirar todos os materiais inflamáveis da área antes de soldar ou esmerilhar (raio de 10 m)
- Ter extintor disponível a no máximo 10 m do local de trabalho com chamas
- Armazenar solventes e combustíveis em local ventilado, longe de fontes de calor
- Sinalizar depósitos de inflamáveis com "PERIGO — INFLAMÁVEL"
- Nunca usar chama aberta próxima a tubulações de gás
- Designar "vigia de solda" para monitorar faíscas durante e 30 min após solda

**Legislação aplicável**
NR-23 | NBR 14276 (Plano de Emergência)

**Mensagem final**
Um minuto de descuido pode destruir horas, dias ou meses de trabalho — e colocar vidas em risco. Prevenção é responsabilidade de todos!`,
  },
]

async function main() {
  console.log('🌱 Iniciando seed de DDS...')

  // Remove DDS de sistema existentes para evitar duplicatas
  const deleted = await (prisma as any).ddsTheme.deleteMany({
    where: { companyId: null },
  })
  console.log(`   → ${deleted.count} DDS de sistema removidos (limpeza)`)

  let created = 0
  for (const dds of DDS_LIST) {
    await (prisma as any).ddsTheme.create({
      data: {
        companyId:  null,
        title:      dds.title,
        content:    dds.content,
        category:   dds.category,
        tags:       dds.tags,
        duration:   dds.duration,
        order:      dds.order,
        isActive:   true,
      },
    })
    created++
  }

  console.log(`✅ ${created} DDS criados com sucesso!`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
