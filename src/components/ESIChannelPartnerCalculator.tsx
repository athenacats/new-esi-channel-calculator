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

export default function EsiChannelPartnerRoiCalculator() {
  /* ---------------- STATES ---------------- */
  const [tiers, setTiers] = useState<
    Array<{ label: string; amount: number; pct: number }>
  >([{ label: "Tier 1", amount: 250000, pct: 5 }]);

  const [inputMode, setInputMode] = useState<"byClients" | "byWSE">(
    "byClients"
  );
  const [clients, setClients] = useState(20);
  const [avgWsePerClient, setAvgWsePerClient] = useState(18);
  const [totalWseDirect, setTotalWseDirect] = useState(360);
  const [avgAnnualWage, setAvgAnnualWage] = useState(55000);
  const [mgmtFeePerWse, setMgmtFeePerWse] = useState(1200);
  const [conversionRate, setConversionRate] = useState(25);
  const pdfRef = useRef<HTMLDivElement>(null);
  const [masterPlanPct, setMasterPlanPct] = useState(1);

  const [customCommissionPct, setCustomCommissionPct] = useState(15);
  const [bookPortionPct, setBookPortionPct] = useState(100);

  const [tierCustom, setTierCustom] = useState<{
    [key: number]: {
      commissionPct: number;
      bookPct: number;
      masterPct: number;
    };
  }>({});

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

  const customCommission = commissionFromRate(customCommissionPct);
  const adjustedBook =
    totalBookCommission * (numberFromInput(bookPortionPct) / 100);

  const customTotalRevenue =
    customCommission + adjustedBook + masterPlanCommission;

  const customMgmtSharePct =
    customTotalRevenue > 0
      ? (customCommission / customTotalRevenue) * 100
      : NaN;

  const customBookSharePct =
    customTotalRevenue > 0 ? (adjustedBook / customTotalRevenue) * 100 : NaN;

  const customUpliftAbs = customTotalRevenue - totalBookCommission;

  const customUpliftPct =
    totalBookCommission > 0
      ? (customUpliftAbs / totalBookCommission) * 100
      : NaN;

  const perClientAddedRevCustom = clients
    ? customCommission / numberFromInput(clients)
    : 0;

  /* -------- STATIC SAMPLE (Standard CP) -------- */
  const STATIC_CP_MGMT = 21600;
  const STATIC_CP_BOOK = 12500;
  const STATIC_CP_TOTAL = STATIC_CP_MGMT + STATIC_CP_BOOK;
  const STATIC_CP_UPLIFT_ABS = STATIC_CP_TOTAL - STATIC_CP_BOOK;
  const STATIC_CP_UPLIFT_PCT = (STATIC_CP_UPLIFT_ABS / STATIC_CP_BOOK) * 100;
  const STATIC_CP_MGMT_SHARE = (STATIC_CP_MGMT / STATIC_CP_TOTAL) * 100;
  const STATIC_CP_BOOK_SHARE = (STATIC_CP_BOOK / STATIC_CP_TOTAL) * 100;

  /* ---------------- HANDLERS ---------------- */

  function ensureTierDefaults(idx: number) {
    if (!tierCustom[idx]) {
      setTierCustom((prev) => ({
        ...prev,
        [idx]: { commissionPct: 15, bookPct: 100, masterPct: 1 },
      }));
    }
  }

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
      { label: `Tier ${prev.length + 1}`, amount: 0, pct: 5 },
    ]);
  }

  function removeTier(idx: number) {
    setTiers((prev) => prev.filter((_, i) => i !== idx));
  }

  function resetAll() {
    setTiers([{ label: "Tier 1", amount: 250000, pct: 5 }]);
    setInputMode("byClients");
    setClients(20);
    setAvgWsePerClient(18);
    setTotalWseDirect(360);
    setAvgAnnualWage(55000);
    setMgmtFeePerWse(1200);
    setConversionRate(25);
    setCustomCommissionPct(15);
    setBookPortionPct(100);
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
      style={{ backgroundColor: "#252a2f" }}
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
          <div className="mb-10 ">
            <span
              className="
          text-l font-poppins font-semibold text-[var(--accent)] text-center"
            >
              Disclaimer:
            </span>
            <p
              className="
          text-sm font-poppins text-white
          
        "
            >
              This calculator provides a high level illustration based solely on
              the information entered above. For advanced AOR scenarios, custom
              commission structures, multi-tier book analysis, or full revenue
              optimization models, please contact our sales team.
              <br></br>
              <br></br>
              Your current book commission is estimated based on your annualized
              group health insurance billing. If eligible, placing your book on
              ESI’s Master Health Plan may provide an additional commission
              percentage (default: 1 percent in this model). Actual
              qualification depends on underwriting requirements and plan
              participation rules.
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
              Add up to five tiers to mirror your existing commission structure.
            </p>

            <div className="space-y-4">
              {tiers.map((t, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-3 items-end">
                  {/* LABEL */}
                  <div className="col-span-12 sm:col-span-4">
                    <label className="block text-xs text-white mb-1">
                      Label
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
                      Tier Amount ($)
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
                  + Add Tier
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

            {/* CUSTOM COMMISSION — NO SLIDERS */}
            <div
              className="
    rounded-2xl p-5 mb-6 
    bg-[var(--soft)] border border-[var(--line)]
    shadow-[0_0_20px_rgba(0,0,0,0.35)]
  "
            >
              <h3 className="text-sm font-semibold mb-4 text-white">
                Find Out Your Commission: Customize Below
              </h3>

              {/* TABLE HEADER */}
              <div className="grid grid-cols-5 gap-4 text-sm text-white mb-2">
                <div>Scenario</div>
                <div className="text-right">Mgmt Fee Commission</div>
                <div className="text-right">Your Current Book</div>
                <div className="text-right">Total Revenue</div>
                <div className="text-right">Value Added</div>
              </div>

              {tiers.map((t, idx) => {
                const cfg = tierCustom[idx] ?? {
                  commissionPct: 15,
                  bookPct: 100,
                  masterPct: 1,
                };

                const bookRevenue =
                  numberFromInput(t.amount) * (numberFromInput(t.pct) / 100);

                const mgmtCommission = grossMgmtFee * (cfg.commissionPct / 100);

                const adjustedBookLocal =
                  totalBookCommission * (cfg.bookPct / 100);

                const masterLocal = totalBookCommission * (cfg.masterPct / 100);

                const totalRevenueLocal =
                  mgmtCommission + adjustedBookLocal + masterLocal;

                const upliftAbsLocal = totalRevenueLocal - totalBookCommission;
                const upliftPctLocal =
                  totalBookCommission > 0
                    ? (upliftAbsLocal / totalBookCommission) * 100
                    : 0;

                return (
                  <div
                    key={idx}
                    className="grid grid-cols-5 gap-4 text-sm text-white py-4 border-t border-[var(--line)]"
                  >
                    {/* LABEL */}
                    <div className="font-semibold">{t.label}</div>

                    {/* MGMT COMMISSION */}
                    <div className="text-right">
                      <div className="text-[var(--accent)] font-semibold">
                        {currencyFmt.format(mgmtCommission)}
                      </div>
                      <div className="text-xs text-[var(--muted)]">
                        {pctFmt((mgmtCommission / totalRevenueLocal) * 100)} of
                        total
                      </div>

                      <label className="block text-xs text-[var(--muted)] mt-2">
                        Commission %
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={50}
                        value={cfg.commissionPct}
                        onChange={(e) =>
                          setTierCustom((prev) => ({
                            ...prev,
                            [idx]: {
                              ...cfg,
                              commissionPct: numberFromInput(e.target.value),
                            },
                          }))
                        }
                        className="w-20 bg-[#1d2023] border border-[var(--line)]
              rounded-lg px-2 py-1 text-right text-white
              focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                      />
                    </div>

                    {/* BOOK */}
                    <div className="text-right">
                      <div className="text-[var(--accent)] font-semibold">
                        {currencyFmt.format(adjustedBookLocal)}
                      </div>
                      <div className="text-xs text-[var(--muted)]">
                        {currencyFmt.format(bookRevenue)} base
                      </div>

                      <label className="block text-xs text-[var(--muted)] mt-2">
                        Book % of Base
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={cfg.bookPct}
                        onChange={(e) =>
                          setTierCustom((prev) => ({
                            ...prev,
                            [idx]: {
                              ...cfg,
                              bookPct: numberFromInput(e.target.value),
                            },
                          }))
                        }
                        className="w-20 bg-[#1d2023] border border-[var(--line)]
              rounded-lg px-2 py-1 text-right text-white
              focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                      />
                    </div>

                    {/* MASTER PLAN */}
                    <div className="text-right">
                      <div className="text-[var(--accent)] font-semibold">
                        {currencyFmt.format(masterLocal)}
                      </div>
                      <div className="text-xs text-[var(--muted)]">
                        {pctFmt(cfg.masterPct)} of book (optional)
                      </div>

                      <label className="block text-xs text-[var(--muted)] mt-2">
                        Master Plan %
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={5}
                        value={cfg.masterPct}
                        onChange={(e) =>
                          setTierCustom((prev) => ({
                            ...prev,
                            [idx]: {
                              ...cfg,
                              masterPct: numberFromInput(e.target.value),
                            },
                          }))
                        }
                        className="w-20 bg-[#1d2023] border border-[var(--line)]
              rounded-lg px-2 py-1 text-right text-white
              focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                      />
                    </div>

                    {/* TOTAL / VALUE */}
                    <div className="text-right">
                      <div className="text-[var(--accent)] font-semibold">
                        {currencyFmt.format(totalRevenueLocal)}
                      </div>
                    </div>

                    <div className="text-right">
                      {pctFmt(upliftPctLocal)}
                      <div className="text-xs text-[var(--muted)]">
                        {currencyFmt.format(upliftAbsLocal)} added
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ========== DYNAMIC TIER SUMMARY (REPLACES STATIC EXAMPLE) ========== */}
            <div
              className="
    rounded-2xl p-5 mb-6 
    bg-[var(--soft)] border border-[var(--line)]
    shadow-[0_0_20px_rgba(0,0,0,0.35)]
  "
            >
              <h3 className="text-sm font-semibold mb-3 text-white">
                Summary of Your Tier Revenue Scenarios
              </h3>

              <div className="grid grid-cols-5 gap-4 text-sm text-white mb-2">
                <div>Scenario</div>
                <div className="text-right">Management Fee Commission</div>
                <div className="text-right">Your Current Book</div>
                <div className="text-right">Total Revenue</div>
                <div className="text-right">Value Added</div>
              </div>

              {tiers.map((t, idx) => {
                const cfg = tierCustom[idx] ?? {
                  commissionPct: 15,
                  bookPct: 100,
                  masterPct: 1,
                };

                const bookRevenue =
                  numberFromInput(t.amount) * (numberFromInput(t.pct) / 100);

                const mgmtCommission = grossMgmtFee * (cfg.commissionPct / 100);

                const adjustedBookLocal =
                  totalBookCommission * (cfg.bookPct / 100);

                const masterLocal = totalBookCommission * (cfg.masterPct / 100);

                const totalRevenueLocal =
                  mgmtCommission + adjustedBookLocal + masterLocal;

                const upliftAbsLocal = totalRevenueLocal - totalBookCommission;

                const upliftPctLocal =
                  totalBookCommission > 0
                    ? (upliftAbsLocal / totalBookCommission) * 100
                    : 0;

                return (
                  <div className="grid grid-cols-5 gap-4 text-sm text-white py-3 border-t border-[var(--line)]">
                    <div className="font-semibold">{t.label}</div>

                    {/* Management Fee */}
                    <div className="text-right">
                      {currencyFmt.format(mgmtCommission)}
                      <div className="text-xs text-[var(--muted)]">
                        {pctFmt((mgmtCommission / totalRevenueLocal) * 100)} of
                        total
                      </div>
                    </div>

                    {/* Book */}
                    <div className="text-right">
                      {currencyFmt.format(adjustedBookLocal)}
                      <div className="text-xs text-[var(--muted)]">
                        {pctFmt((adjustedBookLocal / totalRevenueLocal) * 100)}{" "}
                        of total
                      </div>
                    </div>

                    {/* Total */}
                    <div className="text-right">
                      {currencyFmt.format(totalRevenueLocal)}
                    </div>

                    {/* Value Added */}
                    <div className="text-right">
                      {pctFmt(upliftPctLocal)}
                      <div className="text-xs text-[var(--muted)]">
                        {currencyFmt.format(upliftAbsLocal)} added
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
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
              3. Talking Points
            </h2>

            <ul className="list-disc pl-6 text-sm text-white space-y-2">
              <li>
                Your current book commission is based on your
                <span className="font-semibold text-[var(--accent)]">
                  {" "}
                  annualized group health insurance billing
                </span>
                . This calculator uses your entered tier structure to estimate
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
                At a{" "}
                <span className="text-[var(--accent)] font-semibold">
                  {Math.round(conversionRate)}%
                </span>{" "}
                conversion, your custom scenario generates{" "}
                <span className="text-[var(--accent)] font-semibold">
                  {currencyFmt.format(customCommission)}
                </span>{" "}
                in management-fee commissions at {customCommissionPct}%,
                bringing your total estimated revenue to{" "}
                <span className="text-[var(--accent)] font-semibold">
                  {currencyFmt.format(customTotalRevenue)}
                </span>
                .
              </li>

              <li>
                If eligible, placing your book on
                <span className="font-semibold text-[var(--accent)]">
                  {" "}
                  ESI’s Master Health Plan
                </span>{" "}
                may add an additional{" "}
                <span className="font-semibold text-[var(--accent)]">
                  {pctFmt(masterPlanPct)}
                </span>{" "}
                commission on your total book (shown above as an optional
                component).
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
            Disclaimer: This calculator is for illustration purposes only. It is
            not a quote or guarantee. All figures are annual & pre-tax.
          </footer>
        </div>
      }
    </div>
  );
}
