import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { HiOutlineEnvelope, HiOutlineHeart, HiOutlineLockClosed } from "react-icons/hi2";
import Logo from "../../components/Logo";
import { useAuth } from "../../context/AuthContext";

/**
 * The nursing staff entrance. Separate from the doctor/admin login because
 * the two land in different modules — signing in here always ends at /nurse.
 *
 * A non-nurse account is rejected at the door rather than silently redirected:
 * being told "wrong door" is clearer than being bounced somewhere unexpected.
 */
export default function NurseLogin() {
  const { login, logout, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const redirectTo = location.state?.from?.pathname || "/nurse";

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg("");
    try {
      const user = await login(email, password);
      if (user?.role !== "nurse") {
        // Drop the session we just created — leaving a half-signed-in
        // doctor here would send them to a module they can't use.
        await logout();
        setErrorMsg("That's not a nursing account. Use the main sign-in instead.");
        return;
      }
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Unable to sign in. Please try again.");
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-teal-50 via-white to-brand-50 px-4">
      <div className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-teal-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-brand-200/40 blur-3xl" />

      <div className="relative w-full max-w-md rounded-3xl border border-white/60 bg-white/80 p-8 shadow-2xl shadow-teal-900/10 backdrop-blur-xl">
        <Logo className="justify-center" />

        <div className="mt-6 flex items-center justify-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-teal-100 text-teal-700">
            <HiOutlineHeart className="h-5 w-5" />
          </span>
          <h1 className="text-xl font-bold text-slate-900">Nursing portal</h1>
        </div>
        <p className="mt-1 text-center text-sm text-slate-500">
          Sign in to see the patients assigned to you
        </p>

        <form onSubmit={handleSubmit} className="mt-7 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Email</label>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 focus-within:border-teal-400 focus-within:ring-2 focus-within:ring-teal-100">
              <HiOutlineEnvelope className="h-4.5 w-4.5 text-slate-400" />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nurse@yasodhahospitals.com"
                className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Password</label>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 focus-within:border-teal-400 focus-within:ring-2 focus-within:ring-teal-100">
              <HiOutlineLockClosed className="h-4.5 w-4.5 text-slate-400" />
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
            </div>
          </div>

          {errorMsg && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl bg-gradient-to-r from-teal-500 to-teal-700 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-500/30 transition hover:shadow-xl hover:shadow-teal-500/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Doctor or admin?{" "}
          <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">
            Sign in here
          </Link>
        </p>
      </div>
    </div>
  );
}
