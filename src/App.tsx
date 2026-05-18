import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import { RequireAuth, RequireAdmin } from "./auth/guards";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import MyPicks from "./pages/MyPicks";
import Groups from "./pages/Groups";
import Leaderboard from "./pages/Leaderboard";
import Rules from "./pages/Rules";
import Admin from "./pages/Admin";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/picks" element={<MyPicks />} />
        <Route path="/groups" element={<Groups />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/rules" element={<Rules />} />
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <Admin />
            </RequireAdmin>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
