import { NavLink } from "react-router-dom";
import {
  HiOutlineSquares2X2,
  HiOutlineUsers,
  HiOutlineCalendarDays,
  HiOutlineChatBubbleLeftRight,
  HiOutlineClipboardDocumentList,
  HiOutlineHeart,
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

// `hideFrom` keeps a nav item out of a role's sidebar.
//
// Doctors don't manage org structure — staff, departments and user accounts
// are admin screens. Reception doesn't do patient care at all: consultations,
// prescriptions, reports, medicines and the nursing record are hidden, and
// the API returns 403 for every one of them, so a stale bookmark fails
// server-side too rather than relying on this list.
//
// The routes are also blocked in AppRouter — keep the three in step.
const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: HiOutlineSquares2X2, end: true },
  { to: "/dashboard/patients", label: "Patients", icon: HiOutlineUsers },
  { to: "/dashboard/appointments", label: "Appointments", icon: HiOutlineCalendarDays },
  {
    to: "/dashboard/consultations",
    label: "Consultations",
    icon: HiOutlineChatBubbleLeftRight,
    hideFrom: ["receptionist"],
  },
  // Where a doctor watches the patients they've handed to a nurse. Hidden
  // from reception: assigning and reviewing nursing care is clinical work.
  {
    to: "/dashboard/nursing",
    label: "Nursing Care",
    icon: HiOutlineHeart,
    hideFrom: ["receptionist"],
  },
  {
    to: "/dashboard/prescriptions",
    label: "Prescriptions",
    icon: HiOutlineClipboardDocumentList,
    hideFrom: ["receptionist"],
  },
  {
    to: "/dashboard/reports",
    label: "Reports",
    icon: HiOutlineDocumentChartBar,
    hideFrom: ["receptionist"],
  },
  {
    to: "/dashboard/medicines",
    label: "Medicines",
    icon: HiOutlineBeaker,
    hideFrom: ["receptionist"],
  },
  { to: "/dashboard/doctors", label: "Doctors", icon: HiOutlineUserGroup, hideFrom: ["doctor"] },
  {
    to: "/dashboard/departments",
    label: "Departments",
    icon: HiOutlineBuildingOffice2,
    hideFrom: ["doctor"],
  },
  {
    to: "/dashboard/users",
    label: "Users",
    icon: HiOutlineIdentification,
    hideFrom: ["doctor"],
  },
  { to: "/dashboard/settings", label: "Settings", icon: HiOutlineCog6Tooth },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const navItems = NAV_ITEMS.filter(({ hideFrom }) => !hideFrom?.includes(user?.role));

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-slate-100 bg-white px-4 py-6">
      <Logo className="px-2" />

      <nav className="mt-8 flex-1 space-y-1 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon, end }) => (
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
