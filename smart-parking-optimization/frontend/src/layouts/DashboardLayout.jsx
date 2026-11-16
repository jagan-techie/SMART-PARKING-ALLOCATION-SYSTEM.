import { useState } from 'react'
import {
  BarChart3,
  Car,
  Cpu,
  LayoutDashboard,
  Menu,
  ParkingSquare,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react'

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview Dashboard', icon: LayoutDashboard },
  { id: 'vehicles', label: 'Vehicle Management', icon: Car },
  { id: 'slots', label: 'Parking Slot Management', icon: ParkingSquare },
  { id: 'optimization', label: 'Optimization Center', icon: Cpu },
  { id: 'analytics', label: 'Analytics & Reports', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export default function DashboardLayout({ activePage, onNavigate, backendHealthy, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const currentNav = NAV_ITEMS.find((item) => item.id === activePage) || NAV_ITEMS[0]

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Dark Navy Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-navy-900 text-slate-100 transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
              <ParkingSquare className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold tracking-tight text-white">SmartPark OR</p>
              <p className="text-[11px] text-slate-400">Hungarian Optimization</p>
            </div>
          </div>
          <button
            type="button"
            className="rounded p-1 text-slate-400 hover:text-white lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = activePage === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onNavigate(item.id)
                  setSidebarOpen(false)
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-left text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-navy-800 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="border-t border-slate-800 p-4">
          <div className="rounded-lg bg-navy-800 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">OR Engine Status</span>
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                  backendHealthy ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    backendHealthy ? 'bg-emerald-400' : 'bg-rose-400'
                  }`}
                />
                {backendHealthy ? 'Connected' : 'Offline'}
              </span>
            </div>
            <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-400">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
              SciPy Linear Sum Assignment
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-base font-bold text-slate-900 sm:text-lg">
                {currentNav.label}
              </h1>
              <p className="hidden text-xs text-slate-500 sm:block">
                Smart College Parking Space Allocation Optimization System (CA-3 Operations Research)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 md:inline-flex">
              Assignment Problem · Hungarian Algorithm
            </span>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}

