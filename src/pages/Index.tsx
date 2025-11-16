import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, Shield, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

const Index = () => {
  return (
    <div className="relative min-h-screen bg-[#0A7EA4]">
      {/* Glow effects */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-0 top-20 h-[400px] w-[400px] rounded-full bg-cyan-300/15 blur-[120px]" />
        <div className="absolute -right-40 bottom-20 h-[500px] w-[500px] rounded-full bg-blue-300/20 blur-[130px]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col px-8 py-6">
        {/* header */}
        <header className="flex items-center justify-between py-4">
          <Link to="/" className="group flex items-center gap-3 transition">
            <div className="rounded-2xl bg-white p-2.5 shadow-lg transition-transform group-hover:scale-105">
              <img src="/logo.png" alt="TOP Vistorias" className="h-10 w-10 object-contain" />
            </div>
            <div>
              <p className="text-lg font-bold text-white">TOP Vistorias</p>
              <p className="text-sm text-cyan-100">Sistema Financeiro</p>
            </div>
          </Link>
          <Button 
            size="sm" 
            className="h-11 rounded-lg bg-white/95 px-6 text-base font-medium text-cyan-900 shadow-lg transition-all hover:scale-105 hover:bg-white hover:shadow-xl" 
            asChild
          >
            <Link to="/login" className="flex items-center gap-2">
              <ArrowRight className="h-4 w-4" />
              Entrar
            </Link>
          </Button>
        </header>

        {/* hero */}
        <main className="flex flex-1 flex-col justify-center space-y-10">
          <section className="text-center py-8">
            <h1 className="animate-fade-in text-5xl font-bold leading-tight text-white lg:text-6xl">
              Sistema de Gestão
              <br />
              Financeira Automotiva
            </h1>
            <p className="mx-auto mt-5 max-w-3xl text-lg leading-relaxed text-cyan-50">
              Controle completo de fechamentos de caixa, entradas e saídas para
              vistorias automotivas com interface moderna e intuitiva.
            </p>
            
            <div className="mt-8">
              <Button 
                size="lg" 
                className="h-13 rounded-lg bg-white px-8 text-base font-semibold text-cyan-900 shadow-2xl transition-all hover:scale-105 hover:bg-cyan-50 hover:shadow-2xl" 
                asChild
              >
                <Link to="/login" className="flex items-center gap-2">
                  <ArrowRight className="h-5 w-5" />
                  Acessar Sistema
                </Link>
              </Button>
            </div>
          </section>

          {/* feature cards */}
          <section className="grid gap-6 md:grid-cols-3 py-8">
            <div className="group cursor-pointer rounded-2xl bg-white p-7 text-center shadow-xl transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-emerald-50 transition-all duration-300 group-hover:scale-110 group-hover:bg-emerald-100">
                <BarChart3 className="h-8 w-8 text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Dashboard Inteligente</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Visualize suas métricas financeiras em tempo real com gráficos e relatórios detalhados.
              </p>
            </div>

            <div className="group cursor-pointer rounded-2xl bg-white p-7 text-center shadow-xl transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-blue-50 transition-all duration-300 group-hover:scale-110 group-hover:bg-blue-100">
                <Shield className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Segurança Avançada</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Controle de acesso por usuário com diferentes níveis de permissão e auditoria completa.
              </p>
            </div>

            <div className="group cursor-pointer rounded-2xl bg-white p-7 text-center shadow-xl transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-orange-50 transition-all duration-300 group-hover:scale-110 group-hover:bg-orange-100">
                <Smartphone className="h-8 w-8 text-orange-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">100% Responsivo</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Acesse o sistema de qualquer dispositivo - desktop, tablet ou smartphone com total funcionalidade.
              </p>
            </div>
          </section>

          {/* cta */}
          <section className="rounded-2xl bg-[#0A6B8A] p-8 text-center shadow-2xl backdrop-blur-sm transition-all hover:shadow-2xl mb-6">
            <h2 className="text-2xl font-bold text-white">Pronto para começar?</h2>
            <p className="mx-auto mt-3 max-w-2xl text-base text-cyan-50">
              Faça login e comece a gerenciar suas finanças de forma eficiente.
            </p>
            <Button 
              size="lg" 
              className="mt-6 h-12 rounded-lg bg-white px-8 text-base font-semibold text-cyan-900 shadow-lg transition-all hover:scale-105 hover:bg-cyan-50" 
              asChild
            >
              <Link to="/login">
                Entrar no Sistema
              </Link>
            </Button>
          </section>
        </main>

        <footer className="border-t border-white/10 py-4 text-center text-sm text-cyan-100">
          © 2025 TOP Vistorias Automotivas. Todos os direitos reservados.
        </footer>
      </div>
    </div>
  );
};

export default Index;
