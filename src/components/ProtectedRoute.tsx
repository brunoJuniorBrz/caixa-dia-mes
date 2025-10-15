import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import type { AppRole } from '@/types/database';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireRole?: AppRole;
}

export function ProtectedRoute({ children, requireRole }: ProtectedRouteProps) {
  const { session, user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!session || !user) {
    return <Navigate to="/login" replace />;
  }

  if (requireRole && user.role !== requireRole) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
