import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckSquare,
  Cpu,
  Grid3X3,
  Loader2,
  Play,
  RefreshCw,
  Save,
  ShieldCheck,
  Sliders,
} from 'lucide-react'
import AlertBanner from '../components/AlertBanner'
import KpiCard from '../components/KpiCard'
import { CostComparisonChart } from '../charts/DashboardCharts'
import { extractErrorMessage, parkingApi } from '../services/api'

function getHeatmapCellStyle(val, minCost, maxCost, isAssigned) {
  if (val === null || val === undefined) {
    return 'bg-slate-100 text-slate-400'
  }
  if (isAssigned) {
    return 'bg-blue-600 text-white font-bold ring-2 ring-blue-300'
  }
  const span = Math.max(1, maxCost - minCost)
  const ratio = (val - minCost) / span
  if (ratio < 0.33) return 'bg-emerald-50 text-emerald-800'
  if (ratio < 0.66) return 'bg-amber-50 text-amber-900'
  return 'bg-rose-50 text-rose-800'
}

export default function OptimizationCenter() {
  const [waitingVehicles, setWaitingVehicles] = useState([])
  const [availableSlots, setAvailableSlots] = useState([])
  const [selectedVehicleIds, setSelectedVehicleIds] = useState([])
  const [selectedSlotIds, setSelectedSlotIds] = useState([])

  const [weights, setWeights] = useState({
    distance_weight: 1.0,
    priority_weight: 15.0,
    zone_weight: 10.0,
  })
  const [previewOnly, setPreviewOnly] = useState(false)

  const [matrixData, setMatrixData] = useState(null)
  const [optResult, setOptResult] = useState(null)

  const [loadingInit, setLoadingInit] = useState(true)
  const [generatingMatrix, setGeneratingMatrix] = useState(false)
  const [runningOpt, setRunningOpt] = useState(false)
  const [savingOpt, setSavingOpt] = useState(false)
  const [banner, setBanner] = useState({ type: '', message: '' })

  const loadInitialData = useCallback(async () => {
    setLoadingInit(true)
    try {
      const [vehRes, slotRes, settingsRes, latestRes] = await Promise.all([
        parkingApi.getVehicles({ parking_status: 'Waiting' }),
        parkingApi.getSlots({ status: 'Available' }),
        parkingApi.getSettings(),
        parkingApi.getLatestResults(),
      ])

      const wVeh = vehRes.vehicles || []
      const aSlots = slotRes.slots || []
      setWaitingVehicles(wVeh)
      setAvailableSlots(aSlots)
      setSelectedVehicleIds(wVeh.map((v) => v.vehicle_id))
      setSelectedSlotIds(aSlots.map((s) => s.slot_id))

      if (settingsRes?.weights) {
        setWeights(settingsRes.weights)
      }
      if (latestRes?.has_results && latestRes.latest_run) {
        const run = latestRes.latest_run
        setOptResult({
          run_id: run.run_id,
          applied: true,
          ...(run.result || {}),
        })
      }
    } catch (err) {
      setBanner({ type: 'error', message: extractErrorMessage(err) })
    } finally {
      setLoadingInit(false)
    }
  }, [])

  useEffect(() => {
    loadInitialData()
  }, [loadInitialData])

  const toggleVehicle = (id) => {
    setSelectedVehicleIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const toggleSlot = (id) => {
    setSelectedSlotIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const handleGenerateMatrix = async () => {
    setGeneratingMatrix(true)
    setBanner({ type: '', message: '' })
    try {
      const data = await parkingApi.generateMatrix({
        vehicle_ids: selectedVehicleIds,
        slot_ids: selectedSlotIds,
        weights,
      })
      setMatrixData(data)
      setBanner({
        type: 'info',
        message: `Generated ${data.vehicle_ids.length} × ${data.slot_ids.length} cost matrix (${data.feasible_pairs} feasible pairs).`,
      })
    } catch (err) {
      setBanner({ type: 'error', message: extractErrorMessage(err) })
    } finally {
      setGeneratingMatrix(false)
    }
  }

  const handleRunOptimization = async () => {
    setRunningOpt(true)
    setBanner({ type: '', message: '' })
    try {
      const data = await parkingApi.runOptimization({
        vehicle_ids: selectedVehicleIds,
        slot_ids: selectedSlotIds,
        weights,
        apply_allocation: !previewOnly,
      })
      setOptResult(data)
      if (data.cost_matrix) {
        setMatrixData({
          ...data.cost_matrix,
          feasible_pairs: data.cost_matrix.display_matrix
            .flat()
            .filter((x) => x !== null).length,
        })
      }
      setBanner({
        type: 'success',
        message: previewOnly
          ? `Hungarian preview ready: ${data.summary.assigned_count} optimal assignments (Total Cost: ${data.summary.total_allocation_cost}). Click "Save & Apply Allocation" to commit.`
          : `Optimization applied (${data.run_id}): ${data.summary.assigned_count} vehicles assigned, slot availability & history updated.`,
      })
      if (!previewOnly) {
        // Refresh waiting vehicles and available slots so repeated clicks never reuse occupied slots
        const [vehRes, slotRes] = await Promise.all([
          parkingApi.getVehicles({ parking_status: 'Waiting' }),
          parkingApi.getSlots({ status: 'Available' }),
        ])
        const wVeh = vehRes.vehicles || []
        const aSlots = slotRes.slots || []
        setWaitingVehicles(wVeh)
        setAvailableSlots(aSlots)
        setSelectedVehicleIds(wVeh.map((v) => v.vehicle_id))
        setSelectedSlotIds(aSlots.map((s) => s.slot_id))
      }
    } catch (err) {
      setBanner({ type: 'error', message: extractErrorMessage(err) })
    } finally {
      setRunningOpt(false)
    }
  }

  const handleSavePreview = async () => {
    if (!optResult) return
    setSavingOpt(true)
    setBanner({ type: '', message: '' })
    try {
      const res = await parkingApi.saveOptimization({
        assignments: optResult.assignments,
        unassigned_vehicles: optResult.unassigned_vehicles,
        summary: optResult.summary,
        baseline_comparison: optResult.baseline_comparison,
        constraints_validated: optResult.constraints_validated,
        weights,
      })
      setOptResult((prev) => ({ ...prev, run_id: res.run_id, applied: true }))
      setBanner({
        type: 'success',
        message: `Allocation saved (${res.run_id}). Parking slot availability and allocation history updated.`,
      })
      const [vehRes, slotRes] = await Promise.all([
        parkingApi.getVehicles({ parking_status: 'Waiting' }),
        parkingApi.getSlots({ status: 'Available' }),
      ])
      const wVeh = vehRes.vehicles || []
      const aSlots = slotRes.slots || []
      setWaitingVehicles(wVeh)
      setAvailableSlots(aSlots)
      setSelectedVehicleIds(wVeh.map((v) => v.vehicle_id))
      setSelectedSlotIds(aSlots.map((s) => s.slot_id))
    } catch (err) {
      setBanner({ type: 'error', message: extractErrorMessage(err) })
    } finally {
      setSavingOpt(false)
    }
  }

  const assignedPairSet = useMemo(() => {
    const set = new Set()
    for (const a of optResult?.assignments || []) {
      set.add(`${a.vehicle_id}::${a.slot_id}`)
    }
    return set
  }, [optResult])

  const { minCost, maxCost } = useMemo(() => {
    if (!matrixData?.display_matrix) return { minCost: 0, maxCost: 100 }
    const nums = matrixData.display_matrix.flat().filter((v) => v !== null && v !== undefined)
    if (!nums.length) return { minCost: 0, maxCost: 100 }
    return { minCost: Math.min(...nums), maxCost: Math.max(...nums) }
  }, [matrixData])

  const previewRows = (matrixData?.vehicle_ids || []).slice(0, 18)
  const previewCols = (matrixData?.slot_ids || []).slice(0, 18)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Hungarian Optimization Center</h2>
          <p className="text-sm text-slate-500">
            Configure OR cost weights, inspect the bipartite cost matrix, and solve the optimal Assignment Problem.
          </p>
        </div>
        <button
          type="button"
          onClick={loadInitialData}
          disabled={loadingInit}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={`h-4 w-4 ${loadingInit ? 'animate-spin' : ''}`} />
          Reload Queue & Slots
        </button>
      </div>

      {banner.message && (
        <AlertBanner
          type={banner.type}
          message={banner.message}
          onClose={() => setBanner({ type: '', message: '' })}
        />
      )}

      {/* Selection & Weights Panel */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Pending Vehicles Selector */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                1. Pending Vehicles ({selectedVehicleIds.length}/{waitingVehicles.length})
              </h3>
              <p className="text-xs text-slate-500">Vehicles currently in Waiting queue</p>
            </div>
            <div className="flex gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setSelectedVehicleIds(waitingVehicles.map((v) => v.vehicle_id))}
                className="rounded border border-slate-200 px-2 py-1 font-medium hover:bg-slate-50"
              >
                All
              </button>
              <button
                type="button"
                onClick={() =>
                  setSelectedVehicleIds(waitingVehicles.slice(0, 12).map((v) => v.vehicle_id))
                }
                className="rounded border border-slate-200 px-2 py-1 font-medium hover:bg-slate-50"
              >
                Top 12
              </button>
              <button
                type="button"
                onClick={() => setSelectedVehicleIds([])}
                className="rounded border border-slate-200 px-2 py-1 font-medium hover:bg-slate-50"
              >
                None
              </button>
            </div>
          </div>

          <div className="max-h-60 space-y-1.5 overflow-y-auto pr-1">
            {waitingVehicles.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">
                No waiting vehicles in queue. Add vehicles or mark departed vehicles as Waiting.
              </p>
            ) : (
              waitingVehicles.map((v) => (
                <label
                  key={v.vehicle_id}
                  className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-xs hover:bg-slate-50"
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={selectedVehicleIds.includes(v.vehicle_id)}
                      onChange={() => toggleVehicle(v.vehicle_id)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
                    />
                    <div>
                      <span className="font-bold text-slate-900">{v.vehicle_id}</span>
                      <span className="ml-1.5 text-slate-500">
                        {v.vehicle_type} · {v.user_type}
                      </span>
                    </div>
                  </div>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">
                    Blk {v.destination_block}
                    {v.requires_accessible ? ' · PRM' : ''}
                  </span>
                </label>
              ))
            )}
          </div>
        </div>

        {/* Available Parking Slots Selector */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                2. Available Slots ({selectedSlotIds.length}/{availableSlots.length})
              </h3>
              <p className="text-xs text-slate-500">Only free, non-occupied bays shown</p>
            </div>
            <div className="flex gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setSelectedSlotIds(availableSlots.map((s) => s.slot_id))}
                className="rounded border border-slate-200 px-2 py-1 font-medium hover:bg-slate-50"
              >
                All
              </button>
              <button
                type="button"
                onClick={() =>
                  setSelectedSlotIds(availableSlots.slice(0, 15).map((s) => s.slot_id))
                }
                className="rounded border border-slate-200 px-2 py-1 font-medium hover:bg-slate-50"
              >
                Top 15
              </button>
              <button
                type="button"
                onClick={() => setSelectedSlotIds([])}
                className="rounded border border-slate-200 px-2 py-1 font-medium hover:bg-slate-50"
              >
                None
              </button>
            </div>
          </div>

          <div className="max-h-60 space-y-1.5 overflow-y-auto pr-1">
            {availableSlots.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">
                No available slots remaining. Free slots in Parking Slot Management.
              </p>
            ) : (
              availableSlots.map((s) => (
                <label
                  key={s.slot_id}
                  className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-xs hover:bg-slate-50"
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={selectedSlotIds.includes(s.slot_id)}
                      onChange={() => toggleSlot(s.slot_id)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
                    />
                    <div>
                      <span className="font-bold text-slate-900">{s.slot_id}</span>
                      <span className="ml-1.5 text-slate-500">{s.slot_type}</span>
                    </div>
                  </div>
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                    {s.zone}
                    {s.is_accessible ? ' · PRM' : ''}
                  </span>
                </label>
              ))
            )}
          </div>
        </div>

        {/* Cost Function Weights & Controls */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Sliders className="h-4 w-4 text-navy-900" />
              <h3 className="text-sm font-bold text-slate-900">3. Cost Function Weights</h3>
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium">
                <span className="text-slate-700">Walking Distance Weight</span>
                <span className="font-bold text-slate-900">{weights.distance_weight}</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="5"
                step="0.2"
                value={weights.distance_weight}
                onChange={(e) =>
                  setWeights((w) => ({ ...w, distance_weight: Number(e.target.value) }))
                }
                className="mt-1 w-full accent-navy-900"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium">
                <span className="text-slate-700">User Priority Weight</span>
                <span className="font-bold text-slate-900">{weights.priority_weight}</span>
              </div>
              <input
                type="range"
                min="0"
                max="40"
                step="1"
                value={weights.priority_weight}
                onChange={(e) =>
                  setWeights((w) => ({ ...w, priority_weight: Number(e.target.value) }))
                }
                className="mt-1 w-full accent-navy-900"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium">
                <span className="text-slate-700">Zone Penalty Weight</span>
                <span className="font-bold text-slate-900">{weights.zone_weight}</span>
              </div>
              <input
                type="range"
                min="0"
                max="40"
                step="1"
                value={weights.zone_weight}
                onChange={(e) =>
                  setWeights((w) => ({ ...w, zone_weight: Number(e.target.value) }))
                }
                className="mt-1 w-full accent-navy-900"
              />
            </div>

            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={previewOnly}
                onChange={(e) => setPreviewOnly(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
              />
              Preview results before locking slots
            </label>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={handleGenerateMatrix}
              disabled={generatingMatrix || runningOpt}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              {generatingMatrix ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Grid3X3 className="h-4 w-4" />
              )}
              Generate Cost Matrix
            </button>

            <button
              type="button"
              onClick={handleRunOptimization}
              disabled={runningOpt || generatingMatrix}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-50"
            >
              {runningOpt ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Solving Assignment Problem...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Run Hungarian Optimization
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Cost Matrix Heatmap Preview */}
      {matrixData && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Assignment Cost Matrix Heatmap (c<sub>ij</sub>)
              </h3>
              <p className="text-xs text-slate-500">
                Showing {previewRows.length} of {matrixData.vehicle_ids.length} vehicles ×{' '}
                {previewCols.length} of {matrixData.slot_ids.length} slots. Blue = optimal assigned pair,
                INF = prohibited by compatibility or accessibility rules.
              </p>
            </div>
          </div>

          {previewRows.length === 0 || previewCols.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">
              Select at least one vehicle and one slot to display the cost matrix.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-center text-[11px]">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 border border-slate-200 bg-slate-100 px-2.5 py-2 text-left font-bold text-slate-700">
                      Vehicle \ Slot
                    </th>
                    {previewCols.map((sid) => (
                      <th
                        key={sid}
                        className="border border-slate-200 bg-slate-50 px-2 py-2 font-mono font-semibold text-slate-700"
                      >
                        {sid}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((vid, rIdx) => (
                    <tr key={vid}>
                      <td className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left font-mono font-bold text-slate-800">
                        {vid}
                      </td>
                      {previewCols.map((sid, cIdx) => {
                        const cellVal = matrixData.display_matrix[rIdx]?.[cIdx]
                        const isAssigned = assignedPairSet.has(`${vid}::${sid}`)
                        return (
                          <td
                            key={sid}
                            className={`border border-slate-200 px-2 py-1.5 font-mono ${getHeatmapCellStyle(
                              cellVal,
                              minCost,
                              maxCost,
                              isAssigned
                            )}`}
                          >
                            {cellVal === null || cellVal === undefined ? 'INF' : cellVal}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Optimization Output & Baseline Comparison */}
      {optResult && optResult.summary && (
        <div className="space-y-6">
          {/* Save Banner if Preview Mode */}
          {!optResult.applied && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-5 py-4">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-blue-700" />
                <div>
                  <p className="text-sm font-bold text-blue-950">Preview Mode Active</p>
                  <p className="text-xs text-blue-800">
                    Review the optimal matching below and save to lock parking slot availability.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleSavePreview}
                disabled={savingOpt}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {savingOpt ? 'Saving...' : 'Save & Apply Allocation'}
              </button>
            </div>
          )}

          {/* Summary KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="Vehicles Assigned"
              value={`${optResult.summary.assigned_count} / ${optResult.summary.total_vehicles}`}
              subtitle={`${optResult.summary.unassigned_count} waiting / unassigned`}
              icon={CheckSquare}
              accent="emerald"
            />
            <KpiCard
              title="Minimum Total Cost"
              value={Number(optResult.summary.total_allocation_cost).toLocaleString()}
              subtitle={`Avg ${optResult.summary.average_allocation_cost} cost / vehicle`}
              icon={Cpu}
              accent="navy"
            />
            <KpiCard
              title="Slot Utilization (Batch)"
              value={`${optResult.summary.utilization_percentage}%`}
              subtitle={`${optResult.summary.total_available_slots} available slots evaluated`}
              icon={Grid3X3}
              accent="blue"
            />
            <KpiCard
              title="Baseline Savings (Avg)"
              value={`${optResult.baseline_comparison?.average_cost_reduction_pct ?? 0}%`}
              subtitle={`Avg cost: ${optResult.summary.average_allocation_cost} vs ${
                optResult.baseline_comparison?.baseline_average_cost ?? 0
              }`}
              icon={ShieldCheck}
              accent="indigo"
            />
          </div>

          {/* Baseline Comparison Panel */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900">
                Hungarian vs. Random Feasible Baseline
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Both methods evaluate the exact same vehicles, slots, and hard compatibility constraints.
              </p>
              <div className="mt-4 space-y-2.5 text-sm">
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-600">Hungarian Assigned</span>
                  <span className="font-bold text-slate-900">
                    {optResult.summary.assigned_count} vehicles
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-600">Baseline Assigned</span>
                  <span className="font-semibold text-slate-700">
                    {optResult.baseline_comparison?.baseline_assigned_count} vehicles
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-600">Hungarian Avg Cost</span>
                  <span className="font-bold text-emerald-700">
                    {optResult.summary.average_allocation_cost}
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-600">Baseline Avg Cost</span>
                  <span className="font-semibold text-slate-700">
                    {optResult.baseline_comparison?.baseline_average_cost}
                  </span>
                </div>
                <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                  {optResult.baseline_comparison?.comparison_note}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
              <h3 className="mb-3 text-sm font-bold text-slate-900">Cost Comparison Chart</h3>
              <CostComparisonChart
                items={[
                  {
                    label: optResult.run_id || 'Current Run',
                    hungarian_cost: optResult.summary.total_allocation_cost,
                    baseline_cost: optResult.baseline_comparison?.baseline_total_cost || 0,
                  },
                ]}
              />
            </div>
          </div>

          {/* Assigned Results Table */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Optimal Vehicle-to-Slot Assignments ({optResult.assignments?.length || 0})
                </h3>
                <p className="text-xs text-slate-500">
                  All constraints validated:{' '}
                  <span className="font-semibold text-emerald-700">
                    {optResult.constraints_validated ? 'PASSED' : 'FAILED'}
                  </span>
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Vehicle ID</th>
                    <th className="px-4 py-3">Vehicle Type</th>
                    <th className="px-4 py-3">User Type</th>
                    <th className="px-4 py-3">Assigned Slot</th>
                    <th className="px-4 py-3">Zone</th>
                    <th className="px-4 py-3">Walking Dist.</th>
                    <th className="px-4 py-3 text-right">Allocation Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {(optResult.assignments || []).length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-4 py-6 text-center text-slate-500">
                        No feasible assignments could be made for this selection.
                      </td>
                    </tr>
                  ) : (
                    optResult.assignments.map((row) => (
                      <tr key={row.vehicle_id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-semibold text-slate-900">
                          {row.vehicle_id}
                          <span className="ml-2 font-mono text-xs font-normal text-slate-400">
                            {row.registration_number}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">{row.vehicle_type}</td>
                        <td className="px-4 py-2.5 text-slate-700">{row.user_type}</td>
                        <td className="px-4 py-2.5 font-mono text-xs font-bold text-blue-700">
                          {row.slot_id}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">{row.zone}</td>
                        <td className="px-4 py-2.5 text-slate-600">{row.walking_distance} m</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">
                          {row.allocation_cost}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Unassigned Vehicles Section */}
          {(optResult.unassigned_vehicles || []).length > 0 && (
            <div className="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
              <div className="border-b border-amber-100 bg-amber-50 px-5 py-3">
                <h3 className="text-sm font-bold text-amber-950">
                  Unassigned / Waiting Vehicles ({optResult.unassigned_vehicles.length})
                </h3>
                <p className="text-xs text-amber-800">
                  No invalid assignments were forced. Vehicles remain Waiting until compatible slots free up.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5">Vehicle ID</th>
                      <th className="px-4 py-2.5">Vehicle Type</th>
                      <th className="px-4 py-2.5">User Type</th>
                      <th className="px-4 py-2.5">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {optResult.unassigned_vehicles.map((u) => (
                      <tr key={u.vehicle_id}>
                        <td className="px-4 py-2.5 font-semibold text-slate-900">{u.vehicle_id}</td>
                        <td className="px-4 py-2.5 text-slate-700">{u.vehicle_type}</td>
                        <td className="px-4 py-2.5 text-slate-700">{u.user_type}</td>
                        <td className="px-4 py-2.5 text-xs text-amber-800">{u.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

