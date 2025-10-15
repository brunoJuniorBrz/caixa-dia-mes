import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from '@supabase/supabase-js';

export type AppRole = 'admin' | 'vistoriador';

export interface AppUser {
  id: string;
  store_id: string | null;
  auth_user_id: string | null;
  email: string;
  name: string;
  role: AppRole;
  is_active: boolean;
}

export async function getSession(): Promise<Session | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function getCurrentUser(): Promise<User | null> {
  const session = await getSession();
  return session?.user ?? null;
}

export async function getCurrentAppUser(): Promise<AppUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', user.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as AppUser;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function isAdmin(user: AppUser | null): boolean {
  return user?.role === 'admin';
}

export function isVistoriador(user: AppUser | null): boolean {
  return user?.role === 'vistoriador';
}
