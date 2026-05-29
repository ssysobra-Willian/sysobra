import { prisma } from '@sysobra/database'

const p = () => prisma as any

export async function createNotification(params: {
  companyId: string
  userId: string
  title: string
  message: string
  type?: 'INFO' | 'WARNING' | 'ACTION_REQUIRED'
  link?: string
}) {
  return p().notification.create({
    data: {
      companyId: params.companyId,
      userId:    params.userId,
      title:     params.title,
      message:   params.message,
      type:      params.type ?? 'INFO',
      link:      params.link ?? null,
    },
  })
}

export async function notifyManagers(params: {
  companyId: string
  title: string
  message: string
  type?: 'INFO' | 'WARNING' | 'ACTION_REQUIRED'
  link?: string
  excludeUserId?: string
}) {
  const members = await p().companyMember.findMany({
    where: {
      companyId: params.companyId,
      memberRole: { in: ['OWNER', 'ADMIN', 'MANAGER'] },
      isActive: true,
    },
    select: { userId: true },
  })

  const targets = members
    .map((m: any) => m.userId)
    .filter((uid: string) => uid !== params.excludeUserId)

  if (targets.length === 0) return

  await p().notification.createMany({
    data: targets.map((userId: string) => ({
      companyId: params.companyId,
      userId,
      title:     params.title,
      message:   params.message,
      type:      params.type ?? 'INFO',
      link:      params.link ?? null,
    })),
  })
}
