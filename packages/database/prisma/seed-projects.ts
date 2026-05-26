/**
 * Seed: 3 obras de exemplo com etapas para Centro de Custo.
 * Execute com: npx ts-node prisma/seed-projects.ts
 *
 * Precisa de pelo menos 1 empresa e 1 usuário no banco.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seed: obras de exemplo para Centro de Custo...')

  // Encontra primeira empresa ativa
  const company = await prisma.company.findFirst({ where: { isActive: true } })
  if (!company) {
    console.log('⚠️  Nenhuma empresa encontrada. Crie uma empresa antes de executar este seed.')
    return
  }
  console.log(`  📦 Empresa: ${company.name} (${company.id})`)

  // Encontra primeiro membro (para responsável)
  const member = await (prisma as any).companyMember.findFirst({
    where: { companyId: company.id, isActive: true },
    include: { user: { select: { id: true, name: true } } },
  })
  const responsibleId = member?.userId ?? member?.user?.id ?? null

  // Encontra primeiro cliente (se existir)
  const client = await prisma.client.findFirst({ where: { companyId: company.id, isActive: true } })

  const year = new Date().getFullYear()

  // Verifica se já existem obras de seed
  const existingCount = await (prisma as any).project.count({
    where: { companyId: company.id, code: { startsWith: `CC-${year}-` } },
  })

  if (existingCount >= 3) {
    console.log(`  ℹ️  Já existem ${existingCount} obras. Seed pulado.`)
    return
  }

  // ── Obra 1: Residência em andamento ─────────────────────────────────────
  const obra1 = await (prisma as any).project.create({
    data: {
      companyId:       company.id,
      responsibleId,
      clientId:        client?.id ?? null,
      code:            `CC-${year}-001`,
      name:            'Residência Alto da Boa Vista',
      description:     'Casa residencial de alto padrão com 4 suítes, piscina e área de lazer',
      address:         'Rua das Palmeiras, 120',
      city:            'São Paulo',
      state:           'SP',
      zipCode:         '04560-001',
      status:          'IN_PROGRESS',
      globalBudget:    1200000,
      startDate:       new Date(`${year}-01-10`),
      expectedEndDate: new Date(`${year}-10-30`),
      warrantyMonths:  60,
      progressPercent: 45,
      budgetAlert:     false,
      delayAlert:      false,
      cno:             '123.456.789/00',
      artExecution:    'SP-2024-123456',
      artProjects:     'SP-2024-654321',
      technicalName:   'Eng. Carlos Mendes',
      technicalTitle:  'Eng. Civil',
      technicalCrea:   'CREA-SP 987654-D',
      isActive:        true,
    },
  })
  console.log(`  ✅ Obra 1: ${obra1.name}`)

  // Etapas da obra 1
  const stages1 = [
    { name: 'Fundação',        order: 0, budgetMaterial:  80000, budgetLabor:  40000, progressPercent: 100, status: 'COMPLETED',   realizedValue: 123500 },
    { name: 'Estrutura',       order: 1, budgetMaterial: 200000, budgetLabor: 120000, progressPercent:  90, status: 'IN_PROGRESS', realizedValue: 286000 },
    { name: 'Alvenaria',       order: 2, budgetMaterial: 150000, budgetLabor:  80000, progressPercent:  70, status: 'IN_PROGRESS', realizedValue: 161000 },
    { name: 'Instalações',     order: 3, budgetMaterial: 180000, budgetLabor:  90000, progressPercent:  20, status: 'IN_PROGRESS', realizedValue:  54000 },
    { name: 'Revestimentos',   order: 4, budgetMaterial: 220000, budgetLabor: 100000, progressPercent:   0, status: 'PENDING',     realizedValue:      0 },
    { name: 'Acabamentos',     order: 5, budgetMaterial: 180000, budgetLabor:  60000, progressPercent:   0, status: 'PENDING',     realizedValue:      0 },
  ]
  for (const s of stages1) {
    await (prisma as any).projectStage.create({
      data: {
        projectId: obra1.id,
        code: `E0${s.order + 1}`,
        name: s.name,
        order: s.order,
        budgetMaterial: s.budgetMaterial,
        budgetLabor: s.budgetLabor,
        budgetTotal: s.budgetMaterial + s.budgetLabor,
        realizedValue: s.realizedValue,
        progressPercent: s.progressPercent,
        status: s.status,
        startDate: new Date(`${year}-01-10`),
        endDate: new Date(`${year}-10-30`),
      },
    })
  }

  // ── Obra 2: Reforma comercial — quase concluída ──────────────────────────
  const obra2 = await (prisma as any).project.create({
    data: {
      companyId:       company.id,
      responsibleId,
      code:            `CC-${year}-002`,
      name:            'Reforma Comercial Centro Empresarial',
      description:     'Reforma completa de 3 andares de escritório corporativo',
      address:         'Av. Paulista, 1500 — Sala 301',
      city:            'São Paulo',
      state:           'SP',
      status:          'IN_PROGRESS',
      globalBudget:    380000,
      startDate:       new Date(`${year - 1}-09-01`),
      expectedEndDate: new Date(`${year}-03-31`),
      warrantyMonths:  24,
      progressPercent: 82,
      budgetAlert:     true,
      delayAlert:      true,
      artExecution:    'SP-2023-789012',
      technicalName:   'Arq. Maria Silveira',
      technicalTitle:  'Arquiteta(o)',
      technicalCrea:   'CAU-SP A123456-7',
      isActive:        true,
    },
  })
  console.log(`  ✅ Obra 2: ${obra2.name}`)

  const stages2 = [
    { name: 'Demolição',       order: 0, budgetMaterial:  20000, budgetLabor:  15000, progressPercent: 100, status: 'COMPLETED',   realizedValue:  36500 },
    { name: 'Civil',           order: 1, budgetMaterial:  80000, budgetLabor:  60000, progressPercent: 100, status: 'COMPLETED',   realizedValue: 152000 },
    { name: 'Elétrica',        order: 2, budgetMaterial:  50000, budgetLabor:  30000, progressPercent:  95, status: 'IN_PROGRESS', realizedValue:  81000 },
    { name: 'Hidráulica',      order: 3, budgetMaterial:  30000, budgetLabor:  20000, progressPercent:  90, status: 'IN_PROGRESS', realizedValue:  49000 },
    { name: 'Acabamento',      order: 4, budgetMaterial:  40000, budgetLabor:  25000, progressPercent:  40, status: 'IN_PROGRESS', realizedValue:  26000 },
    { name: 'Paisagismo',      order: 5, budgetMaterial:   8000, budgetLabor:   2000, progressPercent:   0, status: 'PENDING',     realizedValue:      0 },
  ]
  for (const s of stages2) {
    await (prisma as any).projectStage.create({
      data: {
        projectId: obra2.id,
        code: `E0${s.order + 1}`,
        name: s.name,
        order: s.order,
        budgetMaterial: s.budgetMaterial,
        budgetLabor: s.budgetLabor,
        budgetTotal: s.budgetMaterial + s.budgetLabor,
        realizedValue: s.realizedValue,
        progressPercent: s.progressPercent,
        status: s.status,
      },
    })
  }

  // ── Obra 3: Condomínio — início recente ──────────────────────────────────
  const obra3 = await (prisma as any).project.create({
    data: {
      companyId:       company.id,
      responsibleId,
      code:            `CC-${year}-003`,
      name:            'Condomínio Villa Verde — Fase 1',
      description:     'Construção de condomínio residencial com 24 unidades, área de lazer completa',
      address:         'Estrada do Campo Verde, km 3',
      city:            'Campinas',
      state:           'SP',
      zipCode:         '13087-000',
      status:          'ACTIVE',
      globalBudget:    4800000,
      startDate:       new Date(`${year}-03-01`),
      expectedEndDate: new Date(`${year + 2}-02-28`),
      warrantyMonths:  60,
      progressPercent: 12,
      budgetAlert:     false,
      delayAlert:      false,
      cno:             '987.654.321/00',
      artExecution:    'SP-2025-111222',
      artProjects:     'SP-2025-333444',
      technicalName:   'Eng. Paulo Rodrigues',
      technicalTitle:  'Eng. Civil',
      technicalCrea:   'CREA-SP 112233-D',
      isActive:        true,
    },
  })
  console.log(`  ✅ Obra 3: ${obra3.name}`)

  const stages3 = [
    { name: 'Terraplanagem',   order: 0, budgetMaterial: 120000, budgetLabor:  80000, progressPercent: 100, status: 'COMPLETED',   realizedValue: 198000 },
    { name: 'Fundações',       order: 1, budgetMaterial: 350000, budgetLabor: 200000, progressPercent:  60, status: 'IN_PROGRESS', realizedValue: 330000 },
    { name: 'Estrutura',       order: 2, budgetMaterial: 800000, budgetLabor: 500000, progressPercent:   0, status: 'PENDING',     realizedValue:      0 },
    { name: 'Alvenaria',       order: 3, budgetMaterial: 600000, budgetLabor: 350000, progressPercent:   0, status: 'PENDING',     realizedValue:      0 },
    { name: 'Coberturas',      order: 4, budgetMaterial: 400000, budgetLabor: 200000, progressPercent:   0, status: 'PENDING',     realizedValue:      0 },
    { name: 'Instalações',     order: 5, budgetMaterial: 500000, budgetLabor: 300000, progressPercent:   0, status: 'PENDING',     realizedValue:      0 },
    { name: 'Revestimentos',   order: 6, budgetMaterial: 450000, budgetLabor: 250000, progressPercent:   0, status: 'PENDING',     realizedValue:      0 },
    { name: 'Áreas comuns',    order: 7, budgetMaterial: 300000, budgetLabor: 150000, progressPercent:   0, status: 'PENDING',     realizedValue:      0 },
  ]
  for (const s of stages3) {
    await (prisma as any).projectStage.create({
      data: {
        projectId: obra3.id,
        code: `E0${s.order + 1}`,
        name: s.name,
        order: s.order,
        budgetMaterial: s.budgetMaterial,
        budgetLabor: s.budgetLabor,
        budgetTotal: s.budgetMaterial + s.budgetLabor,
        realizedValue: s.realizedValue,
        progressPercent: s.progressPercent,
        status: s.status,
      },
    })
  }

  console.log(`\n✅ Seed concluído: 3 obras criadas para a empresa "${company.name}"`)
  console.log(`   CC-${year}-001 | CC-${year}-002 | CC-${year}-003`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
