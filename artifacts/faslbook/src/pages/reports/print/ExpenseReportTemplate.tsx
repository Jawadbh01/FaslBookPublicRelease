import PrintLayout from "@/components/print/PrintLayout";

const fmtPKR = (n: number) => "Rs. " + n.toLocaleString("en-PK");
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function fmtDate(str: string) {
  if (!str) return "—";
  const parts = str.split("-");
  if (parts.length !== 3) return str;
  return `${parseInt(parts[2])} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(parts[1]) - 1]} ${parts[0]}`;
}
function getMonthKey(dateStr: string) {
  if (!dateStr) return "";
  return dateStr.substring(0, 7); // "YYYY-MM"
}
function monthLabel(key: string) {
  if (!key) return "";
  const [y, m] = key.split("-");
  return `${MONTHS[parseInt(m) - 1]} ${y}`;
}

interface Expense {
  id: string;
  date: string;
  category: string;
  categoryLabel?: string;
  description?: string;
  amount: number;
}

interface Props {
  expenses: Expense[];
  farmName: string;
  printedBy: string;
  dateFrom?: string;
  dateTo?: string;
}

export default function ExpenseReportTemplate({ expenses, farmName, printedBy, dateFrom, dateTo }: Props) {
  const sorted = [...expenses].sort((a, b) => a.date.localeCompare(b.date));

  // Group by month
  const grouped: Record<string, Expense[]> = {};
  sorted.forEach(e => {
    const key = getMonthKey(e.date);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(e);
  });

  const grandTotal = sorted.reduce((s, e) => s + e.amount, 0);

  const filters: string[] = [];
  if (dateFrom && dateTo) filters.push(`Period: ${fmtDate(dateFrom)} — ${fmtDate(dateTo)}`);

  let runningTotal = 0;

  return (
    <PrintLayout
      reportName="Expense Report"
      filters={filters}
      printedBy={printedBy}
      farmName={farmName}
    >
      {Object.entries(grouped).length === 0 && (
        <p style={{ color: "#999" }}>No expenses found for the selected period.</p>
      )}

      {Object.entries(grouped).map(([monthKey, rows]) => {
        const monthTotal = rows.reduce((s, e) => s + e.amount, 0);
        return (
          <div key={monthKey} className="print-section">
            <div className="section-title">{monthLabel(monthKey)}</div>
            <table className="print-table">
              <thead>
                <tr>
                  <th style={{ width: "13%" }}>Date</th>
                  <th style={{ width: "18%" }}>Category</th>
                  <th>Description</th>
                  <th className="num" style={{ width: "16%" }}>Amount (Rs)</th>
                  <th className="num" style={{ width: "18%" }}>Running Total (Rs)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e, i) => {
                  runningTotal += e.amount;
                  return (
                    <tr key={i}>
                      <td>{fmtDate(e.date)}</td>
                      <td>{e.categoryLabel || e.category}</td>
                      <td>{e.description || "—"}</td>
                      <td className="num">{fmtPKR(e.amount)}</td>
                      <td className="num" style={{ fontWeight: 600 }}>{fmtPKR(runningTotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ fontWeight: 700 }}>Monthly Total — {monthLabel(monthKey)}</td>
                  <td className="num">{fmtPKR(monthTotal)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        );
      })}

      {/* Grand Total */}
      {Object.entries(grouped).length > 0 && (
        <div className="print-section" style={{ marginTop: 10 }}>
          <div className="summary-row total">
            <span>Grand Total — All Expenses</span>
            <span>{fmtPKR(grandTotal)}</span>
          </div>
        </div>
      )}
    </PrintLayout>
  );
}
