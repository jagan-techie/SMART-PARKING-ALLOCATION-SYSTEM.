const BADGE_CLASSES = {
  Available: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Occupied: 'bg-rose-50 text-rose-700 border-rose-200',
  Unavailable: 'bg-slate-100 text-slate-600 border-slate-300',
  Waiting: 'bg-amber-50 text-amber-800 border-amber-200',
  Assigned: 'bg-blue-50 text-blue-700 border-blue-200',
  Departed: 'bg-slate-100 text-slate-600 border-slate-200',
  Active: 'bg-blue-50 text-blue-700 border-blue-200',
  Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
}

export default function StatusBadge({ status }) {
  const cls = BADGE_CLASSES[status] || 'bg-slate-100 text-slate-700 border-slate-200'
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  )
}

