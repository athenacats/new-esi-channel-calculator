import { useMemo, useState } from "react";
import { useRef } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const currencyFmt = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const pctFmt = (n: number | string) => `${(Number(n) || 0).toFixed(1)}%`;

function numberFromInput(v: any, fallback = 0) {
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

  const [customCommissionPct, setCustomCommissionPct] = useState(15);
  const [bookPortionPct, setBookPortionPct] = useState(100);

  /* ---------------- DERIVED ---------------- */
  const totalBookCommission = useMemo(() => {
    return tiers.reduce(
      (sum, t) =>
        sum + numberFromInput(t.amount) * (numberFromInput(t.pct) / 100),
      0
    );
  }, [tiers]);

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

  const customTotalRevenue = customCommission + adjustedBook;
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

    // Add loading class (optional)
    element.classList.add("exporting");

    try {
      // Capture element as canvas
      const canvas = await html2canvas(element, {
        scale: 2, // higher resolution
        useCORS: true,
        backgroundColor: "#252a2f", // your root background
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");

      const pageWidth = pdf.internal.pageSize.getWidth();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * pageWidth) / canvas.width;

      let position = 0;
      let heightLeft = imgHeight;

      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pdf.internal.pageSize.getHeight();

      // add extra pages if needed
      while (heightLeft > 0) {
        pdf.addPage();
        position = 0;
        pdf.addImage(
          imgData,
          "PNG",
          0,
          position - heightLeft,
          imgWidth,
          imgHeight
        );
        heightLeft -= pdf.internal.pageSize.getHeight();
      }

      pdf.save("ESI-Channel-ROI-Calculator.pdf");
    } catch (err) {
      console.error("PDF generation error:", err);
    } finally {
      element.classList.remove("exporting");
    }
  }

  /* ---------------- UI START ---------------- */
  return (
    <div ref={pdfRef}>
      {
        <div
          className="
      max-w-6xl mx-auto p-8 rounded-2xl
      bg-[var(--card)] border border-[var(--line)]
      shadow-[0_0_30px_rgba(0,0,0,0.45)]
    "
        >
          {/* HEADER */}
          <div className="mb-10 flex items-center justify-between">
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

            {/* Static CP Scenario */}
            <div
              className="
          rounded-2xl p-5 mb-6 
          bg-[var(--soft)] border border-[var(--line)]
          shadow-[0_0_20px_rgba(0,0,0,0.35)]
        "
            >
              <h3 className="text-sm font-semibold mb-3 text-white">
                An Example of What Our Channel Partner Earns
              </h3>

              <div className="grid grid-cols-5 gap-4 text-sm text-white">
                <div>Scenario</div>
                <div className="text-right">Management Fee Commission</div>
                <div className="text-right">Their Current Book</div>
                <div className="text-right">Total Revenue</div>
                <div className="text-right">Value Added</div>

                <div className="mt-1">Insurance Agent</div>

                <div className="text-right">
                  {currencyFmt.format(STATIC_CP_MGMT)}
                  <div className="text-xs text-[var(--muted)]">
                    {pctFmt(STATIC_CP_MGMT_SHARE)}
                  </div>
                </div>

                <div className="text-right">
                  {currencyFmt.format(STATIC_CP_BOOK)}
                  <div className="text-xs text-[var(--muted)]">
                    {pctFmt(STATIC_CP_BOOK_SHARE)}
                  </div>
                </div>

                <div className="text-right">
                  {currencyFmt.format(STATIC_CP_TOTAL)}
                </div>

                <div className="text-right">
                  {pctFmt(STATIC_CP_UPLIFT_PCT)}
                  <div className="text-xs text-[var(--muted)]">
                    {currencyFmt.format(STATIC_CP_UPLIFT_ABS)} added
                  </div>
                </div>
              </div>
            </div>

            {/* CUSTOM COMMISSION — NO SLIDERS */}
            <div
              className="
          rounded-2xl p-5
          bg-[var(--soft)] border border-[var(--line)]
          
        "
            >
              <h3 className="text-sm font-semibold mb-3 text-white">
                Find Out Your Commision: Customize Below
              </h3>

              <div className="grid grid-cols-5 gap-4 text-sm text-white">
                <div>Scenario</div>
                <div className="text-right">Management Fee Commission</div>
                <div className="text-right">Your Current Book</div>
                <div className="text-right">Total Revenue</div>
                <div className="text-right">Value Added</div>

                <div className="mt-1">Custom</div>

                {/* MGMT FEE INPUT */}
                <div className="text-right">
                  <div className="text-[var(--accent)] font-semibold">
                    {currencyFmt.format(customCommission)}
                  </div>
                  <div className="text-xs text-[var(--muted)] mb-2">
                    {Number.isNaN(customMgmtSharePct)
                      ? "—"
                      : `${pctFmt(customMgmtSharePct)} of total`}
                  </div>

                  <label className="block text-xs text-[var(--muted)] mb-1">
                    Commission %
                  </label>

                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={customCommissionPct}
                    onChange={(e) =>
                      setCustomCommissionPct(numberFromInput(e.target.value))
                    }
                    className="
                  w-20 bg-[#1d2023] border border-[var(--line)]
                  rounded-lg px-2 py-1 text-right text-white
                  focus:outline-none focus:ring-2 focus:ring-[var(--accent)]
                "
                  />
                </div>

                {/* BOOK PERCENT INPUT — FIXED BUG */}
                <div className="text-right">
                  <div className="text-[var(--accent)] font-semibold">
                    {currencyFmt.format(adjustedBook)}
                  </div>
                  <div className="text-xs text-[var(--muted)] mb-2">
                    {currencyFmt.format(totalBookCommission)} base •{" "}
                    {Number.isNaN(customBookSharePct)
                      ? "—"
                      : `${pctFmt(customBookSharePct)} of total`}
                  </div>

                  <label className="block text-xs text-[var(--muted)] mb-1">
                    Book % of Base
                  </label>

                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={bookPortionPct} // FIXED
                    onChange={(e) =>
                      setBookPortionPct(numberFromInput(e.target.value))
                    }
                    className="
                  w-20 bg-[#1d2023] border border-[var(--line)]
                  rounded-lg px-2 py-1 text-right text-white
                  focus:outline-none focus:ring-2 focus:ring-[var(--accent)]
                "
                  />
                </div>

                {/* TOTAL / UPLIFT */}
                <div className="text-right">
                  <div className="text-[var(--accent)] font-semibold">
                    {currencyFmt.format(customTotalRevenue)}
                  </div>
                </div>

                <div className="text-right">
                  {Number.isNaN(customUpliftPct)
                    ? "—"
                    : pctFmt(customUpliftPct)}
                  <div className="text-xs text-[var(--muted)]">
                    {Number.isNaN(customUpliftAbs)
                      ? ""
                      : `${currencyFmt.format(customUpliftAbs)} added`}
                  </div>
                </div>
              </div>

              <div className="text-right text-xs text-white mt-4">
                Per client (added):{" "}
                <span className="text-[var(--accent)] font-semibold">
                  {currencyFmt.format(perClientAddedRevCustom)}
                </span>
              </div>
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
                ESI management fee creates a{" "}
                <span className="font-semibold text-[var(--accent)]">
                  new revenue stream
                </span>{" "}
                that does not replace existing commissions.
              </li>

              <li>
                At a{" "}
                <span className="text-[var(--accent)] font-semibold">
                  {Math.round(conversionRate)}%
                </span>{" "}
                conversion, your custom scenario produces{" "}
                <span className="text-[var(--accent)] font-semibold">
                  {currencyFmt.format(customCommission)}
                </span>{" "}
                at {customCommissionPct}% commission, totaling{" "}
                <span className="text-[var(--accent)] font-semibold">
                  {currencyFmt.format(customTotalRevenue)}
                </span>{" "}
                including{" "}
                <span className="text-[var(--accent)] font-semibold">
                  {currencyFmt.format(adjustedBook)}
                </span>{" "}
                from your book.
              </li>

              <li className="">
                Illustrative only. Results depend on client mix, eligibility,
                and final agreements.
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
