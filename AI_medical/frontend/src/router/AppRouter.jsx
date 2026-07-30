import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "../pages/Landing";
import Login from "../pages/Login";
import Dashboard from "../pages/Dashboard";
import Patients from "../pages/Patients";
import Appointments from "../pages/Appointments";
import Consultations from "../pages/Consultations";
import ConsultationRoom from "../pages/ConsultationRoom";
import Doctors from "../pages/Doctors";
import Departments from "../pages/Departments";
import DepartmentDetail from "../pages/DepartmentDetail";
import Reports from "../pages/Reports";
import Settings from "../pages/Settings";
import Profile from "../pages/Profile";
import ComingSoon from "../pages/ComingSoon";
import DashboardLayout from "../layouts/DashboardLayout";
import ProtectedRoute from "../components/ProtectedRoute";
import RoleRoute from "../components/RoleRoute";

const COMING_SOON_ROUTES = [
  { path: "prescriptions", title: "Prescriptions" },
  { path: "medicines", title: "Medicines" },
];

// Org-structure screens. Hidden from the doctor sidebar (see Sidebar.jsx) and
// unreachable by URL for doctors — keep the two lists in step.
const ADMIN_ONLY_DENY = ["doctor"];

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="patients" element={<Patients />} />
            <Route path="appointments" element={<Appointments />} />
            <Route path="consultations" element={<Consultations />} />
            <Route path="consultations/:id" element={<ConsultationRoom />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<Settings />} />
            <Route path="profile" element={<Profile />} />
            {COMING_SOON_ROUTES.map(({ path, title }) => (
              <Route key={path} path={path} element={<ComingSoon title={title} />} />
            ))}

            <Route element={<RoleRoute deny={ADMIN_ONLY_DENY} />}>
              <Route path="doctors" element={<Doctors />} />
              <Route path="departments" element={<Departments />} />
              <Route path="departments/:id" element={<DepartmentDetail />} />
              <Route path="users" element={<ComingSoon title="Users" />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
