import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import DistrictLayout from './pages/DistrictLayout';
import DistrictHomePage from './pages/DistrictHomePage';
import DistrictAppsPage from './pages/DistrictAppsPage';

import DistrictStaffPage from './pages/DistrictStaffPage';
import DistrictAdminPage from './pages/DistrictAdminPage';
import DistrictActivityLogPage from './pages/DistrictActivityLogPage';
import DistrictAddAppPage from './pages/DistrictAddAppPage';
import DistrictSettingsPage from './pages/DistrictSettingsPage';
import DistrictRequestsPage from './pages/DistrictRequestsPage';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        
        {/* Single Tenant Routes */}
        <Route path="/" element={<DistrictLayout />}>
          <Route index element={<Navigate to="apps" replace />} />
          <Route path="apps" element={<DistrictAppsPage />} />
          <Route path="apps/add" element={<DistrictAddAppPage />} />
          <Route path="staff" element={<DistrictStaffPage />} />
          <Route path="admin" element={<DistrictAdminPage />} />
          <Route path="settings" element={<DistrictSettingsPage />} />
          <Route path="activity" element={<DistrictActivityLogPage />} />
          <Route path="requests" element={<DistrictRequestsPage />} />
        </Route>
        
        {/* Catch all - redirect to users' home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
