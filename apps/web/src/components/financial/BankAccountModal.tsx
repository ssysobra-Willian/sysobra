'use client'

import { useState, useEffect } from 'react'
import { X, Info } from 'lucide-react'
import { NumericFormat } from 'react-number-format'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface Bank { id: string; code: string | null; name: string; fullName?: string | null }
interface BankAccount {
  id: string; name: string; bank?: string | null; bankId?: string | null
  agency?: string | null; agencyDigit?: string | null
  accountNumber?: string | null; accountDigit?: string | null
  accountType: string; pixKey?: string | null
  holderName?: string | null; holderDocument?: string | null
  initialBalance: number; integrationActive: boolean
}

interface Props {
  open:      boolean
  onClose:   () => void
  onSaved:   () => void
  editAccount?: BankAccount | null
  token:     string
}

const ACCOUNT_TYPES = [
  { value: 'CHECKING',    label: 'Conta Corrente'    },
  { value: 'SAVINGS',     label: 'Poupança'          },
  { value: 'INVESTMENT',  label: 'Investimento'      },
  { value: 'CASH',        label: 'Caixa (físico)'   },
  { value: 'CREDIT_CARD', label: 'Cartão de Crédito' },
  { value: 'OTHER',       label: 'Outro'             },
]

const INTEGRATION_STATUS = [
  { value: 'MANUAL',   label: 'Manual'    },
  { value: 'PENDING',  label: 'Pendente'  },
  { value: 'ACTIVE',   label: 'Ativo'     },
  { value: 'ERROR',    label: 'Com erro'  },
  { value: 'INACTIVE', label: 'Inativo'   },
]

export function BankAccountModal({ open, onClose, onSaved, editAccount, token }: Props) {
  const [name,              setName]              = useState('')
  const [bankSearch,        setBankSearch]        = useState('')
  const [bankId,            setBankId]            = useState('')
  const [bankCode,          setBankCode]          = useState('')
  const [agency,            setAgency]            = useState('')
  const [agencyDigit,       setAgencyDigit]       = useState('')
  const [accountNumber,     setAccountNumber]     = useState('')
  const [accountDigit,      setAccountDigit]      = useState('')
  const [accountType,       setAccountType]       = useState('CHECKING')
  const [pixKey,            setPixKey]            = useState('')
  const [holderName,        setHolderName]        = useState('')
  const [holderDocument,    setHolderDocument]    = useState('')
  const [initialBalance,    setInitialBalance]    = useState<number>(0)
  const [integrationActive, setIntegrationActive] = useState(false)
  const [integrationStatus, setIntegrationStatus] = useState('MANUAL')
  const [banks,             setBanks]             = useState<Bank[]>([])
  const [showBanks,         setShowBanks]         = useState(false)
  const [loading,           setLoading]           = useState(false)
  const [error,             setError]             = useState('')

  // Buscar bancos
  useEffect(() => {
    if (!open) return
    const h = { Authorization: `Bearer ${token}` }
    fetch(`${API}/api/financial/banks${bankSearch ? `?search=${encodeURIComponent(bankSearch)}` : ''}`, { headers: h })
      .then((r) => r.json())
      .then((d) => setBanks(d.banks ?? []))
      .catch(() => {})
  }, [open, bankSearch, token])

  // Preencher para edição
  useEffect(() => {
    if (!open) return
    if (editAccount) {
      setName(editAccount.name)
      setBankId(editAccount.bankId ?? '')
      setAgency(editAccount.agency ?? '')
      setAgencyDigit(editAccount.agencyDigit ?? '')
      setAccountNumber(editAccount.accountNumber ?? '')
      setAccountDigit(editAccount.accountDigit ?? '')
      setAccountType(editAccount.accountType ?? 'CHECKING')
      setPixKey(editAccount.pixKey ?? '')
      setHolderName(editAccount.holderName ?? '')
      setHolderDocument(editAccount.holderDocument ?? '')
      setInitialBalance(Number(editAccount.initialBalance) || 0)
      setIntegrationActive(editAccount.integrationActive)
    } else {
      setName(''); setBankId(''); setBankCode(''); setAgency('')
      setAgencyDigit(''); setAccountNumber(''); setAccountDigit('')
      setAccountType('CHECKING'); setPixKey(''); setHolderName('')
      setHolderDocument(''); setInitialBalance(0)
      setIntegrationActive(false); setIntegrationStatus('MANUAL')
    }
  }, [open, editAccount])

  function selectBank(bank: Bank) {
    setBankId(bank.id)
    setBankSearch(bank.name)
    setBankCode(bank.code ?? '')
    setShowBanks(false)
  }

  async function handleSubmit() {
    if (!name.trim()) { setError('Nome da conta obrigatório'); return }
    setLoading(true)
    setError('')
    try {
      const body = {
        name,
        bank:              bankSearch || null,
        bankId:            bankId || null,
        agency:            agency || null,
        agencyDigit:       agencyDigit || null,
        accountNumber:     accountNumber || null,
        accountDigit:      accountDigit || null,
        accountType,
        pixKey:            pixKey || null,
        holderName:        holderName || null,
        holderDocument:    holderDocument || null,
        initialBalance:    initialBalance || 0,
        integrationActive,
      }
      const url    = editAccount
        ? `${API}/api/financial/bank-accounts/${editAccount.id}`
        : `${API}/api/financial/bank-accounts`
      const method = editAccount ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Erro ao salvar conta')
      onSaved()
      onClose()
    } catch (e: any) {
      setError(e.message || 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative min-h-screen flex items-start justify-center py-8 px-4">
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <h2 className="text-lg font-bold text-gray-900">
              {editAccount ? 'Editar conta bancária' : 'Nova conta bancária'}
            </h2>
            <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100">
              <X size={20} />
            </button>
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* ── Esquerda ── */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nome da conta *</label>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Banco do Brasil Principal"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Tipo de conta *</label>
                <select value={accountType} onChange={(e) => setAccountType(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] bg-white">
                  {ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              {/* Banco */}
              <div className="relative">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Banco</label>
                <input value={bankSearch}
                  onChange={(e) => { setBankSearch(e.target.value); setShowBanks(true) }}
                  onFocus={() => setShowBanks(true)}
                  placeholder="Buscar banco..."
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]" />
                {showBanks && banks.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-10 bg-white border border-gray-200 rounded-xl shadow-lg max-h-44 overflow-y-auto mt-1">
                    {banks.slice(0, 10).map((b) => (
                      <button key={b.id} onClick={() => selectBank(b)}
                        className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm border-b border-gray-50 last:border-0">
                        <span className="font-medium text-gray-700">{b.code ? `${b.code} ` : ''}{b.name}</span>
                        {b.fullName && <span className="text-xs text-gray-400 block truncate">{b.fullName}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Código do banco</label>
                <input value={bankCode} onChange={(e) => setBankCode(e.target.value)}
                  placeholder="001"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]" />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Agência</label>
                  <input value={agency} onChange={(e) => setAgency(e.target.value)}
                    placeholder="0001"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Dígito</label>
                  <input value={agencyDigit} onChange={(e) => setAgencyDigit(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Conta</label>
                  <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder="12345"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Dígito</label>
                  <input value={accountDigit} onChange={(e) => setAccountDigit(e.target.value)}
                    placeholder="6"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Chave PIX</label>
                <input value={pixKey} onChange={(e) => setPixKey(e.target.value)}
                  placeholder="CPF, CNPJ, e-mail ou chave aleatória"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]" />
              </div>

              {/* Integração */}
              <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-600">Integração e sincronização</p>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div className={`relative w-10 h-5 rounded-full transition-colors ${integrationActive ? 'bg-[#F5A623]' : 'bg-gray-200'}`}
                    onClick={() => setIntegrationActive(!integrationActive)}>
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${integrationActive ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                  <span className="text-sm text-gray-700">Integração ativa</span>
                </label>
                {integrationActive && (
                  <select value={integrationStatus} onChange={(e) => setIntegrationStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] bg-white">
                    {INTEGRATION_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                )}
                <p className="text-xs text-gray-400">
                  💡 A conexão via Open Finance será feita pelo botão "Conectar banco" na lista de contas.
                </p>
              </div>
            </div>

            {/* ── Direita ── */}
            <div className="space-y-4">
              {/* Dados do titular */}
              <div className="border border-blue-100 bg-blue-50 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Info size={14} className="text-blue-500 flex-shrink-0" />
                  <p className="text-xs text-blue-700 font-semibold">Dados do titular (opcional)</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nome do titular</label>
                  <input value={holderName} onChange={(e) => setHolderName(e.target.value)}
                    placeholder="Nome completo ou razão social"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">CPF / CNPJ</label>
                  <input value={holderDocument} onChange={(e) => setHolderDocument(e.target.value)}
                    placeholder="000.000.000-00"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] bg-white" />
                </div>
                <p className="text-[11px] text-blue-600">
                  Esses dados ajudam na identificação no Open Finance e conciliação bancária.
                </p>
              </div>

              {/* Saldo inicial */}
              <div className="border border-amber-100 bg-amber-50 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Info size={14} className="text-amber-500 flex-shrink-0" />
                  <p className="text-xs text-amber-700 font-semibold">Saldo inicial</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Saldo inicial</label>
                  <NumericFormat
                    thousandSeparator="." decimalSeparator="," prefix="R$ "
                    decimalScale={2} fixedDecimalScale
                    value={initialBalance || ''}
                    onValueChange={(v) => setInitialBalance(v.floatValue ?? 0)}
                    placeholder="R$ 0,00"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] bg-white"
                  />
                </div>
                <p className="text-[11px] text-amber-700">
                  Informe o saldo inicial apenas se desejar controlar saldos manualmente. Lançamentos pagos somam ou subtraem deste valor.
                </p>
              </div>

              {/* Erro */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
            <button onClick={onClose}
              className="px-5 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50">
              Cancelar
            </button>
            <button onClick={handleSubmit} disabled={loading}
              className="px-6 py-2.5 bg-[#F5A623] text-white rounded-xl text-sm font-semibold hover:bg-[#d4891a] disabled:opacity-60">
              {loading ? 'Salvando...' : 'Salvar conta'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
