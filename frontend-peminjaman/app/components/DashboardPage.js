import { formatDate, loanStatus } from "../lib/api";
import styles from "../dashboard.module.css";

export default function DashboardPage({ dashboard, loans, isLoading }) {
  const cards = [
    { value: dashboard?.tools ?? "—", label: "Jenis alat", tone: "cyan" },
    {
      value: dashboard?.loans?.pending ?? "—",
      label: "Menunggu persetujuan",
      tone: "orange",
    },
    {
      value: dashboard?.loans?.approved ?? "—",
      label: "Sedang dipinjam",
      tone: "green",
    },
    {
      value: dashboard?.loans?.returned ?? "—",
      label: "Sudah kembali",
      tone: "purple",
    },
  ];

  return (
    <>
      <div className={styles.statsGrid}>
        {cards.map((card) => (
          <article className={styles.statCard} key={card.label}>
            <strong className={styles[card.tone]}>
              {isLoading ? "…" : card.value}
            </strong>
            <span>{card.label}</span>
          </article>
        ))}
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <h2>Aktivitas peminjaman terbaru</h2>
          {isLoading && <span className={styles.loadingLabel}>Memuat data...</span>}
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Peminjam</th>
                <th>Alat</th>
                <th>Jumlah</th>
                <th>Tanggal pinjam</th>
                <th>Harus kembali</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loans.map((loan) => (
                <tr key={loan.id}>
                  <td>{loan.borrower_name}</td>
                  <td>{loan.tool_name}</td>
                  <td>{loan.quantity}</td>
                  <td>{formatDate(loan.loan_date)}</td>
                  <td>{formatDate(loan.due_date)}</td>
                  <td>
                    <span className={`${styles.statusBadge} ${styles[loan.status]}`}>
                      {loanStatus(loan.status)}
                    </span>
                  </td>
                </tr>
              ))}
              {!isLoading && loans.length === 0 && (
                <tr>
                  <td className={styles.emptyCell} colSpan="6">
                    Belum ada aktivitas peminjaman.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
