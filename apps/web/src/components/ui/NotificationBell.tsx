'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Bell, X, Check, CheckCheck } from 'lucide-react'

interface Notification {
  id: string
  title: string
  message: string
  type: 'INFO' | 'WARNING' | 'ACTION_REQUIRED'
  link?: string | null
  isRead: boolean
  createdAt: string
}

interface NotificationBellProps {
  collapsed?: boolean
}

export function NotificationBell({ collapsed }: NotificationBellProps) {
  const [notifications, setNotifications]   = useState<Notification[]>([])
  const [unreadCount,   setUnreadCount]      = useState(0)
  const [open,          setOpen]             = useState(false)
  const [loading,       setLoading]          = useState(false)
  const panelRef                             = useRef<HTMLDivElement>(null)

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/notifications', { credentials: 'include' })
      if (!res.ok) return
      const data = await res.json()
      setNotifications(data.notifications ?? [])
      setUnreadCount(data.unreadCount ?? 0)
    } catch {}
  }, [])

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30_000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  // Fechar ao clicar fora
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  async function markRead(id: string) {
    await fetch(`/api/v1/notifications/${id}/read`, { method: 'PATCH', credentials: 'include' })
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n))
    setUnreadCount(prev => Math.max(0, prev - 1))
  }

  async function markAllRead() {
    setLoading(true)
    await fetch('/api/v1/notifications/read-all', { method: 'PATCH', credentials: 'include' })
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
    setUnreadCount(0)
    setLoading(false)
  }

  function typeColor(type: Notification['type']) {
    if (type === 'ACTION_REQUIRED') return 'bg-red-500'
    if (type === 'WARNING')         return 'bg-yellow-500'
    return 'bg-blue-500'
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins  = Math.floor(diff / 60_000)
    if (mins < 1)  return 'agora'
    if (mins < 60) return `${mins}m`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24)  return `${hrs}h`
    return `${Math.floor(hrs / 24)}d`
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Botão sino */}
      <button
        onClick={() => setOpen(v => !v)}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        title="Notificações"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Painel */}
      {open && (
        <div className="absolute left-10 bottom-0 z-[200] w-80 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="font-semibold text-gray-800 text-sm">Notificações</span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  disabled={loading}
                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  title="Marcar todas como lidas"
                >
                  <CheckCheck size={14} /> Todas lidas
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Lista */}
          <div className="overflow-y-auto max-h-80 divide-y divide-gray-50">
            {notifications.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">Nenhuma notificação</div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={`flex gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${n.isRead ? 'opacity-60' : ''}`}
                  onClick={() => {
                    if (!n.isRead) markRead(n.id)
                    if (n.link) { window.location.href = n.link; setOpen(false) }
                  }}
                >
                  <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${typeColor(n.type)}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">{n.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-[10px] text-gray-400">{timeAgo(n.createdAt)}</span>
                    {!n.isRead && (
                      <button
                        onClick={e => { e.stopPropagation(); markRead(n.id) }}
                        className="text-gray-300 hover:text-blue-500"
                        title="Marcar como lida"
                      >
                        <Check size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
