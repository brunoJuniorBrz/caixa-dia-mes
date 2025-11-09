import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Historico from "./pages/Historico";
import Receber from "./pages/Receber";
import NotFound from "./pages/NotFound";
import CashBoxNew from "./pages/CashBoxNew";
import CashBoxEdit from "./pages/CashBoxEdit";
import AdminDashboard from "./pages/AdminDashboard";
import AdminMonthlyClosure from "./pages/AdminMonthlyClosure";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute requireRole="vistoriador">
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/historico"
              element={
                <ProtectedRoute requireRole="vistoriador">
                  <Historico />
                </ProtectedRoute>
              }
            />
            <Route
              path="/receber"
              element={
                <ProtectedRoute requireRole="vistoriador">
                  <Receber />
                </ProtectedRoute>
              }
            />
            <Route
              path="/caixas/novo"
              element={
                <ProtectedRoute requireRole="vistoriador">
                  <CashBoxNew />
                </ProtectedRoute>
              }
            />
            <Route
              path="/caixas/:id"
              element={<CashBoxEdit />}
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute requireRole="admin">
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/fechamento"
              element={
                <ProtectedRoute requireRole="admin">
                  <AdminMonthlyClosure />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/historico"
              element={
                <ProtectedRoute requireRole="admin">
                  <Historico />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/receber"
              element={
                <ProtectedRoute requireRole="admin">
                  <Receber />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </TooltipProvider>
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
