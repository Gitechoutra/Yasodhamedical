import { useCallback, useEffect, useState } from "react";
import { HiOutlineArchiveBox } from "react-icons/hi2";
import { fetchBrands } from "../../services/pharmacyService";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "in", label: "In stock" },
  { key: "out", label: "Out of stock" },
  { key: "low", label: "Low" },
];

/** The catalogue with this branch's quantity against each row. */
export default function Inventory() {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("all");
  const [term, setTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    return fetchBrands()
      .then((rows) => {
        setRows(rows);
        setErrorMsg("");
      })
      .catch((err) => setErrorMsg(err.response?.data?.message || "Could not load inventory."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const matchesFilter = (r) => {
    if (filter === "in") return r.quantity > 0;
    if (filter === "out") return r.quantity === 0;
    if (filter === "low") return r.low_stock;
    return true;
  };

  const needle = term.trim().toLowerCase();
  const visible = rows.filter(
    (r) =>
      matchesFilter(r) &&
      (!needle ||
        `${r.brand_name} ${r.generic_name || ""} ${r.category || ""}`
          .toLowerCase()
          .includes(needle))
  );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
          <p className="mt-1 text-sm text-slate-500">
            {visible.length} of {rows.length} medicines
          </p>
        </div>
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Filter this list…"
          className="rounded-xl border border-slate-200 px-3.5 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              filter === f.key
                ? "bg-emerald-600 text-white shadow-md"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {errorMsg && (
        <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      {loading ? (
        <div className="mt-6 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
          <HiOutlineArchiveBox className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-600">Nothing matches.</p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-6 py-3 font-medium">Medicine</th>
                <th className="px-6 py-3 font-medium">Used for</th>
                <th className="px-6 py-3 font-medium">Category</th>
                <th className="px-6 py-3 font-medium">Form</th>
                <th className="px-6 py-3 font-medium">Qty</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-6 py-3">
                    <p className="font-semibold text-slate-800">{r.display_name}</p>
                    <p className="text-xs text-slate-400">
                      {r.generic_name || "—"}
                      {r.manufacturer ? ` · ${r.manufacturer}` : ""}
                    </p>
                  </td>
                  <td className="max-w-xs px-6 py-3 text-xs text-slate-500">
                    {r.used_for || "—"}
                  </td>
                  <td className="px-6 py-3 text-slate-500">{r.category || "—"}</td>
                  <td className="px-6 py-3 text-slate-500">{r.form_label}</td>
                  <td className="px-6 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                        r.quantity === 0
                          ? "bg-red-100 text-red-700"
                          : r.low_stock
                            ? "bg-amber-100 text-amber-700"
                            : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {r.quantity}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
