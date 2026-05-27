/**
 * Helper centralizado de auditoria do sistema SYSOBRA.
 * Cada ação relevante (CREATE, UPDATE, DELETE, PAY, APPROVE, etc.)
 * deve chamar createAuditLog para garantir rastreabilidade completa.
 *
 * SEGURANÇA: companyId é OBRIGATÓRIO — nunca registrar sem ele.
 */

interface AuditParams {
  prisma: any                       // PrismaClient ou transaction (prismaT)
  companyId: string
  userId?: string | null            // null = ação do sistema automático
  action: string                    // CREATE | UPDATE | DELETE | PAY | RECEIVE |
                                    // CANCEL | APPROVE | REJECT | SUBMIT | COMMENT |
                                    // UPLOAD | LOGIN | LOGOUT | TRANSFER | REVERSE |
                                    // REVERSE_TRANSFER | INVITE | PERMISSION_CHANGE |
                                    // EXPORT | PRINT
  module: string                    // FINANCIAL | PROJECT | DIARY | DEPOSIT | FLEET |
                                    // PURCHASES | COLLABORATORS | TRACKER | SETTINGS |
                                    // AUTH | REPORTS
  entity: string                    // FinancialTransaction | Project | DiaryEntry |
                                    // BankAccount | Supplier | Client | Employee |
                                    // Vehicle | StockItem | PurchaseOrder |
                                    // ProjectStage | DiaryComment | User | etc.
  entityId?: string | null
  entityName?: string | null
  description: string               // Descrição legível por humanos
  metadata?: Record<string, any>
  request?: any                     // Fastify request — usado para extrair IP e User-Agent
}

/**
 * Registra uma entrada no log de auditoria.
 * NUNCA lança exceção — erros de log não devem derrubar a operação principal.
 */
export async function createAuditLog(params: AuditParams): Promise<void> {
  try {
    const ipAddress  = params.request?.ip
      ?? params.request?.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
      ?? null

    const userAgent  = params.request?.headers?.['user-agent'] ?? null

    await params.prisma.auditLog.create({
      data: {
        companyId:   params.companyId,
        userId:      params.userId ?? null,
        action:      params.action,
        module:      params.module,
        entity:      params.entity,
        entityId:    params.entityId  ?? null,
        entityName:  params.entityName ?? null,
        description: params.description,
        metadata:    params.metadata  ?? {},
        ipAddress,
        userAgent,
        createdAt:   new Date(),
      },
    })
  } catch (err) {
    // NUNCA deixar erro de log derrubar a operação principal
    console.error('[AuditLog] Erro ao registrar:', err)
  }
}

/**
 * Formata um valor monetário em BRL para uso nas descrições de log.
 * Ex: fmtMoney(1250) → "R$ 1.250,00"
 */
export function fmtMoney(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style:    'currency',
    currency: 'BRL',
  }).format(value)
}

/**
 * Compara dois objetos e retorna apenas os campos que mudaram,
 * com os valores antes e depois.
 * Útil para preencher metadata.changes em logs de UPDATE.
 *
 * Ex: diffObjects({ name: 'Abc', value: 100 }, { name: 'Xyz', value: 100 })
 *   → { name: { before: 'Abc', after: 'Xyz' } }
 */
export function diffObjects(
  before: Record<string, any>,
  after:  Record<string, any>,
): Record<string, { before: any; after: any }> {
  const changes: Record<string, { before: any; after: any }> = {}
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)])

  for (const key of allKeys) {
    const bVal = before[key]
    const aVal = after[key]
    // Comparação por valor JSON — ignora mudanças em funções/undefined
    if (JSON.stringify(bVal) !== JSON.stringify(aVal)) {
      changes[key] = { before: bVal, after: aVal }
    }
  }

  return changes
}
