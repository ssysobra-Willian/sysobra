'use client'

import { useState, useMemo, useEffect, useRef } from 'react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface DdsStaticTheme {
  id:            string
  title:         string
  category:      string
  categoryLabel: string
  icon:          string
  summary:       string
}

interface DdsFullContent {
  introducao:      string
  pontos:          string[]
  encerramento:    string
  duracaoEstimada: number   // minutos
}

interface Props {
  onSelect:        (theme: DdsStaticTheme) => void
  onClose:         () => void
  suggestedId:     string | null
  /** Abre direto na tela de leitura para este tema */
  initialThemeId?: string
  /** Modo somente leitura — não permite trocar o tema */
  readOnly?:       boolean
}

// ─── Temas estáticos (20 temas, 8 categorias) ─────────────────────────────────

const STATIC_THEMES: DdsStaticTheme[] = [
  // 1. Segurança do Trabalho (3)
  { id: 'SEG-01', title: 'EPI obrigatório na obra',        category: 'SAFETY',       categoryLabel: 'Segurança do Trabalho', icon: '🦺', summary: 'Uso correto e obrigatoriedade dos Equipamentos de Proteção Individual em todas as frentes de trabalho.' },
  { id: 'SEG-02', title: 'Trabalho em altura (NR-35)',      category: 'SAFETY',       categoryLabel: 'Segurança do Trabalho', icon: '🏗',  summary: 'Normas e procedimentos para execução segura de atividades acima de 2 metros, conforme NR-35.' },
  { id: 'SEG-03', title: 'Prevenção de quedas',             category: 'SAFETY',       categoryLabel: 'Segurança do Trabalho', icon: '⚠️', summary: 'Identificação de riscos de queda, uso de guarda-corpos, redes de proteção e linha de vida.' },
  // 2. Saúde (2)
  { id: 'SAU-01', title: 'Hidratação e calor',              category: 'HEALTH',       categoryLabel: 'Saúde',                 icon: '💧', summary: 'Importância da hidratação regular, riscos de desidratação e de exposição ao calor intenso.' },
  { id: 'SAU-02', title: 'Saúde mental na obra',            category: 'HEALTH',       categoryLabel: 'Saúde',                 icon: '🧠', summary: 'Conscientização sobre estresse, esgotamento profissional e canais de apoio à saúde mental.' },
  // 3. Meio Ambiente (2)
  { id: 'MA-01',  title: 'Descarte correto de resíduos',    category: 'ENVIRONMENT',  categoryLabel: 'Meio Ambiente',         icon: '♻️', summary: 'Segregação de resíduos da construção, destinação adequada e responsabilidade ambiental.' },
  { id: 'MA-02',  title: 'Economia de água',                category: 'ENVIRONMENT',  categoryLabel: 'Meio Ambiente',         icon: '🌿', summary: 'Boas práticas para redução do consumo de água durante a execução da obra.' },
  // 4. Qualidade (2)
  { id: 'QUA-01', title: 'Controle de qualidade',           category: 'QUALITY',      categoryLabel: 'Qualidade',             icon: '✅', summary: 'Princípios de qualidade na execução dos serviços, tolerâncias e conformidade técnica.' },
  { id: 'QUA-02', title: 'Inspeção de materiais',           category: 'QUALITY',      categoryLabel: 'Qualidade',             icon: '🔍', summary: 'Procedimentos de recebimento, conferência e aprovação de materiais antes do uso.' },
  // 5. Organização (2)
  { id: 'ORG-01', title: '5S na obra',                      category: 'ORGANIZATION', categoryLabel: 'Organização',           icon: '🧹', summary: 'Aplicação dos 5 sensos (Utilização, Ordenação, Limpeza, Padronização, Disciplina) no canteiro.' },
  { id: 'ORG-02', title: 'Organização do canteiro de obras',category: 'ORGANIZATION', categoryLabel: 'Organização',           icon: '📦', summary: 'Layout seguro do canteiro, demarcação de áreas, armazenamento correto de materiais e ferramentas.' },
  // 6. Legislação (2)
  { id: 'LEG-01', title: 'NR-18 — Condições Seguras de Trabalho', category: 'LEGISLATION', categoryLabel: 'Legislação',      icon: '📜', summary: 'Principais exigências da NR-18 para condições e meio ambiente de trabalho na construção civil.' },
  { id: 'LEG-02', title: 'Direitos e deveres do trabalhador',      category: 'LEGISLATION', categoryLabel: 'Legislação',      icon: '⚖️', summary: 'Conhecimento dos direitos trabalhistas, PCMSO, PPRA e responsabilidades de cada trabalhador.' },
  // 7. Equipamentos (2)
  { id: 'EQP-01', title: 'Uso seguro de ferramentas',              category: 'EQUIPMENT',   categoryLabel: 'Equipamentos',    icon: '🔧', summary: 'Cuidados essenciais no manuseio de ferramentas manuais e elétricas para evitar acidentes.' },
  { id: 'EQP-02', title: 'Manutenção preventiva de equipamentos',  category: 'EQUIPMENT',   categoryLabel: 'Equipamentos',    icon: '⚙️', summary: 'Importância da manutenção preventiva para segurança, produtividade e vida útil dos equipamentos.' },
  // 8. Comportamento (5)
  { id: 'COM-01', title: 'Trabalho em equipe',                     category: 'BEHAVIOR',    categoryLabel: 'Comportamento',   icon: '🤝', summary: 'Cooperação, responsabilidade coletiva e como o trabalho em equipe previne acidentes.' },
  { id: 'COM-02', title: 'Comunicação eficaz',                     category: 'BEHAVIOR',    categoryLabel: 'Comportamento',   icon: '💬', summary: 'A importância da comunicação clara entre equipes, transmissão de ordens e relato de riscos.' },
  { id: 'COM-03', title: 'Respeito no ambiente de trabalho',       category: 'BEHAVIOR',    categoryLabel: 'Comportamento',   icon: '🌟', summary: 'Convivência respeitosa, diversidade, combate ao assédio e construção de ambiente saudável.' },
  { id: 'COM-04', title: 'Liderança positiva',                     category: 'BEHAVIOR',    categoryLabel: 'Comportamento',   icon: '👷', summary: 'O papel dos líderes e encarregados na promoção da segurança, motivação e exemplo positivo.' },
  { id: 'COM-05', title: 'Prevenção de acidentes comportamentais', category: 'BEHAVIOR',    categoryLabel: 'Comportamento',   icon: '🎯', summary: 'Como atitudes e hábitos individuais influenciam diretamente a ocorrência de acidentes.' },
]

// ─── Conteúdo completo dos 20 temas ──────────────────────────────────────────

const THEME_CONTENT: Record<string, DdsFullContent> = {
  'SEG-01': {
    duracaoEstimada: 5,
    introducao: 'O Equipamento de Proteção Individual é obrigatório por lei (NR-6) e protege você de acidentes graves. Nunca inicie o trabalho sem os EPIs adequados à sua função.',
    pontos: [
      'Capacete: obrigatório em toda a obra, inclusive para visitantes',
      'Bota de segurança com biqueira de aço: nunca use tênis ou chinelo',
      'Luvas: use conforme o tipo de serviço (raspa, látex, anticorte)',
      'Óculos de proteção: ao cortar, lixar, soldar ou manusear produtos químicos',
      'Protetor auricular: quando houver ruído acima de 85 dB',
      'Colete refletivo: ao trabalhar em vias ou áreas de movimentação de veículos',
      'EPIs danificados devem ser trocados imediatamente — comunique ao encarregado',
    ],
    encerramento: 'Lembre-se: o EPI não atrapalha o trabalho, ele garante que você volte para casa com saúde. Cuide do seu EPI e ele cuidará de você.',
  },
  'SEG-02': {
    duracaoEstimada: 7,
    introducao: 'Trabalho em altura é toda atividade acima de 2 metros do nível inferior. É uma das principais causas de morte na construção civil. A NR-35 existe para proteger sua vida.',
    pontos: [
      'Nunca trabalhe em altura sem cinto de segurança tipo paraquedista',
      'O talabarte deve estar sempre conectado a ponto de ancoragem resistente',
      'Verifique o estado do cinto antes de cada uso — recuse equipamento danificado',
      'Proibido trabalho em altura com ventos fortes, chuva ou superfícies escorregadias',
      'Andaimes devem ser montados por profissional habilitado e inspecionados diariamente',
      'Nunca se apoie em guarda-corpo como ponto de ancoragem',
      'Em caso de queda de objetos: gritar CUIDADO e isolar a área imediatamente',
    ],
    encerramento: 'Sua vida vale mais do que qualquer prazo. Se as condições não forem seguras, pare e comunique. Você tem o direito e o dever de recusar trabalho inseguro.',
  },
  'SEG-03': {
    duracaoEstimada: 5,
    introducao: 'Quedas são responsáveis por grande parte dos acidentes fatais na construção civil. A maioria poderia ser evitada com medidas simples de proteção coletiva e individual.',
    pontos: [
      'Guarda-corpos devem ser instalados em toda abertura ou borda livre acima de 2m',
      'Nunca remova proteções coletivas sem autorização formal e por escrito',
      'Aberturas no piso devem ser tampadas ou sinalizadas imediatamente',
      'Escadas devem ter corrimão firme e degraus antiderrapantes',
      'Proibido improvisar andaimes com materiais inadequados',
      'Use cinto de segurança quando a proteção coletiva não for suficiente',
      'Mantenha os acessos desobstruídos, limpos e iluminados',
    ],
    encerramento: 'Antes de qualquer trabalho, inspecione a área. Um minuto de atenção pode evitar uma vida de sofrimento.',
  },
  'SAU-01': {
    duracaoEstimada: 5,
    introducao: 'Trabalhar exposto ao sol e ao calor intenso pode causar desidratação, câimbras, exaustão térmica e até insolação. Beber água regularmente não é opcional — é essencial.',
    pontos: [
      'Beba ao menos 200 ml de água a cada 20 minutos, mesmo sem sentir sede',
      'Evite bebidas alcoólicas ou com cafeína — elas aumentam a desidratação',
      'Sinais de alerta: tontura, dor de cabeça, urina escura, confusão mental',
      'Ao sentir qualquer sintoma, pare o trabalho e avise o encarregado',
      'Use boné ou capacete com aba para proteção solar',
      'Nos horários mais quentes (10h–15h), prefira trabalho à sombra quando possível',
      'Nunca envergonhe um colega que precisar de pausa para se hidratar',
    ],
    encerramento: 'A hidratação é prevenção. Cuide-se e observe seus colegas — um gesto simples pode salvar uma vida.',
  },
  'SAU-02': {
    duracaoEstimada: 6,
    introducao: 'A saúde mental é tão importante quanto a saúde física. O ambiente da construção civil pode ser estressante, e é fundamental reconhecer sinais de alerta e buscar apoio sem vergonha.',
    pontos: [
      'Estresse crônico, irritabilidade excessiva e insônia são sinais de alerta',
      'Problemas pessoais e financeiros podem afetar a concentração e causar acidentes',
      'Nunca subestime a pressão emocional que um colega está sentindo',
      'Procure o encarregado ou RH em caso de dificuldades — não há fraqueza nisso',
      'Evite o uso de álcool e substâncias como forma de lidar com problemas',
      'Incentive o diálogo e a escuta ativa entre a equipe',
      'O SESI e o SESC oferecem atendimento psicológico gratuito para trabalhadores',
    ],
    encerramento: 'Cuidar da mente é cuidar do trabalho. Um time saudável é um time produtivo e seguro.',
  },
  'MA-01': {
    duracaoEstimada: 5,
    introducao: 'A gestão inadequada de resíduos causa multas ambientais, acidentes na obra e danos ao meio ambiente. Cada trabalhador tem responsabilidade sobre o descarte correto.',
    pontos: [
      'Resíduos Classe A (entulho, cerâmica, argamassa): caçamba específica para reciclagem',
      'Resíduos Classe B (plásticos, papel, metal, vidro): coletores separados por tipo',
      'Resíduos Classe C (gesso, amianto): descarte especial conforme norma técnica',
      'Resíduos Classe D (tintas, solventes, óleos): armazenamento especial e destinação licenciada',
      'Nunca descarte resíduo em terrenos baldios ou áreas não autorizadas',
      'Mantenha a área de trabalho limpa — entulho acumulado causa acidentes',
      'Conheça as caçambas destinadas a cada tipo de resíduo na sua obra',
    ],
    encerramento: 'A obra que cuida do descarte cuida do bairro, da cidade e do meio ambiente. Isso é responsabilidade de todos.',
  },
  'MA-02': {
    duracaoEstimada: 4,
    introducao: 'A água é um recurso natural escasso. A construção civil consome grandes volumes — e cada gota desperdiçada é uma gota a menos para a população e para o futuro.',
    pontos: [
      'Feche torneiras e registros ao final de cada turno ou ao se ausentar',
      'Reporte vazamentos imediatamente — não "deixe para depois"',
      'Reutilize água de lavagem de formas e equipamentos quando possível',
      'Evite lavar pisos e áreas externas com mangueira quando uma vassoura basta',
      'O concreto deve ser preparado na quantidade exata — desperdício gera custo e consumo',
      'Use sistemas de reaproveitamento de água da chuva quando disponíveis',
      'Economizar água também reduz os custos da obra — e isso beneficia a todos',
    ],
    encerramento: 'Um trabalhador consciente cuida dos recursos como se fossem seus. Água desperdiçada na obra é dinheiro e vida jogados fora.',
  },
  'QUA-01': {
    duracaoEstimada: 5,
    introducao: 'Qualidade não é um luxo — é o compromisso com quem vai usar o que você está construindo. Fazer certo na primeira vez evita retrabalho, custos e riscos.',
    pontos: [
      'Siga sempre o projeto e as especificações técnicas — nunca improvise',
      'Em caso de dúvida, pergunte ao encarregado antes de executar',
      'Verifique prumo, nível e esquadro em cada etapa do serviço',
      'Não cubra serviços sem antes inspecioná-los e registrá-los',
      'Erros encontrados cedo custam 10 vezes menos do que erros descobertos no final',
      'Registre qualquer não-conformidade no diário de obra',
      'A qualidade começa na preparação: ferramentas certas, materiais corretos, superfície preparada',
    ],
    encerramento: 'Seu nome está em cada parede que você ergue. Faça com orgulho, faça com qualidade.',
  },
  'QUA-02': {
    duracaoEstimada: 5,
    introducao: 'Materiais fora do padrão comprometem a estrutura, a segurança e a durabilidade da obra. Receber material sem inspeção é assumir um risco desnecessário.',
    pontos: [
      'Confira na nota fiscal: tipo, quantidade e especificação do material recebido',
      'Verifique se há danos físicos, umidade excessiva ou prazo de validade vencido',
      'Cimento e argamassa: rejeite sacos úmidos, empedrados ou com prazo vencido',
      'Aço e ferros: verifique bitola, comprimento e ausência de oxidação excessiva',
      'Blocos e tijolos: dimensões uniformes, sem trincas e resistência adequada',
      'Armazene os materiais em local coberto, organizado e identificado',
      'Registre e notifique divergências ao encarregado antes de utilizar o material',
    ],
    encerramento: 'Material de qualidade mais mão de obra qualificada é igual a obra de qualidade. Não pule etapas.',
  },
  'ORG-01': {
    duracaoEstimada: 6,
    introducao: 'O 5S é um sistema japonês de organização que melhora a produtividade, a segurança e o bem-estar no trabalho. Quando aplicado na obra, reduz acidentes e aumenta a eficiência.',
    pontos: [
      '1º S — Seiri (Utilização): elimine tudo que não é necessário na área de trabalho',
      '2º S — Seiton (Ordenação): um lugar para cada coisa, cada coisa em seu lugar',
      '3º S — Seisou (Limpeza): limpe durante e após o trabalho — não apenas no final do dia',
      '4º S — Seiketsu (Padronização): crie padrões para manter os resultados dos 3 primeiros S',
      '5º S — Shitsuke (Disciplina): cumpra as regras todos os dias, sem exceção',
      'Ferramentas guardadas corretamente evitam acidentes e perda de tempo procurando',
      'Um canteiro limpo e organizado demonstra profissionalismo e respeito pela obra',
    ],
    encerramento: '5S não é faxina — é disciplina. É o respeito pelo local onde você trabalha e pelas pessoas ao seu redor.',
  },
  'ORG-02': {
    duracaoEstimada: 5,
    introducao: 'Um canteiro bem organizado é mais seguro, mais produtivo e menos estressante. A circulação de pessoas, materiais e equipamentos deve ser planejada e respeitada por todos.',
    pontos: [
      'Respeite a sinalização do canteiro: demarcações de área e sentidos de circulação',
      'Materiais pesados devem ser armazenados perto dos pontos de uso',
      'Mantenha as vias de emergência e saídas sempre livres e identificadas',
      'Ferramentas e equipamentos devem ser devolvidos ao almoxarifado após o uso',
      'Banheiros, vestiários e refeitório devem ser mantidos limpos e em bom estado',
      'Reduza o risco de queda mantendo pisos limpos e livres de obstáculos',
      'Planeje a chegada e saída de materiais para não criar congestionamentos',
    ],
    encerramento: 'Um canteiro organizado é o cartão de visitas da construtora e o reflexo da cultura de qualidade da equipe.',
  },
  'LEG-01': {
    duracaoEstimada: 7,
    introducao: 'A NR-18 é a norma que regula as condições de segurança e saúde na construção civil. Conhecê-la é obrigação de todo trabalhador e empregador do setor.',
    pontos: [
      'Todo trabalhador tem direito a treinamento de segurança antes de iniciar as atividades',
      'A empresa é obrigada a fornecer EPIs gratuitamente — cobrar EPI é ilegal',
      'Andaimes, escadas e plataformas devem atender às especificações técnicas da NR-18',
      'Instalações elétricas provisórias devem ser executadas por eletricista habilitado',
      'Áreas de vivência (banheiro, refeitório, vestiário) são obrigatórias em obras acima de 20 trabalhadores',
      'A CIPA ou o representante de segurança tem poder de paralisar atividade de risco imediato',
      'Denúncias ao Ministério do Trabalho podem ser feitas de forma anônima pelo 158',
    ],
    encerramento: 'Conhecer seus direitos é o primeiro passo para exigi-los. A NR-18 existe para você.',
  },
  'LEG-02': {
    duracaoEstimada: 7,
    introducao: 'Todo trabalhador formal tem direitos garantidos pela CLT e pela Constituição Federal. Conhecê-los evita exploração e garante dignidade no trabalho.',
    pontos: [
      'Registro em carteira é obrigatório desde o primeiro dia — trabalho informal não tem proteção legal',
      'Horas extras devem ser remuneradas com acréscimo mínimo de 50%',
      'Todo trabalhador tem direito a 30 dias de férias remuneradas por ano trabalhado',
      'FGTS (8% do salário) deve ser depositado mensalmente pelo empregador',
      'Em caso de acidente de trabalho, há direito a atendimento médico e afastamento pelo INSS',
      'O PCMSO (exame médico) e o PPRA (riscos ambientais) são obrigatórios e gratuitos',
      'Assédio moral ou sexual no trabalho é crime — denuncie ao RH ou ao sindicato',
    ],
    encerramento: 'Trabalhador informado é trabalhador protegido. Não tenha vergonha de conhecer e reivindicar seus direitos.',
  },
  'EQP-01': {
    duracaoEstimada: 5,
    introducao: 'Ferramentas mal utilizadas causam cortes, amputações, choque elétrico e outros acidentes graves. O correto é usar sempre a ferramenta certa para cada função, com os cuidados adequados.',
    pontos: [
      'Sempre inspecione a ferramenta antes do uso — devolva se estiver danificada',
      'Nunca improvise: chave de fenda não é formão, alicate não é chave inglesa',
      'Ferramentas elétricas: verifique o cabo de alimentação e a proteção do plugue',
      'Desconecte a energia antes de trocar brocas, discos ou lâminas',
      'Use proteção para os olhos ao cortar, esmerilhar ou perfurar',
      'Ferramentas de corte cegas exigem mais força e causam mais acidentes — mantenha-as afiadas',
      'Guarde ferramentas cortantes em protetor ou estojo ao transportá-las',
    ],
    encerramento: 'A ferramenta certa, usada da forma certa, no momento certo. Isso é profissionalismo e segurança.',
  },
  'EQP-02': {
    duracaoEstimada: 5,
    introducao: 'Equipamentos sem manutenção falham na pior hora — e uma falha pode ser fatal. A manutenção preventiva é mais barata, mais segura e mais profissional do que a manutenção corretiva.',
    pontos: [
      'Siga o cronograma de manutenção estabelecido para cada equipamento',
      'Registre qualquer anomalia: ruído estranho, vibração excessiva, superaquecimento',
      'Nunca opere equipamento com falha reportada — aguarde a manutenção',
      'Lubrificação regular previne desgaste prematuro e falhas mecânicas',
      'Mantenha os filtros e sistemas de refrigeração limpos e desobstruídos',
      'Somente técnicos habilitados devem realizar manutenção em equipamentos elétricos',
      'A tag "Em manutenção" deve ser respeitada — nunca ligue equipamento sinalizado',
    ],
    encerramento: 'Equipamento bem mantido trabalha com você — equipamento negligenciado trabalha contra você.',
  },
  'COM-01': {
    duracaoEstimada: 5,
    introducao: 'Na construção civil, nenhum trabalho é realizado de forma completamente individual. A cooperação entre os membros da equipe é fundamental para a segurança e para o resultado.',
    pontos: [
      'Ajude seus colegas — especialmente os mais novos ou em situação de risco',
      'Comunique imediatamente qualquer perigo que identifique, mesmo que não seja sua área',
      'Respeite as funções e responsabilidades de cada membro da equipe',
      'Em trabalhos que exigem sincronismo, combinem o procedimento antes de iniciar',
      'Um colega que comete erro precisa de orientação, não de humilhação',
      'Celebre as conquistas do time — uma fase concluída com segurança merece reconhecimento',
      'A segurança de um depende da atenção de todos',
    ],
    encerramento: 'Uma equipe unida conclui mais, com mais segurança e mais satisfação. Construa relações tão sólidas quanto as estruturas que você ergue.',
  },
  'COM-02': {
    duracaoEstimada: 5,
    introducao: 'Falhas na comunicação são uma das principais causas de acidentes na construção civil. Saber passar e receber informações corretamente é uma habilidade de segurança.',
    pontos: [
      'Antes de executar, confirme que entendeu o que foi pedido — repita para o solicitante',
      'Em caso de dúvida: pare, pergunte e só execute quando tiver certeza',
      'Alertas de perigo devem ser imediatos, claros e em voz alta: "CUIDADO!", "PARA!"',
      'Passagens de turno: informe sobre riscos, pendências e situações especiais',
      'Ordens confusas ou incompletas não devem ser executadas sem esclarecimento',
      'Use rádio ou celular apenas para comunicação de trabalho — distração causa acidentes',
      'Registre no diário de obra as ocorrências relevantes do dia',
    ],
    encerramento: 'Falar é fácil. Comunicar é garantir que a mensagem foi entendida. Na obra, isso pode significar a diferença entre um dia normal e uma tragédia.',
  },
  'COM-03': {
    duracaoEstimada: 5,
    introducao: 'Um ambiente de trabalho respeitoso é mais seguro, mais produtivo e mais humano. A falta de respeito gera conflitos, desvios de atenção e aumenta o risco de acidentes.',
    pontos: [
      'Trate todos os colegas com educação, independente do cargo ou função',
      'Piadas e brincadeiras que constrangem ou humilham são inadequadas e podem ser assédio',
      'Respeite as diferenças: idade, origem, religião, gênero e raça',
      'Não interfira negativamente no trabalho de colegas por motivos pessoais',
      'Conflitos devem ser resolvidos com diálogo — nunca com agressividade',
      'Denuncie situações de assédio ou discriminação ao encarregado ou ao RH',
      'Um ambiente respeitoso começa em você — seja o exemplo que gostaria de ter',
    ],
    encerramento: 'Respeito não é fraqueza — é profissionalismo. Construtores que se respeitam constroem obras melhores.',
  },
  'COM-04': {
    duracaoEstimada: 6,
    introducao: 'O líder de equipe na construção civil tem papel fundamental na segurança e no clima da obra. Liderança positiva não é apenas dar ordens — é inspirar, proteger e desenvolver a equipe.',
    pontos: [
      'Dê o exemplo: use os EPIs corretos, siga as normas e seja o primeiro a respeitá-las',
      'Conheça os riscos das atividades de cada membro da sua equipe',
      'Elogie publicamente, corrija em particular',
      'Inclua a equipe nas decisões de segurança — quem trabalha no risco conhece melhor o risco',
      'Nunca pressione sua equipe a trabalhar em condições inseguras por prazo ou produção',
      'Cuide do bem-estar da equipe: reconheça sinais de fadiga, estresse e desmotivação',
      'Um líder que para uma atividade de risco tem mais respeito do que um que deixa passar',
    ],
    encerramento: 'Liderar é construir pessoas. Construir pessoas é construir obras seguras. Seja o líder que você gostaria de ter tido.',
  },
  'COM-05': {
    duracaoEstimada: 6,
    introducao: 'Estudos mostram que mais de 80% dos acidentes têm origem em comportamento humano. Atitudes, hábitos e estados emocionais influenciam diretamente a ocorrência de acidentes.',
    pontos: [
      'Não trabalhe quando estiver com sono, doente ou emocionalmente abalado — comunique ao encarregado',
      'Pressa é inimiga da segurança — planeje antes de agir',
      'Excesso de confiança é perigoso: acidentes acontecem com os "mais experientes" também',
      'Nunca burle proteções e equipamentos de segurança "para facilitar o trabalho"',
      'Distrações por celular durante atividades de risco podem ser fatais',
      'O "sempre fiz assim e nunca aconteceu nada" é um dos maiores fatores de risco',
      'Cuide-se antes da obra: sono adequado, alimentação e saúde mental fazem parte da segurança',
    ],
    encerramento: 'Mudar comportamento é o maior desafio e o maior impacto na prevenção de acidentes. Comece hoje, comece por você.',
  },
}

// ─── Agrupa por categoria ─────────────────────────────────────────────────────

const CATEGORIES = STATIC_THEMES.reduce<Record<string, DdsStaticTheme[]>>((acc, t) => {
  if (!acc[t.category]) acc[t.category] = []
  acc[t.category].push(t)
  return acc
}, {})

// ─── Tela de leitura do DDS ───────────────────────────────────────────────────

function DdsReadScreen({
  theme,
  readOnly,
  onConfirm,
  onBack,
}: {
  theme:     DdsStaticTheme
  readOnly:  boolean
  onConfirm: () => void
  onBack:    () => void
}) {
  const content = THEME_CONTENT[theme.id]
  const totalSecs = (content?.duracaoEstimada ?? 5) * 60
  const [elapsed, setElapsed]   = useState(0)
  const timerRef                = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setElapsed(0)
    timerRef.current = setInterval(() => {
      setElapsed((p) => {
        if (p >= totalSecs) {
          if (timerRef.current) clearInterval(timerRef.current)
          return totalSecs
        }
        return p + 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [theme.id, totalSecs])

  const pct      = Math.min(100, Math.round((elapsed / totalSecs) * 100))
  const done     = pct >= 100
  const mm       = Math.floor(elapsed / 60)
  const ss       = elapsed % 60
  const timeStr  = `${mm}:${String(ss).padStart(2, '0')}`

  return (
    <div className="flex flex-col max-h-[90vh] overflow-hidden">
      {/* Barra de progresso de leitura */}
      <div className="h-1 bg-gray-100 flex-shrink-0">
        <div
          className={`h-full transition-all duration-1000 ${done ? 'bg-green-500' : 'bg-[#F5A623]'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Cabeçalho */}
      <div className="px-5 py-4 border-b border-gray-100 flex-shrink-0 bg-amber-50">
        <div className="flex items-start gap-3">
          <span className="text-4xl flex-shrink-0 mt-1">{theme.icon}</span>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">{theme.categoryLabel}</span>
            <h2 className="text-base font-bold text-gray-900 mt-0.5 leading-tight">{theme.title}</h2>
            <div className="flex items-center gap-3 mt-1">
              {done ? (
                <span className="text-[11px] font-semibold text-green-600 flex items-center gap-1">
                  ✓ Leitura concluída
                </span>
              ) : (
                <span className="text-[11px] text-gray-400 font-mono">
                  ⏱ {timeStr} / {content?.duracaoEstimada ?? 5} min
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Corpo (scrollável) */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 bg-amber-50/40">
        {content ? (
          <>
            {/* Introdução */}
            <div>
              <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest mb-2">Introdução</p>
              <p className="text-sm text-gray-700 italic leading-relaxed">{content.introducao}</p>
            </div>

            {/* Pontos de atenção */}
            <div>
              <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest mb-3">Pontos de atenção</p>
              <ul className="space-y-2.5">
                {content.pontos.map((ponto, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="text-base flex-shrink-0 mt-0.5">✅</span>
                    <span className="text-sm text-gray-800 leading-snug">{ponto}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Encerramento */}
            <div className="p-4 bg-[#F5A623]/10 border border-[#F5A623]/30 rounded-xl">
              <p className="text-[10px] font-bold text-[#c57a00] uppercase tracking-widest mb-2">Mensagem final</p>
              <p className="text-sm font-semibold text-gray-800 leading-relaxed">{content.encerramento}</p>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-400 text-center py-8">Conteúdo não disponível para este tema.</p>
        )}
      </div>

      {/* Rodapé fixo */}
      <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-3 flex-shrink-0 bg-white">
        <button
          onClick={onBack}
          className="py-2.5 px-4 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-1.5"
        >
          {readOnly ? '✕ Fechar' : '← Trocar tema'}
        </button>
        {!readOnly && (
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 px-4 bg-[#F5A623] text-white font-semibold rounded-xl hover:bg-[#d4891a] transition-colors text-sm"
          >
            ✓ DDS realizado
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function DDSThemeSelector({
  onSelect,
  onClose,
  suggestedId,
  initialThemeId,
  readOnly = false,
}: Props) {
  const [step,       setStep]       = useState<'select' | 'read'>(initialThemeId ? 'read' : 'select')
  const [search,     setSearch]     = useState('')
  const [expanded,   setExpanded]   = useState<Record<string, boolean>>({})
  const [selectedId, setSelectedId] = useState<string | null>(initialThemeId ?? suggestedId)

  // Tema atualmente em leitura
  const readingTheme = STATIC_THEMES.find((t) => t.id === selectedId) ?? null

  // Por padrão expande a categoria do sugerido
  const initialOpen = useMemo(() => {
    const theme = STATIC_THEMES.find((t) => t.id === (initialThemeId ?? suggestedId))
    return theme ? { [theme.category]: true } : {}
  }, [suggestedId, initialThemeId])

  const isExpanded = (cat: string) =>
    (expanded[cat] !== undefined ? expanded[cat] : initialOpen[cat]) ?? false

  const toggle = (cat: string) =>
    setExpanded((prev) => ({ ...prev, [cat]: !isExpanded(cat) }))

  const filtered = useMemo(() => {
    if (!search.trim()) return CATEGORIES
    const q = search.toLowerCase()
    const result: Record<string, DdsStaticTheme[]> = {}
    for (const [cat, themes] of Object.entries(CATEGORIES)) {
      const hits = themes.filter(
        (t) => t.title.toLowerCase().includes(q) || t.summary.toLowerCase().includes(q)
      )
      if (hits.length) result[cat] = hits
    }
    return result
  }, [search])

  function handleSelectAndRead(theme: DdsStaticTheme) {
    setSelectedId(theme.id)
    setStep('read')
  }

  function handleConfirm() {
    if (readingTheme) {
      onSelect(readingTheme)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white w-full sm:max-w-xl sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">

        {/* ── TELA 1: Seleção ──────────────────────────────────────── */}
        {step === 'select' && (
          <>
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📋</span>
                  <div>
                    <h2 className="text-base font-bold text-gray-800">Tema do DDS de hoje</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Selecione o tema para o Diálogo Diário de Segurança</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors text-sm"
                >
                  ✕
                </button>
              </div>

              {/* Sugestão do dia */}
              {suggestedId && (
                <div className="mt-3 p-3 bg-orange-50 border border-orange-100 rounded-xl flex items-start gap-2">
                  <span className="text-orange-500 mt-0.5">💡</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-semibold text-orange-700">Sugestão do sistema para hoje</p>
                      <span className="text-[10px] bg-[#F5A623] text-white px-2 py-0.5 rounded-full font-bold">Rotativo</span>
                    </div>
                    <p className="text-sm font-medium text-orange-800 mt-0.5 truncate">
                      {STATIC_THEMES.find((t) => t.id === suggestedId)?.icon}{' '}
                      {STATIC_THEMES.find((t) => t.id === suggestedId)?.title}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      const t = STATIC_THEMES.find((x) => x.id === suggestedId)
                      if (t) handleSelectAndRead(t)
                    }}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors flex-shrink-0 ${
                      selectedId === suggestedId
                        ? 'bg-[#F5A623] text-white'
                        : 'border border-orange-200 text-orange-600 hover:bg-orange-100'
                    }`}
                  >
                    {selectedId === suggestedId ? '→ Ler DDS' : 'Usar sugestão'}
                  </button>
                </div>
              )}

              {/* Busca */}
              <div className="mt-3">
                <input
                  type="text"
                  placeholder="Buscar tema..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {Object.entries(filtered).map(([cat, themes]) => {
                const catLabel = themes[0]?.categoryLabel ?? cat
                const open = search.trim() ? true : isExpanded(cat)
                return (
                  <div key={cat}>
                    <button
                      onClick={() => toggle(cat)}
                      className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">{themes[0]?.icon}</span>
                        <span className="text-sm font-semibold text-gray-700">{catLabel}</span>
                        <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                          {themes.length}
                        </span>
                      </div>
                      <span className={`text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
                    </button>

                    {open && (
                      <div className="divide-y divide-gray-50">
                        {themes.map((theme) => {
                          const isSelected = selectedId === theme.id
                          return (
                            <button
                              key={theme.id}
                              onClick={() => handleSelectAndRead(theme)}
                              className={`w-full flex items-start gap-3 px-5 py-3 text-left transition-colors ${
                                isSelected
                                  ? 'bg-orange-50 border-l-2 border-[#F5A623]'
                                  : 'hover:bg-gray-50 border-l-2 border-transparent'
                              }`}
                            >
                              <span className="text-lg flex-shrink-0 mt-0.5">{theme.icon}</span>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium ${isSelected ? 'text-[#F5A623]' : 'text-gray-800'}`}>
                                  {theme.title}
                                  {theme.id === suggestedId && (
                                    <span className="ml-2 text-[10px] bg-[#F5A623] text-white px-1.5 py-0.5 rounded-full font-bold align-middle">
                                      Hoje
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{theme.summary}</p>
                              </div>
                              <span className="text-xs text-gray-400 flex-shrink-0 mt-1">→ Ler</span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
              {Object.keys(filtered).length === 0 && (
                <p className="py-8 text-center text-sm text-gray-400">Nenhum tema encontrado</p>
              )}
            </div>

            {/* Rodapé */}
            <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-3 flex-shrink-0 bg-white">
              <button
                onClick={onClose}
                className="flex-1 py-3 px-4 border border-gray-200 text-gray-500 rounded-xl hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                Pular DDS
              </button>
            </div>
          </>
        )}

        {/* ── TELA 2: Leitura ──────────────────────────────────────── */}
        {step === 'read' && readingTheme && (
          <DdsReadScreen
            theme={readingTheme}
            readOnly={readOnly}
            onConfirm={handleConfirm}
            onBack={() => {
              if (readOnly) {
                onClose()
              } else {
                setStep('select')
              }
            }}
          />
        )}
      </div>
    </div>
  )
}

// ─── Helper público: tema sugerido pelo dia ───────────────────────────────────

export function getSuggestedDdsTheme(): DdsStaticTheme {
  const now      = new Date()
  const start    = new Date(now.getFullYear(), 0, 0)
  const diff     = now.getTime() - start.getTime()
  const dayOfYear = Math.floor(diff / 86400000)
  return STATIC_THEMES[dayOfYear % STATIC_THEMES.length]
}

export { STATIC_THEMES }
