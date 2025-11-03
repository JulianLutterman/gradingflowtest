import { Navigate, Route, Routes } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ExamPage from './pages/ExamPage.jsx';
import ScanPage from './pages/ScanPage.jsx';
import MultiScanPage from './pages/MultiScanPage.jsx';
import { AuthProvider } from './hooks/useAuth.js';

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/exams/:examId" element={<ExamPage />} />
        <Route path="/exams/:examId/scan" element={<ScanPage />} />
        <Route path="/exams/:examId/multi-scan" element={<MultiScanPage />} />
        <Route path="/scan" element={<ScanPage />} />
        <Route path="/multi-scan" element={<MultiScanPage />} />
        <Route path="/" element={<DashboardPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
