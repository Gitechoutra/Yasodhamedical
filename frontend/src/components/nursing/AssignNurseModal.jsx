import { useEffect, useState } from "react";
import Modal from "../Modal";
import { createAssignment, fetchNurses } from "../../services/nursingService";

const CARE_TYPES = [
  { value: "observation", label: "Observation" },
  { value: "post_surgery", label: "Post-surgery" },
  { value: "post_procedure", label: "Post-procedure" },
  { value: "recovery", label: "Recovery" },
];

const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const labelClass = "mb-1 block text-xs font-semibold text-slate-600";

/**
 * The hand-off: a doctor names the nurse who will watch this patient through
 * the observation period.
 *
 * `consultationId` is optional but worth passing — with it the prescription is
 * carried straight into the nurse's medication schedule instead of being
 * re-typed, and the nurse can read the consultation summary alongside it.
 */
export default function AssignNurseModal({
  patientId,
  patientName,
  consultationId = null,
  defaultPlan = "",
  onClose,
  onAssigned,
}) {
  const [nurses, setNurses] = useState([]);
  const [form, setForm] = useState({
    nurse_id: "",
    care_type: "observation",
    observation_days: 3,
    treatment_plan: defaultPlan,
    care_instructions: "",
    import_prescription: true,
  });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [loadingNurses, setLoadingNurses] = useState(true);

  useEffect(() => {
    fetchNurses()
      .then(setNurses)
      .catch(() => setErrorMsg("Could not load the nurse list."))
      .finally(() => setLoadingNurses(false));
  }, []);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");
    try {
      const assignment = await createAssignment({
        patient_id: patientId,
        consultation_id: consultationId,
        ...form,
      });
      onAssigned(assignment);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not assign a nurse.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Assign a nurse to ${patientName}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className={labelClass}>Nurse *</label>
          <select
            required
            className={inputClass}
            value={form.nurse_id}
            onChange={update("nurse_id")}
            disabled={loadingNurses}
          >
            <option value="">
              {loadingNurses ? "Loading nurses…" : "Choose who will monitor this patient"}
            </option>
            {nurses.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
                {n.department ? ` — ${n.department}` : ""}
                {n.shift ? ` (${n.shift})` : ""}
                {` · ${n.active_assignments} patient${n.active_assignments === 1 ? "" : "s"}`}
              </option>
            ))}
          </select>
          {!loadingNurses && nurses.length === 0 && (
            <p className="mt-1 text-[11px] text-amber-600">
              No nurse accounts exist yet — an admin needs to create one first.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Type of care</label>
            <select className={inputClass} value={form.care_type} onChange={update("care_type")}>
              {CARE_TYPES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Observe for (days)</label>
            <input
              type="number"
              min="1"
              max="90"
              className={inputClass}
              value={form.observation_days}
              onChange={update("observation_days")}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Treatment plan</label>
          <textarea
            rows={3}
            className={inputClass}
            value={form.treatment_plan}
            onChange={update("treatment_plan")}
            placeholder="What was done, and what recovery should look like"
          />
        </div>

        <div>
          <label className={labelClass}>Care instructions for the nurse</label>
          <textarea
            rows={3}
            className={inputClass}
            value={form.care_instructions}
            onChange={update("care_instructions")}
            placeholder="e.g. Vitals every 4 hours. Watch the wound site. Call me if the fever goes above 38.5°C."
          />
        </div>

        {consultationId && (
          <label className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.import_prescription}
              onChange={(e) =>
                setForm((f) => ({ ...f, import_prescription: e.target.checked }))
              }
              className="mt-0.5 h-4 w-4 rounded border-slate-300"
            />
            <span>
              Copy this consultation&apos;s prescription into the nurse&apos;s medication
              schedule
              <span className="block text-[11px] text-slate-400">
                The nurse logs each dose against it — that&apos;s what medication
                compliance is measured from.
              </span>
            </span>
          </label>
        )}

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

        <button
          type="submit"
          disabled={saving || loadingNurses}
          className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
        >
          {saving ? "Assigning…" : "Assign nurse"}
        </button>
      </form>
    </Modal>
  );
}
