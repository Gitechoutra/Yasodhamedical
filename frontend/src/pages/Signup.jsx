import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  HiOutlineCheckCircle,
  HiOutlineEnvelope,
  HiOutlineLockClosed,
  HiOutlineShieldCheck,
  HiOutlineUser,
} from "react-icons/hi2";
import Logo from "../components/Logo";
import { fetchRegistrationOptions, register } from "../services/registrationService";

const ROLE_LABELS = {
  doctor: "Doctor",
  nurse: "Nurse",
  receptionist: "Receptionist",
  pharmacist: "Pharmacist",
};

// Which extra field each role's profile needs before an admin can approve it.
const NEEDS_DEPARTMENT = ["doctor", "nurse"];
const NEEDS_BRANCH = ["pharmacist"];

const MIN_PASSWORD = 8;

const field =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const label = "mb-1.5 block text-xs font-semibold text-slate-600";

const EMPTY = {
  name: "",
  email: "",
  password: "",
  confirm: "",
  phone: "",
  requested_role: "",
  department_id: "",
  branch_id: "",
  license_no: "",
  specialization: "",
  note: "",
};

/**
 * Staff self-registration.
 *
 * Submitting creates a *request*, not an account — every role here can reach
 * patient data, so access is granted by an administrator rather than by
 * filling in a form. The page says so plainly rather than implying instant
 * access and disappointing the applicant at the login screen.
 */
export default function Signup() {
  const [form, setForm] = useState(EMPTY);
  const [options, setOptions] = useState({ departments: [], branches: [] });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetchRegistrationOptions()
      .then(setOptions)
      .catch(() => setOptions({ departments: [], branches: [] }));
  }, []);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const needsDepartment = NEEDS_DEPARTMENT.includes(form.requested_role);
  const needsBranch = NEEDS_BRANCH.includes(form.requested_role);
  const mismatch = form.confirm.length > 0 && form.password !== form.confirm;

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setErrorMsg("Those passwords do not match.");
      return;
    }
    setSaving(true);
    setErrorMsg("");
    try {
      // `confirm` is a UI-only field — it never goes to the server.
      const { confirm: _confirm, ...payload } = form;
      await register({
        ...payload,
        department_id: payload.department_id || null,
        branch_id: payload.branch_id || null,
      });
      setSubmitted(true);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not submit your registration.");
    } finally {
      setSaving(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-indigo-50 px-4">
        <div className="w-full max-w-md rounded-3xl border border-white/60 bg-white/85 p-8 text-center shadow-2xl shadow-brand-900/10 backdrop-blur-xl">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
            <HiOutlineCheckCircle className="h-8 w-8" />
          </div>
          <h1 className="mt-5 text-xl font-bold text-slate-900">Registration received</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            An administrator will verify your details and approve your account.
            You will be able to sign in once that is done — nothing is active
            until then.
          </p>
          <Link
            to="/login"
            className="mt-7 inline-block rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:shadow-xl"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-brand-50 via-white to-indigo-50 px-4 py-12">
      <div className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-brand-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-indigo-200/40 blur-3xl" />

      <div className="relative w-full max-w-2xl rounded-3xl border border-white/60 bg-white/85 p-8 shadow-2xl shadow-brand-900/10 backdrop-blur-xl">
        <Logo className="justify-center" />

        <h1 className="mt-6 text-center text-xl font-bold text-slate-900">
          Request a staff account
        </h1>
        <p className="mx-auto mt-2 max-w-md text-center text-sm text-slate-500">
          For hospital staff. Patients do not need an account — your doctor
          registers you at the front desk.
        </p>

        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-brand-100 bg-brand-50/60 px-4 py-3">
          <HiOutlineShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
          <p className="text-xs leading-relaxed text-slate-600">
            <span className="font-semibold text-slate-800">Approval required. </span>
            Every role here can reach patient information, so an administrator
            verifies your details before your account is activated. Submitting
            this form does not create an account or grant any access.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Full name *</label>
              <div className="relative">
                <HiOutlineUser className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  required
                  className={`${field} pl-10`}
                  value={form.name}
                  onChange={update("name")}
                  placeholder="Dr. Priya Nair"
                />
              </div>
            </div>
            <div>
              <label className={label}>Work email *</label>
              <div className="relative">
                <HiOutlineEnvelope className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  required
                  type="email"
                  autoComplete="email"
                  className={`${field} pl-10`}
                  value={form.email}
                  onChange={update("email")}
                  placeholder="you@yasodhahospitals.com"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Password *</label>
              <div className="relative">
                <HiOutlineLockClosed className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  required
                  type="password"
                  minLength={MIN_PASSWORD}
                  autoComplete="new-password"
                  className={`${field} pl-10`}
                  value={form.password}
                  onChange={update("password")}
                  placeholder="At least 8 characters"
                />
              </div>
            </div>
            <div>
              <label className={label}>Confirm password *</label>
              <input
                required
                type="password"
                autoComplete="new-password"
                className={`${field} ${mismatch ? "border-red-300 focus:border-red-400 focus:ring-red-100" : ""}`}
                value={form.confirm}
                onChange={update("confirm")}
              />
              {mismatch && (
                <p className="mt-1 text-[11px] font-medium text-red-600">
                  Passwords do not match.
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Role you are applying for *</label>
              <select
                required
                className={field}
                value={form.requested_role}
                onChange={update("requested_role")}
              >
                <option value="">Select a role</option>
                {(options.roles || Object.keys(ROLE_LABELS)).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r] || r}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-400">
                An administrator confirms the final role.
              </p>
            </div>
            <div>
              <label className={label}>Phone</label>
              <input className={field} value={form.phone} onChange={update("phone")} />
            </div>
          </div>

          {/* Only shown for the roles whose profile needs it — asking a
              receptionist for a department would be noise. */}
          {(needsDepartment || needsBranch) && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {needsDepartment && (
                <div>
                  <label className={label}>Department</label>
                  <select
                    className={field}
                    value={form.department_id}
                    onChange={update("department_id")}
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
                  <label className={label}>Branch</label>
                  <select
                    className={field}
                    value={form.branch_id}
                    onChange={update("branch_id")}
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
              {needsDepartment && form.requested_role === "doctor" && (
                <div>
                  <label className={label}>Specialization</label>
                  <input
                    className={field}
                    value={form.specialization}
                    onChange={update("specialization")}
                    placeholder="e.g. Orthopedic Surgeon"
                  />
                </div>
              )}
            </div>
          )}

          <div>
            <label className={label}>
              {form.requested_role === "pharmacist"
                ? "Pharmacy council number"
                : "Medical council / employee number"}
            </label>
            <input
              className={field}
              value={form.license_no}
              onChange={update("license_no")}
              placeholder="Helps the administrator verify you"
            />
          </div>

          <div>
            <label className={label}>Anything else the administrator should know</label>
            <textarea
              rows={2}
              className={field}
              value={form.note}
              onChange={update("note")}
              placeholder="Optional"
            />
          </div>

          {errorMsg && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={saving || mismatch}
            className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:shadow-xl hover:shadow-brand-500/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Submitting…" : "Submit registration"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
