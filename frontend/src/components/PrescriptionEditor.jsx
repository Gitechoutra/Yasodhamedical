import { useState } from "react";
import {
  HiOutlineExclamationTriangle,
  HiOutlineTrash,
} from "react-icons/hi2";
import MedicineSearch from "./MedicineSearch";

const cellClass =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const labelClass = "mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400";

function toRow(prescription) {
  return {
    medicine_name: prescription.medicine_name || "",
    brand_id: prescription.brand_id ?? null,
    dose: prescription.dose || "",
    frequency: prescription.frequency || "",
    duration: prescription.duration || "",
    quantity: prescription.quantity || "",
    instructions: prescription.instructions || "",
    notes: prescription.notes || "",
    // Carried through so a line the AI proposed that the pharmacy doesn't
    // stock can be shown as needing replacement rather than silently failing
    // on save.
    matched_formulary: prescription.matched_formulary !== false,
  };
}

/**
 * Edits the prescription: search the pharmacy, add with +, then adjust.
 *
 * Medicines are picked rather than typed. The name field is deliberately
 * read-only — a prescription that names something the pharmacy doesn't carry
 * cannot be dispensed, and the server rejects one, so letting a doctor type
 * freely would only produce an error at save time.
 *
 * Saving sends the whole list, so what is stored is exactly what is on screen.
 */
export default function PrescriptionEditor({ prescriptions, saving, onCancel, onSave }) {
  const [rows, setRows] = useState(() => prescriptions.map(toRow));
  const [errorMsg, setErrorMsg] = useState("");

  function updateRow(index, field, value) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  function removeRow(index) {
    setRows((current) => current.filter((_, i) => i !== index));
  }

  function addMedicine(medicine) {
    setRows((current) => {
      if (current.some((r) => r.brand_id === medicine.brand_id)) return current;
      return [
        ...current,
        {
          medicine_name: medicine.name,
          brand_id: medicine.brand_id,
          dose: "",
          frequency: "",
          duration: "",
          quantity: "",
          // Pre-filled from the pharmacy's own instructions for this medicine,
          // so the common case needs no typing at all.
          instructions: medicine.usage_instructions || "",
          notes: "",
          matched_formulary: true,
        },
      ];
    });
    setErrorMsg("");
  }

  function handleSave() {
    const unstocked = rows.filter((r) => !r.matched_formulary);
    if (unstocked.length) {
      setErrorMsg(
        `${unstocked
          .map((r) => r.medicine_name)
          .join(", ")} is not in your department's pharmacy list. Remove it and pick a ` +
          "stocked medicine, or ask the pharmacy to add it."
      );
      return;
    }
    setErrorMsg("");
    onSave(rows);
  }

  const addedBrandIds = rows.map((r) => r.brand_id).filter(Boolean);

  return (
    <div>
      <div>
        <p className={labelClass}>Search medicine</p>
        <MedicineSearch alreadyAdded={addedBrandIds} onAdd={addMedicine} />
        <p className="mt-1.5 text-[11px] text-slate-400">
          Medicines come from the pharmacy's inventory for your department, in stock now.
          Press <span className="font-semibold">+</span> to add one, then set the dosage below.
        </p>
      </div>

      <div className="mt-4 space-y-3">
        {rows.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 py-10 text-center">
            <p className="text-sm font-medium text-slate-600">No medicines on this prescription.</p>
            <p className="mt-1 text-xs text-slate-400">
              Search above to add one, or save an empty prescription if none is needed.
            </p>
          </div>
        )}

        {rows.map((row, i) => (
          <div
            key={`${row.brand_id ?? "free"}-${i}`}
            className={`rounded-xl border p-4 ${
              row.matched_formulary
                ? "border-slate-200 bg-white"
                : "border-amber-200 bg-amber-50/50"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-800">{row.medicine_name}</p>
                {!row.matched_formulary && (
                  <p className="mt-1 flex items-start gap-1.5 text-xs font-medium text-amber-700">
                    <HiOutlineExclamationTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Not stocked by your department — remove it and pick a stocked medicine.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeRow(i)}
                aria-label={`Remove ${row.medicine_name}`}
                title="Remove"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
              >
                <HiOutlineTrash className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className={labelClass}>Dose</label>
                <input
                  className={cellClass}
                  value={row.dose}
                  onChange={(e) => updateRow(i, "dose", e.target.value)}
                  placeholder="1 tablet"
                />
              </div>
              <div>
                <label className={labelClass}>Frequency</label>
                <input
                  className={cellClass}
                  value={row.frequency}
                  onChange={(e) => updateRow(i, "frequency", e.target.value)}
                  placeholder="Twice daily"
                />
              </div>
              <div>
                <label className={labelClass}>Duration</label>
                <input
                  className={cellClass}
                  value={row.duration}
                  onChange={(e) => updateRow(i, "duration", e.target.value)}
                  placeholder="5 days"
                />
              </div>
              <div>
                <label className={labelClass}>Quantity</label>
                <input
                  className={cellClass}
                  value={row.quantity}
                  onChange={(e) => updateRow(i, "quantity", e.target.value)}
                  placeholder="10 tablets"
                />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Instructions for the patient</label>
                <textarea
                  rows={2}
                  className={cellClass}
                  value={row.instructions}
                  onChange={(e) => updateRow(i, "instructions", e.target.value)}
                  placeholder="Take after food with water"
                />
              </div>
              <div>
                <label className={labelClass}>Notes (not printed for the patient)</label>
                <textarea
                  rows={2}
                  className={cellClass}
                  value={row.notes}
                  onChange={(e) => updateRow(i, "notes", e.target.value)}
                  placeholder="e.g. review response before repeating"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {errorMsg && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
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
          {rows.length} medicine{rows.length === 1 ? "" : "s"} · verify after saving to enable
          printing.
        </p>
      </div>
    </div>
  );
}
