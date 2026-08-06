import { useNavigate } from "react-router-dom";
import { HiOutlineCog6Tooth, HiOutlineMagnifyingGlass } from "react-icons/hi2";
import NotificationMenu from "./NotificationMenu";
import ProfileMenu from "./ProfileMenu";

export default function Topbar() {
  const navigate = useNavigate();

  return (
    <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8 lg:py-4">
      {/* Hidden on the smallest screens: at 375px the search box and the
          action buttons cannot both fit, and the buttons are what a user
          reaches for on a phone. */}
      <div className="hidden w-full max-w-sm items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 sm:flex">
        <HiOutlineMagnifyingGlass className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          type="text"
          placeholder="Search patients, consultations…"
          className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
        />
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        <NotificationMenu />
        <button
          onClick={() => navigate("/dashboard/settings")}
          aria-label="Settings"
          className="grid h-10 w-10 place-items-center rounded-full text-slate-500 transition hover:bg-slate-50"
        >
          <HiOutlineCog6Tooth className="h-5 w-5" />
        </button>
        <ProfileMenu />
      </div>
    </header>
  );
}
