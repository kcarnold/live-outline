// --- LayoutDiagram helper for visualizing layouts ---
const componentColors: Record<string, string> = {
  transcript: "bg-green-300 dark:bg-green-700",
  sourceText: "bg-yellow-200 dark:bg-yellow-600",
  translatedText: "bg-purple-200 dark:bg-purple-700",
};

const componentLabels: Record<string, string> = {
  transcript: "T",
  sourceText: "S",
  translatedText: "Tr",
};

export function LayoutDiagram({ layout }: { layout: string[][] }) {
  // layout is a 2D array: columns of rows
  // Find the max column height for grid alignment
  const maxRows = Math.max(...layout.map(col => col.length));
  return (
    <div className="flex border border-gray-300 dark:border-gray-700 rounded overflow-hidden mr-2" style={{ minWidth: 48 }}>
      {layout.map((col, i) => (
        <div key={i} className="flex flex-col">
          {Array.from({ length: maxRows }).map((_, j) => {
            const key = col[j];
            return key ? (
              <div
                key={key + j}
                className={`w-6 h-6 flex items-center justify-center text-xs font-bold border-b border-r border-gray-200 dark:border-gray-700 ${componentColors[key] || "bg-gray-200"}`}
                title={key}
              >
                {componentLabels[key] || key[0].toUpperCase()}
              </div>
            ) : (
              <div key={"empty" + j} className="w-6 h-6 border-b border-r border-gray-200 dark:border-gray-700 bg-transparent" />
            );
          })}
        </div>
      ))}
    </div>
  );
}
