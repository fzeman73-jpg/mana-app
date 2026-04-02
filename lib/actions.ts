"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"

// --- 1. SEKCE: DASHBOARD (Peněžitá data a milníky) ---

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

  // Najdeme uživatele podle emailu (nebo ho vytvoříme)
  const user = await prisma.user.upsert({
    where: { email: email },
    update: {},
    create: { email: email, name: session.user?.name, isAllowed: true }
  })

  // Uložíme nebo aktualizujeme jeho compensation
  await prisma.compensation.upsert({
    where: { userId: user.id },
    update: data,
    create: { ...data, userId: user.id }
  })

  revalidatePath("/")
}

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

export async function toggleMetric(id: string, currentStatus: boolean) {
  await prisma.strategicMetric.update({
    where: { id },
    data: { isCompleted: !currentStatus }
  })
  revalidatePath("/")
}


export async function updateGlobalSettings(formData: FormData) {
  const session = await auth()
  const email = session?.user?.email
  if (!email) throw new Error("Nepřihlášen")

  const user = await prisma.user.findUnique({ where: { email } })
  if (user?.role !== "ADMIN") throw new Error("Přístup odepřen")

  const currentEbitda = parseFloat(formData.get("currentEbitda") as string) || 50000000
  const baseMultiplier = parseFloat(formData.get("baseMultiplier") as string) || 6.0

  await prisma.globalSettings.upsert({
    where: { id: "global" },
    update: { currentEbitda, baseMultiplier },
    create: { id: "global", currentEbitda, baseMultiplier }
  })

  revalidatePath("/")
  revalidatePath("/admin")
}

// --- 2. SEKCE: ADMIN MANAGEMENT (Správa uživatelů) ---

export async function inviteUser(formData: FormData) {
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
  await prisma.user.update({
    where: { id: userId },
    data: { isAllowed: false }
  })
  revalidatePath("/admin")
}

export async function toggleUserRole(userId: string, currentRole: string) {
  // Funkce je zde pouze jednou - opraveno pro Vercel
  const newRole = currentRole === "ADMIN" ? "MANAGER" : "ADMIN"
  
  await prisma.user.update({
    where: { id: userId },
    data: { role: newRole }
  })
  
  revalidatePath("/admin")
  revalidatePath("/")
}