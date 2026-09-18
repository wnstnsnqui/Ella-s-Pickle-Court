/**
 * The data a chart carries for a screen reader. Spec 0008, AC-11: every chart
 * is `aria-hidden`, with its accessibility layer off, and this table is what
 * announces the numbers instead, once, with a caption naming the chart.
 */
export function HiddenDataTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: readonly string[];
  rows: readonly React.ReactNode[][];
}) {
  return (
    // The `sr-only` clip has to sit on this wrapper, not the `<table>` itself:
    // a table's CSS height is a minimum, not a cap, so its rows still push the
    // page height even under `height: 1px; overflow: hidden`.
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} scope="col">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
