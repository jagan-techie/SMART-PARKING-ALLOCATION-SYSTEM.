import { useCallback, useEffect, useState } from 'react'
import { Download, FileSpreadsheet, RefreshCw } from 'lucide-react'
import AlertBanner from '../components/AlertBanner'
import KpiCard from '../components/KpiCard'
import StatusBadge from '../components/StatusBadge'
import {
  CostComparisonChart,
  DemandTrendChart,
  UserCostChart,
  VehicleDistributionChart,
} from '../charts/DashboardCharts'
import { extractErrorMessage, parkingApi } from '../services/api'

export default function AnalyticsReports() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState('')
  const [banner, setBanner] = useState({ type: '', message: '' })

  const [filters, setFilters] = useState({
    day_type: '',
    zone: '',
    vehicle_type: '',
    status: '',
  })

  const loadAnalytics = useCallback(async () => {
    setLoading(true)
    try {
      const params = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== '')
      )
      const res = await parkingApi.getAnalytics(params)
      setData(res)
    } catch (err) {
      setBanner({ type: 'error', message: extractErrorMessage(err) })
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    loadAnalytics()
  }, [loadAnalytics])

  const handleExport = async (type) => {
    setExporting(type)
    try {
      await parkingApi.exportCsv(type)
      setBanner({ type: 'success', message: `Exported ${type} CSV report.` })
    } catch (err) {
      setBanner({ type: 'error', message: extractErrorMessage(err) })
    } finally {
      setExporting('')
    }
  }

  const summary = data?.summary || {}
  const optRunComparison = (data?.optimization_runs || []).map((r) => ({
    label: r.run_id,
    hungarian_cost: r.total_allocation_cost,
    baseline_cost: r.baseline_total_cost,
  }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Analytics & Reports</h2>
          <p className="text-sm text-slate-500">
            Demand trends, zone efficiency, priority cost equity, historical logs, and CSV exports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleExport('history')}
            disabled={exporting === 'history'}
            className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {exporting === 'history' ? 'Exporting...' : 'Export Allocation CSV'}
          </button>
          <button
            type="button"
            onClick={() => handleExport('vehicles')}
            disabled={exporting === 'vehicles'}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Vehicles CSV
          </button>
          <button
            type="button"
            onClick={() => handleExport('slots')}
            disabled={exporting === 'slots'}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Slots CSV
          </button>
        </div>
      </div>

      {banner.message && (
        <AlertBanner
          type={banner.type}
          message={banner.message}
          onClose={() => setBanner({ type: '', message: '' })}
        />
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Historical Records"
          value={summary.total_records ?? 0}
          subtitle="Filtered allocation log entries"
        />
        <KpiCard
          title="Average Allocation Cost"
          value={summary.average_cost ?? 0}
          subtitle="Weighted distance + priority + zone cost"
          accent="blue"
        />
        <KpiCard
          title="Active Allocations"
          value={summary.active_allocations ?? 0}
          subtitle={`${summary.completed_allocations ?? 0} completed sessions`}
          accent="emerald"
        />
        <KpiCard
          title="Saved OR Runs"
          value={summary.optimization_runs_count ?? 0}
          subtitle="Hungarian solver executions logged"
          accent="indigo"
        />
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
        <select
          value={filters.day_type}
          onChange={(e) => setFilters((f) => ({ ...f, day_type: e.target.value }))}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="">All Day Types (Demand)</option>
          <option value="Weekday">Weekday</option>
          <option value="Weekend">Weekend</option>
          <option value="Exam Day">Exam Day</option>
          <option value="Event Day">Event Day</option>
        </select>

        <select
          value={filters.zone}
          onChange={(e) => setFilters((f) => ({ ...f, zone: e.target.value }))}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="">All Zones</option>
          <option value="Zone A">Zone A</option>
          <option value="Zone B">Zone B</option>
          <option value="Zone C">Zone C</option>
          <option value="Zone D">Zone D</option>
        </select>

        <select
          value={filters.vehicle_type}
          onChange={(e) => setFilters((f) => ({ ...f, vehicle_type: e.target.value }))}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="">All Vehicle Types</option>
          <option value="Car">Car</option>
          <option value="Bike">Bike</option>
          <option value="Scooter">Scooter</option>
        </select>

        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="">All Allocation Statuses</option>
          <option value="Active">Active</option>
          <option value="Completed">Completed</option>
          <option value="Cancelled">Cancelled</option>
        </select>

        <button
          type="button"
          onClick={loadAnalytics}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Analytics
        </button>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h3 className="mb-1 text-sm font-bold text-slate-900">
            Parking Demand Trends Over Time
          </h3>
          <p className="mb-4 text-xs text-slate-500">
            Daily campus demand vs. average available slot capacity
          </p>
          <DemandTrendChart trends={data?.demand_trends || []} />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-1 text-sm font-bold text-slate-900">
            Average Allocation Cost by User Priority
          </h3>
          <p className="mb-4 text-xs text-slate-500">
            Historical cost distribution across Faculty, Staff, Visitor, and Student users
          </p>
          <UserCostChart items={data?.cost_by_user || []} />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-1 text-sm font-bold text-slate-900">Vehicle Distribution</h3>
          <p className="mb-4 text-xs text-slate-500">Fleet composition across all campus records</p>
          <VehicleDistributionChart items={data?.vehicle_distribution || []} />
        </div>
      </div>

      {optRunComparison.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-1 text-sm font-bold text-slate-900">
            Optimization Run Cost Comparison (Hungarian vs. Baseline)
          </h3>
          <p className="mb-4 text-xs text-slate-500">
            Historical optimization batches saved in the database
          </p>
          <CostComparisonChart items={optRunComparison} />
        </div>
      )}

      {/* Zone Efficiency Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3.5">
          <h3 className="text-sm font-bold text-slate-900">Zone-Wise Utilization & Cost Efficiency</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Zone</th>
                <th className="px-4 py-3">Total Slots</th>
                <th className="px-4 py-3">Occupied</th>
                <th className="px-4 py-3">Available</th>
                <th className="px-4 py-3">Unavailable</th>
                <th className="px-4 py-3">Utilization %</th>
                <th className="px-4 py-3">Historical Allocations</th>
                <th className="px-4 py-3 text-right">Avg Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.zone_utilization || []).map((z) => (
                <tr key={z.zone} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-bold text-slate-900">{z.zone}</td>
                  <td className="px-4 py-3">{z.total_slots}</td>
                  <td className="px-4 py-3 text-rose-700 font-medium">{z.occupied}</td>
                  <td className="px-4 py-3 text-emerald-700 font-medium">{z.available}</td>
                  <td className="px-4 py-3 text-slate-500">{z.unavailable}</td>
                  <td className="px-4 py-3 font-semibold">{z.utilization_pct}%</td>
                  <td className="px-4 py-3">{z.historical_allocations}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">{z.avg_cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Historical Allocation Records Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3.5">
          <h3 className="text-sm font-bold text-slate-900">
            Historical Allocation Records (Latest {data?.history?.length || 0})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Allocation ID</th>
                <th className="px-4 py-3">Date & Time</th>
                <th className="px-4 py-3">Vehicle</th>
                <th className="px-4 py-3">User Type</th>
                <th className="px-4 py-3">Slot</th>
                <th className="px-4 py-3">Zone</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.history || []).map((h) => (
                <tr key={h.allocation_id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold text-slate-900">
                    {h.allocation_id}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">
                    {h.allocation_date} {h.allocation_time}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-semibold text-slate-900">{h.vehicle_id}</span>
                    <span className="ml-1.5 text-xs text-slate-500">{h.vehicle_type}</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">{h.user_type}</td>
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold text-blue-700">
                    {h.slot_id}
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">{h.zone}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={h.allocation_status} />
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-900">
                    {h.allocation_cost}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

