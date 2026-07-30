import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { useAuth } from "../context/AuthContext";

export default function DashboardLayout() {
  const { refreshUser } = useAuth();

  // The cached user in localStorage is whatever the last login returned, so a
  // session that predates a profile edit (or a new field like avatar_url)
  // would show stale details. One read on mount keeps the topbar honest;
  // a failure is ignored because the cached copy is still usable.
  useEffect(() => {
    refreshUser().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto px-8 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
