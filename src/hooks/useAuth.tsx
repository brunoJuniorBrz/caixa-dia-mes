import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentAppUser, signOut as authSignOut, type AppUser } from '@/lib/auth';
import type { Session } from '@supabase/supabase-js';

interface AuthContextType {
  session: Session | null;
  user: AppUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchUser = async (currentSession: Session | null) => {
    if (!currentSession) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const appUser = await getCurrentAppUser();
      setUser(appUser);
    } catch (error) {
      console.error('Error fetching user:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Set up auth listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        setSession(currentSession);
        
        // Defer user fetch to avoid deadlock
        if (currentSession) {
          setTimeout(() => {
            fetchUser(currentSession);
          }, 0);
        } else {
          setUser(null);
          setLoading(false);
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      fetchUser(currentSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await authSignOut();
    setSession(null);
    setUser(null);
    navigate('/login');
  };

  const refetch = async () => {
    if (session) {
      await fetchUser(session);
    }
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, signOut: handleSignOut, refetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
