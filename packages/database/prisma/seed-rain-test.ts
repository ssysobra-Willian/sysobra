/**
 * Seed de dados pluviométricos de teste
 * Cria 60 dias de registros de chuva para a obra existente
 * Uso: npx tsx prisma/seed-rain-test.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const p = prisma as any

async function main() {
  // Busca a empresa e o projeto
  const company = await prisma.company.findFirst({ select: { id: true } })
  if (!company) { console.log('Nenhuma empresa encontrada'); return }

  const project = await p.project.findFirst({
    where: { companyId: company.id },
    select: { id: true, name: true },
  })
  if (!project) { console.log('Nenhum projeto encontrado'); return }

  console.log(`Criando rain records para: ${project.name} (${project.id})`)

  // Remove registros existentes para este projeto (evitar duplicatas)
  await p.diaryRainRecord.deleteMany({ where: { projectId: project.id } })

  // Gera 60 dias de dados de chuva retroativos
  const today   = new Date()
  const records = []

  // Perfil de chuvas: alta no início (época chuvosa), baixa no fim (seca)
  const rainProfile = [
    // Dias 1-15: época chuvosa (muita chuva, alguns dias impraticáveis)
    { morning: 8, afternoon: 15, night: 3, unworkable: false },
    { morning: 0, afternoon: 0,  night: 0, unworkable: false },
    { morning: 12, afternoon: 25, night: 8, unworkable: true  },
    { morning: 3, afternoon: 5,  night: 0, unworkable: false },
    { morning: 0, afternoon: 2,  night: 0, unworkable: false },
    { morning: 18, afternoon: 20, night: 12, unworkable: true  },
    { morning: 5, afternoon: 8,  night: 2, unworkable: false },
    { morning: 0, afternoon: 0,  night: 0, unworkable: false },
    { morning: 0, afternoon: 3,  night: 0, unworkable: false },
    { morning: 22, afternoon: 18, night: 5, unworkable: true  },
    { morning: 8, afternoon: 12, night: 3, unworkable: false },
    { morning: 0, afternoon: 0,  night: 0, unworkable: false },
    { morning: 2, afternoon: 5,  night: 0, unworkable: false },
    { morning: 15, afternoon: 28, night: 10, unworkable: true  },
    { morning: 3, afternoon: 7,  night: 2, unworkable: false },
    // Dias 16-30: transição (chuvas moderadas)
    { morning: 0, afternoon: 0,  night: 0, unworkable: false },
    { morning: 5, afternoon: 8,  night: 0, unworkable: false },
    { morning: 0, afternoon: 2,  night: 0, unworkable: false },
    { morning: 10, afternoon: 15, night: 5, unworkable: false },
    { morning: 0, afternoon: 0,  night: 0, unworkable: false },
    { morning: 0, afternoon: 3,  night: 0, unworkable: false },
    { morning: 8, afternoon: 12, night: 3, unworkable: false },
    { morning: 0, afternoon: 0,  night: 0, unworkable: false },
    { morning: 0, afternoon: 0,  night: 0, unworkable: false },
    { morning: 3, afternoon: 5,  night: 0, unworkable: false },
    { morning: 0, afternoon: 0,  night: 0, unworkable: false },
    { morning: 0, afternoon: 2,  night: 0, unworkable: false },
    { morning: 5, afternoon: 10, night: 2, unworkable: false },
    { morning: 0, afternoon: 0,  night: 0, unworkable: false },
    { morning: 0, afternoon: 0,  night: 0, unworkable: false },
    // Dias 31-45: época seca
    { morning: 0, afternoon: 0,  night: 0, unworkable: false },
    { morning: 0, afternoon: 1,  night: 0, unworkable: false },
    { morning: 0, afternoon: 0,  night: 0, unworkable: false },
    { morning: 0, afternoon: 0,  night: 0, unworkable: false },
    { morning: 2, afternoon: 3,  night: 0, unworkable: false },
    { morning: 0, afternoon: 0,  night: 0, unworkable: false },
    { morning: 0, afternoon: 0,  night: 0, unworkable: false },
    { morning: 0, afternoon: 0,  night: 0, unworkable: false },
    { morning: 0, afternoon: 2,  night: 0, unworkable: false },
    { morning: 0, afternoon: 0,  night: 0, unworkable: false },
    { morning: 0, afternoon: 0,  night: 0, unworkable: false },
    { morning: 1, afternoon: 0,  night: 0, unworkable: false },
    { morning: 0, afternoon: 0,  night: 0, unworkable: false },
    { morning: 0, afternoon: 0,  night: 0, unworkable: false },
    { morning: 0, afternoon: 0,  night: 0, unworkable: false },
    // Dias 46-60: ressurgência de chuvas
    { morning: 5, afternoon: 8,  night: 0, unworkable: false },
    { morning: 0, afternoon: 0,  night: 0, unworkable: false },
    { morning: 12, afternoon: 18, night: 5, unworkable: true  },
    { morning: 3, afternoon: 5,  night: 0, unworkable: false },
    { morning: 0, afternoon: 0,  night: 0, unworkable: false },
    { morning: 0, afternoon: 2,  night: 0, unworkable: false },
    { morning: 8, afternoon: 15, night: 3, unworkable: false },
    { morning: 0, afternoon: 0,  night: 0, unworkable: false },
    { morning: 0, afternoon: 0,  night: 0, unworkable: false },
    { morning: 2, afternoon: 4,  night: 0, unworkable: false },
    { morning: 0, afternoon: 0,  night: 0, unworkable: false },
    { morning: 0, afternoon: 1,  night: 0, unworkable: false },
    { morning: 0, afternoon: 0,  night: 0, unworkable: false },
    { morning: 0, afternoon: 0,  night: 0, unworkable: false },
    { morning: 0, afternoon: 0,  night: 0, unworkable: false },
  ]

  for (let i = 0; i < 60; i++) {
    const profile = rainProfile[i] ?? { morning: 0, afternoon: 0, night: 0, unworkable: false }
    const date = new Date(today)
    date.setDate(date.getDate() - (59 - i)) // do mais antigo ao mais recente
    date.setHours(12, 0, 0, 0)

    const total = profile.morning + profile.afternoon + profile.night

    records.push({
      companyId:   company.id,
      projectId:   project.id,
      date,
      morningMm:   profile.morning,
      afternoonMm: profile.afternoon,
      nightMm:     profile.night,
      totalMm:     total,
      isUnworkable: profile.unworkable,
      unworkableReason: profile.unworkable ? 'Chuva intensa — condições adversas para execução' : null,
    })
  }

  // Cria em lotes
  let created = 0
  for (const rec of records) {
    await p.diaryRainRecord.create({
      data: {
        ...rec,
        project: { connect: { id: rec.projectId } },
        company: { connect: { id: rec.companyId } },
      },
    })
    created++
  }

  console.log(`✅ ${created} registros pluviométricos criados`)
  console.log(`   Dias chuvosos: ${records.filter((r) => r.totalMm > 0).length}`)
  console.log(`   Dias impraticáveis: ${records.filter((r) => r.isUnworkable).length}`)
  console.log(`   Total acumulado: ${records.reduce((s, r) => s + r.totalMm, 0).toFixed(0)} mm`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
