import { NavLink } from "react-router-dom";
import {
  HiOutlineAcademicCap,
  HiOutlineBeaker,
  HiOutlineSquares2X2,
  HiOutlineUsers,
  HiOutlineCalendarDays,
  HiOutlineChatBubbleLeftRight,
  HiOutlineFolderOpen,
  HiOutlineClipboardDocumentList,
  HiOutlineHeart,
  HiOutlineDocumentChartBar,
  HiOutlineUserGroup,
  HiOutlineBuildingOffice2,
  HiOutlineClock,
  HiOutlineIdentification,
  HiOutlineCalendarDays as HiOutlineShiftCalendar,
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
// prescriptions, reports and the nursing record are hidden, and the API
// returns 403 for every one of them, so a stale bookmark fails server-side
// too rather than relying on this list.
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
  // Courses of treatment: where a doctor picks an ongoing case back up to add
  // a session, and where a finished one gets its consolidated report.
  {
    to: "/dashboard/cases",
    label: "Cases",
    icon: HiOutlineFolderOpen,
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
  // Lab tests a doctor has ordered, and the discussion with the technician
  // running each one. Clinical, so hidden from reception.
  {
    to: "/dashboard/lab",
    label: "Lab Tests",
    icon: HiOutlineBeaker,
    hideFrom: ["receptionist"],
  },
  {
    to: "/dashboard/reports",
    label: "Reports",
    icon: HiOutlineDocumentChartBar,
    hideFrom: ["receptionist"],
  },
  // What the AI has learned from doctor-approved prescriptions, and what it
  // is therefore suggesting from. Clinical, so hidden from reception.
  {
    to: "/dashboard/knowledge",
    label: "Knowledge Base",
    icon: HiOutlineAcademicCap,
    hideFrom: ["receptionist"],
  },
  // No standalone Medicines section. The catalogue is the pharmacy's, and a
  // doctor only ever meets it while prescribing — the picker in the
  // consultation room reads the same formulary, so a browse-only copy of it
  // on the dashboard was a second door onto data nobody edits from here.
  // `end`: Availability sits underneath this path, and without it both entries
  // would highlight at once.
  {
    to: "/dashboard/doctors",
    label: "Doctors",
    icon: HiOutlineUserGroup,
    end: true,
    hideFrom: ["doctor"],
  },
  // When each doctor is in. Front-desk work — the API allows admin and
  // reception only — and hidden from doctors like the rest of this group.
  {
    to: "/dashboard/doctors/availability",
    label: "Availability",
    icon: HiOutlineClock,
    hideFrom: ["doctor"],
  },
  {
    to: "/dashboard/departments",
    label: "Departments",
    icon: HiOutlineBuildingOffice2,
    hideFrom: ["doctor"],
  },
  // Creating one of these issues a working login, so it is admin-only — the
  // route is blocked in AppRouter and the API 403s every other role.
  {
    to: "/dashboard/staff",
    label: "Staff",
    icon: HiOutlineIdentification,
    hideFrom: ["doctor", "receptionist"],
  },
  // Everyone sees this entry, but not the same page: admin gets the
  // hospital rota to manage, every other role gets their own shifts
  // read-only. Shifts.jsx decides, so there is no hideFrom here.
  { to: "/dashboard/shifts", label: "Shifts", icon: HiOutlineShiftCalendar },
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
