import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HiOutlineExclamationTriangle, HiOutlinePlus } from "react-icons/hi2";
import EmergencyCaseCard, { STATUS_META } from "../components/EmergencyCaseCard";
import Modal from "../components/Modal";
import {
  EmptyState,
  PageHeader,
  RecordGrid,
  RecordGridSkeleton,
} from "../components/RecordCard";
import { useAuth } from "../context/AuthContext";
import useLiveRefresh from "../hooks/useLiveRefresh";
import { fetchDepartments } from "../services/departmentService";
import { fetchDoctors } from "../services/doctorService";
import {
  claimEmergencyCase,
  createEmergencyCase,
  fetchEmergencyCases,
} from "../services/emergencyService";
import { createPatient, fetchPatients } from "../services/patientService";
import { canCreateEmergencyCase, canTreatEmergencyCase } from "../utils/permissions";

const STATUS_TABS = [
  ["open", "Open"],
  ["resolved", "Resolved"],
  ["cancelled", "Cancelled"],
];

const SEVERITIES = ["critical", "serious", "stable"];

function CreateEmergencyCaseModal({ onClose, onCreated }) {
  const [mode, setMode] = useState("existing"); // "existing" | "new"
  const [search, setSearch] = useState("");
  const [patients, setPatients] = useState([]);
  const [patientId, setPatientId] = useState("");
  const [reason, setReason] = useState("");
  const [severity, setSeverity] = useState("serious");
  const [departmentId, setDepartmentId] = useState("");
  const [departments, setDepartments] = useState([]);

  // Only asked for when registering someone unknown on the spot — the same
  // routing decision reception makes for any new patient (create_patient
  // requires it), not something the emergency workflow gets to skip.
  const [newName, setNewName] = useState("");
  const [newGender, setNewGender] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newDoctorId, setNewDoctorId] = useState("");
  const [doctors, setDoctors] = useState([]);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    fetchDepartments().then(setDepartments).catch(() => setDepartments([]));
  }, []);

  useEffect(() => {
    if (mode !== "new") return;
    fetchDoctors()
      .then((rows) => {
        setDoctors(rows);
        // Registering the patient still needs a doctor on file — the same
        // rule normal registration follows — but for an arrival nobody has
        // met yet, making reception hunt for one first is exactly the delay
        // this workflow exists to skip. Pre-picking whoever is first leaves
        // the field changeable, not fixed: the claiming doctor is very
        // possibly someone else entirely, and doesn't have to match this.
        setNewDoctorId((current) => current || (rows[0] ? String(rows[0].id) : ""));
      })
      .catch(() => setDoctors([]));
  }, [mode]);

  useEffect(() => {
    if (mode !== "existing" || search.trim().length < 2) {
      setPatients([]);
      return;
    }
    const id = setTimeout(() => {
      fetchPatients("all", search.trim())
        .then(setPatients)
        .catch(() => setPatients([]));
    }, 300);
    return () => clearTimeout(id);
  }, [mode, search]);

  const inputClass =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

  async function handleSubmit(e) {
    e.preventDefault();
    if (!reason.trim()) {
      setErrorMsg("Reason is required.");
      return;
    }
    setSaving(true);
    setErrorMsg("");
    try {
      let resolvedPatientId = patientId;

      if (mode === "new") {
        if (!newName.trim() || !newDoctorId) {
          setErrorMsg("Name and an assigned doctor are required to register a new patient.");
          setSaving(false);
          return;
        }
        const patient = await createPatient({
          name: newName.trim(),
          gender: newGender || undefined,
          phone: newPhone || undefined,
          assigned_doctor_id: newDoctorId,
        });
        resolvedPatientId = patient.id;
      }

      if (!resolvedPatientId) {
        setErrorMsg("Select a patient.");
        setSaving(false);
        return;
      }

      const emergencyCase = await createEmergencyCase({
        patient_id: Number(resolvedPatientId),
        reason: reason.trim(),
        severity,
        department_id: departmentId || undefined,
      });
      onCreated(emergencyCase);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not create the emergency case.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Log Emergency Case" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("existing")}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${
              mode === "existing" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            Existing patient
          </button>
          <button
            type="button"
            onClick={() => setMode("new")}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${
              mode === "new" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            Unknown / new arrival
          </button>
        </div>

        {mode === "existing" ? (
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Search patient *
            </label>
            <input
              className={inputClass}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, patient ID or phone…"
            />
            {patients.length > 0 && (
              <select
                required
                size={Math.min(patients.length, 5)}
                className={`${inputClass} mt-2`}
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
              >
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
            )}
          </div>
        ) : (
          <>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Name *</label>
              <input
                required
                className={inputClass}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Unknown male, approx. 30s — update once known"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Gender</label>
                <select className={inputClass} value={newGender} onChange={(e) => setNewGender(e.target.value)}>
                  <option value="">Unknown</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Phone</label>
                <input className={inputClass} value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Assign Doctor *
              </label>
              <select
                required
                className={inputClass}
                value={newDoctorId}
                onChange={(e) => setNewDoctorId(e.target.value)}
              >
                <option value="">Select a doctor</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {d.department ? ` (${d.department})` : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-400">
                Whoever is on duty can still claim the emergency case itself — this is only
                required to register the patient record.
              </p>
            </div>
          </>
        )}

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            Reason / type *
          </label>
          <textarea
            required
            rows={2}
            className={inputClass}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Road traffic accident, unconscious on arrival"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Severity</label>
            <select className={inputClass} value={severity} onChange={(e) => setSeverity(e.target.value)}>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s[0].toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Department (if known)
            </label>
            <select
              className={inputClass}
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
            >
              <option value="">Not sure yet</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
        >
          {saving ? "Logging…" : "Log Emergency Case"}
        </button>
      </form>
    </Modal>
  );
}

export default function EmergencyCases() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canCreate = canCreateEmergencyCase(user?.role);
  const canClaim = canTreatEmergencyCase(user?.role);

  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("open");
  const [showCreate, setShowCreate] = useState(false);
  const [claimingId, setClaimingId] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      const params = tab === "open" ? {} : { status: tab };
      return fetchEmergencyCases(params)
        .then(setCases)
        .catch(() => setErrorMsg("Could not load the emergency board."))
        .finally(() => setLoading(false));
    },
    [tab]
  );

  useEffect(() => {
    load();
  }, [load]);

  useLiveRefresh(load);

  async function handleClaim(emergencyCase) {
    setClaimingId(emergencyCase.id);
    setErrorMsg("");
    try {
      await claimEmergencyCase(emergencyCase.id);
      navigate(`/dashboard/emergency/${emergencyCase.id}`);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not claim this case.");
      load(true);
    } finally {
      setClaimingId(null);
    }
  }

  return (
    <div>
      <PageHeader
        icon={HiOutlineExclamationTriangle}
        title="Emergency Cases"
        description="Patients whose treatment could not wait for the normal OP queue — logged separately, claimed by whoever is on duty."
        action={
          canCreate && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
            >
              <HiOutlinePlus className="h-4 w-4" />
              Log Emergency Case
            </button>
          )
        }
      />

      <div className="mt-5 flex flex-wrap gap-2">
        {STATUS_TABS.map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              tab === value
                ? "bg-brand-600 text-white shadow-md"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {errorMsg && (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      <div className="mt-5">
        {loading ? (
          <RecordGridSkeleton count={3} />
        ) : cases.length === 0 ? (
          <EmptyState icon={HiOutlineExclamationTriangle}>
            {tab === "open"
              ? "No open emergency cases right now."
              : `No ${STATUS_META[tab]?.label.toLowerCase() || tab} cases.`}
          </EmptyState>
        ) : (
          <RecordGrid>
            {cases.map((c) => (
              <EmergencyCaseCard
                key={c.id}
                emergencyCase={c}
                canClaim={canClaim}
                busy={claimingId === c.id}
                onClaim={handleClaim}
                onOpen={(ec) => navigate(`/dashboard/emergency/${ec.id}`)}
              />
            ))}
          </RecordGrid>
        )}
      </div>

      {showCreate && canCreate && (
        <CreateEmergencyCaseModal
          onClose={() => setShowCreate(false)}
          onCreated={(ec) => {
            setShowCreate(false);
            navigate(`/dashboard/emergency/${ec.id}`);
          }}
        />
      )}
    </div>
  );
}
