import { useCallback, useEffect, useMemo, useState } from "react";
import {
  HiOutlineCalendarDays,
  HiOutlineClock,
  HiOutlinePencilSquare,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineXCircle,
} from "react-icons/hi2";
import Avatar from "../components/Avatar";
import ConfirmDialog from "../components/ConfirmDialog";
import Modal from "../components/Modal";
import { Badge, EmptyState, PageHeader } from "../components/RecordCard";
import { useAuth } from "../context/AuthContext";
import {
  cancelShift,
  createShift,
  deleteShift,
  fetchMyShifts,
  fetchShiftOptions,
  fetchShifts,
  updateShift,
} from "../services/shiftService";

const SLOT_TONES = {
  morning: "amber",
  evening: "brand",
  night: "slateSolid",
  custom: "slate",
};

const ROLE_LABELS = {
  doctor: "Doctor",
  nurse: "Nurse",
  receptionist: "Receptionist",
  pharmacist: "Pharmacist",
  lab_technician: "Lab technician",
  accountant: "Accountant",
  other_staff: "Staff",
};

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

/** Today (or today ± offsetDays) as YYYY-MM-DD in the *hospital's* timezone.
 *
 *  Built from the local date parts rather than `toISOString()`, which converts
 *  to UTC first and so returns the wrong day for part of every day: east of
 *  UTC it reads a day behind until the offset passes (05:30 in IST), west of
 *  it a day ahead all evening. A rota is wall-clock local — matching the
 *  storage model — so an administrator rostering the night shift at 2am must
 *  not be handed yesterday's date as the default. */
function isoDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "Mon 11 Aug 2026" — the rota is read by date, so the weekday leads. */
function formatDay(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Groups a flat list into [date, shifts[]] pairs, preserving server order —
 *  the API already sorts by date then start time. */
function groupByDate(items) {
  const map = new Map();
  for (const item of items) {
    if (!map.has(item.shift_date)) map.set(item.shift_date, []);
    map.get(item.shift_date).push(item);
  }
  return [...map.entries()];
}

function ShiftHours({ shift }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm text-slate-600">
      <HiOutlineClock className="h-4 w-4 shrink-0 text-slate-400" />
      {shift.starts_at} – {shift.ends_at}
      {/* A night shift ends the following morning. Saying so beats leaving a
          reader to work out why the end time is "before" the start. */}
      {shift.crosses_midnight && <span className="text-xs text-slate-400">(next day)</span>}
    </span>
  );
}

function ShiftBadges({ shift, showRole }) {
  return (
    <>
      <Badge tone={SLOT_TONES[shift.slot] || "slate"}>{shift.slot}</Badge>
      {shift.status === "cancelled" && <Badge tone="amber">Cancelled</Badge>}
      {showRole && shift.staff_role && (
        <Badge tone="slate">{ROLE_LABELS[shift.staff_role] || shift.staff_role}</Badge>
      )}
      {shift.department && <Badge tone="slate">{shift.department}</Badge>}
    </>
  );
}

/** A from/to window. Shared by both views so the two read the same way. */
function RangePicker({ range, onChange }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-xs font-semibold text-slate-600">
        From
        <input
          type="date"
          value={range.from}
          onChange={(e) => onChange({ ...range, from: e.target.value })}
          className={`mt-1 ${inputClass}`}
        />
      </label>
      <label className="text-xs font-semibold text-slate-600">
        To
        <input
          type="date"
          value={range.to}
          onChange={(e) => onChange({ ...range, to: e.target.value })}
          className={`mt-1 ${inputClass}`}
        />
      </label>
    </div>
  );
}

// ------------------------------------------------------------ read-only --

/**
 * What a doctor, nurse, receptionist or pharmacist sees.
 *
 * There is no manage affordance anywhere on this screen — not a disabled
 * button, not a hidden menu. The server refuses their writes regardless, but
 * showing a control they can never use only invites them to try.
 */
function MyShifts() {
  const [range, setRange] = useState({ from: isoDate(0), to: isoDate(30) });
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchMyShifts({ from: range.from, to: range.to })
      .then((data) => {
        if (!active) return;
        setShifts(data.items || []);
        setErrorMsg("");
      })
      .catch((err) => {
        if (!active) return;
        setErrorMsg(err.response?.data?.message || "Could not load your shifts.");
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [range.from, range.to]);

  const grouped = useMemo(() => groupByDate(shifts), [shifts]);
  const scheduled = shifts.filter((s) => s.status === "scheduled").length;

  return (
    <div>
      <PageHeader
        icon={HiOutlineCalendarDays}
        title="My shifts"
        description="The shifts the hospital administrator has rostered you for. Contact them if something here looks wrong — shifts are managed centrally."
      />

      <div className="mt-5">
        <RangePicker range={range} onChange={setRange} />
      </div>

      {errorMsg && (
        <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      <p className="mt-5 text-sm text-slate-500">
        {loading
          ? "Loading…"
          : `${scheduled} shift${scheduled === 1 ? "" : "s"} in this period`}
      </p>

      <div className="mt-3 space-y-5">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          ))
        ) : shifts.length === 0 ? (
          <EmptyState icon={HiOutlineCalendarDays}>
            You have no shifts rostered in this period.
          </EmptyState>
        ) : (
          grouped.map(([day, rows]) => (
            <div key={day}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {formatDay(day)}
              </p>
              <div className="mt-2 space-y-2">
                {rows.map((shift) => (
                  <div
                    key={shift.id}
                    className={`rounded-2xl border bg-white p-4 shadow-sm ${
                      shift.status === "cancelled"
                        ? "border-slate-100 opacity-60"
                        : "border-slate-100"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <ShiftHours shift={shift} />
                      <div className="flex flex-wrap items-center gap-2">
                        <ShiftBadges shift={shift} />
                      </div>
                    </div>
                    {shift.notes && (
                      <p className="mt-2 text-sm text-slate-500">{shift.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------- admin --

function ShiftFormModal({ shift, options, onClose, onSaved }) {
  const editing = Boolean(shift);
  const [form, setForm] = useState(() => ({
    user_id: shift?.user_id ? String(shift.user_id) : "",
    shift_date: shift?.shift_date || isoDate(0),
    slot: shift?.slot || "morning",
    starts_at: shift?.starts_at || options.slot_hours?.morning?.starts_at || "06:00",
    ends_at: shift?.ends_at || options.slot_hours?.morning?.ends_at || "14:00",
    department_id: shift?.department_id ? String(shift.department_id) : "",
    notes: shift?.notes || "",
    status: shift?.status || "scheduled",
  }));
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  // Picking a named slot fills its standard hours in, which the admin can
  // then override. `custom` leaves whatever is already there.
  function handleSlot(e) {
    const slot = e.target.value;
    const hours = options.slot_hours?.[slot];
    setForm((f) => ({
      ...f,
      slot,
      starts_at: hours?.starts_at ?? f.starts_at,
      ends_at: hours?.ends_at ?? f.ends_at,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");
    const payload = {
      user_id: form.user_id ? Number(form.user_id) : null,
      shift_date: form.shift_date,
      slot: form.slot,
      starts_at: form.starts_at,
      ends_at: form.ends_at,
      department_id: form.department_id ? Number(form.department_id) : null,
      notes: form.notes,
    };
    // Only on edit: creating always starts a shift scheduled, and sending a
    // status on create would offer a "roster it already cancelled" that means
    // nothing. On edit this is what puts a cancelled shift back on the rota.
    if (editing) payload.status = form.status;
    try {
      const saved = editing
        ? await updateShift(shift.id, payload)
        : await createShift(payload);
      onSaved(saved);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not save that shift.");
    } finally {
      setSaving(false);
    }
  }

  const staffByRole = useMemo(() => {
    const map = new Map();
    for (const s of options.staff || []) {
      const key = s.role || "other_staff";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    }
    return [...map.entries()];
  }, [options.staff]);

  return (
    <Modal title={editing ? "Edit shift" : "Roster a shift"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            Assign to
          </label>
          <select className={inputClass} value={form.user_id} onChange={update("user_id")}>
            {/* An unfilled slot is a real state — an administrator drafts the
                week first and puts names to it after. */}
            <option value="">Leave unassigned</option>
            {staffByRole.map(([role, people]) => (
              <optgroup key={role} label={ROLE_LABELS[role] || role}>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Date *</label>
            <input
              required
              type="date"
              className={inputClass}
              value={form.shift_date}
              onChange={update("shift_date")}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Slot *</label>
            <select className={inputClass} value={form.slot} onChange={handleSlot}>
              {(options.slots || []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Starts *</label>
            <input
              required
              type="time"
              className={inputClass}
              value={form.starts_at}
              onChange={update("starts_at")}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Ends *</label>
            <input
              required
              type="time"
              className={inputClass}
              value={form.ends_at}
              onChange={update("ends_at")}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Department</label>
          <select
            className={inputClass}
            value={form.department_id}
            onChange={update("department_id")}
          >
            <option value="">No department</option>
            {(options.departments || []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        {/* Edit only. Cancelling is done from the rota, but putting a shift
            back is only possible here — without this a cancelled shift could
            never return to the rota, and deleting it (the only other way out)
            destroys the history that cancelling exists to keep. */}
        {editing && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Status</label>
            <select className={inputClass} value={form.status} onChange={update("status")}>
              <option value="scheduled">Scheduled</option>
              <option value="cancelled">Cancelled</option>
            </select>
            {shift?.status === "cancelled" && form.status === "scheduled" && (
              <p className="mt-1 text-xs text-slate-500">
                Saving will put this shift back on the rota.
              </p>
            )}
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Notes</label>
          <textarea
            rows={2}
            className={inputClass}
            value={form.notes}
            onChange={update("notes")}
            placeholder="e.g. Ward B cover"
          />
        </div>

        {errorMsg && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{errorMsg}</p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
        >
          {saving ? "Saving…" : editing ? "Save changes" : "Roster shift"}
        </button>
      </form>
    </Modal>
  );
}

/** The administrator's rota: create, assign, edit, cancel and delete. */
function ShiftManager() {
  const [range, setRange] = useState({ from: isoDate(0), to: isoDate(14) });
  const [filters, setFilters] = useState({ role: "all", user_id: "", status: "all" });
  const [shifts, setShifts] = useState([]);
  const [options, setOptions] = useState({});
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [editing, setEditing] = useState(null); // shift object, or "new"
  const [confirming, setConfirming] = useState(null); // { shift, action }
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = { from: range.from, to: range.to };
    if (filters.role !== "all") params.role = filters.role;
    if (filters.user_id) params.user_id = filters.user_id;
    if (filters.status !== "all") params.status = filters.status;
    return fetchShifts(params)
      .then((data) => {
        setShifts(data.items || []);
        setErrorMsg("");
      })
      .catch((err) => setErrorMsg(err.response?.data?.message || "Could not load the rota."))
      .finally(() => setLoading(false));
  }, [range.from, range.to, filters.role, filters.user_id, filters.status]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetchShiftOptions()
      .then(setOptions)
      .catch(() => setErrorMsg("Could not load the roster options."));
  }, []);

  async function handleConfirm() {
    if (!confirming) return;
    setBusy(true);
    try {
      if (confirming.action === "cancel") await cancelShift(confirming.shift.id);
      else await deleteShift(confirming.shift.id);
      setConfirming(null);
      load();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not update that shift.");
      setConfirming(null);
    } finally {
      setBusy(false);
    }
  }

  const grouped = useMemo(() => groupByDate(shifts), [shifts]);
  const unassigned = shifts.filter((s) => !s.assigned && s.status === "scheduled").length;
  // Whether anything other than the date window is narrowing the list. An
  // empty rota and a rota filtered down to nothing look identical, and saying
  // "no shifts rostered" for the second reads as though the save failed — the
  // filters persist across a save, so rostering a nurse while filtered to
  // doctors makes a shift that really was stored appear not to exist.
  const filtered = filters.role !== "all" || filters.user_id || filters.status !== "all";

  return (
    <div>
      <PageHeader
        icon={HiOutlineCalendarDays}
        title="Staff shifts"
        description="The hospital rota. Every shift a doctor, nurse, receptionist or pharmacist works is created and assigned here — staff see only their own and cannot change them."
        action={
          <button
            onClick={() => setEditing("new")}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
          >
            <HiOutlinePlus className="h-4 w-4" />
            Roster a shift
          </button>
        }
      />

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <RangePicker range={range} onChange={setRange} />

        <label className="text-xs font-semibold text-slate-600">
          Role
          <select
            value={filters.role}
            onChange={(e) => setFilters((f) => ({ ...f, role: e.target.value, user_id: "" }))}
            className={`mt-1 ${inputClass}`}
          >
            <option value="all">All roles</option>
            {(options.roles || []).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r] || r}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-semibold text-slate-600">
          Staff member
          <select
            value={filters.user_id}
            onChange={(e) => setFilters((f) => ({ ...f, user_id: e.target.value }))}
            className={`mt-1 ${inputClass}`}
          >
            <option value="">Everyone</option>
            <option value="unassigned">Unassigned slots</option>
            {(options.staff || [])
              .filter((s) => filters.role === "all" || s.role === filters.role)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>

        <label className="text-xs font-semibold text-slate-600">
          Status
          <select
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            className={`mt-1 ${inputClass}`}
          >
            <option value="all">All</option>
            <option value="scheduled">Scheduled</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
      </div>

      {errorMsg && (
        <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      <p className="mt-5 text-sm text-slate-500">
        {loading ? "Loading…" : `${shifts.length} shift${shifts.length === 1 ? "" : "s"}`}
        {!loading && unassigned > 0 && ` · ${unassigned} still unassigned`}
      </p>

      <div className="mt-3 space-y-5">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
          ))
        ) : shifts.length === 0 ? (
          <EmptyState icon={HiOutlineCalendarDays}>
            {filtered ? (
              <>
                No shifts match these filters in this period.{" "}
                <button
                  onClick={() => setFilters({ role: "all", user_id: "", status: "all" })}
                  className="font-semibold text-brand-600 underline underline-offset-2"
                >
                  Clear filters
                </button>{" "}
                to see the whole rota.
              </>
            ) : (
              "No shifts rostered for this period. Use “Roster a shift” to add one."
            )}
          </EmptyState>
        ) : (
          grouped.map(([day, rows]) => (
            <div key={day}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {formatDay(day)}
              </p>
              <div className="mt-2 space-y-2">
                {rows.map((shift) => (
                  <div
                    key={shift.id}
                    className={`rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:shadow-md ${
                      shift.status === "cancelled" ? "opacity-60" : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        {shift.assigned ? (
                          <Avatar
                            name={shift.staff_name}
                            imageUrl={shift.staff_avatar_url}
                            size="md"
                          />
                        ) : (
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-dashed border-slate-300 text-slate-300">
                            ?
                          </span>
                        )}
                        <div className="min-w-0">
                          <p
                            className={`truncate font-semibold ${
                              shift.assigned ? "text-slate-900" : "text-slate-400"
                            }`}
                          >
                            {shift.staff_name || "Unassigned"}
                          </p>
                          <ShiftHours shift={shift} />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <ShiftBadges shift={shift} showRole />
                      </div>
                    </div>

                    {shift.notes && (
                      <p className="mt-2 text-sm text-slate-500">{shift.notes}</p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                      <button
                        onClick={() => setEditing(shift)}
                        className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                      >
                        <HiOutlinePencilSquare className="h-4 w-4" />
                        {shift.assigned ? "Edit" : "Assign"}
                      </button>
                      {shift.status === "scheduled" && (
                        <button
                          onClick={() => setConfirming({ shift, action: "cancel" })}
                          className="flex items-center gap-1.5 rounded-xl border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-50"
                        >
                          <HiOutlineXCircle className="h-4 w-4" />
                          Cancel
                        </button>
                      )}
                      <button
                        onClick={() => setConfirming({ shift, action: "delete" })}
                        className="flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                      >
                        <HiOutlineTrash className="h-4 w-4" />
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {editing && (
        <ShiftFormModal
          shift={editing === "new" ? null : editing}
          options={options}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      {confirming && (
        <ConfirmDialog
          title={confirming.action === "cancel" ? "Cancel this shift?" : "Delete this shift?"}
          message={
            confirming.action === "cancel"
              ? "It stays on the rota marked cancelled, so the record of who was meant to work it survives. You can put it back to scheduled by editing it."
              : "This removes the shift outright. Cancel it instead if you want the rota to keep a record of it."
          }
          confirmLabel={confirming.action === "cancel" ? "Cancel shift" : "Delete"}
          // "Cancel" as the dismiss label next to a "Cancel shift" button
          // would be genuinely ambiguous.
          cancelLabel="Go back"
          destructive={confirming.action === "delete"}
          busy={busy}
          onConfirm={handleConfirm}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

/**
 * Shifts are managed centrally by the administrator; everyone else reads
 * their own. One route, two screens, chosen by role — a non-admin never
 * renders a control they are not allowed to use, and the API enforces the
 * same split independently.
 */
export default function Shifts() {
  const { user } = useAuth();
  return user?.role === "admin" ? <ShiftManager /> : <MyShifts />;
}
