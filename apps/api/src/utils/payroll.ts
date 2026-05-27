/**
 * Utilitários de folha de pagamento — tabelas vigentes 2025/2026
 *
 * INSS:  Portaria MPS nº 1.367/2024 (vigente jan/2025)
 * IRRF:  Lei 14.848/2024
 *          2025 → isenção até R$ 3.036,00
 *          2026 → isenção até R$ 5.000,00 (vigente jan/2026)
 */

// ─── INSS 2025 ────────────────────────────────────────────────────────────────

const TETO_INSS_2025 = 8157.41

const FAIXAS_INSS_2025 = [
  { limite: 1518.00, aliquota: 0.075 }, // até R$ 1.518,00 → 7,5%
  { limite: 2793.88, aliquota: 0.09  }, // de R$ 1.518,01 a R$ 2.793,88 → 9%
  { limite: 4190.83, aliquota: 0.12  }, // de R$ 2.793,89 a R$ 4.190,83 → 12%
  { limite: 8157.41, aliquota: 0.14  }, // de R$ 4.190,84 a R$ 8.157,41 → 14%
]

export function calcularINSS(salarioBruto: number): number {
  const base = Math.min(salarioBruto, TETO_INSS_2025)
  let inss = 0
  let anterior = 0
  for (const faixa of FAIXAS_INSS_2025) {
    if (base <= anterior) break
    const valorNaFaixa = Math.min(base, faixa.limite) - anterior
    inss += valorNaFaixa * faixa.aliquota
    anterior = faixa.limite
  }
  return Math.round(inss * 100) / 100
}

// ─── IRRF ─────────────────────────────────────────────────────────────────────

const DEDUCAO_DEPENDENTE = 189.59

// Tabela 2025 — isenção R$ 3.036,00
const FAIXAS_IRRF_2025 = [
  { limite: 3036.00,   aliquota: 0,     deducao: 0       },
  { limite: 6000.00,   aliquota: 0.075, deducao: 227.70  },
  { limite: 9000.00,   aliquota: 0.15,  deducao: 677.70  },
  { limite: 12000.00,  aliquota: 0.225, deducao: 1352.70 },
  { limite: Infinity,  aliquota: 0.275, deducao: 1952.70 },
]

// Tabela 2026 — Lei 14.848/2024 — isenção R$ 5.000,00
const FAIXAS_IRRF_2026 = [
  { limite: 5000.00,   aliquota: 0,     deducao: 0       },
  { limite: 6533.94,   aliquota: 0.075, deducao: 375.00  },
  { limite: 8045.02,   aliquota: 0.15,  deducao: 864.55  },
  { limite: 10302.02,  aliquota: 0.225, deducao: 1468.43 },
  { limite: Infinity,  aliquota: 0.275, deducao: 1983.43 },
]

export function calcularIRRF(
  baseCalculo: number,
  dependentes  = 0,
  referenceDate?: Date,
): number {
  const date  = referenceDate ?? new Date()
  const ano   = date.getFullYear()
  const faixas = ano >= 2026 ? FAIXAS_IRRF_2026 : FAIXAS_IRRF_2025

  const base = baseCalculo - dependentes * DEDUCAO_DEPENDENTE
  if (base <= 0) return 0

  for (const faixa of faixas) {
    if (base <= faixa.limite) {
      const valor = base * faixa.aliquota - faixa.deducao
      return Math.max(0, Math.round(valor * 100) / 100)
    }
  }
  return 0
}

/** Valor da faixa de isenção IRRF para o ano de referência */
export function isencaoIRRF(referenceDate?: Date): number {
  const ano = (referenceDate ?? new Date()).getFullYear()
  return ano >= 2026 ? 5000 : 3036
}

// ─── Cálculo completo da folha ────────────────────────────────────────────────

export interface PayrollCalculation {
  salarioBase:         number
  horasExtra60:        number
  horasExtra100:       number
  totalExtra60:        number
  totalExtra100:       number
  salarioBruto:        number
  inss:                number
  irrfBase:            number
  irrf:                number
  desconto:            number
  salarioLiquido:      number
  fgts:                number
  inssPatronal:        number
  rat:                 number
  terceiros:           number
  provisaoFerias:      number
  provisaoDecimo:      number
  encargosPatronais:   number
  provisoes:           number
  custoTotal:          number
  tabelaAno:           number
  isencaoIRRFValor:    number
}

export function calcularFolha(params: {
  salarioBase:     number
  horasExtra60?:   number
  horasExtra100?:  number
  desconto?:       number
  dependentes?:    number
  type:            'CLT' | 'PJ' | 'TEMPORARY' | 'INTERN' | 'THIRD_PARTY'
  referenceDate?:  Date
}): PayrollCalculation {
  const {
    salarioBase,
    horasExtra60  = 0,
    horasExtra100 = 0,
    desconto      = 0,
    dependentes   = 0,
    type,
    referenceDate,
  } = params

  const valorHora   = salarioBase / 220
  const totalExtra60  = Math.round(horasExtra60  * valorHora * 1.60 * 100) / 100
  const totalExtra100 = Math.round(horasExtra100 * valorHora * 2.00 * 100) / 100
  const salarioBruto  = Math.round((salarioBase + totalExtra60 + totalExtra100) * 100) / 100

  const date       = referenceDate ?? new Date()
  const tabelaAno  = date.getFullYear()
  const isencaoIRRFValor = isencaoIRRF(date)

  // PJ / temporário / estagiário / terceirizado → sem encargos CLT
  if (type !== 'CLT') {
    const salarioLiquido = Math.round((salarioBruto - desconto) * 100) / 100
    return {
      salarioBase, horasExtra60, horasExtra100,
      totalExtra60, totalExtra100, salarioBruto,
      inss: 0, irrfBase: 0, irrf: 0, desconto, salarioLiquido,
      fgts: 0, inssPatronal: 0, rat: 0, terceiros: 0,
      provisaoFerias: 0, provisaoDecimo: 0,
      encargosPatronais: 0, provisoes: 0,
      custoTotal: salarioBruto,
      tabelaAno, isencaoIRRFValor,
    }
  }

  // CLT — todos os encargos
  const inss             = calcularINSS(salarioBruto)
  const irrfBase         = Math.max(0, salarioBruto - inss)
  const irrf             = calcularIRRF(irrfBase, dependentes, date)
  const salarioLiquido   = Math.round((salarioBruto - inss - irrf - desconto) * 100) / 100

  const fgts             = Math.round(salarioBruto * 0.08   * 100) / 100
  const inssPatronal     = Math.round(salarioBruto * 0.20   * 100) / 100
  const rat              = Math.round(salarioBruto * 0.03   * 100) / 100  // RAT grau 3 (construção civil)
  const terceiros        = Math.round(salarioBruto * 0.058  * 100) / 100  // SESI + SENAI + SEBRAE + INCRA
  const provisaoFerias   = Math.round(salarioBruto * 0.1111 * 100) / 100
  const provisaoDecimo   = Math.round(salarioBruto * 0.0833 * 100) / 100
  const encargosPatronais = fgts + inssPatronal + rat + terceiros
  const provisoes        = provisaoFerias + provisaoDecimo
  const custoTotal       = Math.round((salarioBruto + encargosPatronais + provisoes) * 100) / 100

  return {
    salarioBase, horasExtra60, horasExtra100,
    totalExtra60, totalExtra100, salarioBruto,
    inss, irrfBase, irrf, desconto, salarioLiquido,
    fgts, inssPatronal, rat, terceiros,
    provisaoFerias, provisaoDecimo,
    encargosPatronais, provisoes, custoTotal,
    tabelaAno, isencaoIRRFValor,
  }
}
