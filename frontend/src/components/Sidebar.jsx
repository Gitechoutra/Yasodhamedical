import { NavLink } from "react-router-dom";
import {
  HiOutlineSquares2X2,
  HiOutlineUsers,
  HiOutlineCalendarDays,
  HiOutlineChatBubbleLeftRight,
  HiOutlineClipboardDocumentList,
  HiOutlineDocumentChartBar,
  HiOutlineBeaker,
  HiOutlineUserGroup,
  HiOutlineBuildingOffice2,
  HiOutlineIdentification,
  HiOutlineCog6Tooth,
  HiOutlineArrowRightOnRectangle,
} from "react-icons/hi2";
import Logo from "./Logo";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: HiOutlineSquares2X2, end: true },
  { to: "/dashboard/patients", label: "Patients", icon: HiOutlineUsers },
  { to: "/dashboard/appointments", label: "Appointments", icon: HiOutlineCalendarDays },
  { to: "/dashboard/consultations", label: "Consultations", icon: HiOutlineChatBubbleLeftRight },
  { to: "/dashboard/prescriptions", label: "Prescriptions", icon: HiOutlineClipboardDocumentList },
  { to: "/dashboard/reports", label: "Reports", icon: HiOutlineDocumentChartBar },
  { to: "/dashboard/medicines", label: "Medicines", icon: HiOutlineBeaker },
  { to: "/dashboard/doctors", label: "Doctors", icon: HiOutlineUserGroup },
  { to: "/dashboard/departments", label: "Departments", icon: HiOutlineBuildingOffice2 },
  { to: "/dashboard/users", label: "Users", icon: HiOutlineIdentification },
  { to: "/dashboard/settings", label: "Settings", icon: HiOutlineCog6Tooth },
];

export default function Sidebar() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-slate-100 bg-white px-4 py-6">
      <Logo className="px-2" />

      <nav className="mt-8 flex-1 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                isActive
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </nav>

      <button
        onClick={handleLogout}
        className="mt-4 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 transition hover:bg-red-50 hover:text-red-600"
      >
        <HiOutlineArrowRightOnRectangle className="h-5 w-5" />
        Logout
      </button>
    </aside>
  );
}
