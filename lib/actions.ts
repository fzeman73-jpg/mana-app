"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"

// 1. ULOŽENÍ FINANČNÍCH PARAMETRŮ
export async function updateCompensation(formData: FormData) {
  const session = await auth()
  const email = session?.user?.email

  if (!email) throw new Error("Nepřihlášen")

  const data = {
    baseSalary: parseFloat(formData.get("baseSalary") as string) || 0,
    targetBonusAnnual: parseFloat(formData.get("targetBonusAnnual") as string) || 0,
    popUnits: parseFloat(formData.get("popUnits") as string) || 0,
    grantEbitda: parseFloat(formData.get("grantEbitda") as string) || 0,
    grantMultiplier: parseFloat(formData.get("grantMultiplier") as string) || 0,
  }

  // Najdeme uživatele podle emailu (nebo ho vytvoříme, pokud v DB ještě není)
  const user = await prisma.user.upsert({
    where: { email: email },
    update: {},
    create: { email: email, name: session.user?.name }
  })

  // Uložíme nebo aktualizujeme jeho compensation
  await prisma.compensation.upsert({
    where: { userId: user.id },
    update: data,
    create: { ...data, userId: user.id }
  })

  revalidatePath("/")
}

// 2. PŘIDÁNÍ MILNÍKU
export async function addStrategicMetric(formData: FormData) {
  const session = await auth()
  const email = session?.user?.email
  if (!email) return

  const name = formData.get("name") as string
  const impact = parseFloat(formData.get("multiplierImpact") as string) || 0

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return

  await prisma.strategicMetric.create({
    data: {
      name,
      multiplierImpact: impact,
      userId: user.id,
    }
  })

  revalidatePath("/")
}

// 3. PŘEPNUTÍ MILNÍKU
export async function toggleMetric(id: string, currentStatus: boolean) {
  await prisma.strategicMetric.update({
    where: { id },
    data: { isCompleted: !currentStatus }
  })
  revalidatePath("/")
}

export async function toggleUserRole(userId: string, currentRole: string) {
  const session = await auth()
  // Tady by měla být kontrola, jestli JE přihlášený uživatel Admin (vyřešíme v page)
  
  const newRole = currentRole === "ADMIN" ? "MANAGER" : "ADMIN"
  
  await prisma.user.update({
    where: { id: userId },
    data: { role: newRole }
  })
  
  revalidatePath("/")
}

// lib/actions.ts
export async function inviteUser(formData: FormData) {
  const session = await auth()
  const adminEmail = session?.user?.email
  
  // Kontrola, zda akci provádí admin
  const admin = await prisma.user.findUnique({ where: { email: adminEmail || "" } })
  if (admin?.role !== "ADMIN") throw new Error("Nepovolená akce")

  const email = formData.get("email") as string
  const name = formData.get("name") as string

  await prisma.user.upsert({
    where: { email },
    update: { isAllowed: true },
    create: { email, name, isAllowed: true, role: "MANAGER" }
  })

  revalidatePath("/admin")
}

export async function removeUser(userId: string) {
  // Jen nastavíme isAllowed na false (nebo smažeme)
  await prisma.user.update({
    where: { id: userId },
    data: { isAllowed: false }
  })
  revalidatePath("/admin")
}