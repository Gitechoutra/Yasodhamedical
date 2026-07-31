import { useState } from "react";
import { HiOutlinePlus, HiOutlineTrash } from "react-icons/hi2";

const EMPTY_ROW = { medicine_name: "", dose: "", frequency: "", duration: "" };

const cellClass =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

/**
 * Edits the AI-suggested prescription in place. Saving sends the whole list,
 * so what's on screen is exactly what gets stored.
 */
export default function PrescriptionEditor({ prescriptions, saving, onCancel, onSave }) {
  const [rows, setRows] = useState(() =>
    prescriptions.length
      ? prescriptions.map((p) => ({
          medicine_name: p.medicine_name || "",
          dose: p.dose || "",
          frequency: p.frequency || "",
          duration: p.duration || "",
        }))
      : [{ ...EMPTY_ROW }]
  );
  const [errorMsg, setErrorMsg] = useState("");

  function updateRow(index, field, value) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  function addRow() {
    setRows((current) => [...current, { ...EMPTY_ROW }]);
  }

  function removeRow(index) {
    setRows((current) => current.filter((_, i) => i !== index));
  }

  function handleSave() {
    // Blank rows are how someone clears a medicine they added by mistake —
    // drop them rather than rejecting the save.
    const filled = rows.filter((r) => r.medicine_name.trim());
    if (rows.some((r) => !r.medicine_name.trim() && (r.dose || r.frequency || r.duration))) {
      setErrorMsg("Every medicine needs a name.");
      return;
    }
    setErrorMsg("");
    onSave(filled);
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2 font-medium">Medicine *</th>
              <th className="px-3 py-2 font-medium">Dose</th>
              <th className="px-3 py-2 font-medium">Frequency</th>
              <th className="px-3 py-2 font-medium">Duration</th>
              <th className="w-10 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  <input
                    className={cellClass}
                    value={row.medicine_name}
                    onChange={(e) => updateRow(i, "medicine_name", e.target.value)}
                    placeholder="e.g. Paracetamol 650mg"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    className={cellClass}
                    value={row.dose}
                    onChange={(e) => updateRow(i, "dose", e.target.value)}
                    placeholder="1 Tablet"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    className={cellClass}
                    value={row.frequency}
                    onChange={(e) => updateRow(i, "frequency", e.target.value)}
                    placeholder="Every 8 hours"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    className={cellClass}
                    value={row.duration}
                    onChange={(e) => updateRow(i, "duration", e.target.value)}
                    placeholder="5 days"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    aria-label={`Remove medicine ${i + 1}`}
                    className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                  >
                    <HiOutlineTrash className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-400">
                  No medicines. Saving now records an empty prescription.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={addRow}
        className="mt-3 flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
      >
        <HiOutlinePlus className="h-3.5 w-3.5" />
        Add medicine
      </button>

      {errorMsg && <p className="mt-3 text-sm text-red-600">{errorMsg}</p>}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save prescription"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
        >
          Cancel
        </button>
        <p className="ml-1 text-xs text-slate-400">
          Verify the prescription after saving to enable printing.
        </p>
      </div>
    </div>
  );
}
