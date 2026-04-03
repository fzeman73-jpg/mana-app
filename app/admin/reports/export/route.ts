import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { calcBonus, calcPOP, calcVestingSchedule, yearsSinceDate } from "@/lib/calculator"
import * as XLSX from "xlsx"

export async function GET(req: NextRequest) {
  const session = await auth()
  const caller  = await prisma.user.findUnique({ where: { email: session?.user?.email || "" } })
  if (caller?.role !== "ADMIN") return NextResponse.json({ error: "Přístup odepřen" }, { status: 403 })

  const periodId = req.nextUrl.searchParams.get("periodId")
  if (!periodId) return NextResponse.json({ error: "Chybí periodId" }, { status: 400 })

  const period = await prisma.period.findUnique({ where: { id: periodId } })
  if (!period) return NextResponse.json({ error: "Období nenalezeno" }, { status: 404 })

  const [compensations, perfParams, vestingBase, boosters] = await Promise.all([
    prisma.compensation.findMany({
      where:   { periodId },
      include: { user: true, payments: true },
    }),
    prisma.performanceParameter.findMany({
      where:   { periodId },
      include: { results: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.vestingBase.findUnique({ where: { periodId } }),
    prisma.strategicBooster.findMany({ where: { periodId } }),
  ])

  const now  = new Date()
  const curQ = Math.ceil((now.getMonth() + 1) / 3)
  const curY = now.getFullYear()

  const wb = XLSX.utils.book_new()

  // ── List 1: Přehled bonusů ────────────────────────────────────────────────
  const bonusRows: unknown[][] = [
    ["Manažer", "Cílový bonus (CZK)", "Vypočtený bonus (CZK)", "Plnění (%)", "KPI splněno"],
  ]

  for (const comp of compensations) {
    const kpiTasks = await prisma.kpiTask.findMany({ where: { userId: comp.userId, periodId } })
    const params = perfParams.map(p => {
      const res = p.results.find(r => r.quarter === curQ && r.year === curY)
      return {
        id:           p.id,
        name:         p.name,
        weight:       p.weight,
        threshold:    p.threshold,
        gatesParamId: p.gatesParamId,
        actual:       res?.actual ?? 0,
        target:       res?.target ?? 0,
      }
    })
    const bonus = calcBonus(params, comp.targetBonusAnnual, kpiTasks.map(t => ({ weight: t.weight, isCompleted: t.isCompleted })), (comp as unknown as { kpiWeight: number }).kpiWeight ?? 0)
    const pct   = comp.targetBonusAnnual > 0 ? Math.round(bonus.total / comp.targetBonusAnnual * 100) : 0
    const kpiDone = kpiTasks.filter(t => t.isCompleted).length
    bonusRows.push([comp.user.name ?? comp.user.email ?? "?", comp.targetBonusAnnual, Math.round(bonus.total), pct, `${kpiDone}/${kpiTasks.length}`])
  }

  const ws1 = XLSX.utils.aoa_to_sheet(bonusRows)
  ws1["!cols"] = [{ wch: 30 }, { wch: 20 }, { wch: 22 }, { wch: 12 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws1, "Bonusy")

  // ── List 2: POP závazek ───────────────────────────────────────────────────
  const popRows: unknown[][] = [
    ["Manažer", "Podíl (%)", "Grant EBITDA", "Grant koef.", "Aktuální EBITDA", "Akt. koef.", "Hodnota firmy při grantu", "Aktuální hodnota firmy", "Vytvořená hodnota", "Hrubý zisk POP (CZK)", "Vesting roků", "Roční splátka (CZK)"],
  ]

  for (const comp of compensations) {
    const pop = vestingBase ? calcPOP({
      sharePercent:    comp.sharePercent,
      grantEbitda:     comp.grantEbitda,
      grantMultiplier: comp.grantMultiplier,
      currentEbitda:   vestingBase.currentEbitda,
      baseMultiplier:  vestingBase.baseMultiplier,
      boosters:        boosters.map(b => ({ multiplierBoost: b.multiplierBoost, isAchieved: b.isAchieved })),
    }) : null

    const vestingYears   = (comp as { vestingYears: number }).vestingYears ?? 4
    const vestingPercent = (comp as { vestingPercent: number }).vestingPercent ?? 25
    const annualAmount   = pop ? pop.grossGain * (vestingPercent / 100) : 0

    popRows.push([
      comp.user.name ?? comp.user.email ?? "?",
      comp.sharePercent,
      comp.grantEbitda,
      comp.grantMultiplier,
      vestingBase?.currentEbitda ?? 0,
      pop?.currentMultiplier ?? 0,
      Math.round(pop?.grantFirmValue ?? 0),
      Math.round(pop?.currentFirmValue ?? 0),
      Math.round(pop?.createdValue ?? 0),
      Math.round(pop?.grossGain ?? 0),
      vestingYears,
      Math.round(annualAmount),
    ])
  }

  const ws2 = XLSX.utils.aoa_to_sheet(popRows)
  ws2["!cols"] = Array(12).fill({ wch: 20 })
  XLSX.utils.book_append_sheet(wb, ws2, "POP závazek")

  // ── List 3: Vesting splátky ────────────────────────────────────────────────
  const vestingRows: unknown[][] = [
    ["Manažer", "Rok od grantu", "% z POP", "Částka (CZK)", "Zaplaceno", "Datum platby"],
  ]

  for (const comp of compensations) {
    const pop = vestingBase ? calcPOP({
      sharePercent:    comp.sharePercent,
      grantEbitda:     comp.grantEbitda,
      grantMultiplier: comp.grantMultiplier,
      currentEbitda:   vestingBase.currentEbitda,
      baseMultiplier:  vestingBase.baseMultiplier,
      boosters:        boosters.map(b => ({ multiplierBoost: b.multiplierBoost, isAchieved: b.isAchieved })),
    }) : null

    const vestingPercent = (comp as { vestingPercent: number }).vestingPercent ?? 25
    const vestingYears   = (comp as { vestingYears: number }).vestingYears ?? 4
    const schedule = pop ? calcVestingSchedule({
      grossGain:       pop.grossGain,
      vestingYears,
      vestingPercent,
      yearsSinceGrant: yearsSinceDate(comp.grantDate),
    }) : []

    for (const s of schedule) {
      const payment = comp.payments.find(p => p.vestingYear === s.year)
      vestingRows.push([
        comp.user.name ?? comp.user.email ?? "?",
        s.year,
        s.percentage,
        Math.round(s.amount),
        payment?.isPaid ? "Ano" : "Ne",
        payment?.paidAt ? new Date(payment.paidAt).toLocaleDateString("cs-CZ") : "",
      ])
    }
  }

  const ws3 = XLSX.utils.aoa_to_sheet(vestingRows)
  ws3["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 10 }, { wch: 14 }]
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
