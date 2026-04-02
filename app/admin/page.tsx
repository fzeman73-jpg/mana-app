import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { inviteUser, removeUser, toggleUserRole, updateGlobalSettings } from "@/lib/actions"
import Image from "next/image"
import { redirect } from "next/navigation"

export default async function AdminPage() {
  const session = await auth()

  const user = await prisma.user.findUnique({
    where: { email: session?.user?.email || "" }
  })

  if (user?.role !== "ADMIN") {
    redirect("/")
  }

  const [allowedUsers, globalSettings] = await Promise.all([
    prisma.user.findMany({ where: { isAllowed: true }, orderBy: { email: 'asc' } }),
    prisma.globalSettings.findUnique({ where: { id: "global" } }),
  ])

  return (
    <div className="min-h-screen bg-brand-navy p-8 font-sans selection:bg-brand-cyan/20">
      <div className="max-w-5xl mx-auto space-y-10">

        {/* HLAVIČKA */}
        <header className="flex flex-col md:flex-row justify-between items-center bg-brand-navy-card p-10 rounded-[3rem] shadow-lg border border-brand-cyan/10 gap-6">
          <div className="flex items-center gap-6">
            <Image
              src="/algotech-logo.png"
              alt="Algotech"
              width={140}
              height={45}
              className="object-contain"
            />
            <div className="w-px h-10 bg-brand-cyan/20 hidden md:block"></div>
            <div>
              <h1 className="text-2xl font-black italic uppercase tracking-tighter text-white">
                User <span className="text-brand-cyan font-black">Control</span>
              </h1>
              <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Access & Whitelist Management</p>
            </div>
          </div>
          <a href="/" className="flex items-center gap-2 bg-brand-cyan text-brand-navy px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-brand-pink hover:text-white transition-all shadow-xl">
            <span>← Back to Cockpit</span>
          </a>
        </header>

        {/* FORMULÁŘ PRO POZVÁNÍ */}
        <section className="bg-brand-navy-deep p-12 rounded-[3.5rem] text-white shadow-2xl relative overflow-hidden ring-1 ring-brand-cyan/10">
          <div className="relative z-10">
            <h2 className="text-brand-cyan text-[11px] font-black uppercase tracking-[0.4em] mb-8 italic">Authorize New Access</h2>
            <form action={inviteUser} className="flex flex-col lg:flex-row gap-4">
              <input
                name="name"
                placeholder="Full Name (e.g. John Doe)"
                className="flex-1 bg-white/5 border border-brand-cyan/20 rounded-2xl px-6 py-4 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all placeholder:text-white/20"
                required
              />
              <input
                name="email"
                type="email"
                placeholder="Google Email (@algotech.cz)"
                className="flex-[1.5] bg-white/5 border border-brand-cyan/20 rounded-2xl px-6 py-4 font-bold text-sm outline-none focus:ring-2 ring-brand-cyan transition-all placeholder:text-white/20"
                required
              />
              <button type="submit" className="bg-brand-cyan text-brand-navy hover:bg-brand-pink hover:text-white transition-all px-10 py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-lg active:scale-95">
                Grant Access
              </button>
            </form>
          </div>
          <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-brand-cyan rounded-full opacity-5 blur-[100px]"></div>
        </section>

        {/* GLOBÁLNÍ PARAMETRY MODELU */}
        <section className="bg-brand-navy-card p-12 rounded-[3.5rem] border border-brand-cyan/10 shadow-lg relative overflow-hidden">
          <h2 className="text-brand-cyan text-[11px] font-black uppercase tracking-[0.4em] mb-8 italic">Global Model Parameters</h2>
          <form action={updateGlobalSettings} className="flex flex-col lg:flex-row gap-6 items-end">
            <div className="flex-1 space-y-2">
              <label className="text-[10px] font-black text-brand-cyan/60 uppercase tracking-widest block ml-1">Current EBITDA (CZK)</label>
              <input name="currentEbitda" type="number" step="1" defaultValue={globalSettings?.currentEbitda ?? 50000000} className="w-full bg-brand-navy rounded-2xl px-6 py-4 font-black border-2 border-brand-cyan/10 focus:border-brand-cyan focus:bg-brand-navy-deep outline-none transition-all text-white shadow-inner" />
            </div>
            <div className="flex-1 space-y-2">
              <label className="text-[10px] font-black text-brand-cyan/60 uppercase tracking-widest block ml-1">Base Multiplier</label>
              <input name="baseMultiplier" type="number" step="0.1" defaultValue={globalSettings?.baseMultiplier ?? 6.0} className="w-full bg-brand-navy rounded-2xl px-6 py-4 font-black border-2 border-brand-cyan/10 focus:border-brand-cyan focus:bg-brand-navy-deep outline-none transition-all text-white shadow-inner" />
            </div>
            <button type="submit" className="bg-brand-cyan text-brand-navy px-10 py-4 rounded-2xl font-black hover:bg-brand-pink hover:text-white transition-all uppercase text-[10px] tracking-[0.2em] shadow-xl active:scale-95 whitespace-nowrap">
              Update Parameters
            </button>
          </form>
          <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-brand-pink rounded-full opacity-5 blur-[100px]"></div>
        </section>

        {/* TABULKA UŽIVATELŮ */}
        <section className="bg-brand-navy-card rounded-[3rem] shadow-lg border border-brand-cyan/10 overflow-hidden">
          <div className="p-8 border-b border-brand-cyan/10 flex justify-between items-center">
            <h3 className="font-black text-white uppercase italic tracking-tight">Active Whitelist</h3>
            <span className="bg-brand-navy text-brand-cyan/60 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest border border-brand-cyan/10">
              {allowedUsers.length} Users Authorized
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-brand-navy/50 text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">
                  <th className="px-10 py-6">Manager Identity</th>
                  <th className="px-10 py-6">System Role</th>
                  <th className="px-10 py-6 text-right">Administrative Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-cyan/5">
                {allowedUsers.map(u => (
                  <tr key={u.id} className="group hover:bg-brand-cyan/5 transition-colors">
                    <td className="px-10 py-8">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-brand-navy flex items-center justify-center font-black text-brand-cyan text-xs border border-brand-cyan/20">
                          {u.name?.charAt(0) || u.email?.charAt(0)}
                        </div>
                        <div>
                          <p className="font-black text-white text-sm uppercase tracking-tight italic">{u.name || "Pending login..."}</p>
                          <p className="text-[11px] font-bold text-white/30 mt-0.5">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-10 py-8 text-center sm:text-left">
                      <span className={`text-[9px] font-black px-4 py-1.5 rounded-full uppercase tracking-[0.2em] shadow-sm ${
                        u.role === 'ADMIN'
                          ? 'bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/30'
                          : 'bg-brand-navy text-white/30 border border-brand-cyan/10'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-10 py-8 text-right">
                      <div className="flex justify-end items-center gap-6">
                        <form action={toggleUserRole.bind(null, u.id, u.role)}>
                          <button className="text-[10px] font-black text-white/20 hover:text-brand-cyan uppercase tracking-widest transition-colors hover:underline decoration-brand-cyan/30 decoration-2 underline-offset-4">
                            Change Role
                          </button>
                        </form>
                        <form action={removeUser.bind(null, u.id)}>
                          <button className="bg-brand-navy hover:bg-brand-pink/10 text-white/20 hover:text-brand-pink p-3 rounded-xl transition-all border border-transparent hover:border-brand-pink/20">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {allowedUsers.length === 0 && (
            <div className="p-20 text-center">
              <p className="text-white/20 font-black italic text-sm uppercase tracking-widest">No managers currently authorized.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
