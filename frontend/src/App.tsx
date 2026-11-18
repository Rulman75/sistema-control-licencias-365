import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ControlLicencias from './pages/ControlLicencias';
import GestionUsuarios from './pages/GestionUsuarios';
import ReportesMovimientos from './pages/ReportesMovimientos';
import ImportarExportar from './pages/ImportarExportar';
import UsuariosSistema from './pages/UsuariosSistema';
import Mantenedores from './pages/Mantenedores';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="licencias" element={<ControlLicencias />} />
          <Route path="usuarios" element={<GestionUsuarios />} />
          <Route path="movimientos" element={<ReportesMovimientos />} />
          <Route path="importar" element={<ImportarExportar />} />
          <Route path="usuarios-sistema" element={<UsuariosSistema />} />
          <Route path="mantenedores" element={<Mantenedores />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
