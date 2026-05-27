'use client'

import { useState, useMemo } from 'react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface DdsStaticTheme {
  id:          string
  title:       string
  category:    string
  categoryLabel: string
  icon:        string
  summary:     string
}

interface Props {
  onSelect:    (theme: DdsStaticTheme) => void
  onClose:     () => void
  suggestedId: string | null  // id do tema sugerido pelo dia
}

// ─── Temas estáticos (20 temas, 8 categorias) ─────────────────────────────────

const STATIC_THEMES: DdsStaticTheme[] = [
  // 1. Segurança do Trabalho (3)
  {
    id: 'SEG-01', title: 'EPI obrigatório na obra', category: 'SAFETY',
    categoryLabel: 'Segurança do Trabalho', icon: '🦺',
    summary: 'Uso correto e obrigatoriedade dos Equipamentos de Proteção Individual em todas as frentes de trabalho.',
  },
  {
    id: 'SEG-02', title: 'Trabalho em altura (NR-35)', category: 'SAFETY',
    categoryLabel: 'Segurança do Trabalho', icon: '🏗',
    summary: 'Normas e procedimentos para execução segura de atividades acima de 2 metros, conforme NR-35.',
  },
  {
    id: 'SEG-03', title: 'Prevenção de quedas', category: 'SAFETY',
    categoryLabel: 'Segurança do Trabalho', icon: '⚠️',
    summary: 'Identificação de riscos de queda, uso de guarda-corpos, redes de proteção e linha de vida.',
  },
  // 2. Saúde (2)
  {
    id: 'SAU-01', title: 'Hidratação e calor', category: 'HEALTH',
    categoryLabel: 'Saúde', icon: '💧',
    summary: 'Importância da hidratação regular, riscos de desidratação e de exposição ao calor intenso.',
  },
  {
    id: 'SAU-02', title: 'Saúde mental na obra', category: 'HEALTH',
    categoryLabel: 'Saúde', icon: '🧠',
    summary: 'Conscientização sobre estresse, esgotamento profissional e canais de apoio à saúde mental.',
  },
  // 3. Meio Ambiente (2)
  {
    id: 'MA-01', title: 'Descarte correto de resíduos', category: 'ENVIRONMENT',
    categoryLabel: 'Meio Ambiente', icon: '♻️',
    summary: 'Segregação de resíduos da construção, destinação adequada e responsabilidade ambiental.',
  },
  {
    id: 'MA-02', title: 'Economia de água', category: 'ENVIRONMENT',
    categoryLabel: 'Meio Ambiente', icon: '🌿',
    summary: 'Boas práticas para redução do consumo de água durante a execução da obra.',
  },
  // 4. Qualidade (2)
  {
    id: 'QUA-01', title: 'Controle de qualidade', category: 'QUALITY',
    categoryLabel: 'Qualidade', icon: '✅',
    summary: 'Princípios de qualidade na execução dos serviços, tolerâncias e conformidade técnica.',
  },
  {
    id: 'QUA-02', title: 'Inspeção de materiais', category: 'QUALITY',
    categoryLabel: 'Qualidade', icon: '🔍',
    summary: 'Procedimentos de recebimento, conferência e aprovação de materiais antes do uso.',
  },
  // 5. Organização (2)
  {
    id: 'ORG-01', title: '5S na obra', category: 'ORGANIZATION',
    categoryLabel: 'Organização', icon: '🧹',
    summary: 'Aplicação dos 5 sensos (Utilização, Ordenação, Limpeza, Padronização, Disciplina) no canteiro.',
  },
  {
    id: 'ORG-02', title: 'Organização do canteiro de obras', category: 'ORGANIZATION',
    categoryLabel: 'Organização', icon: '📦',
    summary: 'Layout seguro do canteiro, demarcação de áreas, armazenamento correto de materiais e ferramentas.',
  },
  // 6. Legislação (2)
  {
    id: 'LEG-01', title: 'NR-18 — Condições Seguras de Trabalho', category: 'LEGISLATION',
    categoryLabel: 'Legislação', icon: '📜',
    summary: 'Principais exigências da NR-18 para condições e meio ambiente de trabalho na construção civil.',
  },
  {
    id: 'LEG-02', title: 'Direitos e deveres do trabalhador', category: 'LEGISLATION',
    categoryLabel: 'Legislação', icon: '⚖️',
    summary: 'Conhecimento dos direitos trabalhistas, PCMSO, PPRA e responsabilidades de cada trabalhador.',
  },
  // 7. Equipamentos (2)
  {
    id: 'EQP-01', title: 'Uso seguro de ferramentas', category: 'EQUIPMENT',
    categoryLabel: 'Equipamentos', icon: '🔧',
    summary: 'Cuidados essenciais no manuseio de ferramentas manuais e elétricas para evitar acidentes.',
  },
  {
    id: 'EQP-02', title: 'Manutenção preventiva de equipamentos', category: 'EQUIPMENT',
    categoryLabel: 'Equipamentos', icon: '⚙️',
    summary: 'Importância da manutenção preventiva para segurança, produtividade e vida útil dos equipamentos.',
  },
  // 8. Comportamento (5)
  {
    id: 'COM-01', title: 'Trabalho em equipe', category: 'BEHAVIOR',
    categoryLabel: 'Comportamento', icon: '🤝',
    summary: 'Cooperação, responsabilidade coletiva e como o trabalho em equipe previne acidentes.',
  },
  {
    id: 'COM-02', title: 'Comunicação eficaz', category: 'BEHAVIOR',
    categoryLabel: 'Comportamento', icon: '💬',
    summary: 'A importância da comunicação clara entre equipes, transmissão de ordens e relato de riscos.',
  },
  {
    id: 'COM-03', title: 'Respeito no ambiente de trabalho', category: 'BEHAVIOR',
    categoryLabel: 'Comportamento', icon: '🌟',
    summary: 'Convivência respeitosa, diversidade, combate ao assédio e construção de ambiente saudável.',
  },
  {
    id: 'COM-04', title: 'Liderança positiva', category: 'BEHAVIOR',
    categoryLabel: 'Comportamento', icon: '👷',
    summary: 'O papel dos líderes e encarregados na promoção da segurança, motivação e exemplo positivo.',
  },
  {
    id: 'COM-05', title: 'Prevenção de acidentes comportamentais', category: 'BEHAVIOR',
    categoryLabel: 'Comportamento', icon: '🎯',
    summary: 'Como atitudes e hábitos individuais influenciam diretamente a ocorrência de acidentes.',
  },
]

// Agrupa por categoria
const CATEGORIES = STATIC_THEMES.reduce<Record<string, DdsStaticTheme[]>>((acc, t) => {
  if (!acc[t.category]) acc[t.category] = []
  acc[t.category].push(t)
  return acc
}, {})

// ─── Componente ───────────────────────────────────────────────────────────────

export default function DDSThemeSelector({ onSelect, onClose, suggestedId }: Props) {
  const [search,      setSearch]      = useState('')
  const [expanded,    setExpanded]    = useState<Record<string, boolean>>({})
  const [selectedId,  setSelectedId]  = useState<string | null>(suggestedId)

  // Por padrão expande a categoria do sugerido
  const initialOpen = useMemo(() => {
    const theme = STATIC_THEMES.find((t) => t.id === suggestedId)
    return theme ? { [theme.category]: true } : {}
  }, [suggestedId])

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

  const selectedTheme = STATIC_THEMES.find((t) => t.id === selectedId)

  function handleConfirm() {
    if (selectedTheme) {
      onSelect(selectedTheme)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white w-full sm:max-w-xl sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">

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
                onClick={() => setSelectedId(suggestedId)}
                className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors flex-shrink-0 ${
                  selectedId === suggestedId
                    ? 'bg-[#F5A623] text-white'
                    : 'border border-orange-200 text-orange-600 hover:bg-orange-100'
                }`}
              >
                {selectedId === suggestedId ? '✓ Selecionado' : 'Usar sugestão'}
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
                {/* Cabeçalho da categoria */}
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

                {/* Temas da categoria */}
                {open && (
                  <div className="divide-y divide-gray-50">
                    {themes.map((theme) => {
                      const isSelected = selectedId === theme.id
                      return (
                        <button
                          key={theme.id}
                          onClick={() => setSelectedId(theme.id)}
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
                          {isSelected && (
                            <span className="text-[#F5A623] font-bold flex-shrink-0">✓</span>
                          )}
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

        {/* Rodapé fixo */}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-3 flex-shrink-0 bg-white">
          <button
            onClick={handleConfirm}
            disabled={!selectedId}
            className="flex-1 py-3 px-4 bg-[#F5A623] text-white font-semibold rounded-xl hover:bg-[#d4891a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {selectedTheme
              ? `Confirmar: ${selectedTheme.icon} ${selectedTheme.title}`
              : 'Selecione um tema'}
          </button>
          <button
            onClick={onClose}
            className="py-3 px-4 border border-gray-200 text-gray-500 rounded-xl hover:bg-gray-50 transition-colors text-sm"
          >
            Pular
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Helper público: tema sugerido pelo dia ───────────────────────────────────

export function getSuggestedDdsTheme(): DdsStaticTheme {
  const now    = new Date()
  const start  = new Date(now.getFullYear(), 0, 0)
  const diff   = now.getTime() - start.getTime()
  const dayOfYear = Math.floor(diff / 86400000)
  return STATIC_THEMES[dayOfYear % STATIC_THEMES.length]
}

export { STATIC_THEMES }
