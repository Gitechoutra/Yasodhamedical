export default function ComingSoon({ title }) {
  return (
    <div className="flex h-[70vh] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-center">
      <p className="text-lg font-semibold text-slate-800">{title}</p>
      <p className="mt-1 text-sm text-slate-400">
        This module is planned for an upcoming milestone.
      </p>
    </div>
  );
}
