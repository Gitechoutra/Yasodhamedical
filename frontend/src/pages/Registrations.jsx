import { useCallback, useEffect, useState } from "react";
import {
  HiOutlineCheckCircle,
  HiOutlineShieldCheck,
  HiOutlineXCircle,
} from "react-icons/hi2";
import Modal from "../components/Modal";
import { fetchRegistrationOptions } from "../services/registrationService";
import {
  approveRegistration,
  fetchRegistrations,
  rejectRegistration,
} from "../services/registrationService";

const FILTERS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

const NEEDS_DEPARTMENT = ["doctor", "nurse"];
const NEEDS_BRANCH = ["pharmacist"];

const field =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const label = "mb-1 block text-xs font-semibold text-slate-600";

/**
 * Approval is where the account is actually created, so the admin confirms the
 * role and supplies whatever the role profile needs. The server refuses a
 * doctor without a department or a pharmacist without a branch — this form
 * asks for them up front rather than letting the request bounce.
 */
function ReviewModal({ entry, options, onClose, onDone }) {
  const [role, setRole] = useState(entry.requested_role);
  const [departmentId, setDepartmentId] = useState(entry.department_id || "");
  const [branchId, setBranchId] = useState(entry.branch_id || "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const needsDepartment = NEEDS_DEPARTMENT.includes(role);
  const needsBranch = NEEDS_BRANCH.includes(role);

  async function act(approve) {
    setSaving(true);
    setErrorMsg("");
    try {
      if (approve) {
        await approveRegistration(entry.id, {
          role,
          department_id: departmentId || null,
          branch_id: branchId || null,
          review_note: note,
        });
      } else {
        await rejectRegistration(entry.id, { review_note: note });
      }
      onDone();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not complete this review.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Review ${entry.name}`} onClose={onClose}>
      <div className="space-y-3">
        <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm">
          <div className="col-span-2">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Email
            </dt>
            <dd className="text-slate-800">{entry.email}</dd>
          </div>
          {entry.phone && (
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Phone
              </dt>
              <dd className="text-slate-800">{entry.phone}</dd>
            </div>
          )}
          {entry.license_no && (
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Council / employee no.
              </dt>
              <dd className="text-slate-800">{entry.license_no}</dd>
            </div>
          )}
          {entry.note && (
            <div className="col-span-2">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Their note
              </dt>
              <dd className="text-slate-700">{entry.note}</dd>
            </div>
          )}
        </dl>

        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
          Verify this person works here before approving. Approval creates a
          working account with access to patient data.
        </p>

        <div>
          <label className={label}>Grant role *</label>
          <select className={field} value={role} onChange={(e) => setRole(e.target.value)}>
            {(options.roles || []).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          {role !== entry.requested_role && (
            <p className="mt-1 text-[11px] font-medium text-amber-600">
              They asked for {entry.requested_role}.
            </p>
          )}
        </div>

        {needsDepartment && (
          <div>
            <label className={label}>Department *</label>
            <select
              className={field}
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
            >
              <option value="">Select a department</option>
              {options.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {needsBranch && (
          <div>
            <label className={label}>Branch *</label>
            <select
              className={field}
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
            >
              <option value="">Select a branch</option>
              {options.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className={label}>Note (optional)</label>
          <input className={field} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => act(false)}
            disabled={saving}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
          >
            Reject
          </button>
          <button
            onClick={() => act(true)}
            disabled={saving}
            className="flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
          >
            {saving ? "Saving…" : "Approve & create account"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

const STATUS_STYLES = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-slate-200 text-slate-600",
};

export default function Registrations() {
  const [status, setStatus] = useState("pending");
  const [data, setData] = useState({ items: [], pending_count: 0 });
  const [options, setOptions] = useState({ roles: [], departments: [], branches: [] });
  const [reviewing, setReviewing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    return fetchRegistrations(status)
      .then((d) => {
        setData(d);
        setErrorMsg("");
      })
      .catch((err) =>
        setErrorMsg(err.response?.data?.message || "Could not load registrations.")
      )
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetchRegistrationOptions().then(setOptions).catch(() => {});
  }, []);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Staff registrations</h1>
          <p className="mt-1 text-sm text-slate-500">
            {data.pending_count} awaiting review — nobody has access until approved.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                status === f.key
                  ? "bg-brand-600 text-white shadow-md"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {errorMsg && (
        <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMsg}</p>
      )}

      {loading ? (
        <div className="mt-6 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
          <HiOutlineShieldCheck className="mx-auto h-9 w-9 text-emerald-400" />
          <p className="mt-2 text-sm font-medium text-slate-600">
            {status === "pending" ? "Nothing waiting for review." : "Nothing in this view."}
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {data.items.map((r) => (
            <article
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-slate-900">{r.name}</p>
                  <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold capitalize text-brand-700">
                    {r.requested_role}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
                      STATUS_STYLES[r.status]
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">{r.email}</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {[r.department, r.branch, r.license_no].filter(Boolean).join(" · ") || "—"}
                </p>
                {r.review_note && (
                  <p className="mt-1.5 text-xs italic text-slate-500">
                    &ldquo;{r.review_note}&rdquo;
                    {r.reviewed_by ? ` — ${r.reviewed_by}` : ""}
                  </p>
                )}
              </div>

              {r.status === "pending" ? (
                <button
                  onClick={() => setReviewing(r)}
                  className="shrink-0 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
                >
                  Review
                </button>
              ) : (
                <span className="shrink-0 text-xs text-slate-400">
                  {r.status === "approved" ? (
                    <HiOutlineCheckCircle className="h-6 w-6 text-emerald-500" />
                  ) : (
                    <HiOutlineXCircle className="h-6 w-6 text-slate-300" />
                  )}
                </span>
              )}
            </article>
          ))}
        </div>
      )}

      {reviewing && (
        <ReviewModal
          entry={reviewing}
          options={options}
          onClose={() => setReviewing(null)}
          onDone={() => {
            setReviewing(null);
            load();
          }}
        />
      )}
    </div>
  );
}
