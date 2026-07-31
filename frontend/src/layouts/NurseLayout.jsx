import { useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import NurseSidebar from "../components/nurse/NurseSidebar";
import NotificationMenu from "../components/NotificationMenu";
import ProfileMenu from "../components/ProfileMenu";
import { useAuth } from "../context/AuthContext";

/**
 * The nursing module's shell. Guards the whole tree twice over: unauthenticated
 * users go to the nurse login, and a signed-in doctor or admin is sent back to
 * their own dashboard rather than shown a module scoped to someone else's
 * assignments.
 */
export default function NurseLayout() {
  const { user, isAuthenticated, refreshUser } = useAuth();

  // Same reason as DashboardLayout: the cached user may predate a profile
  // edit. A failure is ignored because the cached copy is still usable.
  useEffect(() => {
    if (isAuthenticated) refreshUser().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isAuthenticated) {
    return <Navigate to="/nurse/login" replace />;
  }
  if (user?.role !== "nurse") {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <NurseSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-100 bg-white px-8 py-4">
          <div>
            <p className="text-sm font-semibold text-slate-800">Nursing station</p>
            <p className="text-xs text-slate-400">
              Patients assigned to you by the treating doctor
            </p>
          </div>
          <div className="flex items-center gap-2">
            <NotificationMenu />
            <ProfileMenu />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto px-8 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
