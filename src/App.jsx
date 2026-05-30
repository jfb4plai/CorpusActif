import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/admin/Login';
import AdminLayout from './pages/admin/AdminLayout';
import Spaces from './pages/admin/Spaces';
import SpaceDetail from './pages/admin/SpaceDetail';
import Chat from './pages/learner/Chat';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Spaces />} />
          <Route path="spaces/:spaceId" element={<SpaceDetail />} />
        </Route>
        <Route path="/chat/:token" element={<Chat />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  );
}
