import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  HiOutlineArchiveBox,
  HiOutlineArrowPath,
  HiOutlineBanknotes,
  HiOutlineExclamationTriangle,
  HiOutlineMagnifyingGlass,
  HiOutlinePlus,
} from "react-icons/hi2";
import StatCard from "../../components/StatCard";
import { useAuth } from "../../context/AuthContext";
import { fetchPharmacySummary } from "../../services/pharmacyService";

export default function PharmacyDashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    return fetchPharmacySummary()
      .then((d) => {
        setSummary(d);
        setErrorMsg("");
      })
      .catch((err) =>
        setErrorMsg(err.response?.data?.message || "Could not load the counter summary.")
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Hello, {user?.name} 💊</h1>
          <p className="mt-1 text-sm text-slate-500">
            {summary?.branch?.name || user?.branch || "Pharmacy counter"}
          </p>
        </div>
        <button
          onClick={load}
          title="Refresh"
          aria-label="Refresh"
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
        >
          <HiOutlineArrowPath className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {errorMsg && (
        <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      {loading ? (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : (
        summary && (
          <>
            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Medicines stocked"
                value={summary.in_stock}
                hint={`${summary.catalogue_size} in catalogue`}
                icon={HiOutlineArchiveBox}
                to="/pharmacy/medicines/inventory"
              />
              <StatCard
                label="Total units"
                value={summary.total_units}
                hint={`₹${summary.stock_value.toLocaleString()} at MRP`}
                icon={HiOutlineBanknotes}
                to="/pharmacy/medicines/inventory"
              />
              <StatCard
                label="Low stock"
                value={summary.low_stock}
                hint={`${summary.out_of_stock} out of stock`}
                icon={HiOutlineExclamationTriangle}
                to="/pharmacy/stock/low"
              />
              <StatCard
                label="Expiring soon"
                value={summary.expiring_soon_batches}
                hint={
                  summary.expired_units
                    ? `${summary.expired_units} units already expired`
                    : "Batches within 60 days"
                }
                icon={HiOutlineExclamationTriangle}
                to="/pharmacy/stock/expired"
              />
            </div>

            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Link
                to="/pharmacy/medicines/search"
                className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                  <HiOutlineMagnifyingGlass className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-bold text-slate-900">Search medicines</p>
                  <p className="text-xs text-slate-500">Here, or across branches</p>
                </div>
              </Link>
              <Link
                to="/pharmacy/medicines/add"
                className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                  <HiOutlinePlus className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-bold text-slate-900">Add medicine</p>
                  <p className="text-xs text-slate-500">New brand + what it treats</p>
                </div>
              </Link>
              <Link
                to="/pharmacy/stock/in"
                className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                  <HiOutlineArchiveBox className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-bold text-slate-900">Receive stock</p>
                  <p className="text-xs text-slate-500">Batch, expiry and MRP</p>
                </div>
              </Link>
            </div>
          </>
        )
      )}
    </div>
  );
}
