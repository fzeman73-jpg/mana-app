import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { inviteUser, removeUser, toggleUserRole } from "@/lib/actions"
import Image from "next/image"
import { redirect } from "next/navigation"

export default async function AdminPage() {
  const session = await auth()
  
  // 1. KONTROLA ROLE: Pokud není uživatel v DB jako ADMIN, nepustíme ho sem
  const user = await prisma.user.findUnique({ 
    where: { email: session?.user?.email || "" } 
  })

  if (user?.role !== "ADMIN") {
    redirect("/") // Automatický odsun na hlavní stránku, pokud není admin
  }

  // 2. NAČTENÍ SEZNAMU POVOLENÝCH UŽIVATELŮ
  const allowedUsers = await prisma.user.findMany({
    where: { isAllowed: true },
    orderBy: { email: 'asc' }
  })

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans selection:bg-blue-100">
      <div className="max-w-5xl mx-auto space-y-10">
        
        {/* HLAVIČKA PANELU */}
        <header className="flex flex-col md:flex-row justify-between items-center bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 gap-6">
           <div className="flex items-center gap-6">
              <Image 
                src="/algotech-logo.png" 
                alt="Algotech" 
                width={140} 
                height={45} 
                className="object-contain"
              />
              <div className="w-px h-10 bg-slate-100 hidden md:block"></div>
              <div>
                <h1 className="text-2xl font-black italic uppercase tracking-tighter text-slate-900">
                  User <span className="text-blue-600 font-black">Control</span>
                </h1>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Access & Whitelist Management</p>
              </div>
           </div>
           <a href="/" className="group flex items-center gap-2 bg-slate-950 text-white px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-blue-600 transition-all shadow-xl shadow-slate-200">
             <span>← Back to Cockpit</span>
           </a>
        </header>

        {/* FORMULÁŘ PRO POZVÁNÍ (Whitelist) */}
        <section className="bg-slate-900 p-12 rounded-[3.5rem] text-white shadow-2xl relative overflow-hidden ring-1 ring-white/10">
          <div className="relative z-10">
            <h2 className="text-blue-500 text-[11px] font-black uppercase tracking-[0.4em] mb-8 italic">Authorize New Access</h2>
            <form action={inviteUser} className="flex flex-col lg:flex-row gap-4">
              <input 
                name="name" 
                placeholder="Full Name (e.g. John Doe)" 
                className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-6 py-4 font-bold text-sm outline-none focus:ring-2 ring-blue-500 transition-all placeholder:text-slate-600" 
                required 
              />
              <input 
                name="email" 
                type="email" 
                placeholder="Google Email (@algotech.cz)" 
                className="flex-[1.5] bg-white/5 border border-white/10 rounded-2xl px-6 py-4 font-bold text-sm outline-none focus:ring-2 ring-blue-500 transition-all placeholder:text-slate-600" 
                required 
              />
              <button type="submit" className="bg-blue-600 hover:bg-white hover:text-blue-600 transition-all px-10 py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-lg shadow-blue-900/20 active:scale-95">
                Grant Access
              </button>
            </form>
          </div>
          <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-blue-600 rounded-full opacity-10 blur-[100px]"></div>
        </section>

        {/* TABULKA UŽIVATELŮ */}
        <section className="bg-white rounded-[3rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-8 border-b border-slate-50 flex justify-between items-center">
            <h3 className="font-black text-slate-900 uppercase italic tracking-tight">Active Whitelist</h3>
            <span className="bg-slate-50 text-slate-400 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest border border-slate-100">
              {allowedUsers.length} Users Authorized
            </span>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                  <th className="px-10 py-6">Manager Identity</th>
                  <th className="px-10 py-6">System Role</th>
                  <th className="px-10 py-6 text-right">Administrative Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {allowedUsers.map(u => (
                  <tr key={u.id} className="group hover:bg-blue-50/30 transition-colors">
                    <td className="px-10 py-8">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-black text-slate-400 text-xs border border-slate-200">
                          {u.name?.charAt(0) || u.email?.charAt(0)}
                        </div>
                        <div>
                          <p className="font-black text-slate-900 text-sm uppercase tracking-tight italic">{u.name || "Pending login..."}</p>
                          <p className="text-[11px] font-bold text-slate-400 mt-0.5">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-10 py-8 text-center sm:text-left">
                      <span className={`text-[9px] font-black px-4 py-1.5 rounded-full uppercase tracking-[0.2em] shadow-sm ${
                        u.role === 'ADMIN' 
                          ? 'bg-slate-900 text-blue-400 ring-1 ring-blue-500/30' 
                          : 'bg-slate-100 text-slate-400'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-10 py-8 text-right">
                      <div className="flex justify-end items-center gap-6">
                        {/* PŘEPÍNAČ ROLE */}
                        <form action={toggleUserRole.bind(null, u.id, u.role)}>
                          <button className="text-[10px] font-black text-slate-300 hover:text-blue-600 uppercase tracking-widest transition-colors decoration-blue-500/30 decoration-2 underline-offset-4 hover:underline">
                            Change Role
                          </button>
                        </form>
                        
                        {/* SMAZÁNÍ (Revoke access) */}
                        <form action={removeUser.bind(null, u.id)}>
                          <button className="bg-slate-50 hover:bg-red-50 text-slate-300 hover:text-red-500 p-3 rounded-xl transition-all border border-transparent hover:border-red-100">
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
              <p className="text-slate-300 font-black italic text-sm uppercase tracking-widest">No managers currently authorized.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}