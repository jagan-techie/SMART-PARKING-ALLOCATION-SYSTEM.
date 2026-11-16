import { useCallback, useEffect, useState } from 'react'
import { Database, Loader2, RefreshCw, Save } from 'lucide-react'
import AlertBanner from '../components/AlertBanner'
import { extractErrorMessage, parkingApi } from '../services/api'

const SLOT_TYPES = ['Car', 'Bike', 'Scooter', 'Two-Wheeler']
const VEHICLE_TYPES = ['Car', 'Bike', 'Scooter']
const USER_TYPES = ['Faculty', 'Staff', 'Visitor', 'Student']

export default function SettingsPage() {
  const [config, setConfig] = useState(null)
  const [seed, setSeed] = useState(42)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [banner, setBanner] = useState({ type: '', message: '' })

  const loadSettings = useCallback(async () => {
    setLoading(true)
    try {
      const data = await parkingApi.getSettings()
      setConfig(data)
    } catch (err) {
      setBanner({ type: 'error', message: extractErrorMessage(err) })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const handleSaveSettings = async (e) => {
    e.preventDefault()
    if (!config) return
    setSaving(true)
    setBanner({ type: '', message: '' })
    try {
      const res = await parkingApi.updateSettings(config)
      setConfig(res.settings)
      setBanner({
        type: 'success',
        message: 'OR weights, priority rules, zone policies, and compatibility rules saved.',
      })
    } catch (err) {
      setBanner({ type: 'error', message: extractErrorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  const handleRegenerate = async () => {
    if (
      !window.confirm(
        `Regenerate all synthetic CSV datasets and reset SQLite database with seed ${seed}?`
      )
    ) {
      return
    }
    setRegenerating(true)
    setBanner({ type: '', message: '' })
    try {
      const res = await parkingApi.regenerateDataset(Number(seed) || 42)
      setBanner({
        type: 'success',
        message: `${res.message}. (${res.counts.waiting_vehicles} waiting vehicles, ${res.counts.available_slots} available slots).`,
      })
    } catch (err) {
      setBanner({ type: 'error', message: extractErrorMessage(err) })
    } finally {
      setRegenerating(false)
    }
  }

  const toggleCompat = (vType, sType) => {
    setConfig((prev) => {
      const current = prev.compatibility_rules[vType] || []
      const next = current.includes(sType)
        ? current.filter((x) => x !== sType)
        : [...current, sType]
      return {
        ...prev,
        compatibility_rules: {
          ...prev.compatibility_rules,
          [vType]: next,
        },
      }
    })
  }

  const toggleZoneRestriction = (zoneName, userType) => {
    setConfig((prev) => {
      const zoneObj = prev.zone_rules[zoneName]
      const current = zoneObj.restricted_users || []
      const next = current.includes(userType)
        ? current.filter((x) => x !== userType)
        : [...current, userType]
      return {
        ...prev,
        zone_rules: {
          ...prev.zone_rules,
          [zoneName]: {
            ...zoneObj,
            restricted_users: next,
          },
        },
      }
    })
  }

  if (loading || !config) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        Loading system configuration...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">OR Engine Settings & Data Control</h2>
          <p className="text-sm text-slate-500">
            Configure objective weights, user priority tiers, zone restrictions, compatibility matrix, and synthetic datasets.
          </p>
        </div>
      </div>

      {banner.message && (
        <AlertBanner
          type={banner.type}
          message={banner.message}
          onClose={() => setBanner({ type: '', message: '' })}
        />
      )}

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* 1. Objective Weights */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900">1. Default Allocation Cost Weights</h3>
          <p className="mb-4 text-xs text-slate-500">
            Cost(i,j) = (distance_weight × walking_distance) + (priority_weight × priority_penalty) + (zone_weight × zone_penalty)
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Distance Weight
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={config.weights.distance_weight}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    weights: { ...c.weights, distance_weight: Number(e.target.value) },
                  }))
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Priority Weight
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={config.weights.priority_weight}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    weights: { ...c.weights, priority_weight: Number(e.target.value) },
                  }))
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Zone Weight
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={config.weights.zone_weight}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    weights: { ...c.weights, zone_weight: Number(e.target.value) },
                  }))
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        {/* 2. Priority Rules */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900">2. User Priority Rules</h3>
          <p className="mb-4 text-xs text-slate-500">
            Higher urgency routes closer bays to priority users; higher unassignment boost protects them under scarce capacity.
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">User Type</th>
                  <th className="px-4 py-2.5">Priority Level (1=Highest)</th>
                  <th className="px-4 py-2.5">Distance Urgency Factor</th>
                  <th className="px-4 py-2.5">Unassigned Penalty Boost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {USER_TYPES.map((u) => {
                  const rule = config.priority_rules[u] || {
                    level: 4,
                    urgency: 1.0,
                    unassigned_penalty_boost: 500,
                  }
                  return (
                    <tr key={u}>
                      <td className="px-4 py-2.5 font-semibold text-slate-900">{u}</td>
                      <td className="px-4 py-2.5">
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={rule.level}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              priority_rules: {
                                ...c.priority_rules,
                                [u]: { ...rule, level: Number(e.target.value) },
                              },
                            }))
                          }
                          className="w-24 rounded border border-slate-200 px-2.5 py-1 text-sm"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={rule.urgency}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              priority_rules: {
                                ...c.priority_rules,
                                [u]: { ...rule, urgency: Number(e.target.value) },
                              },
                            }))
                          }
                          className="w-24 rounded border border-slate-200 px-2.5 py-1 text-sm"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          type="number"
                          step="100"
                          min="0"
                          value={rule.unassigned_penalty_boost}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              priority_rules: {
                                ...c.priority_rules,
                                [u]: {
                                  ...rule,
                                  unassigned_penalty_boost: Number(e.target.value),
                                },
                              },
                            }))
                          }
                          className="w-28 rounded border border-slate-200 px-2.5 py-1 text-sm"
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 3. Vehicle Compatibility Matrix */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900">
            3. Vehicle-to-Slot Compatibility Rules
          </h3>
          <p className="mb-4 text-xs text-slate-500">
            Unchecked pairs are strictly prohibited (assigned infinite cost in the solver).
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Vehicle Category</th>
                  {SLOT_TYPES.map((st) => (
                    <th key={st} className="px-4 py-2.5 text-center">
                      {st} Slot
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {VEHICLE_TYPES.map((vt) => (
                  <tr key={vt}>
                    <td className="px-4 py-2.5 font-semibold text-slate-900">{vt}</td>
                    {SLOT_TYPES.map((st) => {
                      const checked = (config.compatibility_rules[vt] || []).includes(st)
                      return (
                        <td key={st} className="px-4 py-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCompat(vt, st)}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600"
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 4. Parking Zones Penalties & Strict Restrictions */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900">
            4. Parking Zone Penalties & Strict Restrictions
          </h3>
          <p className="mb-4 text-xs text-slate-500">
            Configure soft zone penalty scores and optional hard zone bans per user category.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {Object.entries(config.zone_rules)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([zoneName, zObj]) => (
                <div key={zoneName} className="rounded-lg border border-slate-200 p-4">
                  <p className="text-sm font-bold text-slate-900">{zObj.label || zoneName}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2.5 text-xs">
                    {USER_TYPES.map((u) => (
                      <div key={u} className="flex items-center justify-between rounded bg-slate-50 px-2.5 py-1.5">
                        <span className="font-medium text-slate-700">{u} Penalty</span>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={zObj.penalties?.[u] ?? 0}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              zone_rules: {
                                ...c.zone_rules,
                                [zoneName]: {
                                  ...zObj,
                                  penalties: {
                                    ...zObj.penalties,
                                    [u]: Number(e.target.value),
                                  },
                                },
                              },
                            }))
                          }
                          className="w-16 rounded border border-slate-200 bg-white px-2 py-0.5 text-right"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 border-t border-slate-100 pt-2.5">
                    <span className="text-[11px] font-semibold text-slate-500">
                      Hard Restrict Users:
                    </span>
                    <div className="mt-1.5 flex flex-wrap gap-3 text-xs">
                      {USER_TYPES.map((u) => (
                        <label key={u} className="flex items-center gap-1.5 text-slate-700">
                          <input
                            type="checkbox"
                            checked={(zObj.restricted_users || []).includes(u)}
                            onChange={() => toggleZoneRestriction(zoneName, u)}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-rose-600"
                          />
                          {u}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving Settings...' : 'Save Configuration'}
          </button>
        </div>
      </form>

      {/* 5. Dataset Regeneration */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Synthetic Dataset Regeneration
              </h3>
              <p className="text-xs text-slate-500">
                Re-runs <code>generate_dataset.py</code> with a deterministic seed and resets SQLite tables.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-700">Random Seed:</label>
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                className="w-24 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={regenerating}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
            >
              {regenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {regenerating ? 'Regenerating...' : 'Regenerate Dataset'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

