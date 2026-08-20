import { memo, useMemo, useState } from "react";
import Plot from "react-plotly.js";
import { PlotExportButtons } from "@/shared/plot/PlotExportButtons";
import { lockCartesianInteractions, paperPlotConfig } from "@/shared/plot/plotlyConfig";
import { plotAxisText, plotFont } from "@/shared/plot/plotTypography";

export type CustomAxisOption = {
  key: string;
  label: string;
  values: Array<number | null | undefined>;
};

type Props = {
  axisOptions: CustomAxisOption[];
  defaultXKey?: string;
  defaultYKey?: string;
  isDark?: boolean;
  filenamePrefix: string;
  className?: string;
};

const CustomParameterPlot = memo(function CustomParameterPlot({
  axisOptions,
  defaultXKey = "phase",
  defaultYKey,
  isDark,
  filenamePrefix,
  className = "",
}: Props) {
  const [xAxisKey, setXAxisKey] = useState(defaultXKey);
  const [yAxisKey, setYAxisKey] = useState(defaultYKey ?? axisOptions.find(option => option.key !== defaultXKey)?.key ?? defaultXKey);

  const themeIsDark = !!isDark;
  const axisColor = themeIsDark ? "#f8fbff" : "#111827";
  const gridColor = themeIsDark ? "#374151" : "#cbd5e1";
  const paperBg = themeIsDark ? "#080808" : "#f7fafc";
  const plotBg = themeIsDark ? "#080808" : "#f7fafc";

  const axisMap = useMemo(() => {
    const map = new Map<string, number[]>();
    axisOptions.forEach(option => {
      map.set(option.key, option.values.filter((value): value is number => Number.isFinite(value)));
    });
    return map;
  }, [axisOptions]);

  const xData = axisMap.get(xAxisKey) ?? [];
  const yData = axisMap.get(yAxisKey) ?? [];
  const xLabel = axisOptions.find(option => option.key === xAxisKey)?.label ?? xAxisKey;
  const yLabel = axisOptions.find(option => option.key === yAxisKey)?.label ?? yAxisKey;

  const rows = useMemo(() => {
    const count = Math.min(xData.length, yData.length);
    const next: Array<{ index: number; x: number; y: number }> = [];
    for (let index = 0; index < count; index += 1) {
      const x = xData[index];
      const y = yData[index];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      next.push({ index, x, y });
    }
    return next;
  }, [xData, yData]);

  const plotLayout = useMemo(() => lockCartesianInteractions({
    title: undefined,
    xaxis: {
      title: { text: xLabel, standoff: 8 },
      gridcolor: gridColor,
      ...plotAxisText(axisColor),
      tickcolor: axisColor,
      ticks: "outside" as const,
      ticklen: 4,
      showline: true,
      mirror: "allticks" as const,
      automargin: true,
    },
    yaxis: {
      title: { text: yLabel, standoff: 10 },
      gridcolor: gridColor,
      ...plotAxisText(axisColor),
      tickcolor: axisColor,
      ticks: "outside" as const,
      ticklen: 4,
      showline: true,
      mirror: "allticks" as const,
      automargin: true,
    },
    margin: { l: 50, r: 20, t: 34, b: 50 },
    paper_bgcolor: paperBg,
    plot_bgcolor: plotBg,
    font: plotFont(axisColor),
    showlegend: false,
  }), [axisColor, gridColor, paperBg, plotBg, xLabel, yLabel]);

  return (
    <div className={`w-full scientific-divider pt-7 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="plot-toolbar flex-1">
          <PlotExportButtons filename={`${filenamePrefix}-custom-xy`} />
          <div className="plot-panel-title text-foreground">{`${yLabel} vs ${xLabel} Plot`}</div>
        </div>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
        <label className="flex flex-col gap-1 text-muted-foreground">
          <span className="form-label text-foreground/80">X axis</span>
          <select value={xAxisKey} onChange={event => setXAxisKey(event.target.value)} className="rounded-md border border-border/60 bg-background/80 px-2 py-1 text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
            {axisOptions.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-muted-foreground">
          <span className="form-label text-foreground/80">Y axis</span>
          <select value={yAxisKey} onChange={event => setYAxisKey(event.target.value)} className="rounded-md border border-border/60 bg-background/80 px-2 py-1 text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
            {axisOptions.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
        </label>
      </div>
      <div className="h-[420px] w-full">
        <Plot
          data={rows.length ? [{
            type: "scatter" as const,
            mode: "lines+markers" as const,
            x: rows.map(row => row.x),
            y: rows.map(row => row.y),
            line: { color: themeIsDark ? "#60a5fa" : "#2563eb", width: 1.8 },
            marker: { size: 4 },
            hovertemplate: `${xLabel} %{x:.4f}<br>${yLabel} %{y:.4f}<extra></extra>`,
          }] : []}
          layout={plotLayout}
          config={paperPlotConfig(`${filenamePrefix}-custom-xy`)}
          useResizeHandler
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
});

export default CustomParameterPlot;
