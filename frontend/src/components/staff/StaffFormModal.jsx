import { useEffect, useState } from "react";
import Modal from "../Modal";
import { createStaff, updateStaff } from "../../services/staffService";

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const label = "mb-1 block text-xs font-semibold text-slate-600";

export const ROLE_LABELS = {
  doctor: "Doctor",
  nurse: "Nurse",
  receptionist: "Receptionist",
  pharmacist: "Pharmacist",
  lab_technician: "Lab Technician",
  accountant: "Accountant",
  other_staff: "Other Staff",
};

/**
 * Which extra fields each role shows.
 *
 * One table rather than conditionals scattered through the JSX: when the
 * hospital tells us what they actually collect, this is the object that
 * changes, and the form re-renders itself.
 */
const ROLE_FIELDS = {
  doctor: ["department", "specialization", "designation", "registration_no", "years_experience"],
  nurse: ["department", "designation", "registration_no"],
  receptionist: ["department"],
  pharmacist: ["branch", "designation", "registration_no"],
  lab_technician: ["department", "lab_department", "qualification", "designation"],
  accountant: ["designation", "qualification"],
  other_staff: ["department", "designation"],
};

// Fields the server refuses to create the account without, because the role's
// operational profile cannot exist otherwise.
const REQUIRED_BY_ROLE = { doctor: ["department"], nurse: ["department"], pharmacist: ["branch"] };

const REGISTRATION_LABELS = {
  doctor: "Medical registration number",
  nurse: "Nursing registration number",
  pharmacist: "Pharmacy license number",
};

const EMPTY = {
  name: "",
  email: "",
  password: "",
  confirm_password: "",
  role: "",
  phone: "",
  gender: "",
  date_of_birth: "",
  joined_on: "",
  department_id: "",
  branch_id: "",
  designation: "",
  employee_code: "",
  registration_no: "",
  specialization: "",
  years_experience: "",
  lab_department: "",
  qualification: "",
  notes: "",
  is_active: true,
};

export default function StaffFormModal({ staff, options, onClose, onSaved }) {
  const editing = Boolean(staff);

  const [form, setForm] = useState(() => {
    if (!staff) return EMPTY;
    const p = staff.profile || {};
    return {
      ...EMPTY,
      name: staff.name || "",
      email: staff.email || "",
      role: staff.role || "",
      is_active: staff.is_active,
      phone: p.phone || "",
      gender: p.gender || "",
      date_of_birth: p.date_of_birth || "",
      joined_on: p.joined_on || "",
      department_id: p.department_id || "",
      branch_id: p.branch_id || "",
      designation: p.designation || "",
      employee_code: p.employee_code || "",
      registration_no: p.registration_no || "",
      specialization: p.specialization || "",
      years_experience: p.years_experience ?? "",
      lab_department: p.lab_department || "",
      qualification: p.qualification || "",
      notes: p.notes || "",
    };
  });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const update = (key) => (e) =>
    setForm((f) => ({
      ...f,
      [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value,
    }));

  const shown = ROLE_FIELDS[form.role] || [];
  const required = REQUIRED_BY_ROLE[form.role] || [];
  const designations = options.designations?.[form.role] || [];

  // Clear fields that no longer apply when the role changes, so a doctor's
  // specialization cannot be silently saved against an accountant.
  useEffect(() => {
    if (!form.role) return;
    const keep = new Set(ROLE_FIELDS[form.role] || []);
    setForm((f) => ({
      ...f,
      specialization: keep.has("specialization") ? f.specialization : "",
      years_experience: keep.has("years_experience") ? f.years_experience : "",
      lab_department: keep.has("lab_department") ? f.lab_department : "",
      qualification: keep.has("qualification") ? f.qualification : "",
      registration_no: keep.has("registration_no") ? f.registration_no : "",
      department_id: keep.has("department") ? f.department_id : "",
      branch_id: keep.has("branch") ? f.branch_id : "",
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.role]);

  const mismatch =
    form.confirm_password.length > 0 && form.password !== form.confirm_password;

  // Trivial to compute and `required` is rebuilt each render anyway, so a
  // memo here would cost more than it saves.
  const missing = required.filter((r) =>
    r === "department" ? !form.department_id : r === "branch" ? !form.branch_id : false
  );

  async function handleSubmit(e) {
    e.preventDefault();
    if (mismatch) {
      setErrorMsg("Those passwords do not match.");
      return;
    }
    setSaving(true);
    setErrorMsg("");
    try {
      const payload = { ...form };
      // Blank means "leave it" on edit; on create the server requires one.
      if (editing && !payload.password) {
        delete payload.password;
        delete payload.confirm_password;
      }
      if (editing) {
        await updateStaff(staff.id, payload);
      } else {
        await createStaff(payload);
      }
      onSaved();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Could not save this staff member.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={editing ? `Edit ${staff.name}` : "Add staff member"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={label}>Role *</label>
          <select required className={input} value={form.role} onChange={update("role")}>
            <option value="">Select a role</option>
            {(options.roles || []).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r] || r}
              </option>
            ))}
          </select>
          {editing && staff.has_records && (
            <p className="mt-1 text-[11px] text-amber-600">
              This account has clinical records — its role cannot be changed.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>Full name *</label>
            <input required className={input} value={form.name} onChange={update("name")} />
          </div>
          <div>
            <label className={label}>Email *</label>
            <input
              required
              type="email"
              className={input}
              value={form.email}
              onChange={update("email")}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className={label}>Mobile number</label>
            <input className={input} value={form.phone} onChange={update("phone")} />
          </div>
          <div>
            <label className={label}>Gender</label>
            <select className={input} value={form.gender} onChange={update("gender")}>
              <option value="">Select</option>
              {(options.genders || []).map((g) => (
                <option key={g} value={g} className="capitalize">
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Date of birth</label>
            <input
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              className={input}
              value={form.date_of_birth}
              onChange={update("date_of_birth")}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>Employee code</label>
            <input
              className={input}
              value={form.employee_code}
              onChange={update("employee_code")}
              placeholder="Optional — reserved for hospital IDs"
            />
          </div>
          <div>
            <label className={label}>Joined on</label>
            <input
              type="date"
              className={input}
              value={form.joined_on}
              onChange={update("joined_on")}
            />
          </div>
        </div>

        {/* Everything below depends on the role selected above. */}
        {form.role && (
          <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
              {ROLE_LABELS[form.role]} details
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {shown.includes("department") && (
                <div>
                  <label className={label}>
                    Department {required.includes("department") ? "*" : ""}
                  </label>
                  <select
                    className={input}
                    value={form.department_id}
                    onChange={update("department_id")}
                  >
                    <option value="">Select a department</option>
                    {(options.departments || []).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {shown.includes("branch") && (
                <div>
                  <label className={label}>
                    Branch {required.includes("branch") ? "*" : ""}
                  </label>
                  <select
                    className={input}
                    value={form.branch_id}
                    onChange={update("branch_id")}
                  >
                    <option value="">Select a branch</option>
                    {(options.branches || []).map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {shown.includes("designation") && (
                <div>
                  <label className={label}>Designation</label>
                  {designations.length > 0 ? (
                    <select
                      className={input}
                      value={form.designation}
                      onChange={update("designation")}
                    >
                      <option value="">Select</option>
                      {designations.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className={input}
                      value={form.designation}
                      onChange={update("designation")}
                    />
                  )}
                </div>
              )}

              {shown.includes("specialization") && (
                <div>
                  <label className={label}>Specialization</label>
                  <input
                    className={input}
                    value={form.specialization}
                    onChange={update("specialization")}
                    placeholder="e.g. Orthopedic Surgeon"
                  />
                </div>
              )}

              {shown.includes("registration_no") && (
                <div>
                  <label className={label}>
                    {REGISTRATION_LABELS[form.role] || "Registration number"}
                  </label>
                  <input
                    className={input}
                    value={form.registration_no}
                    onChange={update("registration_no")}
                  />
                </div>
              )}

              {shown.includes("years_experience") && (
                <div>
                  <label className={label}>Years of experience</label>
                  <input
                    type="number"
                    min="0"
                    max="70"
                    className={input}
                    value={form.years_experience}
                    onChange={update("years_experience")}
                  />
                </div>
              )}

              {shown.includes("lab_department") && (
                <div>
                  <label className={label}>Lab department</label>
                  <input
                    className={input}
                    value={form.lab_department}
                    onChange={update("lab_department")}
                    placeholder="e.g. Pathology, Radiology"
                  />
                </div>
              )}

              {shown.includes("qualification") && (
                <div>
                  <label className={label}>Qualification</label>
                  <input
                    className={input}
                    value={form.qualification}
                    onChange={update("qualification")}
                    placeholder="e.g. B.Sc MLT"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>{editing ? "New password" : "Password *"}</label>
            <input
              required={!editing}
              type="password"
              minLength={8}
              autoComplete="new-password"
              className={input}
              value={form.password}
              onChange={update("password")}
              placeholder={editing ? "Leave blank to keep current" : "At least 8 characters"}
            />
          </div>
          <div>
            <label className={label}>Confirm password{editing ? "" : " *"}</label>
            <input
              required={!editing}
              type="password"
              autoComplete="new-password"
              className={`${input} ${mismatch ? "border-red-300" : ""}`}
              value={form.confirm_password}
              onChange={update("confirm_password")}
            />
            {mismatch && (
              <p className="mt-1 text-[11px] font-medium text-red-600">
                Passwords do not match.
              </p>
            )}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={update("is_active")}
            className="h-4 w-4 rounded border-slate-300"
          />
          Account active — an inactive account cannot sign in
        </label>

        <div>
          <label className={label}>Notes</label>
          <textarea
            rows={2}
            className={input}
            value={form.notes}
            onChange={update("notes")}
          />
        </div>

        {missing.length > 0 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            A {ROLE_LABELS[form.role]} needs a {missing.join(" and ")} before the account
            can be created.
          </p>
        )}
        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

        <button
          type="submit"
          disabled={saving || mismatch || missing.length > 0}
          className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
        >
          {saving ? "Saving…" : editing ? "Save changes" : "Create staff account"}
        </button>
      </form>
    </Modal>
  );
}
