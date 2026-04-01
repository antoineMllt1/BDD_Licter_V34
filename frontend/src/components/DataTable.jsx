export default function DataTable({ columns, rows, emptyMessage = 'Aucune donnée' }) {
  if (!rows || rows.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">◻</div>
        <div className="empty-text">{emptyMessage}</div>
      </div>
    )
  }

  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} style={col.width ? { width: col.width } : {}}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map(col => (
                <td key={col.key}>
                  {col.render ? col.render(row[col.key], row) : (
                    col.truncate
                      ? <span className="text-truncate" title={row[col.key]}>{row[col.key] || '—'}</span>
                      : (row[col.key] ?? '—')
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
