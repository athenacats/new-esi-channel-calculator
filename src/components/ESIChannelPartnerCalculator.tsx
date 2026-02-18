import { useMemo, useState } from "react";
import { useRef } from "react";
import * as html2pdf from "html2pdf.js";

const currencyFmt = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const pctFmt = (n: number | string) => `${(Number(n) || 0).toFixed(1)}%`;

function numberFromInput(v: any, fallback = 0): any {
  if (v === "") return "";
  if (v === null || v === undefined) return fallback;

  const n =
    typeof v === "number" ? v : Number(String(v).replace(/[^0-9.\-]/g, ""));

  return Number.isFinite(n) ? n : fallback;
}

const DEFAULT_COMMISSION_PCT = 15;
const DEFAULT_BOOK_PCT = 100;

export default function EsiChannelPartnerRoiCalculator() {
  /* ---------------- STATES ---------------- */
  const [tiers, setTiers] = useState<
    Array<{ label: string; amount: number; pct: number }>
  >([{ label: "Book 1", amount: 250000, pct: 5 }]);

  const [inputMode, setInputMode] = useState<"byClients" | "byWSE">(
    "byClients"
  );
  const [clients, setClients] = useState(20);
  const [avgWsePerClient, setAvgWsePerClient] = useState(18);
  const [totalWseDirect, setTotalWseDirect] = useState(360);
  const [avgAnnualWage, setAvgAnnualWage] = useState(55000);
  const [mgmtFeePerWse, setMgmtFeePerWse] = useState(1500);
  const [conversionRate, setConversionRate] = useState(25);
  const pdfRef = useRef<HTMLDivElement>(null);
  const [masterPlanPct, setMasterPlanPct] = useState(1);

  /* ---------------- DERIVED ---------------- */

  const totalBookCommission = useMemo(() => {
    return tiers.reduce(
      (sum, t) =>
        sum + numberFromInput(t.amount) * (numberFromInput(t.pct) / 100),
      0
    );
  }, [tiers]);

  const masterPlanCommission = totalBookCommission * (masterPlanPct / 100);

  const totalWse = useMemo(() => {
    return inputMode === "byClients"
      ? numberFromInput(clients) * numberFromInput(avgWsePerClient)
      : numberFromInput(totalWseDirect);
  }, [inputMode, clients, avgWsePerClient, totalWseDirect]);

  const convertedWse = useMemo(() => {
    return Math.round(totalWse * (numberFromInput(conversionRate) / 100));
  }, [totalWse, conversionRate]);

  const totalPayroll = useMemo(() => {
    return numberFromInput(totalWse) * numberFromInput(avgAnnualWage);
  }, [totalWse, avgAnnualWage]);

  const grossMgmtFee = useMemo(() => {
    return convertedWse * numberFromInput(mgmtFeePerWse);
  }, [convertedWse, mgmtFeePerWse]);

  const commissionFromRate = (ratePct: number) =>
    grossMgmtFee * (numberFromInput(ratePct) / 100);

  const mgmtFeeCommission = commissionFromRate(DEFAULT_COMMISSION_PCT);
  const adjustedBook = totalBookCommission * (DEFAULT_BOOK_PCT / 100);
  const totalRevenue = mgmtFeeCommission + adjustedBook + masterPlanCommission;
  const valueAddedAbsTotal = totalRevenue - totalBookCommission;

  const valueAddedPctTotal =
    totalBookCommission > 0
      ? (valueAddedAbsTotal / totalBookCommission) * 100
      : 0;

  const mgmtShareTotal =
    totalRevenue > 0 ? (mgmtFeeCommission / totalRevenue) * 100 : 0;

  const bookShareTotal =
    totalRevenue > 0 ? (adjustedBook / totalRevenue) * 100 : 0;

  // Scenario rows (per book) + totals for the table
  const scenarioRows = useMemo(() => {
    const commissionPct = DEFAULT_COMMISSION_PCT;
    const bookPct = DEFAULT_BOOK_PCT;
    const masterPct = masterPlanPct;

    // This is global (from WSE inputs) and is the same for every row unless you later decide to allocate it.
    const mgmtCommissionEach = grossMgmtFee * (commissionPct / 100);

    const rows = tiers.map((t) => {
      const bookCommission =
        numberFromInput(t.amount) * (numberFromInput(t.pct) / 100);
      const adjustedBookLocal = bookCommission * (bookPct / 100);
      const masterLocal = bookCommission * (masterPct / 100);

      const totalRevenueLocal =
        mgmtCommissionEach + adjustedBookLocal + masterLocal;

      const upliftAbsLocal = totalRevenueLocal - bookCommission;
      const upliftPctLocal =
        bookCommission > 0 ? (upliftAbsLocal / bookCommission) * 100 : 0;

      const mgmtShareLocal =
        totalRevenueLocal > 0
          ? (mgmtCommissionEach / totalRevenueLocal) * 100
          : 0;
      const bookShareLocal =
        totalRevenueLocal > 0
          ? (adjustedBookLocal / totalRevenueLocal) * 100
          : 0;

      return {
        label: t.label,
        mgmtCommission: mgmtCommissionEach,
        bookCommission,
        adjustedBook: adjustedBookLocal,
        master: masterLocal,
        totalRevenue: totalRevenueLocal,
        upliftAbs: upliftAbsLocal,
        upliftPct: upliftPctLocal,
        mgmtShare: mgmtShareLocal,
        bookShare: bookShareLocal,
      };
    });

    const totals = rows.reduce(
      (acc, r) => {
        acc.mgmtCommission += r.mgmtCommission;
        acc.adjustedBook += r.adjustedBook;
        acc.master += r.master;
        acc.totalRevenue += r.totalRevenue;
        return acc;
      },
      { mgmtCommission: 0, adjustedBook: 0, master: 0, totalRevenue: 0 }
    );

    const totalBookBase = totalBookCommission; // sum of all book commissions
    const valueAddedAbs = totals.totalRevenue - totalBookBase;
    const valueAddedPct =
      totalBookBase > 0 ? (valueAddedAbs / totalBookBase) * 100 : 0;

    const mgmtShareTotal =
      totals.totalRevenue > 0
        ? (totals.mgmtCommission / totals.totalRevenue) * 100
        : 0;
    const bookShareTotal =
      totals.totalRevenue > 0
        ? (totals.adjustedBook / totals.totalRevenue) * 100
        : 0;

    return {
      rows,
      totals: {
        ...totals,
        totalBookBase,
        valueAddedAbs,
        valueAddedPct,
        mgmtShareTotal,
        bookShareTotal,
      },
    };
  }, [tiers, grossMgmtFee, masterPlanPct, totalBookCommission]);

  /* ---------------- HANDLERS ---------------- */

  function updateTier(
    idx: number,
    key: "label" | "amount" | "pct",
    value: any
  ) {
    setTiers((prev) =>
      prev.map((t, i) => (i === idx ? { ...t, [key]: value } : t))
    );
  }

  function addTier() {
    if (tiers.length >= 5) return;
    setTiers((prev) => [
      ...prev,
      { label: `Book ${prev.length + 1}`, amount: 250000, pct: 5 },
    ]);
  }

  function removeTier(idx: number) {
    setTiers((prev) => prev.filter((_, i) => i !== idx));
  }

  function resetAll() {
    setTiers([{ label: "Book 1", amount: 250000, pct: 5 }]);
    setInputMode("byClients");
    setClients(20);
    setAvgWsePerClient(18);
    setTotalWseDirect(360);
    setAvgAnnualWage(55000);
    setMgmtFeePerWse(1500);
    setConversionRate(25);
    setMasterPlanPct(1);
  }

  async function exportPDF() {
    const element = pdfRef.current;
    if (!element) return;

    const opt: any = {
      margin: 0,
      filename: "ESI-Channel-ROI-Calculator.pdf",
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: "#252a2f",
        scrollY: 0,
        scrollX: 0,
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    };
    element.classList.add("exporting");
    try {
      await (html2pdf as any)
        .default() // required for ES imports
        .set(opt)
        .from(element)
        .save();
    } finally {
      element.classList.remove("exporting");
    }
  }

  /* ---------------- UI START ---------------- */
  return (
    <div
      ref={pdfRef}
      id="pdf-wrapper"
      className="bg-[#252a2f]"
      style={{ backgroundColor: "#252a2f", opacity: 1, isolation: "isolate" }}
    >
      {
        <div
          className="
      max-w-6xl mx-auto p-8 rounded-2xl
      bg-[var(--card)] border border-[var(--line)]
      shadow-[0_0_30px_rgba(0,0,0,0.45)]
    "
        >
          {/* HEADER */}
          <div className="mb-5 flex items-center justify-between">
            <h1
              className="
          text-3xl font-poppins font-bold 
          text-[var(--accent)]
          
        "
            >
              ESI Channel Partner ROI Calculator
            </h1>

            <button
              onClick={resetAll}
              className="
            px-4 py-2 rounded-xl text-sm
            border border-[var(--line)]
            text-white bg-[var(--soft)]
            hover:shadow-[0_0_15px_rgba(52,223,169,0.35)]
            hover:border-[var(--accent)]
            transition-all duration-200 cursor-pointer
          "
            >
              Reset
            </button>
          </div>
          <div className="mb-5 flex items-center justify-between">
            <p
              className="
          text-l font-poppins font-normal text-white
          
        "
            >
              A high level summary of your estimated commissions and revenue
              outcomes based on the inputs below.
            </p>
          </div>

          {/* SUMMARY CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            {/* CARD */}
            <div
              className="
          rounded-2xl p-5 border border-[var(--line)] glass animate-slide animate-neon
          shadow-[0_0_20px_rgba(0,0,0,0.35)]
        "
            >
              <div className="text-sm text-[var(--muted)]">
                Current Annual Commission (Book)
              </div>
              <div
                className="
            text-3xl font-bold mt-1
            text-[var(--accent)]
            
          "
              >
                {currencyFmt.format(totalBookCommission)}
              </div>
            </div>

            <div
              className="
          rounded-2xl p-5 border border-[var(--line)] glass animate-slide animate-neon
          shadow-[0_0_20px_rgba(0,0,0,0.35)]
        "
            >
              <div className="text-sm text-[var(--muted)]">
                Converted WSE to ESI
              </div>
              <div
                className="
            text-3xl font-bold mt-1
            text-[var(--accent)]
            
          "
              >
                {convertedWse.toLocaleString()}
              </div>
              <div className="text-xs text-[var(--muted)]">
                of {totalWse.toLocaleString()} total WSE
              </div>
            </div>

            <div
              className="
          rounded-2xl p-5 border border-[var(--line)] glass animate-slide animate-neon
          shadow-[0_0_20px_rgba(0,0,0,0.35)]
        "
            >
              <div className="text-sm text-[var(--muted)]">
                Gross Management Fee (Annual)
              </div>
              <div
                className="
            text-3xl font-bold mt-1
            text-[var(--accent)]
            
          "
              >
                {currencyFmt.format(grossMgmtFee)}
              </div>
            </div>
          </div>

          {/* ========== SECTION 1 — CURRENT BOOK ========== */}
          <section
            className="
        rounded-2xl p-6 mb-12
        bg-[var(--soft)] border border-[var(--line)] glass animate-slide animate-neon
        shadow-[0_0_20px_rgba(0,0,0,0.35)]
      "
          >
            <h2
              className="
          text-xl font-poppins font-semibold mb-4
          text-[var(--accent)]
          
        "
            >
              1. Current Book of Business
            </h2>

            <p className="text-sm text-[var(--muted)] mb-4">
              Add up to five books to mirror your existing commission structure.
            </p>

            <div className="space-y-4">
              {tiers.map((t, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-3 items-end">
                  {/* LABEL */}
                  <div className="col-span-12 sm:col-span-4">
                    <label className="block text-xs text-white mb-1">
                      Book
                    </label>
                    <input
                      type="text"
                      value={t.label}
                      onChange={(e) => updateTier(idx, "label", e.target.value)}
                      className="
                    w-full rounded-xl 
                    bg-[#1d2023] border border-[var(--line)]
                    px-3 py-2 text-white
                    focus:outline-none focus:ring-2 
                    focus:ring-[var(--accent)]
                  "
                    />
                  </div>

                  {/* AMOUNT */}
                  <div className="col-span-12 sm:col-span-4">
                    <label className="block text-xs text-white mb-1">
                      Total Book Amount ($)
                    </label>
                    <input
                      type="number"
                      value={t.amount}
                      min={0}
                      step={100}
                      onChange={(e) =>
                        updateTier(
                          idx,
                          "amount",
                          numberFromInput(e.target.value)
                        )
                      }
                      className="
                    w-full rounded-xl 
                    bg-[#1d2023] border border-[var(--line)]
                    px-3 py-2 text-white
                    focus:outline-none focus:ring-2 
                    focus:ring-[var(--accent)]
                  "
                    />
                  </div>

                  {/* COMMISSION % */}
                  <div className="col-span-10 sm:col-span-3">
                    <label className="block text-xs text-white mb-1">
                      Commission %
                    </label>
                    <input
                      type="number"
                      value={t.pct}
                      min={0}
                      max={100}
                      step={0.1}
                      onChange={(e) =>
                        updateTier(idx, "pct", numberFromInput(e.target.value))
                      }
                      className="
                    w-full rounded-xl 
                    bg-[#1d2023] border border-[var(--line)]
                    px-3 py-2 text-white
                    focus:outline-none focus:ring-2 
                    focus:ring-[var(--accent)]
                  "
                    />
                  </div>

                  {/* REMOVE BUTTON */}
                  <div className="col-span-2 sm:col-span-1 flex justify-end">
                    {tiers.length > 1 && (
                      <button
                        onClick={() => removeTier(idx)}
                        className="
                      px-3 py-2 rounded-xl text-sm 
                      border border-[var(--line)] text-white
                      hover:border-red-400 hover:text-red-400
                      hover:shadow-[0_0_10px_rgba(255,0,0,0.35)]
                      transition-all duration-150
                    "
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))}

              <div className="flex items-center gap-4 mt-4">
                <button
                  onClick={addTier}
                  disabled={tiers.length >= 5}
                  className="
                px-4 py-2 rounded-xl text-sm 
                border border-[var(--line)] text-white
                hover:border-[var(--accent)]
                hover:shadow-[0_0_10px_rgba(52,223,169,0.45)]
                disabled:opacity-40
                transition-all duration-150
              "
                >
                  + Add Book
                </button>

                <div className="text-sm text-[var(--muted)]">
                  Current Book Commission Total:{" "}
                  <span className="text-[var(--accent)] font-semibold">
                    {currencyFmt.format(totalBookCommission)}
                  </span>
                </div>
              </div>
            </div>
          </section>
          {/* ========== SECTION 2 — ESI OPPORTUNITY ========== */}
          <section
            className="
        rounded-2xl p-6 mb-12
        bg-[var(--soft)] border border-[var(--line)] glass animate-slide animate-neon
        shadow-[0_0_20px_rgba(0,0,0,0.35)]
      "
          >
            <h2
              className="
          text-xl font-poppins font-semibold mb-4
          text-[var(--accent)]
          
        "
            >
              2. ESI Opportunity (Management Fee)
            </h2>

            <p className="text-sm text-[var(--muted)] mb-6">
              Estimate worksite employees (WSE) and commissions from ESI’s
              management fee.
            </p>

            {/* Mode Selector */}
            <div className="mb-6 flex gap-6 text-sm text-white">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="mode"
                  checked={inputMode === "byClients"}
                  onChange={() => setInputMode("byClients")}
                />
                Estimate by clients × avg. WSE
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="mode"
                  checked={inputMode === "byWSE"}
                  onChange={() => setInputMode("byWSE")}
                />
                Enter total WSE directly
              </label>
            </div>

            {/* Inputs */}
            {inputMode === "byClients" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-xs text-white mb-1">
                    Number of Clients
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={clients}
                    onChange={(e) =>
                      setClients(numberFromInput(e.target.value))
                    }
                    className="
                  w-full rounded-xl bg-[#1d2023] border border-[var(--line)]
                  px-3 py-2 text-white
                  focus:outline-none focus:ring-2 focus:ring-[var(--accent)]
                "
                  />
                </div>
                <div>
                  <label className="block text-xs text-white mb-1">
                    Avg. WSE per Client
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={avgWsePerClient}
                    onChange={(e) =>
                      setAvgWsePerClient(numberFromInput(e.target.value))
                    }
                    className="
                  w-full rounded-xl bg-[#1d2023] border border-[var(--line)]
                  px-3 py-2 text-white
                  focus:outline-none focus:ring-2 focus:ring-[var(--accent)]
                "
                  />
                </div>
              </div>
            ) : (
              <div className="mb-6">
                <label className="block text-xs text-white mb-1">
                  Total WSE (direct)
                </label>
                <input
                  type="number"
                  min={0}
                  value={totalWseDirect}
                  onChange={(e) =>
                    setTotalWseDirect(numberFromInput(e.target.value))
                  }
                  className="
                w-full rounded-xl bg-[#1d2023] border border-[var(--line)]
                px-3 py-2 text-white
                focus:outline-none focus:ring-2 focus:ring-[var(--accent)]
              "
                />
              </div>
            )}

            {/* Additional Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
              <div>
                <label className="block text-xs text-white mb-1">
                  Avg. Annual Wage ($)
                </label>
                <input
                  type="number"
                  min={0}
                  step={500}
                  value={avgAnnualWage}
                  onChange={(e) =>
                    setAvgAnnualWage(numberFromInput(e.target.value))
                  }
                  className="
                w-full rounded-xl bg-[#1d2023] border border-[var(--line)]
                px-3 py-2 text-white
                focus:outline-none focus:ring-2 focus:ring-[var(--accent)]
              "
                />
                <div className="text-xs text-[var(--muted)] mt-1">
                  Total payroll:{" "}
                  <span className="text-[var(--accent)] font-semibold">
                    {currencyFmt.format(totalPayroll)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs text-white mb-1">
                  Management Fee per WSE ($)
                </label>
                <input
                  type="number"
                  min={0}
                  value={mgmtFeePerWse}
                  onChange={(e) =>
                    setMgmtFeePerWse(numberFromInput(e.target.value))
                  }
                  className="
                w-full rounded-xl bg-[#1d2023] border border-[var(--line)]
                px-3 py-2 text-white
                focus:outline-none focus:ring-2 focus:ring-[var(--accent)]
              "
                />
                <div className="text-xs text-[var(--muted)] mt-1">
                  Gross fee on converted WSE:{" "}
                  <span className="text-[var(--accent)] font-semibold">
                    {currencyFmt.format(grossMgmtFee)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs text-white mb-1">
                  Conversion Rate %
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={conversionRate}
                    onChange={(e) =>
                      setConversionRate(numberFromInput(e.target.value))
                    }
                    className="w-full accent-[var(--accent)]"
                  />
                  <span className="text-sm w-10 text-right text-white">
                    {Math.round(conversionRate)}%
                  </span>
                </div>
              </div>
            </div>
            {/* ========== DYNAMIC TIER SUMMARY (REPLACES STATIC EXAMPLE) ========== */}
            <h3 className="text-sm font-semibold mb-3 text-white">
              Summary of Your Book Revenue Scenarios
            </h3>

            <div className="grid grid-cols-5 gap-4 text-sm text-white mb-2">
              <div>Scenario</div>
              <div className="text-right">Management Fee Commission</div>
              <div className="text-right">Your Current Book</div>
              <div className="text-right">Total Revenue</div>
              <div className="text-right">Value Added</div>
            </div>

            {scenarioRows.rows.map((r) => (
              <div
                key={r.label}
                className="grid grid-cols-5 gap-4 text-sm text-white py-3 border-t border-[var(--line)]"
              >
                <div className="font-semibold">{r.label}</div>

                <div className="text-right">
                  {currencyFmt.format(r.mgmtCommission)}
                  <div className="text-xs text-[var(--muted)]">
                    {pctFmt(r.mgmtShare)} of total
                  </div>
                </div>

                <div className="text-right">
                  {currencyFmt.format(r.adjustedBook)}
                  <div className="text-xs text-[var(--muted)]">
                    {pctFmt(r.bookShare)} of total
                  </div>
                </div>

                <div className="text-right">
                  {currencyFmt.format(r.totalRevenue)}
                </div>

                <div className="text-right">
                  {pctFmt(r.upliftPct)}
                  <div className="text-xs text-[var(--muted)]">
                    {currencyFmt.format(r.upliftAbs)} added
                  </div>
                </div>
              </div>
            ))}

            {tiers.length > 1 && (
              <div className="grid grid-cols-5 gap-4 text-sm text-white py-3 border-t border-[var(--line)]">
                <div className="font-semibold">Total</div>

                <div className="text-right">
                  {currencyFmt.format(scenarioRows.totals.mgmtCommission)}
                  <div className="text-xs text-[var(--muted)]">
                    {pctFmt(scenarioRows.totals.mgmtShareTotal)} of total
                  </div>
                </div>

                <div className="text-right">
                  {currencyFmt.format(scenarioRows.totals.adjustedBook)}
                  <div className="text-xs text-[var(--muted)]">
                    {pctFmt(scenarioRows.totals.bookShareTotal)} of total
                  </div>
                </div>

                <div className="text-right">
                  {currencyFmt.format(scenarioRows.totals.totalRevenue)}
                </div>

                <div className="text-right">
                  {pctFmt(scenarioRows.totals.valueAddedPct)}
                  <div className="text-xs text-[var(--muted)]">
                    {currencyFmt.format(scenarioRows.totals.valueAddedAbs)}{" "}
                    added
                  </div>
                </div>
              </div>
            )}
          </section>
          <button
            onClick={exportPDF}
            className="
            m-auto px-4 py-2 rounded-xl text-sm
            border border-[var(--line)]
            text-white bg-[var(--soft)]
            hover:shadow-[0_0_15px_rgba(52,223,169,0.35)]
            hover:border-[var(--accent)]
            transition-all duration-200 cursor-pointer
          "
          >
            Download PDF Summary
          </button>

          {/* ========== SECTION 3 — TALKING POINTS ========== */}
          <section
            className="
        rounded-2xl p-6 mt-6
        bg-[var(--soft)] border border-[var(--line)] glass animate-slide animate-neon
        shadow-[0_0_20px_rgba(0,0,0,0.35)]
      "
          >
            <h2
              className="
          text-xl font-poppins font-semibold mb-4
          text-[var(--accent)]
          
        "
            >
              3. Understanding Your Estimated Earnings
            </h2>

            <ul className="list-disc pl-6 text-sm text-white space-y-2">
              <li>
                Your current book commission is based on your
                <span className="font-semibold text-[var(--accent)]">
                  {" "}
                  annualized book of business
                </span>
                . This calculator uses your entered book structure to estimate
                those totals.
              </li>

              <li>
                ESI’s management fee creates a
                <span className="font-semibold text-[var(--accent)]">
                  {" "}
                  new supplemental revenue stream
                </span>{" "}
                that adds to your existing book rather than replacing it.
              </li>

              <li>
                You indicated a{" "}
                <span className="text-[var(--accent)] font-semibold">
                  {Math.round(conversionRate)}%
                </span>{" "}
                conversion, this scenario generates{" "}
                <span className="text-[var(--accent)] font-semibold">
                  {currencyFmt.format(mgmtFeeCommission)}
                </span>{" "}
                in management-fee commissions, bringing your total estimated
                revenue to{" "}
                <span className="text-[var(--accent)] font-semibold">
                  {currencyFmt.format(totalRevenue)}
                </span>
                .
              </li>

              <li>
                All values shown are illustrative. Actual compensation depends
                on client mix, underwriting requirements, eligibility, and final
                agreements.
              </li>
            </ul>
          </section>

          {/* FOOTER */}
          <footer className="mt-6 text-xs text-[var(--muted)] text-center">
            <p>
              This calculator provides a high level illustration based solely on
              the information entered above. It is not a quote or guarantee. For
              advanced AOR scenarios, custom commission structures, multi-tier
              book analysis, or full revenue optimization models, please contact
              our sales team. <br></br>
              <br></br> Your current book commission is estimated based on your
              annualized group health insurance billing. If eligible, placing
              your book on ESI’s Master Health Plan may provide an additional
              commission percentage (default: 1 percent in this model). Actual
              qualification depends on underwriting requirements and plan
              participation rules.
            </p>
          </footer>
        </div>
      }
    </div>
  );
}
