'use client'

import React from 'react'

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg'

interface Props {
  name:      string
  avatarUrl?: string | null
  size?:     AvatarSize
  className?: string
  /** Exibir tooltip com nome completo ao passar o mouse */
  tooltip?:  boolean
}

// Gera cor de fundo consistente a partir do nome
function nameToColor(name: string): string {
  const COLORS = [
    '#F5A623', '#E57C23', '#3B82F6', '#6366F1', '#8B5CF6',
    '#EC4899', '#10B981', '#14B8A6', '#F59E0B', '#EF4444',
    '#06B6D4', '#84CC16', '#F97316', '#A855F7', '#0EA5E9',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return COLORS[Math.abs(hash) % COLORS.length]
}

// Extrai iniciais: primeira letra do primeiro e último palavra
function nameToInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

const SIZE_CLS: Record<AvatarSize, { outer: string; text: string; img: string }> = {
  xs: { outer: 'w-5 h-5',   text: 'text-[9px]',  img: 'w-5 h-5'  },
  sm: { outer: 'w-6 h-6',   text: 'text-[10px]', img: 'w-6 h-6'  },
  md: { outer: 'w-8 h-8',   text: 'text-xs',     img: 'w-8 h-8'  },
  lg: { outer: 'w-10 h-10', text: 'text-sm',     img: 'w-10 h-10' },
}

export function UserAvatar({ name, avatarUrl, size = 'md', className = '', tooltip = true }: Props) {
  const sz       = SIZE_CLS[size]
  const initials = nameToInitials(name)
  const color    = nameToColor(name)

  return (
    <div
      title={tooltip ? name : undefined}
      className={`${sz.outer} rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden ${className}`}
      style={!avatarUrl ? { backgroundColor: color } : undefined}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} className={`${sz.img} rounded-full object-cover`} />
      ) : (
        <span className={`${sz.text} font-bold text-white leading-none select-none`}>{initials}</span>
      )}
    </div>
  )
}

/** Linha com avatar + nome — usada em tabelas e recibo */
export function UserAvatarRow({
  name,
  avatarUrl,
  size = 'sm',
  sub,
}: {
  name:      string
  avatarUrl?: string | null
  size?:     AvatarSize
  sub?:      string
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <UserAvatar name={name} avatarUrl={avatarUrl} size={size} />
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-700 truncate">{name}</p>
        {sub && <p className="text-[10px] text-gray-400 truncate">{sub}</p>}
      </div>
    </div>
  )
}
