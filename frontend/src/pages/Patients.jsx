import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HiOutlinePlus, HiOutlineCamera, HiOutlineCheckBadge } from "react-icons/hi2";
import Avatar from "../components/Avatar";
import ConfirmDialog from "../components/ConfirmDialog";
import Modal from "../components/Modal";
import PatientCard from "../components/PatientCard";
import AssignNurseModal from "../components/nursing/AssignNurseModal";
import EditPatientModal from "../components/EditPatientModal";
import { useAuth } from "../context/AuthContext";
import useLiveRefresh from "../hooks/useLiveRefresh";
import { fetchDoctors } from "../services/doctorService";
import {
  fetchPatientCounts,
  fetchPatients,
  createPatient,
  deletePatient,
  uploadPatientPhoto,
  assignPatientDoctor,
} from "../services/patientService";

const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // must match the backend's limit

function AddPatientModal({ onClose, onCreated, doctors, mustAssign }) {
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
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const photoInputRef = useRef(null);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function handlePhotoPick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
      setErrorMsg("Photo must be 2 MB or smaller.");
      return;
    }
    setErrorMsg("");
    setPhoto(file);
    // Local preview, so the photo is visible before the patient row exists.
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");
    try {
      // The photo endpoint keys off a patient id, so it can only be sent
      // once the row exists.
      let patient = await createPatient(form);
      if (photo) {
        try {
          patient = await uploadPatientPhoto(patient.id, photo);
        } catch {
          // The patient is already saved — don't lose that over a photo.
          setErrorMsg("Patient saved, but the photo could not be uploaded.");
        }
      }
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
        <div className="flex items-center gap-4">
          <Avatar name={form.name} imageUrl={photoPreview} size="lg" />
          <div>
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <HiOutlineCamera className="h-4 w-4" />
              {photo ? "Change photo" : "Add photo"}
            </button>
            <p className="mt-1 text-[11px] text-slate-400">PNG, JPG or WEBP · up to 2 MB</p>
          </div>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={handlePhotoPick}
            className="hidden"
          />
        </div>

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
            <input className={inputClass} value={form.phone} onChange={update("phone")} />
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
            <input className={inputClass} value={form.blood_group} onChange={update("blood_group")} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Email</label>
          <input type="email" className={inputClass} value={form.email} onChange={update("email")} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Allergies</label>
          <input className={inputClass} value={form.allergies} onChange={update("allergies")} />
        </div>
        {mustAssign && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Assign Doctor *
            </label>
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
        )}

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
          disabled={saving}
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
  // Scheduling a patient into a department queue is front-desk/admin work —
  // doctors just work whatever lands in their own Appointments queue.
  const canScheduleAppointments = user?.role !== "doctor";
  // Front desk picks the treating doctor; a doctor registering a patient is
  // implicitly assigning them to themselves, so no picker is needed.
  const mustAssign = user?.role !== "doctor";
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

  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      return Promise.all([fetchPatients(scope), fetchPatientCounts()])
        .then(([rows, totals]) => {
          setPatients(rows);
          setCounts(totals);
        })
        .finally(() => setLoading(false));
    },
    [scope]
  );

  useEffect(() => {
    if (!mustAssign) return;
    fetchDoctors().then(setDoctors).catch(() => setDoctors([]));
  }, [mustAssign]);

  useEffect(() => {
    load();
  }, [load]);

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
            {scope === "consulted"
              ? "Patients whose consultation is complete"
              : "Registered or in Appointments — not yet consulted"}
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
        >
          <HiOutlinePlus className="h-4 w-4" />
          Add Patient
        </button>
      </div>

      {/* A patient sits on exactly one side: in Appointments until their
          consultation is finished, here afterwards. The tabs make that
          visible rather than leaving the other half looking missing. */}
      <div className="mt-5 flex flex-wrap gap-2">
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

      {scope === "awaiting" && (
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
              {scope === "consulted"
                ? counts?.awaiting
                  ? `No completed consultations yet. ${counts.awaiting} patient${
                      counts.awaiting === 1 ? " is" : "s are"
                    } still in Appointments — they appear here once their consultation is done.`
                  : "No patients have completed a consultation yet."
                : "Nobody is waiting. Every registered patient has been consulted."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {patients.map((p) => (
              <PatientCard
                key={p.id}
                patient={p}
                doctors={doctors}
                mustAssign={mustAssign}
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

      {showAddModal && (
        <AddPatientModal
          doctors={doctors}
          mustAssign={mustAssign}
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
