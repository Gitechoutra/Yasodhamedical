import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HiOutlinePlus, HiOutlineCalendarDays, HiOutlineCamera } from "react-icons/hi2";
import Avatar from "../components/Avatar";
import Modal from "../components/Modal";
import { useAuth } from "../context/AuthContext";
import { fetchPatients, createPatient, uploadPatientPhoto } from "../services/patientService";

const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // must match the backend's limit

function AddPatientModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: "",
    gender: "",
    dob: "",
    phone: "",
    email: "",
    blood_group: "",
    allergies: "",
    medical_history: "",
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Date of Birth
            </label>
            {/* Age on the queue cards is derived from this — without it the
                card can only show a dash. */}
            <input
              type="date"
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

        <div className="grid grid-cols-2 gap-3">
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
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  function load() {
    setLoading(true);
    fetchPatients()
      .then(setPatients)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Patients</h1>
          <p className="mt-1 text-sm text-slate-500">{patients.length} total patients</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
        >
          <HiOutlinePlus className="h-4 w-4" />
          Add Patient
        </button>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-100 bg-white shadow-sm">
        {loading ? (
          <div className="space-y-2 p-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : patients.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">
            No patients yet. Add one to get started.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-6 py-3 font-medium">Patient</th>
                <th className="px-6 py-3 font-medium">Age</th>
                <th className="px-6 py-3 font-medium">Gender</th>
                <th className="px-6 py-3 font-medium">Phone</th>
                <th className="px-6 py-3 font-medium">Blood Group</th>
                {canScheduleAppointments && <th className="px-6 py-3 font-medium"></th>}
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={p.name} imageUrl={p.photo_url} size="sm" />
                      <div>
                        <p className="font-medium text-slate-800">{p.name}</p>
                        <p className="text-xs text-slate-400">{p.code}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-slate-500">
                    {p.age != null ? `${p.age}` : "—"}
                  </td>
                  <td className="px-6 py-3 capitalize text-slate-500">{p.gender || "—"}</td>
                  <td className="px-6 py-3 text-slate-500">{p.phone || "—"}</td>
                  <td className="px-6 py-3 text-slate-500">{p.blood_group || "—"}</td>
                  {canScheduleAppointments && (
                    <td className="px-6 py-3 text-right">
                      <button
                        onClick={() => navigate(`/dashboard/appointments?patient_id=${p.id}`)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-100"
                      >
                        <HiOutlineCalendarDays className="h-3.5 w-3.5" />
                        New Appointment
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAddModal && (
        <AddPatientModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            setShowAddModal(false);
            load();
          }}
        />
      )}
    </div>
  );
}
