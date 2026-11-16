import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  Car,
  CheckCircle2,
  Clock,
  Cpu,
  DollarSign,
  ParkingSquare,
  RefreshCw,
} from 'lucide-react'
import KpiCard from '../components/KpiCard'
import AlertBanner from '../components/AlertBanner'
import {
  CostComparisonChart,
  HourlyDemandChart,
  UtilizationDoughnutChart,
  VehicleDistributionChart,
  ZoneOccupancyChart,
} from '../charts/DashboardCharts'
import { extractErrorMessage, parkingApi } from '../services/api'

export default function OverviewDashboard({ onNavigate }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadStats = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await parkingApi.getDashboardStats()
      setStats(data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const kpis = stats?.kpis || {}
  const charts = stats?.charts || {}

  return (
    <div className="space-y-6">
      {/* Header action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Campus Parking Operations Overview</h2>
          <p className="text-sm text-slate-500">
            Live telemetry aggregated directly from SQLite parking slots, vehicles, and allocation logs.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={loadStats}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => onNavigate('optimization')}
            className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800"
          >
            <Cpu className="h-4 w-4" />
            Optimize Waiting Vehicles
          </button>
        </div>
      </div>

      {error && <AlertBanner type="error" message={error} onClose={() => setError('')} />}

      {/* 6 KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          title="Total Parking Slots"
          value={loading && !stats ? '...' : kpis.total_slots ?? 0}
          subtitle={`${kpis.unavailable_slots ?? 0} under maintenance / unavailable`}
          icon={ParkingSquare}
          accent="navy"
        />
        <KpiCard
          title="Occupied Slots"
          value={loading && !stats ? '...' : kpis.occupied_slots ?? 0}
          subtitle={`${kpis.vehicles_assigned ?? 0} active parked vehicles`}
          icon={Car}
          accent="rose"
        />
        <KpiCard
          title="Available Slots"
          value={loading && !stats ? '...' : kpis.available_slots ?? 0}
          subtitle="Ready for Hungarian assignment"
          icon={CheckCircle2}
          accent="emerald"
        />
        <KpiCard
          title="Vehicles Waiting"
          value={loading && !stats ? '...' : kpis.vehicles_waiting ?? 0}
          subtitle={`Out of ${kpis.total_vehicles ?? 0} total vehicles`}
          icon={Clock}
          accent="amber"
        />
        <KpiCard
          title="Parking Utilization"
          value={loading && !stats ? '...' : `${kpis.utilization_percentage ?? 0}%`}
          subtitle="Occupied bays / total campus capacity"
          icon={Activity}
          accent="blue"
        />
        <KpiCard
          title="Total Allocation Cost"
          value={loading && !stats ? '...' : Number(kpis.total_allocation_cost ?? 0).toLocaleString()}
          subtitle={`Avg ${kpis.average_allocation_cost ?? 0} cost units / active bay`}
          icon={DollarSign}
          accent="indigo"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-900">Parking Utilization Breakdown</h3>
            <p className="text-xs text-slate-500">Available vs. Occupied vs. Unavailable bays</p>
          </div>
          <UtilizationDoughnutChart data={charts.utilization_doughnut} />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-900">Vehicle Type Distribution</h3>
            <p className="text-xs text-slate-500">Campus fleet split across Cars, Bikes, and Scooters</p>
          </div>
          <VehicleDistributionChart items={charts.vehicle_type_distribution || []} />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-900">Zone-Wise Parking Occupancy</h3>
            <p className="text-xs text-slate-500">Slot status across campus zones A, B, C, and D</p>
          </div>
          <ZoneOccupancyChart zones={charts.zone_occupancy || []} />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-900">Hourly Parking Demand</h3>
            <p className="text-xs text-slate-500">Aggregated arrival demand across campus time windows</p>
          </div>
          <HourlyDemandChart periods={charts.hourly_demand || []} />
        </div>
      </div>

      {/* Allocation Cost Comparison Full-Width Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Allocation Cost Comparison</h3>
            <p className="text-xs text-slate-500">
              Hungarian optimal total cost vs. valid random feasible baseline across saved optimization runs
            </p>
          </div>
        </div>
        {(charts.cost_comparison || []).length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 py-10 text-center">
            <p className="text-sm font-medium text-slate-700">
              No optimization runs saved yet.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Run the Hungarian Algorithm in the Optimization Center to compare optimal cost against a valid random feasible baseline.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('optimization')}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-navy-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-navy-800"
            >
              <Cpu className="h-3.5 w-3.5" />
              Go to Optimization Center
            </button>
          </div>
        ) : (
          <CostComparisonChart items={charts.cost_comparison || []} />
        )}
      </div>
    </div>
  )
}

