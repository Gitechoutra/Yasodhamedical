import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  HiOutlinePlus,
  HiOutlineCheckBadge,
  HiOutlineMagnifyingGlass,
  HiOutlineXMark,
} from "react-icons/hi2";
import ConfirmDialog from "../components/ConfirmDialog";
import Modal from "../components/Modal";
import PatientCard from "../components/PatientCard";
import AssignNurseModal from "../components/nursing/AssignNurseModal";
import EditPatientModal from "../components/EditPatientModal";
import { useAuth } from "../context/AuthContext";
import { BLOOD_GROUPS } from "../constants/patient";
import {
  EMAIL_ERROR,
  EMAIL_HINT,
  PHONE_DIGITS,
  PHONE_ERROR,
  digitsOnly,
  isPhoneIncomplete,
  isValidEmail,
} from "../utils/contact";
import { canCreateOp, canReassignDoctor, canRegisterPatient } from "../utils/permissions";
import useLiveRefresh from "../hooks/useLiveRefresh";
import { fetchDoctors } from "../services/doctorService";
import {
  fetchPatientCounts,
  fetchPatients,
  createPatient,
  deletePatient,
  assignPatientDoctor,
} from "../services/patientService";

// Matches the API's own floor (helpers/search.py). Below it the server stops
// narrowing and answers with the whole list, which would read on this page as
// a search that matched everybody.
const MIN_SEARCH_LENGTH = 2;

// Only ever rendered for the front desk — see `canRegisterPatient`. The
// treating doctor is therefore always chosen here rather than implied, which
// is why the picker below is unconditional.
function AddPatientModal({ onClose, onCreated, doctors }) {
  const [form, setForm] = useState({
    name: "",
    gender: "",
    dob: "",
    phone: "",
    email: "",
    blood_group: "",
    allergies: "",
    medical_history: "",
    assigned_doctor_id: "",
  });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  // Both optional on a patient record — somebody brought in unconscious has
  // neither — but exact when given, and the same rule the staff form uses.
  const phoneIncomplete = isPhoneIncomplete(form.phone);
  const emailInvalid = !isValidEmail(form.email);

  async function handleSubmit(e) {
    e.preventDefault();
    if (phoneIncomplete) {
      setErrorMsg(PHONE_ERROR);
      return;
    }
    if (emailInvalid) {
      setErrorMsg(EMAIL_ERROR);
      return;
    }
    setSaving(true);
    setErrorMsg("");
    try {
      const patient = await createPatient(form);
      onCreated(patient);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not create patient.");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

  return (
    <Modal title="Add Patient" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Name *</label>
          <input required className={inputClass} value={form.name} onChange={update("name")} />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Date of Birth
            </label>
            {/* Age on the queue cards is derived from this — without it the
                card can only show a dash. The min stops a mistyped year
                (e.g. "0001") from producing an absurd age; the server
                rejects out-of-range dates too. */}
            <input
              type="date"
              min={`${new Date().getFullYear() - 130}-01-01`}
              max={new Date().toISOString().slice(0, 10)}
              className={inputClass}
              value={form.dob}
              onChange={update("dob")}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Phone</label>
            {/* Sanitised as it is typed rather than validated on submit: a
                pasted "+91 98765 43210" becomes usable instead of an error,
                and a letter simply cannot be entered. Same rule as the staff
                form — see utils/contact.js. */}
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              maxLength={PHONE_DIGITS}
              placeholder={`${PHONE_DIGITS} digits`}
              className={`${inputClass} ${phoneIncomplete ? "border-red-300" : ""}`}
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: digitsOnly(e.target.value) }))}
            />
            {phoneIncomplete && (
              <p className="mt-1 text-xs text-red-600">
                {form.phone.length} of {PHONE_DIGITS} digits
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Gender</label>
            <select className={inputClass} value={form.gender} onChange={update("gender")}>
              <option value="">Select</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Blood Group</label>
            {/* A picker, not a text box. Typing this field is how "P+" and
                "Z+" got into the record — there are eight answers and no
                reason to let anyone write a ninth. Optional: reception often
                registers a patient before anybody knows it. */}
            <select
              className={inputClass}
              value={form.blood_group}
              onChange={update("blood_group")}
            >
              <option value="">Not recorded</option>
              {BLOOD_GROUPS.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Email</label>
          <input
            type="email"
            placeholder={EMAIL_HINT}
            className={`${inputClass} ${emailInvalid ? "border-red-300" : ""}`}
            value={form.email}
            onChange={update("email")}
          />
          {emailInvalid && <p className="mt-1 text-xs text-red-600">{EMAIL_ERROR}</p>}
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Allergies</label>
          <input className={inputClass} value={form.allergies} onChange={update("allergies")} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Assign Doctor *</label>
          {/* Chosen from the condition the patient presents with — this is
              also what decides who can see the record afterwards. */}
          <select
            required
            className={inputClass}
            value={form.assigned_doctor_id}
            onChange={update("assigned_doctor_id")}
          >
            <option value="">Select the treating doctor</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.specialization ? ` — ${d.specialization}` : ""}
                {d.department ? ` (${d.department})` : ""}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-slate-400">
            Only this doctor will be able to see this patient.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Medical History</label>
          <textarea
            className={inputClass}
            rows={2}
            value={form.medical_history}
            onChange={update("medical_history")}
          />
        </div>

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

        <button
          type="submit"
          disabled={saving || phoneIncomplete || emailInvalid}
          className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
        >
          {saving ? "Saving…" : "Add Patient"}
        </button>
      </form>
    </Modal>
  );
}

export default function Patients() {
  const navigate = useNavigate();
  const { user } = useAuth();
  // A patient is admitted at the front desk and nowhere else. A doctor works
  // whoever reception routes to them; they never register a patient — and the
  // server refuses the call, so this only decides whether to draw the button.
  const canRegister = canRegisterPatient(user?.role);
  // Scheduling a patient into a department queue is front-desk/admin work —
  // doctors just work whatever lands in their own Appointments queue.
  // Front desk only — same rule as the Appointments page, from one place so
  // the two cannot drift. Admin monitors; it does not raise visits.
  const canScheduleAppointments = canCreateOp(user?.role);
  // Correcting a mis-routed patient. Front desk *and* admin, matching the
  // server's assignment route — wider than registration on purpose.
  const canReroute = canReassignDoctor(user?.role);
  // Handing a patient to a nurse is the treating doctor's call — the server
  // rejects it from anyone else. It is also offered for surgery cases only
  // (see the row below): nursing care is the post-operative watch, and the
  // API refuses the hand-off for a patient who is not on that pathway. The
  // pathway itself is driven from the consultation room.
  const canAssignNurse = user?.role === "doctor";
  // Reception typed these details in; the treating doctor may correct them
  // too. The server enforces the same pair.
  const canEditPatient = user?.role !== "nurse";
  // Removing a registration is front-desk work — the same pair the server
  // allows on the delete route. A doctor or nurse never sees the button.
  const canDeletePatient = user?.role === "receptionist" || user?.role === "admin";

  const [patients, setPatients] = useState([]);
  const [counts, setCounts] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [nursePatient, setNursePatient] = useState(null);
  const [editPatient, setEditPatient] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  // Which side of the journey is on screen. Defaults to the patients whose
  // consultation is finished — anyone still pending or in progress belongs to
  // Appointments, and listing them here is what made the two sections
  // disagree about where a patient was.
  const [scope, setScope] = useState("consulted");

  // The term lives in the URL so the header's search box can land here with a
  // patient already picked out, and so the result is a page somebody can
  // bookmark or reload.
  const [searchParams, setSearchParams] = useSearchParams();
  const searchTerm = searchParams.get("search") || "";
  const [searchInput, setSearchInput] = useState(searchTerm);

  // Arriving from the header search (or the back button) has to move the box,
  // which otherwise keeps whatever was last typed into it.
  useEffect(() => setSearchInput(searchTerm), [searchTerm]);

  const query = searchTerm.trim();
  // Same floor as the API, which stops narrowing below it — one character
  // would come back as the entire list and read as a broken search.
  const searching = query.length >= MIN_SEARCH_LENGTH;

  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      // A search runs across every patient rather than the open tab. Whoever
      // is being looked for is as likely to be waiting in Appointments as to
      // have been seen, and a name that exists returning "no patients" is
      // indistinguishable from the record having been lost.
      return Promise.all([
        fetchPatients(searching ? "all" : scope, searching ? query : undefined),
        fetchPatientCounts(),
      ])
        .then(([rows, totals]) => {
          setPatients(rows);
          setCounts(totals);
        })
        .finally(() => setLoading(false));
    },
    [scope, searching, query]
  );

  // The doctor list backs both the registration form and the re-route picker;
  // nobody who can do neither needs to pay for the request.
  const needsDoctors = canRegister || canReroute;

  useEffect(() => {
    if (!needsDoctors) return;
    fetchDoctors().then(setDoctors).catch(() => setDoctors([]));
  }, [needsDoctors]);

  useEffect(() => {
    load();
  }, [load]);

  // Typing moves the URL, debounced — one request per pause rather than one
  // per keystroke, and `replace` so a search does not bury the previous page
  // under a history entry per character.
  useEffect(() => {
    const next = searchInput.trim();
    if (next === searchTerm) return;
    const id = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (next) params.set("search", next);
      else params.delete("search");
      setSearchParams(params, { replace: true });
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput, searchTerm, searchParams, setSearchParams]);

  // Front desk registering a patient should show up here immediately.
  useLiveRefresh(load);

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      await deletePatient(deleteTarget.id);
      // Dropped from the table straight away, then the counts and the rest of
      // the list are refetched so nothing on screen is left stale.
      setPatients((rows) => rows.filter((p) => p.id !== deleteTarget.id));
      setSuccessMsg(`${deleteTarget.name} was deleted.`);
      setDeleteTarget(null);
      load(true);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not delete this patient.");
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Patients</h1>
          <p className="mt-1 text-sm text-slate-500">
            {searching
              ? `Matching “${query}” — every patient, consulted or not`
              : scope === "consulted"
                ? "Patients whose consultation is complete"
                : "Registered or in Appointments — not yet consulted"}
          </p>
        </div>
        {canRegister && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
          >
            <HiOutlinePlus className="h-4 w-4" />
            Add Patient
          </button>
        )}
      </div>

      {/* Name, patient code (PAT0004), phone or email. The server does the
          matching so it reaches every patient the caller may see, not just the
          page already loaded. */}
      <div className="mt-5 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 sm:max-w-md">
        <HiOutlineMagnifyingGlass className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="Search patients"
          placeholder="Search by name, patient ID, phone or email…"
          className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
        />
        {searchInput && (
          <button
            type="button"
            onClick={() => setSearchInput("")}
            aria-label="Clear search"
            className="shrink-0 rounded-full p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <HiOutlineXMark className="h-4 w-4" />
          </button>
        )}
      </div>

      {searchInput.trim().length === 1 && (
        <p className="mt-2 text-xs text-slate-400">
          Keep typing — at least {MIN_SEARCH_LENGTH} characters.
        </p>
      )}

      {/* A patient sits on exactly one side: in Appointments until their
          consultation is finished, here afterwards. The tabs make that
          visible rather than leaving the other half looking missing.

          Hidden while searching: the search deliberately crosses both sides,
          so a tab claiming to be the active filter would be a lie — and a
          match on the other side would look like no match at all. */}
      <div className={`mt-5 flex-wrap gap-2 ${searching ? "hidden" : "flex"}`}>
        {[
          ["consulted", "Consulted", counts?.consulted],
          ["awaiting", "Awaiting consultation", counts?.awaiting],
        ].map(([value, label, count]) => (
          <button
            key={value}
            onClick={() => setScope(value)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              scope === value
                ? "bg-brand-600 text-white shadow-md"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {label}
            {count != null && (
              <span
                className={`ml-2 rounded-full px-1.5 py-0.5 text-[11px] ${
                  scope === value ? "bg-white/20" : "bg-slate-100 text-slate-500"
                }`}
              >
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {scope === "awaiting" && !searching && (
        <p className="mt-3 flex flex-wrap items-center gap-1.5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          These patients are still with Appointments. They move to Consulted once the doctor
          completes their consultation.
          <button
            onClick={() => navigate("/dashboard/appointments")}
            className="font-semibold underline underline-offset-2"
          >
            Open Appointments
          </button>
        </p>
      )}

      {errorMsg && (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}
      {successMsg && (
        <p
          role="status"
          className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700"
        >
          <HiOutlineCheckBadge className="h-5 w-5 shrink-0" />
          {successMsg}
        </p>
      )}

      <div className="mt-5">
        {loading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-56 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : patients.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white py-16 text-center shadow-sm">
            <p className="mx-auto max-w-lg text-sm text-slate-400">
              {searching ? (
                <>
                  No patient matches “{query}”. Names, patient IDs, phone
                  numbers and email addresses are all searched.
                  <button
                    onClick={() => setSearchInput("")}
                    className="ml-1 font-semibold text-brand-600 underline underline-offset-2"
                  >
                    Clear the search
                  </button>
                </>
              ) : scope === "consulted" ? (
                counts?.awaiting ? (
                  `No completed consultations yet. ${counts.awaiting} patient${
                    counts.awaiting === 1 ? " is" : "s are"
                  } still in Appointments — they appear here once their consultation is done.`
                ) : (
                  "No patients have completed a consultation yet."
                )
              ) : (
                "Nobody is waiting. Every registered patient has been consulted."
              )}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {patients.map((p) => (
              <PatientCard
                key={p.id}
                patient={p}
                doctors={doctors}
                canReassignDoctor={canReroute}
                canScheduleAppointments={canScheduleAppointments}
                canAssignNurse={canAssignNurse}
                canEditPatient={canEditPatient}
                canDeletePatient={canDeletePatient}
                onCreateOp={() => navigate(`/dashboard/appointments?patient_id=${p.id}`)}
                onAssignNurse={() => setNursePatient(p)}
                onEdit={() => setEditPatient(p)}
                onDelete={() => {
                  setErrorMsg("");
                  setSuccessMsg("");
                  setDeleteTarget(p);
                }}
                onAssignDoctor={async (patientId, doctorId) => {
                  await assignPatientDoctor(patientId, doctorId);
                  load(true);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {showAddModal && canRegister && (
        <AddPatientModal
          doctors={doctors}
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            setShowAddModal(false);
            // A patient who has just been registered has no completed
            // consultation, so they belong to Awaiting. Switching to that tab
            // means the person who registered them sees them, instead of
            // watching them apparently not save. The scope change reloads.
            if (scope === "awaiting") load();
            else setScope("awaiting");
          }}
        />
      )}

      {editPatient && (
        <EditPatientModal
          patient={editPatient}
          onClose={() => setEditPatient(null)}
          onSaved={() => {
            setEditPatient(null);
            load(true);
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete patient"
          message={
            `Are you sure you want to delete this patient record?\n\n` +
            `${deleteTarget.name} (${deleteTarget.code}) will be removed permanently, ` +
            "along with any appointment they are queued for. This cannot be undone."
          }
          confirmLabel="Delete patient"
          cancelLabel="Cancel"
          destructive
          busy={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleConfirmDelete}
        />
      )}

      {nursePatient && (
        <AssignNurseModal
          patientId={nursePatient.id}
          patientName={nursePatient.name}
          observationDays={nursePatient.observation_days}
          onClose={() => setNursePatient(null)}
          onAssigned={(assignment) => {
            setNursePatient(null);
            navigate(`/dashboard/nursing/${assignment.id}`);
          }}
        />
      )}
    </div>
  );
}
