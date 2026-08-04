import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HiOutlineCheckCircle, HiOutlinePlus } from "react-icons/hi2";
import { createBrand } from "../../services/pharmacyService";

const FORMS = [
  ["tablet", "Tablet"],
  ["capsule", "Capsule"],
  ["syrup", "Syrup"],
  ["injection", "Injection"],
  ["iv_fluid", "IV Fluid"],
  ["ointment", "Ointment / Cream"],
  ["drops", "Drops"],
  ["inhaler", "Inhaler"],
  ["sachet", "Sachet"],
  ["other", "Other"],
];

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100";
const label = "mb-1 block text-xs font-semibold text-slate-600";

const EMPTY = {
  brand_name: "",
  strength: "",
  generic_name: "",
  used_for: "",
  category: "",
  manufacturer: "",
  form: "tablet",
  reorder_level: 20,
};

/**
 * Adds a brand to the hospital-wide catalogue.
 *
 * Catalogue only — no quantity here. A product existing and a branch holding
 * some of it are different facts, and conflating them is what makes
 * cross-branch search impossible. Stock is received separately under Stock In.
 */
export default function AddMedicine() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [saved, setSaved] = useState(null);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");
    try {
      const brand = await createBrand(form);
      setSaved(brand);
      setForm(EMPTY);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not add this medicine.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-900">Add medicine</h1>
      <p className="mt-1 text-sm text-slate-500">
        Adds the brand to the catalogue for every branch. Receive quantity
        separately under Stock In.
      </p>

      {saved && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
            <HiOutlineCheckCircle className="h-5 w-5" />
            {saved.display_name} added to the catalogue.
          </p>
          <button
            onClick={() => navigate("/pharmacy/stock/in")}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-700"
          >
            Receive stock for it
          </button>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="mt-6 space-y-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Brand name *</label>
            <input
              required
              className={input}
              value={form.brand_name}
              onChange={update("brand_name")}
              placeholder="e.g. Dolo 650"
            />
          </div>
          <div>
            <label className={label}>Strength</label>
            <input
              className={input}
              value={form.strength}
              onChange={update("strength")}
              placeholder="e.g. 650mg, 100ml"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Part of what makes a brand unique — 250mg and 500mg are different
              products.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Generic / salt name</label>
            <input
              className={input}
              value={form.generic_name}
              onChange={update("generic_name")}
              placeholder="e.g. Paracetamol"
            />
          </div>
          <div>
            <label className={label}>Manufacturer</label>
            <input
              className={input}
              value={form.manufacturer}
              onChange={update("manufacturer")}
              placeholder="e.g. Micro Labs"
            />
          </div>
        </div>

        <div>
          <label className={label}>What is it used for? *</label>
          <textarea
            rows={3}
            className={input}
            value={form.used_for}
            onChange={update("used_for")}
            placeholder="e.g. Fever, mild to moderate pain, headache, body ache"
          />
          <p className="mt-1 text-[11px] text-slate-400">
            Searchable — typing &ldquo;fever&rdquo; at the counter will find this
            medicine even without the brand name.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={label}>Category</label>
            <input
              className={input}
              value={form.category}
              onChange={update("category")}
              placeholder="e.g. Antibiotic"
            />
          </div>
          <div>
            <label className={label}>Form</label>
            <select className={input} value={form.form} onChange={update("form")}>
              {FORMS.map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Reorder level</label>
            <input
              type="number"
              min="0"
              className={input}
              value={form.reorder_level}
              onChange={update("reorder_level")}
            />
            <p className="mt-1 text-[11px] text-slate-400">Below this it shows in Low Stock.</p>
          </div>
        </div>

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

        <button
          type="submit"
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
        >
          <HiOutlinePlus className="h-4 w-4" />
          {saving ? "Adding…" : "Add to catalogue"}
        </button>
      </form>
    </div>
  );
}
