import { useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import NotificationMenu from "../components/NotificationMenu";
import ProfileMenu from "../components/ProfileMenu";
import PharmacySidebar from "../components/pharmacy/PharmacySidebar";
import { useAuth } from "../context/AuthContext";

/**
 * The pharmacy module's shell. Guarded twice: unauthenticated visitors go to
 * the single login, and anyone who is not a pharmacist is sent back to their
 * own dashboard rather than shown a counter scoped to someone else's branch.
 */
export default function PharmacyLayout() {
  const { user, isAuthenticated, refreshUser } = useAuth();

  useEffect(() => {
    if (isAuthenticated) refreshUser().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== "pharmacist") return <Navigate to="/dashboard" replace />;

  return (
    <div className="flex h-screen bg-slate-50">
      <PharmacySidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-100 bg-white px-8 py-4">
          <div>
            <p className="text-sm font-semibold text-slate-800">Pharmacy counter</p>
            <p className="text-xs text-slate-400">
              {user?.branch ? `Stock for ${user.branch}` : "No branch assigned"}
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
