import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Lock, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { signIn } from "@/lib/auth";
import { loginSchema, type LoginInput } from "@/schemas/validation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { session, user } = useAuth();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "topcapaobonito@hotmail.com",
      password: "********"
    }
  });

  useEffect(() => {
    document.body.classList.add("login-body");
    if (session && user) {
      if (user.role === "admin") {
        navigate("/admin", { replace: true });
      } else {
        navigate("/dashboard", { replace: true });
      }
    }
    return () => {
      document.body.classList.remove("login-body");
    };
  }, [session, user, navigate]);

  const onSubmit = async (data: LoginInput) => {
    setLoading(true);
    try {
      await signIn(data.email, data.password);
      toast.success("Login realizado com sucesso!");
    } catch (error) {
      console.error("Login error:", error);
      const message =
        error instanceof Error ? error.message : "Erro ao fazer login. Verifique suas credenciais.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative h-screen overflow-hidden bg-[#0A7EA4]">
      {/* Glow effects - mesmo da página inicial */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 top-20 h-[500px] w-[500px] rounded-full bg-cyan-300/25 blur-[130px]" />
        <div className="absolute -right-40 bottom-20 h-[500px] w-[500px] rounded-full bg-blue-300/20 blur-[130px]" />
      </div>

      <div className="relative z-10 flex h-screen items-center justify-center px-6">
        <div className="w-full max-w-md">
          <div className="group rounded-3xl bg-white p-10 shadow-2xl transition-all duration-300 hover:shadow-[0_30px_80px_rgba(0,0,0,0.3)]">
            {/* Logo - Maior */}
            <div className="mb-8 flex justify-center">
              <div className="inline-block rounded-3xl bg-gradient-to-br from-cyan-50 to-blue-50 p-6 shadow-xl transition-all duration-300 group-hover:scale-105 group-hover:shadow-2xl">
                <img src="/logo.png" alt="TOP Vistorias" className="h-24 w-24 object-contain" />
              </div>
            </div>

            {/* Title */}
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-bold text-slate-900">Bem-vindo</h1>
              <p className="mt-2 text-base text-slate-600">Entre para acessar o sistema</p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-semibold text-slate-700">
                  E-mail
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-cyan-600" />
                  <input
                    id="email"
                    type="email"
                    className="h-12 w-full rounded-xl border-2 border-slate-200 bg-white pl-12 pr-4 text-base text-slate-900 placeholder:text-slate-400 transition-all focus:border-cyan-500 focus:outline-none focus:ring-4 focus:ring-cyan-500/20 disabled:opacity-50"
                    placeholder="seu@email.com"
                    {...register("email")}
                    disabled={loading}
                  />
                </div>
                {errors.email && <p className="text-sm text-red-500">{errors.email.message}</p>}
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-semibold text-slate-700">
                  Senha
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-cyan-600" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    className="h-12 w-full rounded-xl border-2 border-slate-200 bg-white pl-12 pr-12 text-base text-slate-900 placeholder:text-slate-400 transition-all focus:border-cyan-500 focus:outline-none focus:ring-4 focus:ring-cyan-500/20 disabled:opacity-50"
                    placeholder="••••••••"
                    {...register("password")}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition-all hover:scale-110 hover:text-cyan-600"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-sm text-red-500">{errors.password.message}</p>
                )}
              </div>

              <Button
                type="submit"
                className="h-13 w-full rounded-xl bg-[#0A7EA4] text-base font-semibold text-white shadow-xl transition-all hover:scale-[1.02] hover:bg-[#0A6B8A] hover:shadow-2xl disabled:opacity-50"
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                Entrar
              </Button>
            </form>
          </div>
        </div>
      </div>

      <footer className="absolute bottom-6 left-0 right-0 text-center text-sm text-white/90">
        © 2025 TOP Vistorias. Todos os direitos reservados.
      </footer>
    </main>
  );
}
