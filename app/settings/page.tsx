import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import Image from "next/image"
import { redirect } from "next/navigation"
import PasswordForm from "./PasswordForm"

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.email) redirect("/")

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user || !user.isAllowed) redirect("/")

  const hasPassword = !!user.password

  return (
    <div className="min-h-screen bg-gray-50 p-8 font-sans selection:bg-brand-cyan/20">
      <div className="max-w-xl mx-auto space-y-8">

        {/* HLAVIČKA */}
        <header className="flex flex-col sm:flex-row justify-between items-center bg-white p-8 rounded-[3rem] shadow-sm border border-gray-100 gap-4">
          <div className="flex items-center gap-5">
            <a href="/"><Image src="/algotech-logo.png" alt="Algotech" width={140} height={40} className="object-contain" /></a>
            <div className="w-px h-8 bg-gray-200" />
            <div>
              <h1 className="text-lg font-black italic uppercase tracking-tighter text-gray-900">
                Nastavení <span className="text-brand-cyan">účtu</span>
              </h1>
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{user.email}</p>
            </div>
          </div>
          <a href="/" className="bg-brand-cyan text-brand-navy px-5 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-brand-pink hover:text-white transition-all shadow-sm">
            ← Cockpit
          </a>
        </header>

        {/* PROFIL */}
        <section className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-brand-cyan/10 flex items-center justify-center font-black text-brand-cyan text-xl border border-brand-cyan/20 flex-shrink-0">
            {user.name?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-gray-900 text-lg italic uppercase tracking-tight truncate">{user.name || "—"}</p>
            <p className="text-[11px] text-brand-cyan/70 font-bold mt-0.5 truncate">{user.email}</p>
          </div>
          <span className={`text-[9px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest flex-shrink-0 ${
            user.role === "ADMIN"   ? "bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/30" :
            user.role === "MANAGER" ? "bg-brand-pink/10 text-brand-pink ring-1 ring-brand-pink/30" :
                                      "bg-gray-100 text-gray-400 border border-gray-200"
          }`}>{user.role}</span>
        </section>

        {/* ZMĚNA HESLA */}
        <section className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
          <h2 className="text-[11px] font-black text-brand-cyan uppercase tracking-[0.3em] italic mb-2">
            {hasPassword ? "Změna hesla" : "Nastavit heslo"}
          </h2>
          <p className="text-[11px] text-gray-400 mb-6">
            {hasPassword
              ? "Umožňuje přihlášení emailem a heslem jako alternativa k Google přihlášení."
              : "Nastavte si heslo pro přihlášení emailem (alternativa ke Google)."}
          </p>

          <PasswordForm hasPassword={hasPassword} />
        </section>

        {/* PŘIHLAŠOVACÍ METODY */}
        <section className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
          <h2 className="text-[11px] font-black text-gray-500 uppercase tracking-[0.3em] italic mb-4">Přihlašovací metody</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-2xl border border-gray-200">
              <div className="flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                <span className="text-sm font-bold text-gray-700">Google</span>
              </div>
              <span className={`text-[9px] font-black px-2 py-1 rounded-full uppercase tracking-wider ${session.user?.image ? "bg-brand-green/10 text-brand-green" : "bg-gray-100 text-gray-400"}`}>
                {session.user?.image ? "Aktivní" : "Nepřipojeno"}
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-2xl border border-gray-200">
              <div className="flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                <span className="text-sm font-bold text-gray-700">Email + heslo</span>
              </div>
              <span className={`text-[9px] font-black px-2 py-1 rounded-full uppercase tracking-wider ${hasPassword ? "bg-brand-green/10 text-brand-green" : "bg-gray-100 text-gray-400"}`}>
                {hasPassword ? "Nastaveno" : "Nenastaveno"}
              </span>
            </div>
          </div>
        </section>

      </div>
    </div>
  )
}
