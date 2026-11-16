import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

const STYLES = {
  success: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  error: 'bg-rose-50 border-rose-200 text-rose-900',
  info: 'bg-blue-50 border-blue-200 text-blue-900',
  warning: 'bg-amber-50 border-amber-200 text-amber-900',
}

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: AlertCircle,
}

export default function AlertBanner({ type = 'info', message, onClose }) {
  if (!message) return null
  const Icon = ICONS[type] || Info
  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${STYLES[type] || STYLES.info}`}>
      <div className="flex items-center gap-2.5">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="font-medium">{message}</span>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 opacity-70 hover:opacity-100"
          aria-label="Dismiss message"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

