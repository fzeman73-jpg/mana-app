"use server"

import { auth, signIn } from "@/auth"
import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import bcrypt from "bcryptjs"

// --- Helpers ---

async function requireAdmin() {
  const session = await auth()
  const email = session?.user?.email
  if (!email) throw new Error("Nepřihlášen")
  const caller = await prisma.user.findUnique({ where: { email } })
  if (caller?.role !== "ADMIN") throw new Error("Přístup odepřen")
}

async function requireAdminOrManager() {
  const session = await auth()
  const email = session?.user?.email
  if (!email) throw new Error("Nepřihlášen")
  const caller = await prisma.user.findUnique({ where: { email } })
  if (caller?.role !== "ADMIN" && caller?.role !== "MANAGER") throw new Error("Přístup odepřen")
}

// --- Přihlášení email + heslo ---

export async function loginWithCredentials(formData: FormData) {
  await signIn("credentials", {
    email:      formData.get("email"),
    password:   formData.get("password"),
    redirectTo: "/",
  })
}

// --- ADMIN + MANAGER: Firemní parametry (per období) ---

export async function updateCompanyParameters(periodId: string, formData: FormData) {
  await requireAdminOrManager()

  const data = {
    currentEbitda:     parseFloat(formData.get("currentEbitda") as string)     || 0,
    targetEbitda:      parseFloat(formData.get("targetEbitda") as string)      || 0,
    currentHorizont:   parseFloat(formData.get("currentHorizont") as string)   || 0,
    targetHorizont:    parseFloat(formData.get("targetHorizont") as string)    || 0,
    currentMultiplier: parseFloat(formData.get("currentMultiplier") as string) || 6.0,
  }

  await prisma.companyParameters.upsert({
    where:  { periodId },
    update: data,
    create: { periodId, ...data },
  })

  revalidatePath("/admin/parameters")
  revalidatePath("/")
}

// --- ADMIN: Odměna uživatele (per uživatel + období) ---

export async function adminSetCompensation(userId: string, periodId: string, formData: FormData) {
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
    where:  { userId_periodId: { userId, periodId } },
    update: data,
    create: { userId, periodId, ...data },
  })

  revalidatePath("/admin/parameters")
  revalidatePath("/")
}

// --- ADMIN: KPI úkoly (per uživatel + období) ---

export async function adminAddKpiTask(userId: string, periodId: string, formData: FormData) {
  await requireAdmin()

  const name   = formData.get("name") as string
  const weight = parseFloat(formData.get("weight") as string) || 0

  await prisma.kpiTask.create({
    data: { name, weight, userId, periodId },
  })

  revalidatePath("/admin/parameters")
}

export async function adminDeleteKpiTask(taskId: string) {
  await requireAdmin()
  await prisma.kpiTask.delete({ where: { id: taskId } })
  revalidatePath("/admin/parameters")
}

// --- ADMIN + MANAGER: Toggle KPI ---

export async function adminToggleKpiTask(taskId: string, current: boolean) {
  await requireAdminOrManager()
  await prisma.kpiTask.update({
    where: { id: taskId },
    data:  { isCompleted: !current },
  })
  revalidatePath("/admin/parameters")
  revalidatePath("/")
}

// --- ADMIN: Správa období ---

export async function createPeriod(formData: FormData) {
  await requireAdmin()
  const name      = formData.get("name") as string
  const startDate = new Date(formData.get("startDate") as string)
  const endDate   = new Date(formData.get("endDate") as string)

  await prisma.period.create({ data: { name, startDate, endDate } })
  revalidatePath("/admin/parameters")
}

export async function setActivePeriod(periodId: string) {
  await requireAdminOrManager()
  await prisma.period.updateMany({ data: { isActive: false } })
  await prisma.period.update({ where: { id: periodId }, data: { isActive: true } })
  revalidatePath("/admin/parameters")
  revalidatePath("/")
}

export async function deletePeriod(periodId: string) {
  await requireAdmin()
  await prisma.period.delete({ where: { id: periodId } })
  revalidatePath("/admin/parameters")
  redirect("/admin/parameters")
}

// --- ADMIN: Správa uživatelů ---

export async function inviteUser(formData: FormData) {
  await requireAdmin()
  const email = formData.get("email") as string
  const name  = formData.get("name") as string

  await prisma.user.upsert({
    where:  { email },
    update: { isAllowed: true },
    create: { email, name, isAllowed: true, role: "USER" },
  })
  revalidatePath("/admin")
}

export async function setUserActive(userId: string, isAllowed: boolean) {
  await requireAdmin()
  await prisma.user.update({ where: { id: userId }, data: { isAllowed } })
  revalidatePath("/admin")
  revalidatePath(`/admin/user/${userId}`)
}

export async function deleteUser(userId: string) {
  await requireAdmin()
  await prisma.user.delete({ where: { id: userId } })
  revalidatePath("/admin")
  redirect("/admin")
}

export async function setUserRole(userId: string, formData: FormData) {
  await requireAdmin()
  const role = formData.get("role") as "USER" | "MANAGER" | "ADMIN"
  await prisma.user.update({ where: { id: userId }, data: { role } })
  revalidatePath(`/admin/user/${userId}`)
  revalidatePath("/admin")
}

export async function setUserPassword(userId: string, formData: FormData) {
  await requireAdmin()
  const password = formData.get("password") as string
  if (!password || password.length < 6) throw new Error("Heslo musí mít alespoň 6 znaků")
  const hashed = await bcrypt.hash(password, 12)
  await prisma.user.update({ where: { id: userId }, data: { password: hashed } })
  revalidatePath(`/admin/user/${userId}`)
}

export async function removeUser(userId: string) {
  await setUserActive(userId, false)
}
