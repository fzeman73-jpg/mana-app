"use server"

import { auth, signIn } from "@/auth"
import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import bcrypt from "bcryptjs"
import { calcBonus, calcPOP } from "@/lib/calculator"

// ─── HELPERS ─────────────────────────────────────────────────────────────────

async function getCallerOrThrow() {
  const session = await auth()
  const email = session?.user?.email
  if (!email) throw new Error("Nepřihlášen")
  const caller = await prisma.user.findUnique({ where: { email } })
  if (!caller) throw new Error("Uživatel nenalezen")
  return caller
}

async function requireAdmin() {
  const caller = await getCallerOrThrow()
  if (caller.role !== "ADMIN") throw new Error("Přístup odepřen")
  return caller
}

async function requireAdminOrManager() {
  const caller = await getCallerOrThrow()
  if (caller.role !== "ADMIN" && caller.role !== "MANAGER") throw new Error("Přístup odepřen")
  return caller
}

async function audit(userEmail: string, action: string, target?: string, oldValue?: object, newValue?: object) {
  await prisma.auditLog.create({
    data: {
      userEmail,
      action,
      target,
      oldValue:  oldValue  ? JSON.stringify(oldValue)  : undefined,
      newValue:  newValue  ? JSON.stringify(newValue)  : undefined,
    }
  })
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────

export async function loginWithCredentials(formData: FormData) {
  await signIn("credentials", {
    email:      formData.get("email"),
    password:   formData.get("password"),
    redirectTo: "/",
  })
}

// ─── SPRÁVA UŽIVATELŮ (Admin) ────────────────────────────────────────────────

export async function inviteUser(formData: FormData) {
  const caller = await requireAdmin()
  const email = formData.get("email") as string
  const name  = formData.get("name") as string

  await prisma.user.upsert({
    where:  { email },
    update: { isAllowed: true },
    create: { email, name, isAllowed: true, role: "USER" },
  })
  await audit(caller.email!, "INVITE_USER", `User:${email}`)
  revalidatePath("/admin")
}

export async function setUserActive(userId: string, isAllowed: boolean) {
  const caller = await requireAdmin()
  await prisma.user.update({ where: { id: userId }, data: { isAllowed } })
  await audit(caller.email!, isAllowed ? "ACTIVATE_USER" : "DEACTIVATE_USER", `User:${userId}`)
  revalidatePath("/admin")
  revalidatePath(`/admin/user/${userId}`)
}

export async function deleteUser(userId: string) {
  const caller = await requireAdmin()
  await audit(caller.email!, "DELETE_USER", `User:${userId}`)
  await prisma.user.delete({ where: { id: userId } })
  revalidatePath("/admin")
  redirect("/admin")
}

export async function setUserRole(userId: string, formData: FormData) {
  const caller = await requireAdmin()
  const role = formData.get("role") as "USER" | "MANAGER" | "ADMIN"
  const old = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
  await prisma.user.update({ where: { id: userId }, data: { role } })
  await audit(caller.email!, "SET_ROLE", `User:${userId}`, { role: old?.role }, { role })
  revalidatePath(`/admin/user/${userId}`)
  revalidatePath("/admin")
}

export async function setUserPassword(userId: string, formData: FormData) {
  const caller = await requireAdmin()
  const password = formData.get("password") as string
  if (!password || password.length < 6) throw new Error("Heslo musí mít alespoň 6 znaků")
  const hashed = await bcrypt.hash(password, 12)
  await prisma.user.update({ where: { id: userId }, data: { password: hashed } })
  await audit(caller.email!, "SET_PASSWORD", `User:${userId}`)
  revalidatePath(`/admin/user/${userId}`)
}

export async function setUserDivision(userId: string, formData: FormData) {
  const caller = await requireAdmin()
  const divisionId = formData.get("divisionId") as string | null
  await prisma.user.update({ where: { id: userId }, data: { divisionId: divisionId || null } })
  await audit(caller.email!, "SET_DIVISION", `User:${userId}`, undefined, { divisionId })
  revalidatePath(`/admin/user/${userId}`)
}

export async function removeUser(userId: string) {
  await setUserActive(userId, false)
}

// ─── DIVIZE ──────────────────────────────────────────────────────────────────

export async function createDivision(formData: FormData) {
  const caller = await requireAdmin()
  const name        = formData.get("name") as string
  const description = formData.get("description") as string | null
  await prisma.division.create({ data: { name, description: description || undefined } })
  await audit(caller.email!, "CREATE_DIVISION", undefined, undefined, { name })
  revalidatePath("/admin")
}

export async function deleteDivision(divisionId: string) {
  const caller = await requireAdmin()
  await audit(caller.email!, "DELETE_DIVISION", `Division:${divisionId}`)
  await prisma.division.delete({ where: { id: divisionId } })
  revalidatePath("/admin")
}

// ─── OBDOBÍ ──────────────────────────────────────────────────────────────────

export async function createPeriod(formData: FormData) {
  const caller = await requireAdmin()
  const name      = formData.get("name") as string
  const startDate = new Date(formData.get("startDate") as string)
  const endDate   = new Date(formData.get("endDate") as string)
  await prisma.period.create({ data: { name, startDate, endDate } })
  await audit(caller.email!, "CREATE_PERIOD", undefined, undefined, { name })
  revalidatePath("/admin/parameters")
}

export async function setActivePeriod(periodId: string) {
  const caller = await requireAdminOrManager()
  await prisma.period.updateMany({ data: { isActive: false } })
  await prisma.period.update({ where: { id: periodId }, data: { isActive: true } })
  await audit(caller.email!, "SET_ACTIVE_PERIOD", `Period:${periodId}`)
  revalidatePath("/admin/parameters")
  revalidatePath("/")
}

export async function deletePeriod(periodId: string) {
  const caller = await requireAdmin()
  await audit(caller.email!, "DELETE_PERIOD", `Period:${periodId}`)
  await prisma.period.delete({ where: { id: periodId } })
  revalidatePath("/admin/parameters")
  redirect("/admin/parameters")
}

// ─── VÝKONNOSTNÍ PARAMETRY ───────────────────────────────────────────────────

export async function createPerformanceParameter(periodId: string, formData: FormData) {
  const caller = await requireAdminOrManager()
  const data = {
    periodId,
    name:         formData.get("name") as string,
    description:  (formData.get("description") as string) || undefined,
    weight:       parseFloat(formData.get("weight") as string)    || 0,
    threshold:    parseFloat(formData.get("threshold") as string) || 0,
    sortOrder:    parseInt(formData.get("sortOrder") as string)   || 0,
  }
  await prisma.performanceParameter.create({ data })
  await audit(caller.email!, "CREATE_PARAMETER", `Period:${periodId}`, undefined, data)
  revalidatePath("/admin/parameters")
}

export async function updatePerformanceParameter(paramId: string, formData: FormData) {
  const caller = await requireAdminOrManager()
  const old = await prisma.performanceParameter.findUnique({ where: { id: paramId } })
  const data = {
    name:         formData.get("name") as string,
    description:  (formData.get("description") as string) || undefined,
    weight:       parseFloat(formData.get("weight") as string)    || 0,
    threshold:    parseFloat(formData.get("threshold") as string) || 0,
    gatesParamId: (formData.get("gatesParamId") as string) || null,
  }
  await prisma.performanceParameter.update({ where: { id: paramId }, data })
  await audit(caller.email!, "UPDATE_PARAMETER", `PerformanceParameter:${paramId}`, old ?? undefined, data)
  revalidatePath("/admin/parameters")
}

export async function deletePerformanceParameter(paramId: string) {
  const caller = await requireAdminOrManager()
  await audit(caller.email!, "DELETE_PARAMETER", `PerformanceParameter:${paramId}`)
  await prisma.performanceParameter.delete({ where: { id: paramId } })
  revalidatePath("/admin/parameters")
}

// ─── KVARTÁLNÍ VÝSLEDKY ───────────────────────────────────────────────────────

export async function upsertQuarterlyResult(
  parameterId: string, quarter: number, year: number, formData: FormData
) {
  const caller = await requireAdminOrManager()
  const data = {
    actual: parseFloat(formData.get("actual") as string) || 0,
    target: parseFloat(formData.get("target") as string) || 0,
    note:   (formData.get("note") as string) || undefined,
  }
  await prisma.quarterlyResult.upsert({
    where:  { parameterId_quarter_year: { parameterId, quarter, year } },
    update: data,
    create: { parameterId, quarter, year, ...data },
  })
  await audit(caller.email!, "UPDATE_QUARTERLY_RESULT", `PerformanceParameter:${parameterId}`, undefined, { quarter, year, ...data })
  revalidatePath("/admin/parameters")
  revalidatePath("/")
}

export async function lockQuarter(parameterId: string, quarter: number, year: number) {
  const caller = await requireAdmin()
  await prisma.quarterlyResult.update({
    where: { parameterId_quarter_year: { parameterId, quarter, year } },
    data:  { isLocked: true, lockedAt: new Date(), lockedByEmail: caller.email! },
  })
  await audit(caller.email!, "LOCK_QUARTER", `PerformanceParameter:${parameterId}`, undefined, { quarter, year })
  revalidatePath("/admin/parameters")
}

// ─── POP – VESTING BASE ───────────────────────────────────────────────────────

export async function upsertVestingBase(periodId: string, formData: FormData) {
  const caller = await requireAdminOrManager()
  const data = {
    baseMultiplier: parseFloat(formData.get("baseMultiplier") as string) || 6.0,
    currentEbitda:  parseFloat(formData.get("currentEbitda") as string)  || 0,
  }
  await prisma.vestingBase.upsert({
    where:  { periodId },
    update: data,
    create: { periodId, ...data },
  })
  await audit(caller.email!, "UPDATE_VESTING_BASE", `Period:${periodId}`, undefined, data)
  revalidatePath("/admin/parameters")
  revalidatePath("/")
}

// ─── STRATEGICKÉ BOOSTERY ────────────────────────────────────────────────────

export async function createBooster(periodId: string, formData: FormData) {
  const caller = await requireAdminOrManager()
  const data = {
    periodId,
    name:            formData.get("name") as string,
    description:     (formData.get("description") as string) || undefined,
    multiplierBoost: parseFloat(formData.get("multiplierBoost") as string) || 0,
  }
  await prisma.strategicBooster.create({ data })
  await audit(caller.email!, "CREATE_BOOSTER", `Period:${periodId}`, undefined, data)
  revalidatePath("/admin/parameters")
}

export async function toggleBooster(boosterId: string, current: boolean) {
  const caller = await requireAdminOrManager()
  await prisma.strategicBooster.update({
    where: { id: boosterId },
    data:  { isAchieved: !current, achievedAt: !current ? new Date() : null },
  })
  await audit(caller.email!, "TOGGLE_BOOSTER", `StrategicBooster:${boosterId}`, { isAchieved: current }, { isAchieved: !current })
  revalidatePath("/admin/parameters")
  revalidatePath("/")
}

export async function deleteBooster(boosterId: string) {
  const caller = await requireAdminOrManager()
  await audit(caller.email!, "DELETE_BOOSTER", `StrategicBooster:${boosterId}`)
  await prisma.strategicBooster.delete({ where: { id: boosterId } })
  revalidatePath("/admin/parameters")
}

// ─── ODMĚNA MANAŽERA ─────────────────────────────────────────────────────────

export async function adminSetCompensation(userId: string, periodId: string, formData: FormData) {
  const caller = await requireAdmin()
  const grantDateRaw = formData.get("grantDate") as string
  const grantDate    = grantDateRaw ? new Date(grantDateRaw) : new Date()

  const data = {
    baseSalary:        parseFloat(formData.get("baseSalary") as string)        || 0,
    targetBonusAnnual: parseFloat(formData.get("targetBonusAnnual") as string) || 0,
    sharePercent:      parseFloat(formData.get("sharePercent") as string)      || 0,
    grantEbitda:       parseFloat(formData.get("grantEbitda") as string)       || 0,
    grantMultiplier:   parseFloat(formData.get("grantMultiplier") as string)   || 0,
    vestingYears:      parseInt(formData.get("vestingYears") as string)        || 4,
    vestingPercent:    parseFloat(formData.get("vestingPercent") as string)    || 25,
    grantDate,
  }

  await prisma.compensation.upsert({
    where:  { userId_periodId: { userId, periodId } },
    update: data,
    create: { userId, periodId, ...data },
  })
  await audit(caller.email!, "UPDATE_COMPENSATION", `User:${userId}`, undefined, data)
  revalidatePath("/admin/parameters")
  revalidatePath("/")
}

// ─── KPI ÚKOLY ────────────────────────────────────────────────────────────────

export async function adminAddKpiTask(userId: string, periodId: string, formData: FormData) {
  const caller = await requireAdmin()
  const data = {
    name:        formData.get("name") as string,
    description: (formData.get("description") as string) || undefined,
    weight:      parseFloat(formData.get("weight") as string) || 0,
    userId,
    periodId,
  }
  await prisma.kpiTask.create({ data })
  await audit(caller.email!, "ADD_KPI_TASK", `User:${userId}`, undefined, data)
  revalidatePath("/admin/parameters")
}

export async function adminDeleteKpiTask(taskId: string) {
  const caller = await requireAdmin()
  await audit(caller.email!, "DELETE_KPI_TASK", `KpiTask:${taskId}`)
  await prisma.kpiTask.delete({ where: { id: taskId } })
  revalidatePath("/admin/parameters")
}

export async function adminToggleKpiTask(taskId: string, current: boolean) {
  const caller = await requireAdminOrManager()
  await prisma.kpiTask.update({
    where: { id: taskId },
    data:  { isCompleted: !current, completedAt: !current ? new Date() : null },
  })
  await audit(caller.email!, "TOGGLE_KPI_TASK", `KpiTask:${taskId}`, { isCompleted: current }, { isCompleted: !current })
  revalidatePath("/admin/parameters")
  revalidatePath("/")
}

// ─── UZAVŘENÍ KVARTÁLU ────────────────────────────────────────────────────────

/**
 * Uzavře kvartál pro všechny uživatele v daném období:
 * 1. Pro každého uživatele spočítá bonus + POP v okamžiku uzavření
 * 2. Uloží QuarterlySnapshot jako historický bod
 * 3. Uzamkne všechny QuarterlyResult daného kvartálu
 */
export async function closeQuarter(periodId: string, quarter: number, year: number) {
  const caller = await requireAdmin()

  const [users, perfParams, vestingBase, boosters] = await Promise.all([
    prisma.compensation.findMany({
      where:   { periodId },
      include: { user: true },
    }),
    prisma.performanceParameter.findMany({
      where:   { periodId },
      include: { results: { where: { quarter, year } } },
    }),
    prisma.vestingBase.findUnique({ where: { periodId } }),
    prisma.strategicBooster.findMany({ where: { periodId } }),
  ])

  for (const comp of users) {
    const kpiTasks = await prisma.kpiTask.findMany({
      where: { userId: comp.userId, periodId },
    })

    // Výpočet bonusu
    const paramInputs = perfParams.map(p => {
      const res = p.results[0]
      return {
        id: p.id, name: p.name, weight: p.weight,
        threshold: p.threshold, gatesParamId: p.gatesParamId,
        actual: res?.actual ?? 0, target: res?.target ?? 0,
      }
    })

    const bonus = calcBonus(
      paramInputs,
      comp.targetBonusAnnual,
      kpiTasks.map(t => ({ weight: t.weight, isCompleted: t.isCompleted })),
      0
    )

    // Výpočet POP
    const pop = vestingBase ? calcPOP({
      sharePercent:    comp.sharePercent,
      grantEbitda:     comp.grantEbitda,
      grantMultiplier: comp.grantMultiplier,
      currentEbitda:   vestingBase.currentEbitda,
      baseMultiplier:  vestingBase.baseMultiplier,
      boosters:        boosters.map(b => ({ multiplierBoost: b.multiplierBoost, isAchieved: b.isAchieved })),
    }) : null

    // Uložení snapshotu
    await prisma.quarterlySnapshot.upsert({
      where:  { userId_periodId_quarter_year: { userId: comp.userId, periodId, quarter, year } },
      update: {
        bonusAmount: bonus.total,
        popValue:    pop?.grossGain ?? 0,
        breakdown:   bonus as object,
      },
      create: {
        userId: comp.userId, periodId, quarter, year,
        bonusAmount: bonus.total,
        popValue:    pop?.grossGain ?? 0,
        breakdown:   bonus as object,
      },
    })
  }

  // Uzamčení všech výsledků daného kvartálu
  await prisma.quarterlyResult.updateMany({
    where: {
      parameter: { periodId },
      quarter,
      year,
      isLocked: false,
    },
    data: { isLocked: true, lockedAt: new Date(), lockedByEmail: caller.email! },
  })

  await audit(caller.email!, "CLOSE_QUARTER", `Period:${periodId}`, undefined, { quarter, year, usersCount: users.length })
  revalidatePath("/admin/parameters")
  revalidatePath("/")
}

// ─── VESTING PLATBY ───────────────────────────────────────────────────────────

export async function markVestingPaid(compensationId: string, vestingYear: number, formData: FormData) {
  const caller = await requireAdmin()
  const amount = parseFloat(formData.get("amount") as string) || null

  await prisma.vestingPayment.upsert({
    where:  { compensationId_vestingYear: { compensationId, vestingYear } },
    update: { isPaid: true, paidAt: new Date(), amount: amount ?? undefined },
    create: { compensationId, vestingYear, percentage: 0, isPaid: true, paidAt: new Date(), amount: amount ?? undefined },
  })

  await audit(caller.email!, "MARK_VESTING_PAID", `Compensation:${compensationId}`, undefined, { vestingYear, amount })
  revalidatePath("/admin/reports")
}

export async function markVestingUnpaid(compensationId: string, vestingYear: number) {
  const caller = await requireAdmin()
  await prisma.vestingPayment.deleteMany({ where: { compensationId, vestingYear } })
  await audit(caller.email!, "MARK_VESTING_UNPAID", `Compensation:${compensationId}`, undefined, { vestingYear })
  revalidatePath("/admin/reports")
}
