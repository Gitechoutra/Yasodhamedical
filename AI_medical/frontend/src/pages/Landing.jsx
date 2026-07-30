import { Link } from "react-router-dom";
import { HiArrowRight, HiOutlineSparkles } from "react-icons/hi2";
import { motion } from "framer-motion";
import Logo from "../components/Logo";

function ConversationPreview() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="relative w-full max-w-sm rounded-3xl border border-white/60 bg-white/80 p-5 shadow-2xl shadow-brand-900/10 backdrop-blur-xl"
    >
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-800">Doctor</p>
        <p className="text-[11px] text-slate-400">10:30 AM</p>
      </div>

      <div className="space-y-3">
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-2.5 text-sm text-slate-700">
          How are you feeling today?
        </div>
        <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-brand-600 px-4 py-2.5 text-sm text-white">
          I have fever and headache since yesterday.
        </div>
        <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-2.5 text-sm text-slate-700">
          Thank you for sharing. I&apos;ll help the doctor summarize and
          suggest the best possible treatment.
        </div>
      </div>

      <div className="mt-5 flex items-center justify-center gap-1.5 rounded-full bg-slate-50 py-3">
        {[3, 6, 10, 14, 10, 6, 3, 8, 12, 6, 3].map((h, i) => (
          <span
            key={i}
            className="w-1 rounded-full bg-brand-400"
            style={{ height: `${h}px` }}
          />
        ))}
      </div>

      <div className="mt-4 flex justify-center">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/40">
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
            <path d="M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3z" />
            <path d="M19 11a1 1 0 10-2 0 5 5 0 01-10 0 1 1 0 10-2 0 7 7 0 006 6.93V20H9a1 1 0 100 2h6a1 1 0 100-2h-2v-2.07A7 7 0 0019 11z" />
          </svg>
        </div>
      </div>
    </motion.div>
  );
}

export default function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-brand-50 via-white to-indigo-50">
      <div className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-brand-200/40 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 -right-24 h-96 w-96 rounded-full bg-indigo-200/40 blur-3xl" />

      <header className="relative mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
        <Logo />
        <Link
          to="/login"
          className="rounded-full border border-slate-200 bg-white/70 px-5 py-2 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur transition hover:border-brand-300 hover:text-brand-700"
        >
          Sign in
        </Link>
      </header>

      <main className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 px-6 pb-24 pt-8 lg:grid-cols-2 lg:px-10">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3.5 py-1.5 text-xs font-semibold text-brand-700">
            <HiOutlineSparkles className="h-3.5 w-3.5" />
            AI-Powered Healthcare
          </span>

          <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl">
            Intelligent Conversations,{" "}
            <span className="bg-gradient-to-r from-brand-500 to-indigo-500 bg-clip-text text-transparent">
              Better Healthcare
            </span>
          </h1>

          <p className="mt-5 max-w-lg text-base leading-relaxed text-slate-500">
            AI-powered voice conversations between doctors and patients with
            intelligent summaries, prescriptions and comprehensive treatment
            reports.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:shadow-xl hover:shadow-brand-500/40"
            >
              Get Started
              <HiArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#learn-more"
              className="rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300"
            >
              Learn More
            </a>
          </div>
        </div>

        <div className="flex justify-center lg:justify-end">
          <ConversationPreview />
        </div>
      </main>
    </div>
  );
}
