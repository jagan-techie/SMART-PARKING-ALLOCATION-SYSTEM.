import { useCallback, useEffect, useState } from 'react'
import { Accessibility, Edit2, Plus, Search, Trash2, X } from 'lucide-react'
import AlertBanner from '../components/AlertBanner'
import StatusBadge from '../components/StatusBadge'
import { extractErrorMessage, parkingApi } from '../services/api'

const EMPTY_FORM = {
  registration_number: '',
  vehicle_type: 'Car',
  user_type: 'Student',
  destination_block: 'A',
  arrival_time: '09:00',
  departure_time: '17:00',
  requires_accessible: false,
  parking_status: 'Waiting',
}

export default function VehicleManagement() {
  const [vehicles, setVehicles] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [banner, setBanner] = useState({ type: '', message: '' })

  const [filters, setFilters] = useState({
    search: '',
    vehicle_type: '',
    user_type: '',
    destination_block: '',
    parking_status: '',
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const loadVehicles = useCallback(async () => {
    setLoading(true)
    try {
      const params = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== '')
      )
      const data = await parkingApi.getVehicles(params)
      setVehicles(data.vehicles || [])
    } catch (err) {
      setBanner({ type: 'error', message: extractErrorMessage(err) })
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    loadVehicles()
  }, [loadVehicles])

  const openAddModal = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  const openEditModal = (v) => {
    setEditingId(v.vehicle_id)
    setForm({
      registration_number: v.registration_number,
      vehicle_type: v.vehicle_type,
      user_type: v.user_type,
      destination_block: v.destination_block,
      arrival_time: v.arrival_time,
      departure_time: v.departure_time,
      requires_accessible: Boolean(v.requires_accessible),
      parking_status: v.parking_status,
    })
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setBanner({ type: '', message: '' })
    try {
      if (editingId) {
        await parkingApi.updateVehicle(editingId, form)
        setBanner({ type: 'success', message: `Vehicle ${editingId} updated successfully.` })
      } else {
        const res = await parkingApi.createVehicle(form)
        setBanner({
          type: 'success',
          message: `Vehicle ${res.vehicle?.vehicle_id || ''} added to queue.`,
        })
      }
      setModalOpen(false)
      await loadVehicles()
    } catch (err) {
      setBanner({ type: 'error', message: extractErrorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (vehicleId) => {
    if (!window.confirm(`Delete vehicle ${vehicleId}? Any occupied slot will be freed.`)) {
      return
    }
    try {
      await parkingApi.deleteVehicle(vehicleId)
      setBanner({ type: 'success', message: `Vehicle ${vehicleId} deleted.` })
      await loadVehicles()
    } catch (err) {
      setBanner({ type: 'error', message: extractErrorMessage(err) })
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Vehicle Management</h2>
          <p className="text-sm text-slate-500">
            Manage campus vehicles, priority categories, destination blocks, and accessibility needs.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800"
        >
          <Plus className="h-4 w-4" />
          Add Vehicle
        </button>
      </div>

      {banner.message && (
        <AlertBanner
          type={banner.type}
          message={banner.message}
          onClose={() => setBanner({ type: '', message: '' })}
        />
      )}

      {/* Search & Filter Bar */}
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-6">
        <div className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Search ID, registration, slot..."
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <select
          value={filters.vehicle_type}
          onChange={(e) => setFilters((f) => ({ ...f, vehicle_type: e.target.value }))}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">All Vehicle Types</option>
          <option value="Car">Car</option>
          <option value="Bike">Bike</option>
          <option value="Scooter">Scooter</option>
        </select>

        <select
          value={filters.user_type}
          onChange={(e) => setFilters((f) => ({ ...f, user_type: e.target.value }))}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">All User Types</option>
          <option value="Faculty">Faculty (P1)</option>
          <option value="Staff">Staff (P2)</option>
          <option value="Visitor">Visitor (P3)</option>
          <option value="Student">Student (P4)</option>
        </select>

        <select
          value={filters.destination_block}
          onChange={(e) => setFilters((f) => ({ ...f, destination_block: e.target.value }))}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">All Blocks</option>
          <option value="A">Block A</option>
          <option value="B">Block B</option>
          <option value="C">Block C</option>
          <option value="D">Block D</option>
        </select>

        <select
          value={filters.parking_status}
          onChange={(e) => setFilters((f) => ({ ...f, parking_status: e.target.value }))}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">All Statuses</option>
          <option value="Waiting">Waiting</option>
          <option value="Assigned">Assigned</option>
          <option value="Departed">Departed</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Showing {vehicles.length} vehicle(s)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Vehicle ID</th>
                <th className="px-4 py-3">Registration</th>
                <th className="px-4 py-3">Vehicle Type</th>
                <th className="px-4 py-3">User Type</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Dest. Block</th>
                <th className="px-4 py-3">Arrival - Dep.</th>
                <th className="px-4 py-3">Accessible</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Assigned Slot</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan="11" className="px-4 py-8 text-center text-slate-500">
                    Loading vehicles...
                  </td>
                </tr>
              ) : vehicles.length === 0 ? (
                <tr>
                  <td colSpan="11" className="px-4 py-8 text-center text-slate-500">
                    No vehicles match the active filters.
                  </td>
                </tr>
              ) : (
                vehicles.map((v) => (
                  <tr key={v.vehicle_id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">
                      {v.vehicle_id}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-700">
                      {v.registration_number}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{v.vehicle_type}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{v.user_type}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">
                        P{v.priority_level}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">
                      Block {v.destination_block}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                      {v.arrival_time} - {v.departure_time}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {v.requires_accessible ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                          <Accessibility className="h-3.5 w-3.5" />
                          Yes
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">No</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusBadge status={v.parking_status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold text-blue-700">
                      {v.assigned_slot_id || '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditModal(v)}
                          className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          title="Edit vehicle"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(v.vehicle_id)}
                          className="rounded-md border border-rose-200 p-1.5 text-rose-600 hover:bg-rose-50"
                          title="Delete vehicle"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Vehicle Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h3 className="text-base font-bold text-slate-900">
                {editingId ? `Edit Vehicle (${editingId})` : 'Register New Vehicle'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 p-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Registration Number
                  </label>
                  <input
                    type="text"
                    required
                    value={form.registration_number}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, registration_number: e.target.value.toUpperCase() }))
                    }
                    placeholder="e.g. KA-01-MN-4521"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Vehicle Category
                  </label>
                  <select
                    value={form.vehicle_type}
                    onChange={(e) => setForm((f) => ({ ...f, vehicle_type: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="Car">Car</option>
                    <option value="Bike">Bike</option>
                    <option value="Scooter">Scooter</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    User Category
                  </label>
                  <select
                    value={form.user_type}
                    onChange={(e) => setForm((f) => ({ ...f, user_type: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="Student">Student</option>
                    <option value="Faculty">Faculty</option>
                    <option value="Staff">Staff</option>
                    <option value="Visitor">Visitor</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Destination Block
                  </label>
                  <select
                    value={form.destination_block}
                    onChange={(e) => setForm((f) => ({ ...f, destination_block: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="A">Block A</option>
                    <option value="B">Block B</option>
                    <option value="C">Block C</option>
                    <option value="D">Block D</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Parking Status
                  </label>
                  <select
                    value={form.parking_status}
                    onChange={(e) => setForm((f) => ({ ...f, parking_status: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="Waiting">Waiting</option>
                    <option value="Assigned">Assigned</option>
                    <option value="Departed">Departed</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Arrival Time
                  </label>
                  <input
                    type="time"
                    value={form.arrival_time}
                    onChange={(e) => setForm((f) => ({ ...f, arrival_time: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Departure Time
                  </label>
                  <input
                    type="time"
                    value={form.departure_time}
                    onChange={(e) => setForm((f) => ({ ...f, departure_time: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={form.requires_accessible}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, requires_accessible: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                />
                <span className="font-medium text-slate-800">
                  Requires Accessible (PRM) Parking Slot
                </span>
              </label>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Vehicle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

