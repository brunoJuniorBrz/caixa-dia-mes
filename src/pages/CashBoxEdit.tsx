import { useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { CashBoxForm } from '@/features/cash-box/components/CashBoxForm';

export default function CashBoxEdit() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as { returnTo?: string; filters?: any })?.returnTo;
  const filters = (location.state as { returnTo?: string; filters?: any })?.filters;

  useEffect(() => {
    if (!id) {
      navigate('/dashboard', { replace: true });
      return;
    }
    if (user && user.role !== 'vistoriador' && user.role !== 'admin') {
      navigate('/dashboard', { replace: true });
    }
  }, [id, user, navigate]);

  if (!id || (user && user.role !== 'vistoriador' && user.role !== 'admin')) {
    return null;
  }

  return <CashBoxForm mode="edit" cashBoxId={id} returnTo={returnTo} returnFilters={filters} />;
}
