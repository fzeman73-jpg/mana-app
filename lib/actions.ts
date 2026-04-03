"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"

// --- Helper ---

async function requireAdmin() {
  const session = await auth()
  const email = session?.user?.email
  if (!email) throw new Error("Nepřihlášen")
  const caller = await prisma.user.findUnique({ where: { email } })
  if (caller?.role !== "ADMIN") throw new Error("Přístup odepřen")
}

// --- ADMIN: Firemní parametry ---

export async function updateCompanyParameters(formData: FormData) {
  await requireAdmin()

  const data = {
    currentEbitda:     parseFloat(formData.get("currentEbitda") as string)     || 0,
    targetEbitda:      parseFloat(formData.get("targetEbitda") as string)      || 0,
    currentHorizont:   parseFloat(formData.get("currentHorizont") as string)   || 0,
    targetHorizont:    parseFloat(formData.get("targetHorizont") as string)    || 0,
    currentMultiplier: parseFloat(formData.get("currentMultiplier") as string) || 6.0,
  }

  await prisma.companyParameters.upsert({
    where:  { id: "global" },
    update: data,
    create: { id: "global", ...data },
  })

  revalidatePath("/")
  revalidatePath("/admin/parameters")
}

// --- ADMIN: Správa odměn jednotlivého manažera ---

export async function adminSetCompensation(userId: string, formData: FormData) {
  await requireAdmin()

  const grantDateRaw = formData.get("grantDate") as string
  const grantDate    = grantDateRaw ? new Date(grantDateRaw) : new Date()

  const data = {
    baseSalary:          parseFloat(formData.get("baseSalary") as string)          || 0,
    targetBonusAnnual:   parseFloat(formData.get("targetBonusAnnual") as string)   || 0,
    bonusWeightEbitda:   parseFloat(formData.get("bonusWeightEbitda") as string)   || 0,
    bonusWeightHorizont: parseFloat(formData.get("bonusWeightHorizont") as string) || 0,
    bonusWeightKpi:      parseFloat(formData.get("bonusWeightKpi") as string)      || 0,
    sharePercent:        parseFloat(formData.get("sharePercent") as string)        || 0,
    grantEbitda:         parseFloat(formData.get("grantEbitda") as string)         || 0,
    grantMultiplier:     parseFloat(formData.get("grantMultiplier") as string)     || 0,
    vestingYears:        parseInt(formData.get("vestingYears") as string)          || 3,
    grantDate,
  }

  await prisma.compensation.upsert({
    where:  { userId },
    update: data,
    create: { userId, ...data },
  })

  revalidatePath(`/admin/user/${userId}`)
  revalidatePath("/")
}

// --- ADMIN: KPI úkoly manažera ---

export async function adminAddKpiTask(userId: string, formData: FormData) {
  await requireAdmin()

  const name   = formData.get("name") as string
  const weight = parseFloat(formData.get("weight") as string) || 0

  await prisma.kpiTask.create({
    data: { name, weight, userId },
  })

  revalidatePath(`/admin/user/${userId}`)
}

export async function adminDeleteKpiTask(taskId: string, userId: string) {
  await requireAdmin()
  await prisma.kpiTask.delete({ where: { id: taskId } })
  revalidatePath(`/admin/user/${userId}`)
}

export async function adminToggleKpiTask(taskId: string, current: boolean, userId: string) {
  await requireAdmin()
  await prisma.kpiTask.update({
    where: { id: taskId },
    data:  { isCompleted: !current },
  })
  revalidatePath(`/admin/user/${userId}`)
  revalidatePath("/")
}

// --- ADMIN: Správa přístupu ---

export async function inviteUser(formData: FormData) {
  const email = formData.get("email") as string
  const name  = formData.get("name") as string

  await prisma.user.upsert({
    where:  { email },
    update: { isAllowed: true },
    create: { email, name, isAllowed: true, role: "MANAGER" },
  })
  revalidatePath("/admin")
}

export async function removeUser(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data:  { isAllowed: false },
  })
  revalidatePath("/admin")
}

export async function toggleUserRole(userId: string, currentRole: string) {
  const newRole = currentRole === "ADMIN" ? "MANAGER" : "ADMIN"
  await prisma.user.update({
    where: { id: userId },
    data:  { role: newRole },
  })
  revalidatePath("/admin")
  revalidatePath("/")
}
