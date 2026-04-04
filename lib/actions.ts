"use server"

import { auth, signIn } from "@/auth"
import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import bcrypt from "bcryptjs"
import { calcBonus, calcPOP } from "@/lib/calculator"

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/** Načte mapu parameterId → přepsaná váha pro daného uživatele */
async function loadWeightOverrides(userId: string): Promise<Map<string, number>> {
  const rows = await (prisma as unknown as {
    parameterWeight: { findMany: (a: object) => Promise<{ parameterId: string; weight: number }[]> }
  }).parameterWeight.findMany({ where: { userId } })
  return new Map(rows.map(r => [r.parameterId, r.weight]))
}

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

export type PasswordState = { error?: string; success?: boolean }

export async function changeOwnPassword(
  _prev: PasswordState,
  formData: FormData
): Promise<PasswordState> {
  try {
    const caller = await getCallerOrThrow()
    const current  = formData.get("current")  as string
    const password = formData.get("password")  as string
    const confirm  = formData.get("confirm")   as string

    if (!password || password.length < 6) return { error: "Nové heslo musí mít alespoň 6 znaků" }
    if (password !== confirm) return { error: "Hesla se neshodují" }

    if (caller.password) {
      const ok = await bcrypt.compare(current, caller.password)
      if (!ok) return { error: "Stávající heslo není správné" }
    }

    const hashed = await bcrypt.hash(password, 12)
    await prisma.user.update({ where: { id: caller.id }, data: { password: hashed } })
    await audit(caller.email!, "CHANGE_OWN_PASSWORD", `User:${caller.id}`)
    revalidatePath("/settings")
    return { success: true }
  } catch {
    return { error: "Nastala neočekávaná chyba. Zkuste to znovu." }
  }
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
  const caller     = await requireAdminOrManager()
  const divisionId = (formData.get("divisionId") as string) || null
  const data = {
    periodId,
    divisionId,
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

export async function unlockQuarter(parameterId: string, quarter: number, year: number) {
  const caller = await requireAdmin()
  await prisma.quarterlyResult.update({
    where: { parameterId_quarter_year: { parameterId, quarter, year } },
    data:  { isLocked: false, lockedAt: null, lockedByEmail: null },
  })
  await audit(caller.email!, "UNLOCK_QUARTER", `PerformanceParameter:${parameterId}`, undefined, { quarter, year })
  revalidatePath("/admin/parameters")
}

/** Znovu otevře kvartál – smaže snapshot a odemkne všechny výsledky v daném období */
export async function reopenQuarter(periodId: string, quarter: number, year: number) {
  const caller = await requireAdmin()
  await (prisma as unknown as { quarterlySnapshot: { deleteMany: (a: object) => Promise<unknown> } }).quarterlySnapshot.deleteMany({ where: { periodId, quarter, year } })
  await prisma.quarterlyResult.updateMany({
    where: { parameter: { periodId }, quarter, year },
    data:  { isLocked: false, lockedAt: null, lockedByEmail: null },
  })
  await audit(caller.email!, "REOPEN_QUARTER", `Period:${periodId}`, undefined, { quarter, year })
  revalidatePath("/admin/parameters")
  revalidatePath("/")
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

  const data = {
    baseSalary:        parseFloat(formData.get("baseSalary") as string)        || 0,
    targetBonusAnnual: parseFloat(formData.get("targetBonusAnnual") as string) || 0,
    kpiWeight:         parseFloat(formData.get("kpiWeight") as string)         || 0,
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

// ─── POZICE UŽIVATELE ─────────────────────────────────────────────────────────

export async function setUserPosition(userId: string, formData: FormData) {
  const caller   = await requireAdmin()
  const position = (formData.get("position") as string) || null
  await prisma.user.update({ where: { id: userId }, data: { position } as object })
  await audit(caller.email!, "SET_POSITION", `User:${userId}`, undefined, { position })
  revalidatePath(`/admin/user/${userId}`)
  revalidatePath("/admin/parameters")
}

// ─── PHANTOM GRANTY ───────────────────────────────────────────────────────────

export async function adminAddPhantomGrant(userId: string, formData: FormData) {
  const caller      = await requireAdmin()
  const grantDateRaw = formData.get("grantDate") as string
  const data = {
    userId,
    name:           formData.get("name") as string,
    sharePercent:   parseFloat(formData.get("sharePercent") as string)   || 0,
    grantEbitda:    parseFloat(formData.get("grantEbitda") as string)    || 0,
    grantMultiplier: parseFloat(formData.get("grantMultiplier") as string) || 0,
    grantDate:      grantDateRaw ? new Date(grantDateRaw) : new Date(),
    vestingYears:   parseInt(formData.get("vestingYears") as string)     || 4,
    vestingPercent: parseFloat(formData.get("vestingPercent") as string) || 25,
  }
  await (prisma as unknown as { phantomGrant: { create: (a: object) => Promise<unknown> } }).phantomGrant.create({ data })
  await audit(caller.email!, "ADD_PHANTOM_GRANT", `User:${userId}`, undefined, { name: data.name })
  revalidatePath("/admin/parameters")
  revalidatePath("/")
}

export async function adminUpdatePhantomGrant(grantId: string, formData: FormData) {
  const caller      = await requireAdmin()
  const grantDateRaw = formData.get("grantDate") as string
  const data = {
    name:           formData.get("name") as string,
    sharePercent:   parseFloat(formData.get("sharePercent") as string)   || 0,
    grantEbitda:    parseFloat(formData.get("grantEbitda") as string)    || 0,
    grantMultiplier: parseFloat(formData.get("grantMultiplier") as string) || 0,
    grantDate:      grantDateRaw ? new Date(grantDateRaw) : new Date(),
    vestingYears:   parseInt(formData.get("vestingYears") as string)     || 4,
    vestingPercent: parseFloat(formData.get("vestingPercent") as string) || 25,
  }
  await (prisma as unknown as { phantomGrant: { update: (a: object) => Promise<unknown> } }).phantomGrant.update({
    where: { id: grantId }, data,
  })
  await audit(caller.email!, "UPDATE_PHANTOM_GRANT", `PhantomGrant:${grantId}`, undefined, data)
  revalidatePath("/admin/parameters")
  revalidatePath("/")
}

export async function adminDeletePhantomGrant(grantId: string) {
  const caller = await requireAdmin()
  await audit(caller.email!, "DELETE_PHANTOM_GRANT", `PhantomGrant:${grantId}`)
  await (prisma as unknown as { phantomGrant: { delete: (a: object) => Promise<unknown> } }).phantomGrant.delete({ where: { id: grantId } })
  revalidatePath("/admin/parameters")
  revalidatePath("/")
}

// ─── PŘEPSÁNÍ VÁHY PARAMETRU PER MANAŽER ─────────────────────────────────────

export async function setParameterWeight(userId: string, parameterId: string, formData: FormData) {
  const caller = await requireAdmin()
  const weight = parseFloat(formData.get("weight") as string)
  if (isNaN(weight) || weight < 0) throw new Error("Neplatná váha")
  await (prisma as unknown as { parameterWeight: { upsert: (a: object) => Promise<unknown> } }).parameterWeight.upsert({
    where:  { userId_parameterId: { userId, parameterId } },
    create: { userId, parameterId, weight },
    update: { weight },
  })
  await audit(caller.email!, "SET_PARAMETER_WEIGHT", `User:${userId}`, undefined, { parameterId, weight })
  revalidatePath("/admin/parameters")
  revalidatePath("/")
}

export async function resetParameterWeight(userId: string, parameterId: string) {
  const caller = await requireAdmin()
  await (prisma as unknown as { parameterWeight: { deleteMany: (a: object) => Promise<unknown> } }).parameterWeight.deleteMany({
    where: { userId, parameterId },
  })
  await audit(caller.email!, "RESET_PARAMETER_WEIGHT", `User:${userId}`, undefined, { parameterId })
  revalidatePath("/admin/parameters")
  revalidatePath("/")
}

// ─── KPI ÚKOLY ────────────────────────────────────────────────────────────────

export async function adminAddKpiTask(userId: string, periodId: string, formData: FormData) {
  const caller   = await requireAdmin()
  const taskType = (formData.get("taskType") as string) || "BOOLEAN"
  const data = {
    name:         formData.get("name") as string,
    description:  (formData.get("description") as string) || undefined,
    weight:       parseFloat(formData.get("weight") as string) || 0,
    taskType,
    targetAmount: taskType === "AMOUNT" ? (parseFloat(formData.get("targetAmount") as string) || null) : null,
    userId,
    periodId,
  }
  await prisma.kpiTask.create({ data })
  await audit(caller.email!, "ADD_KPI_TASK", `User:${userId}`, undefined, data)
  revalidatePath("/admin/parameters")
}

export async function updateKpiTaskCompletion(taskId: string, formData: FormData) {
  const caller   = await requireAdminOrManager()
  const taskType = formData.get("taskType") as string
  const data: Record<string, unknown> = {}
  if (taskType === "PERCENT") {
    data.completionPct = Math.min(100, Math.max(0, parseFloat(formData.get("completionPct") as string) || 0))
  } else if (taskType === "AMOUNT") {
    data.actualAmount = parseFloat(formData.get("actualAmount") as string) || 0
  }
  await prisma.kpiTask.update({ where: { id: taskId }, data })
  await audit(caller.email!, "TOGGLE_KPI_TASK", `KpiTask:${taskId}`, undefined, data)
  revalidatePath("/admin/parameters")
  revalidatePath("/")
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

    // Výpočet bonusu — filtr parametrů dle divize + přepsání vah
    const userDivId   = comp.user.divisionId
    const weightMap   = await loadWeightOverrides(comp.userId)
    const userParams  = perfParams.filter((p: typeof perfParams[number]) => {
      const pd = (p as unknown as { divisionId: string | null }).divisionId
      return pd === null || pd === userDivId
    })
    const paramInputs = userParams.map(p => {
      const res = p.results[0]
      return {
        id: p.id, name: p.name,
        weight:       weightMap.get(p.id) ?? p.weight,
        threshold:    p.threshold,
        gatesParamId: p.gatesParamId,
        actual: res?.actual ?? 0, target: res?.target ?? 0,
      }
    })

    const bonus = calcBonus(
      paramInputs,
      comp.targetBonusAnnual,
      kpiTasks.map(t => {
        const tt = t as unknown as { taskType: string; completionPct: number | null; targetAmount: number | null; actualAmount: number | null }
        let pct = t.isCompleted ? 1 : 0
        if (tt.taskType === "PERCENT") pct = Math.min(1, (tt.completionPct ?? 0) / 100)
        else if (tt.taskType === "AMOUNT" && (tt.targetAmount ?? 0) > 0) pct = Math.min(1, (tt.actualAmount ?? 0) / tt.targetAmount!)
        return { weight: t.weight, completionPct: pct }
      }),
      (comp as unknown as { kpiWeight: number }).kpiWeight ?? 0
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

// ─── POP PLÁN ─────────────────────────────────────────────────────────────────

type PopPlanModel = {
  create: (a: object) => Promise<{ id: string }>
  update: (a: object) => Promise<unknown>
  delete: (a: object) => Promise<unknown>
  findMany: (a: object) => Promise<unknown[]>
  findUnique: (a: object) => Promise<unknown>
}
type PopPlanBoosterModel = {
  create: (a: object) => Promise<unknown>
  update: (a: object) => Promise<unknown>
  delete: (a: object) => Promise<unknown>
}
type PopYearDataModel = {
  upsert: (a: object) => Promise<unknown>
  delete: (a: object) => Promise<unknown>
}
type PopAssignmentModel = {
  upsert: (a: object) => Promise<unknown>
  delete: (a: object) => Promise<unknown>
  findMany: (a: object) => Promise<unknown[]>
}
type PopPaymentModel = {
  upsert: (a: object) => Promise<unknown>
  deleteMany: (a: object) => Promise<unknown>
}

function popPrisma() {
  return prisma as unknown as {
    popPlan:        PopPlanModel
    popPlanBooster: PopPlanBoosterModel
    popYearData:    PopYearDataModel
    popAssignment:  PopAssignmentModel
    popPayment:     PopPaymentModel
  }
}

export async function createPopPlan(formData: FormData) {
  const caller = await requireAdmin()
  const data = {
    name:              formData.get("name") as string,
    description:       (formData.get("description") as string) || undefined,
    baseMultiplier:     parseFloat(formData.get("baseMultiplier") as string) || 6.0,
    grantEbitda:        parseFloat(formData.get("grantEbitda") as string) || 0,
    vestingGranularity: (formData.get("vestingGranularity") as string) || "YEARLY",
    vestingYears:       parseInt(formData.get("vestingYears") as string) || 4,
    vestingPaymentDay:  parseInt(formData.get("vestingPaymentDay") as string) || 1,
    vestingPaymentMonth: parseInt(formData.get("vestingPaymentMonth") as string) || 5,
    vestingQuarters:    parseInt(formData.get("vestingQuarters") as string) || 16,
  }
  const plan = await popPrisma().popPlan.create({ data })
  await audit(caller.email!, "CREATE_POP_PLAN", `PopPlan:${plan.id}`, undefined, data)
  revalidatePath("/admin/pop")
  redirect("/admin/pop/" + plan.id)
}

export async function updatePopPlan(planId: string, formData: FormData) {
  const caller = await requireAdmin()
  const data = {
    name:              formData.get("name") as string,
    description:       (formData.get("description") as string) || undefined,
    baseMultiplier:     parseFloat(formData.get("baseMultiplier") as string) || 6.0,
    grantEbitda:        parseFloat(formData.get("grantEbitda") as string) || 0,
    vestingGranularity: (formData.get("vestingGranularity") as string) || "YEARLY",
    vestingYears:       parseInt(formData.get("vestingYears") as string) || 4,
    vestingPaymentDay:  parseInt(formData.get("vestingPaymentDay") as string) || 1,
    vestingPaymentMonth: parseInt(formData.get("vestingPaymentMonth") as string) || 5,
    vestingQuarters:    parseInt(formData.get("vestingQuarters") as string) || 16,
  }
  await popPrisma().popPlan.update({ where: { id: planId }, data })
  await audit(caller.email!, "UPDATE_POP_PLAN", `PopPlan:${planId}`, undefined, data)
  revalidatePath("/admin/pop")
  revalidatePath("/admin/pop/" + planId)
}

export async function deletePopPlan(planId: string) {
  const caller = await requireAdmin()
  await audit(caller.email!, "DELETE_POP_PLAN", `PopPlan:${planId}`)
  await popPrisma().popPlan.delete({ where: { id: planId } })
  revalidatePath("/admin/pop")
  redirect("/admin/pop")
}

export async function createPopBooster(planId: string, formData: FormData) {
  const caller = await requireAdmin()
  const data = {
    popPlanId:       planId,
    name:            formData.get("name") as string,
    description:     (formData.get("description") as string) || undefined,
    multiplierBoost: parseFloat(formData.get("multiplierBoost") as string) || 0,
  }
  await popPrisma().popPlanBooster.create({ data })
  await audit(caller.email!, "CREATE_POP_BOOSTER", `PopPlan:${planId}`, undefined, data)
  revalidatePath("/admin/pop/" + planId)
  revalidatePath("/")
}

export async function togglePopBooster(boosterId: string, current: boolean, planId: string) {
  const caller = await requireAdminOrManager()
  await popPrisma().popPlanBooster.update({
    where: { id: boosterId },
    data: { isAchieved: !current, achievedAt: !current ? new Date() : null },
  })
  await audit(caller.email!, "TOGGLE_POP_BOOSTER", `PopPlanBooster:${boosterId}`, { isAchieved: current }, { isAchieved: !current })
  revalidatePath("/admin/pop/" + planId)
  revalidatePath("/")
}

export async function deletePopBooster(boosterId: string, planId: string) {
  const caller = await requireAdmin()
  await audit(caller.email!, "DELETE_POP_BOOSTER", `PopPlanBooster:${boosterId}`)
  await popPrisma().popPlanBooster.delete({ where: { id: boosterId } })
  revalidatePath("/admin/pop/" + planId)
  revalidatePath("/")
}

export async function upsertPopYearData(planId: string, formData: FormData) {
  const caller = await requireAdmin()
  const year          = parseInt(formData.get("year") as string)
  const currentEbitda = parseFloat(formData.get("currentEbitda") as string) || 0
  await popPrisma().popYearData.upsert({
    where:  { popPlanId_year: { popPlanId: planId, year } },
    update: { currentEbitda },
    create: { popPlanId: planId, year, currentEbitda },
  })
  await audit(caller.email!, "UPSERT_POP_YEAR", `PopPlan:${planId}`, undefined, { year, currentEbitda })
  revalidatePath("/admin/pop/" + planId)
  revalidatePath("/")
}

export async function deletePopYearData(yearDataId: string, planId: string) {
  const caller = await requireAdmin()
  await popPrisma().popYearData.delete({ where: { id: yearDataId } })
  await audit(caller.email!, "DELETE_POP_YEAR", `PopPlan:${planId}`)
  revalidatePath("/admin/pop/" + planId)
}

export async function upsertPopAssignment(planId: string, formData: FormData) {
  const caller = await requireAdmin()
  const userId     = formData.get("userId") as string
  const grantDateRaw = formData.get("grantDate") as string
  const data = {
    sharePercent: parseFloat(formData.get("sharePercent") as string) || 0,
    grantDate:    grantDateRaw ? new Date(grantDateRaw) : new Date(),
    grantEbitda:  parseFloat(formData.get("grantEbitda") as string) || 0,
  }
  await popPrisma().popAssignment.upsert({
    where:  { userId_popPlanId: { userId, popPlanId: planId } },
    update: data,
    create: { userId, popPlanId: planId, ...data },
  })
  await audit(caller.email!, "UPSERT_POP_ASSIGNMENT", `PopPlan:${planId}`, undefined, { userId, ...data })
  revalidatePath("/admin/pop/" + planId)
  revalidatePath("/admin/parameters")
  revalidatePath("/")
}

export async function deletePopAssignment(assignmentId: string, planId: string) {
  const caller = await requireAdmin()
  await audit(caller.email!, "DELETE_POP_ASSIGNMENT", `PopAssignment:${assignmentId}`)
  await popPrisma().popAssignment.delete({ where: { id: assignmentId } })
  revalidatePath("/admin/pop/" + planId)
  revalidatePath("/admin/parameters")
  revalidatePath("/")
}

export async function markPopPaymentPaid(assignmentId: string, vestingYear: number, formData: FormData) {
  const caller = await requireAdmin()
  const amount = parseFloat(formData.get("amount") as string) || null
  await popPrisma().popPayment.upsert({
    where:  { assignmentId_vestingYear: { assignmentId, vestingYear } },
    update: { isPaid: true, paidAt: new Date(), amount: amount ?? undefined },
    create: { assignmentId, vestingYear, isPaid: true, paidAt: new Date(), amount: amount ?? undefined },
  })
  await audit(caller.email!, "MARK_POP_PAYMENT_PAID", `PopAssignment:${assignmentId}`, undefined, { vestingYear, amount })
  revalidatePath("/admin/pop")
  revalidatePath("/")
}

export async function markPopPaymentUnpaid(assignmentId: string, vestingYear: number, planId: string) {
  const caller = await requireAdmin()
  await popPrisma().popPayment.deleteMany({ where: { assignmentId, vestingYear } })
  await audit(caller.email!, "MARK_POP_PAYMENT_UNPAID", `PopAssignment:${assignmentId}`, undefined, { vestingYear })
  revalidatePath("/admin/pop/" + planId)
  revalidatePath("/")
}

// ─── VESTING PLATBY ───────────────────────────────────────────────────────────

export async function markVestingPaid(compensationId: string, vestingYear: number, formData: FormData) {
  const caller = await requireAdmin()
  const amount = parseFloat(formData.get("amount") as string) || null

  // Načti vestingPercent z Compensation aby percentage nebylo 0
  const comp = await prisma.compensation.findUnique({
    where: { id: compensationId },
    select: { vestingPercent: true },
  })
  const percentage = (comp as { vestingPercent: number } | null)?.vestingPercent ?? 25

  await prisma.vestingPayment.upsert({
    where:  { compensationId_vestingYear: { compensationId, vestingYear } },
    update: { isPaid: true, paidAt: new Date(), amount: amount ?? undefined },
    create: { compensationId, vestingYear, percentage, isPaid: true, paidAt: new Date(), amount: amount ?? undefined },
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
