import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { CashBoxForm } from '@/features/cash-box/components/CashBoxForm';

export default function CashBoxEdit() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

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

  return <CashBoxForm mode="edit" cashBoxId={id} />;
}
