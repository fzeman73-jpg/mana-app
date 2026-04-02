"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"

// Helpers
async function requireAdmin() {
  const session = await auth()
  const email = session?.user?.email
  if (!email) throw new Error("Nepřihlášen")
  const caller = await prisma.user.findUnique({ where: { email } })
  if (caller?.role !== "ADMIN") throw new Error("Přístup odepřen")
}

// --- UŽIVATEL: Toggle vlastního strategického metriku ---

export async function toggleMetric(id: string, currentStatus: boolean) {
  await prisma.strategicMetric.update({
    where: { id },
    data: { isCompleted: !currentStatus }
  })
  revalidatePath("/")
}

// --- ADMIN: Správa odměn uživatelů ---

export async function adminSetCompensation(userId: string, formData: FormData) {
  await requireAdmin()

  const data = {
    baseSalary:        parseFloat(formData.get("baseSalary") as string)        || 0,
    targetBonusAnnual: parseFloat(formData.get("targetBonusAnnual") as string) || 0,
    popUnits:          parseFloat(formData.get("popUnits") as string)          || 0,
    grantEbitda:       parseFloat(formData.get("grantEbitda") as string)       || 0,
    grantMultiplier:   parseFloat(formData.get("grantMultiplier") as string)   || 0,
  }

  await prisma.compensation.upsert({
    where: { userId },
    update: data,
    create: { ...data, userId }
  })

  revalidatePath(`/admin/user/${userId}`)
  revalidatePath("/")
}

export async function adminAddMetric(userId: string, formData: FormData) {
  await requireAdmin()

  const name   = formData.get("name") as string
  const impact = parseFloat(formData.get("multiplierImpact") as string) || 0

  await prisma.strategicMetric.create({
    data: { name, multiplierImpact: impact, userId }
  })

  revalidatePath(`/admin/user/${userId}`)
  revalidatePath("/")
}

export async function adminDeleteMetric(metricId: string, userId: string) {
  await requireAdmin()
  await prisma.strategicMetric.delete({ where: { id: metricId } })
  revalidatePath(`/admin/user/${userId}`)
  revalidatePath("/")
}

// --- ADMIN: Globální nastavení modelu ---

export async function updateGlobalSettings(formData: FormData) {
  await requireAdmin()

  const currentEbitda  = parseFloat(formData.get("currentEbitda") as string)  || 50000000
  const baseMultiplier = parseFloat(formData.get("baseMultiplier") as string)  || 6.0

  await prisma.globalSettings.upsert({
    where:  { id: "global" },
    update: { currentEbitda, baseMultiplier },
    create: { id: "global", currentEbitda, baseMultiplier }
  })

  revalidatePath("/")
  revalidatePath("/admin")
}

// --- ADMIN: Správa přístupu uživatelů ---

export async function inviteUser(formData: FormData) {
  const email = formData.get("email") as string
  const name  = formData.get("name") as string

  await prisma.user.upsert({
    where:  { email },
    update: { isAllowed: true },
    create: { email, name, isAllowed: true, role: "MANAGER" }
  })
  revalidatePath("/admin")
}

export async function removeUser(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data:  { isAllowed: false }
  })
  revalidatePath("/admin")
}

export async function toggleUserRole(userId: string, currentRole: string) {
  const newRole = currentRole === "ADMIN" ? "MANAGER" : "ADMIN"
  await prisma.user.update({
    where: { id: userId },
    data:  { role: newRole }
  })
  revalidatePath("/admin")
  revalidatePath("/")
}
