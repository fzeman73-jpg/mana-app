import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { calcBonus, calcPOP, calcVestingSchedule } from "@/lib/calculator"
import * as XLSX from "xlsx"

// ── Types for new POP system ──────────────────────────────────────────────────
type PopBooster    = { multiplierBoost: number; isAchieved: boolean }
type PopYearData   = { year: number; currentEbitda: number }
type PopPlanData   = {
  id: string; name: string
  baseMultiplier: number; grantEbitda: number
  vestingGranularity: string; vestingYears: number
  vestingPaymentDay: number; vestingPaymentMonth: number; vestingQuarters: number
  minGrowthPercent: number
  boosters: PopBooster[]
  yearData: PopYearData[]
}
type PopPaymentRec = { vestingYear: number; isPaid: boolean; paidAt: Date | null; amount: number | null }
type PopAssignRec  = {
  id: string; userId: string
  sharePercent: number; grantDate: Date; grantEbitda: number
  user: { name: string | null; email: string | null }
  popPlan: PopPlanData
  payments: PopPaymentRec[]
}

function castPrisma() {
  return prisma as unknown as {
    popAssignment: { findMany: (a: object) => Promise<unknown[]> }
    parameterWeight: { findMany: (a: object) => Promise<{ parameterId: string; weight: number }[]> }
  }
}

export async function GET(req: NextRequest) {
  const session = await auth()
  const caller  = await prisma.user.findUnique({ where: { email: session?.user?.email || "" } })
  if (caller?.role !== "ADMIN") return NextResponse.json({ error: "Přístup odepřen" }, { status: 403 })

  const periodId = req.nextUrl.searchParams.get("periodId")
  if (!periodId) return NextResponse.json({ error: "Chybí periodId" }, { status: 400 })

  const period = await prisma.period.findUnique({ where: { id: periodId } })
  if (!period) return NextResponse.json({ error: "Období nenalezeno" }, { status: 404 })

  const now  = new Date()
  const curQ = Math.ceil((now.getMonth() + 1) / 3)
  const curY = now.getFullYear()

  const [compensations, perfParams] = await Promise.all([
    prisma.compensation.findMany({
      where:   { periodId },
      include: { user: true },
    }),
    prisma.performanceParameter.findMany({
      where:   { periodId },
      include: { results: true },
      orderBy: { sortOrder: "asc" },
    }),
  ])

  // POP assignments – global, not period-scoped
  const rawAssignments = await castPrisma().popAssignment.findMany({
    include: {
      user:    true,
      payments: true,
      popPlan: { include: { boosters: true, yearData: { orderBy: { year: "asc" } } } },
    },
    orderBy: { user: { name: "asc" } },
  })
  const popAssignments = rawAssignments as PopAssignRec[]

  const wb = XLSX.utils.book_new()

  // ── List 1: Přehled bonusů ────────────────────────────────────────────────
  const bonusRows: unknown[][] = [
    ["Manažer", "Cílový bonus (CZK)", "Vypočtený bonus (CZK)", "Plnění (%)", "KPI splněno"],
  ]

  for (const comp of compensations) {
    const kpiTasks   = await prisma.kpiTask.findMany({ where: { userId: comp.userId, periodId } })
    const userDivId  = comp.user.divisionId
    const weightRows = await castPrisma().parameterWeight.findMany({ where: { userId: comp.userId } })
    const weightMap  = new Map(weightRows.map((r: { parameterId: string; weight: number }) => [r.parameterId, r.weight]))
    const params = perfParams
      .filter(p =>
        (p as unknown as { divisionId: string | null }).divisionId === null ||
        (p as unknown as { divisionId: string | null }).divisionId === userDivId
      )
      .map(p => {
        const res = p.results.find(r => r.quarter === curQ && r.year === curY)
        return {
          id:           p.id,
          name:         p.name,
          weight:       weightMap.get(p.id) ?? p.weight,
          threshold:    p.threshold,
          gatesParamId: p.gatesParamId,
          actual:       res?.actual ?? 0,
          target:       res?.target ?? 0,
        }
      })
    const bonus = calcBonus(params, comp.targetBonusAnnual, kpiTasks.map(t => {
      const tt = t as unknown as { taskType: string; completionPct: number | null; targetAmount: number | null; actualAmount: number | null }
      let cp = t.isCompleted ? 1 : 0
      if (tt.taskType === "PERCENT") cp = Math.min(1, (tt.completionPct ?? 0) / 100)
      else if (tt.taskType === "AMOUNT" && (tt.targetAmount ?? 0) > 0) cp = Math.min(1, (tt.actualAmount ?? 0) / tt.targetAmount!)
      return { weight: t.weight, completionPct: cp }
    }), (comp as unknown as { kpiWeight: number }).kpiWeight ?? 0)

    const bonusPct = comp.targetBonusAnnual > 0 ? Math.round(bonus.total / comp.targetBonusAnnual * 100) : 0
    const kpiDone  = kpiTasks.filter(t => t.isCompleted).length
    bonusRows.push([comp.user.name ?? comp.user.email ?? "?", comp.targetBonusAnnual, Math.round(bonus.total), bonusPct, `${kpiDone}/${kpiTasks.length}`])
  }

  const ws1 = XLSX.utils.aoa_to_sheet(bonusRows)
  ws1["!cols"] = [{ wch: 30 }, { wch: 20 }, { wch: 22 }, { wch: 12 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws1, "Bonusy")

  // ── List 2: POP závazek ───────────────────────────────────────────────────
  const popRows: unknown[][] = [
    ["Manažer", "Plán", "Podíl (%)", "Grant datum", "Akt. EBITDA", "Koef.", "Hodnota firmy při grantu", "Aktuální hodnota firmy", "Vytvořená hodnota", "Hurdle splněn", "Hrubý zisk POP (CZK)", "Vesting roků", "Roční splátka (CZK)"],
  ]

  for (const a of popAssignments) {
    const plan             = a.popPlan
    const latestYearData   = plan.yearData.at(-1)
    const effectiveGrantEbitda = a.grantEbitda > 0 ? a.grantEbitda : plan.grantEbitda
    const pop = latestYearData ? calcPOP({
      sharePercent:     a.sharePercent,
      grantEbitda:      effectiveGrantEbitda,
      grantMultiplier:  plan.baseMultiplier,
      currentEbitda:    latestYearData.currentEbitda,
      baseMultiplier:   plan.baseMultiplier,
      boosters:         plan.boosters,
      minGrowthPercent: plan.minGrowthPercent,
    }) : null

    const annualAmount = pop && pop.grossGain > 0 ? pop.grossGain / plan.vestingYears : 0

    popRows.push([
      a.user.name ?? a.user.email ?? "?",
      plan.name,
      a.sharePercent,
      new Date(a.grantDate).toLocaleDateString("cs-CZ"),
      latestYearData?.currentEbitda ?? 0,
      pop?.currentMultiplier ?? 0,
      Math.round(pop?.grantFirmValue ?? 0),
      Math.round(pop?.currentFirmValue ?? 0),
      Math.round(pop?.createdValue ?? 0),
      pop?.hurdleMet ? "Ano" : "Ne",
      Math.round(pop?.grossGain ?? 0),
      plan.vestingYears,
      Math.round(annualAmount),
    ])
  }

  const ws2 = XLSX.utils.aoa_to_sheet(popRows)
  ws2["!cols"] = Array(13).fill({ wch: 20 })
  XLSX.utils.book_append_sheet(wb, ws2, "POP závazek")

  // ── List 3: Vesting splátky ────────────────────────────────────────────────
  const vestingRows: unknown[][] = [
    ["Manažer", "Plán", "Rok od grantu", "% z POP", "Částka (CZK)", "Zaplaceno", "Datum platby", "Vyplacená částka"],
  ]

  for (const a of popAssignments) {
    const plan             = a.popPlan
    const latestYearData   = plan.yearData.at(-1)
    const effectiveGrantEbitda = a.grantEbitda > 0 ? a.grantEbitda : plan.grantEbitda
    const pop = latestYearData ? calcPOP({
      sharePercent:     a.sharePercent,
      grantEbitda:      effectiveGrantEbitda,
      grantMultiplier:  plan.baseMultiplier,
      currentEbitda:    latestYearData.currentEbitda,
      baseMultiplier:   plan.baseMultiplier,
      boosters:         plan.boosters,
      minGrowthPercent: plan.minGrowthPercent,
    }) : null

    const schedule = pop ? calcVestingSchedule({
      grossGain:           pop.grossGain,
      granularity:         "YEARLY",
      vestingYears:        plan.vestingYears,
      vestingPaymentDay:   plan.vestingPaymentDay,
      vestingPaymentMonth: plan.vestingPaymentMonth,
      vestingQuarters:     plan.vestingQuarters,
      grantYear:           new Date(a.grantDate).getFullYear(),
    }) : []

    for (const s of schedule) {
      const payment = a.payments.find(p => p.vestingYear === s.index)
      vestingRows.push([
        a.user.name ?? a.user.email ?? "?",
        plan.name,
        s.label,
        Math.round(s.percentage),
        Math.round(s.amount),
        payment?.isPaid ? "Ano" : "Ne",
        payment?.paidAt ? new Date(payment.paidAt).toLocaleDateString("cs-CZ") : "",
        payment?.amount ? Math.round(payment.amount) : "",
      ])
    }
  }

  const ws3 = XLSX.utils.aoa_to_sheet(vestingRows)
  ws3["!cols"] = [{ wch: 28 }, { wch: 20 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, ws3, "Vesting")

  // ── List 4: Snapshoty ──────────────────────────────────────────────────────
  const snapshots = await prisma.quarterlySnapshot.findMany({
    where:   { periodId },
    include: { user: true },
    orderBy: [{ year: "asc" }, { quarter: "asc" }],
  })

  const snapRows: unknown[][] = [
    ["Manažer", "Rok", "Kvartál", "Bonus (CZK)", "POP hodnota (CZK)"],
  ]
  for (const s of snapshots) {
    snapRows.push([s.user.name ?? s.user.email ?? "?", s.year, `Q${s.quarter}`, Math.round(s.bonusAmount), Math.round(s.popValue)])
  }

  const ws4 = XLSX.utils.aoa_to_sheet(snapRows)
  ws4["!cols"] = [{ wch: 28 }, { wch: 8 }, { wch: 10 }, { wch: 14 }, { wch: 18 }]
  XLSX.utils.book_append_sheet(wb, ws4, "Historie")

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

  return new NextResponse(buf, {
    headers: {
      "Content-Type":        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="report-${period.name.replace(/\s+/g, "-")}.xlsx"`,
    },
  })
}
