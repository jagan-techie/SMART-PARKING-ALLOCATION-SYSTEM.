import { useCallback, useEffect, useMemo, useState } from 'react'
import { Accessibility, Edit2, Plus, Search, Trash2, X } from 'lucide-react'
import AlertBanner from '../components/AlertBanner'
import StatusBadge from '../components/StatusBadge'
import { extractErrorMessage, parkingApi } from '../services/api'

const EMPTY_SLOT_FORM = {
  zone: 'Zone A',
  slot_type: 'Car',
  distance_to_block_a: 60,
  distance_to_block_b: 140,
  distance_to_block_c: 230,
  distance_to_block_d: 210,
  is_accessible: false,
  status: 'Available',
}

export default function ParkingSlotManagement() {
  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [banner, setBanner] = useState({ type: '', message: '' })

  const [selectedSlotId, setSelectedSlotId] = useState(null)
  const [filters, setFilters] = useState({
    search: '',
    zone: '',
    slot_type: '',
    status: '',
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_SLOT_FORM)

  const loadSlots = useCallback(async () => {
    setLoading(true)
    try {
      const params = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== '')
      )
      const data = await parkingApi.getSlots(params)
      setSlots(data.slots || [])
    } catch (err) {
      setBanner({ type: 'error', message: extractErrorMessage(err) })
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    loadSlots()
  }, [loadSlots])

  const selectedSlot = useMemo(
    () => slots.find((s) => s.slot_id === selectedSlotId) || null,
    [slots, selectedSlotId]
  )

  const slotsByZone = useMemo(() => {
    const grouped = {}
    for (const s of slots) {
      if (!grouped[s.zone]) grouped[s.zone] = []
      grouped[s.zone].push(s)
    }
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b))
  }, [slots])

  const openAddModal = () => {
    setEditingId(null)
    setForm(EMPTY_SLOT_FORM)
    setModalOpen(true)
  }

  const openEditModal = (slot) => {
    setEditingId(slot.slot_id)
    setForm({
      zone: slot.zone,
      slot_type: slot.slot_type,
      distance_to_block_a: slot.distance_to_block_a,
      distance_to_block_b: slot.distance_to_block_b,
      distance_to_block_c: slot.distance_to_block_c,
      distance_to_block_d: slot.distance_to_block_d,
      is_accessible: Boolean(slot.is_accessible),
      status: slot.status,
    })
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setBanner({ type: '', message: '' })
    try {
      const payload = {
        ...form,
        is_available: form.status === 'Available',
      }
      if (editingId) {
        await parkingApi.updateSlot(editingId, payload)
        setBanner({ type: 'success', message: `Parking slot ${editingId} updated.` })
      } else {
        const res = await parkingApi.createSlot(payload)
        setBanner({ type: 'success', message: `Parking slot ${res.slot?.slot_id || ''} added.` })
      }
      setModalOpen(false)
      await loadSlots()
    } catch (err) {
      setBanner({ type: 'error', message: extractErrorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  const handleQuickStatusChange = async (slot, nextStatus) => {
    try {
      await parkingApi.updateSlot(slot.slot_id, {
        status: nextStatus,
        is_available: nextStatus === 'Available',
      })
      setBanner({
        type: 'success',
        message: `Slot ${slot.slot_id} marked as ${nextStatus}.`,
      })
      await loadSlots()
    } catch (err) {
      setBanner({ type: 'error', message: extractErrorMessage(err) })
    }
  }

  const handleDelete = async (slotId) => {
    if (!window.confirm(`Delete parking slot ${slotId}?`)) return
    try {
      await parkingApi.deleteSlot(slotId)
      if (selectedSlotId === slotId) setSelectedSlotId(null)
      setBanner({ type: 'success', message: `Slot ${slotId} deleted.` })
      await loadSlots()
    } catch (err) {
      setBanner({ type: 'error', message: extractErrorMessage(err) })
    }
  }

  const getBayVisualClass = (slot) => {
    if (selectedSlotId === slot.slot_id) {
      return 'bg-blue-600 text-white border-blue-700 ring-2 ring-blue-300'
    }
    if (slot.status === 'Available' && slot.is_available) {
      return 'bg-emerald-500 text-white border-emerald-600 hover:bg-emerald-600'
    }
    if (slot.status === 'Occupied') {
      return 'bg-rose-500 text-white border-rose-600 hover:bg-rose-600'
    }
    return 'bg-slate-400 text-white border-slate-500 hover:bg-slate-500'
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Parking Slot Management</h2>
          <p className="text-sm text-slate-500">
            Interactive campus parking map, zone configuration, accessibility bays, and slot lifecycle.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800"
        >
          <Plus className="h-4 w-4" />
          Add Parking Slot
        </button>
      </div>

      {banner.message && (
        <AlertBanner
          type={banner.type}
          message={banner.message}
          onClose={() => setBanner({ type: '', message: '' })}
        />
      )}

      {/* Filters & Legend */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Search slot or vehicle ID..."
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <select
            value={filters.zone}
            onChange={(e) => setFilters((f) => ({ ...f, zone: e.target.value }))}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">All Zones</option>
            <option value="Zone A">Zone A</option>
            <option value="Zone B">Zone B</option>
            <option value="Zone C">Zone C</option>
            <option value="Zone D">Zone D</option>
          </select>

          <select
            value={filters.slot_type}
            onChange={(e) => setFilters((f) => ({ ...f, slot_type: e.target.value }))}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">All Slot Types</option>
            <option value="Car">Car</option>
            <option value="Bike">Bike</option>
            <option value="Scooter">Scooter</option>
            <option value="Two-Wheeler">Two-Wheeler</option>
          </select>

          <select
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">All States</option>
            <option value="Available">Available</option>
            <option value="Occupied">Occupied</option>
            <option value="Unavailable">Unavailable</option>
          </select>
        </div>

        {/* Visual Legend */}
        <div className="flex flex-wrap items-center gap-5 border-t border-slate-100 pt-3 text-xs font-medium text-slate-600">
          <span className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 rounded bg-emerald-500" /> Available
          </span>
          <span className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 rounded bg-rose-500" /> Occupied
          </span>
          <span className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 rounded bg-slate-400" /> Unavailable / Maintenance
          </span>
          <span className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 rounded bg-blue-600" /> Selected Bay
          </span>
          <span className="flex items-center gap-1.5 text-slate-500">
            <Accessibility className="h-3.5 w-3.5 text-slate-700" /> PRM Accessible Bay
          </span>
        </div>
      </div>

      {/* Main Layout: Visual Grid + Inspector Sidebar */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              Loading visual parking layout...
            </div>
          ) : slotsByZone.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              No parking slots match the selected filters.
            </div>
          ) : (
            slotsByZone.map(([zoneName, zoneSlots]) => {
              const availCnt = zoneSlots.filter((s) => s.status === 'Available' && s.is_available).length
              return (
                <div key={zoneName} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">{zoneName}</h3>
                      <p className="text-xs text-slate-500">
                        {availCnt} available / {zoneSlots.length} bays shown
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-5 gap-2 sm:grid-cols-8 md:grid-cols-10">
                    {zoneSlots.map((slot) => {
                      const numLabel = slot.slot_id.replace('SLT-', '')
                      return (
                        <button
                          key={slot.slot_id}
                          type="button"
                          onClick={() => setSelectedSlotId(slot.slot_id)}
                          title={`${slot.slot_id} | ${slot.slot_type} | ${slot.status}${
                            slot.assigned_vehicle_id ? ` (${slot.assigned_vehicle_id})` : ''
                          }`}
                          className={`relative flex flex-col items-center justify-center rounded-md border px-1 py-2 text-[11px] font-bold transition-colors ${getBayVisualClass(
                            slot
                          )}`}
                        >
                          <span>{numLabel}</span>
                          <span className="text-[9px] font-normal opacity-90">
                            {slot.slot_type === 'Two-Wheeler' ? '2W' : slot.slot_type.slice(0, 3)}
                          </span>
                          {slot.is_accessible && (
                            <Accessibility className="absolute right-0.5 top-0.5 h-2.5 w-2.5" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Selected Slot Details Panel */}
        <div className="h-fit rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900">Slot Inspector</h3>
          {!selectedSlot ? (
            <p className="mt-3 text-sm text-slate-500">
              Click any numbered parking bay in the campus map to inspect distances, compatibility,
              occupancy, or modify its state.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <p className="text-lg font-bold text-slate-900">{selectedSlot.slot_id}</p>
                  <p className="text-xs text-slate-500">
                    {selectedSlot.zone} · {selectedSlot.slot_type} Bay
                  </p>
                </div>
                <StatusBadge status={selectedSlot.status} />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <span className="text-slate-500">To Block A</span>
                  <p className="mt-0.5 font-bold text-slate-900">{selectedSlot.distance_to_block_a} m</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <span className="text-slate-500">To Block B</span>
                  <p className="mt-0.5 font-bold text-slate-900">{selectedSlot.distance_to_block_b} m</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <span className="text-slate-500">To Block C</span>
                  <p className="mt-0.5 font-bold text-slate-900">{selectedSlot.distance_to_block_c} m</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <span className="text-slate-500">To Block D</span>
                  <p className="mt-0.5 font-bold text-slate-900">{selectedSlot.distance_to_block_d} m</p>
                </div>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Accessible (PRM)</span>
                  <span className="font-semibold text-slate-900">
                    {selectedSlot.is_accessible ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Assigned Vehicle</span>
                  <span className="font-mono font-semibold text-blue-700">
                    {selectedSlot.assigned_vehicle_id || 'None'}
                  </span>
                </div>
              </div>

              {/* Quick status switches */}
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <p className="text-xs font-semibold text-slate-600">Quick Status Update</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleQuickStatusChange(selectedSlot, 'Available')}
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    Mark Available
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickStatusChange(selectedSlot, 'Unavailable')}
                    className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                  >
                    Mark Unavailable
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => openEditModal(selectedSlot)}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-navy-900 px-3 py-2 text-xs font-medium text-white hover:bg-navy-800"
                >
                  <Edit2 className="h-3.5 w-3.5" /> Edit Slot
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(selectedSlot.slot_id)}
                  className="inline-flex items-center justify-center rounded-lg border border-rose-200 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Slot Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h3 className="text-base font-bold text-slate-900">
                {editingId ? `Edit Slot (${editingId})` : 'Add Parking Slot'}
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Zone</label>
                  <select
                    value={form.zone}
                    onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="Zone A">Zone A</option>
                    <option value="Zone B">Zone B</option>
                    <option value="Zone C">Zone C</option>
                    <option value="Zone D">Zone D</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Slot Type</label>
                  <select
                    value={form.slot_type}
                    onChange={(e) => setForm((f) => ({ ...f, slot_type: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="Car">Car</option>
                    <option value="Bike">Bike</option>
                    <option value="Scooter">Scooter</option>
                    <option value="Two-Wheeler">Two-Wheeler</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="Available">Available</option>
                    <option value="Occupied">Occupied</option>
                    <option value="Unavailable">Unavailable</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {['a', 'b', 'c', 'd'].map((b) => (
                  <div key={b}>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      Block {b.toUpperCase()} (m)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={form[`distance_to_block_${b}`]}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          [`distance_to_block_${b}`]: Number(e.target.value),
                        }))
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                ))}
              </div>

              <label className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_accessible}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, is_accessible: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                />
                <span className="font-medium text-slate-800">Accessible (PRM) Bay</span>
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
                  {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Slot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

