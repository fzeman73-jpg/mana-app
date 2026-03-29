import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { toggleUserRole } from "@/lib/actions"
import { redirect } from "next/navigation"

export default async function AdminPage() {
  const session = await auth()
  
  // 1. KONTROLA: Do této stránky vlezou jen lidi, co už mají v DB roli ADMIN
  const currentUser = await prisma.user.findUnique({
    where: { email: session?.user?.email || "" }
  })

  if (currentUser?.role !== "ADMIN") {
    return <div className="p-10 text-center font-black">PŘÍSTUP ZAMÍTNUT. NEJSTE ADMIN.</div>
  }

  const allUsers = await prisma.user.findMany({
    include: { compensation: true }
  })

  return (
    <div className="min-h-screen bg-slate-50 p-12">
      <div className="max-w-4xl mx-auto bg-white rounded-[2rem] shadow-xl p-10 border border-slate-100">
        <h1 className="text-3xl font-black mb-10 italic uppercase tracking-tighter">
          User <span className="text-blue-600">Management</span>
        </h1>
        
        <table className="w-full text-left font-sans">
          <thead>
            <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">
              <th className="pb-4">Uživatel</th>
              <th className="pb-4">Role</th>
              <th className="pb-4">Data</th>
              <th className="pb-4 text-right">Akce</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {allUsers.map((u) => (
              <tr key={u.id} className="group">
                <td className="py-5">
                  <p className="font-bold text-slate-800">{u.name || "Neznámý"}</p>
                  <p className="text-xs text-slate-400">{u.email}</p>
                </td>
                <td className="py-5">
                  <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${u.role === 'ADMIN' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                    {u.role}
                  </span>
                </td>
                <td className="py-5">
                  {u.compensation ? <span className="text-green-500 text-xs font-bold italic">Configured</span> : <span className="text-slate-300 text-xs">Empty</span>}
                </td>
                <td className="py-5 text-right">
                  <form action={toggleUserRole.bind(null, u.id, u.role)}>
                    <button className="text-[10px] font-black text-slate-400 hover:text-blue-600 transition-colors uppercase tracking-widest">
                      Přepnout roli
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { inviteUser, removeUser, toggleUserRole } from "@/lib/actions"
import Image from "next/image"

export default async function AdminPage() {
  const session = await auth()
  const user = await prisma.user.findUnique({ where: { email: session?.user?.email || "" } })

  if (user?.role !== "ADMIN") return <div className="p-20 text-center font-black uppercase tracking-widest text-red-500">Přístup odepřen</div>

  const allowedUsers = await prisma.user.findMany({
    where: { isAllowed: true }
  })

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* HLAVIČKA A LOGO */}
        <div className="flex justify-between items-center bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
           <div>
              <Image src="/algotech-logo.png" alt="Algotech" width={120} height={40} />
              <h1 className="text-xl font-black mt-4 italic uppercase tracking-tighter">User <span className="text-blue-600">Whitelisting</span></h1>
           </div>
           <a href="/" className="text-[10px] font-black bg-slate-100 px-6 py-3 rounded-xl uppercase tracking-widest hover:bg-slate-200 transition-all">Zpět do Cockpitu</a>
        </div>

        {/* FORMULÁŘ PRO POZVÁNÍ */}
        <div className="bg-slate-900 p-10 rounded-[2.5rem] text-white shadow-2xl shadow-blue-100">
          <h2 className="text-sm font-black uppercase tracking-[0.3em] mb-6 text-blue-400">Pozvat nového manažera</h2>
          <form action={inviteUser} className="flex flex-col sm:flex-row gap-4">
            <input name="name" placeholder="Jméno" className="flex-1 bg-slate-800 border-none rounded-2xl px-6 py-4 font-bold text-sm outline-none focus:ring-2 ring-blue-500" required />
            <input name="email" type="email" placeholder="google-email@algotech.cz" className="flex-2 bg-slate-800 border-none rounded-2xl px-6 py-4 font-bold text-sm outline-none focus:ring-2 ring-blue-500" required />
            <button type="submit" className="bg-blue-600 hover:bg-white hover:text-blue-600 transition-all px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest">
              Povolit přístup
            </button>
          </form>
        </div>

        {/* SEZNAM UŽIVATELŮ */}
        <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b">
              <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                <th className="px-8 py-5">Manažer</th>
                <th className="px-8 py-5">Role</th>
                <th className="px-8 py-5 text-right">Akce</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {allowedUsers.map(u => (
                <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-8 py-6">
                    <p className="font-black text-slate-800 text-sm italic">{u.name}</p>
                    <p className="text-xs text-slate-400">{u.email}</p>
                  </td>
                  <td className="px-8 py-6">
                    <span className={`text-[9px] font-black px-3 py-1 rounded-lg uppercase tracking-widest ${u.role === 'ADMIN' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-8 py-6 text-right space-x-4">
                    <form action={removeUser.bind(null, u.id)} className="inline">
                      <button className="text-[10px] font-black text-red-400 hover:text-red-600 uppercase tracking-widest">Odebrat</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}