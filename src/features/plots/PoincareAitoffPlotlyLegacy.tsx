import { useMemo, useState } from "react";
import Plot from "react-plotly.js";
import { FullscreenOverlay, FullscreenIconButton } from "@/components/FullscreenOverlay";
import { PlotExportButtons } from "@/shared/plot/PlotExportButtons";
import { paperPlotConfig } from "@/shared/plot/plotlyConfig";

type AitoffData = {
	lon: number[];
	lat: number[];
};

interface PoincareAitoffFixedProps {
	data: AitoffData | null;
	phaseValue?: number;
	isDark?: boolean;
}

export default function PoincareAitoffFixed({ data, isDark }: PoincareAitoffFixedProps) {
	if (!data) return null;
	const [fullscreenKey, setFullscreenKey] = useState<string | null>(null);
	const [view, setView] = useState<"aitoff" | "3d">("aitoff");
	const themeIsDark = !!isDark;
	const axisColor = themeIsDark ? "#e5e7eb" : "#111827";
	const gridColor = themeIsDark ? "#1f2937" : "#e5e7eb";
	const paperBg = themeIsDark ? "#0b1220" : "#ffffff";
	const plotBg = themeIsDark ? "#0b1220" : "#ffffff";
	const themeKey = `${themeIsDark ? "d" : "l"}`;

	// Plotly's Aitoff projection expects degrees; backend returns radians.
	const { lonDeg, latDeg } = useMemo(() => ({
		lonDeg: data.lon.map(v => (v * 180) / Math.PI),
		latDeg: data.lat.map(v => (v * 180) / Math.PI),
	}), [data.lon, data.lat]);

	const xyz = useMemo(() => {
		const radLon = data.lon;
		const radLat = data.lat;
		const x = radLon.map((lon, i) => Math.cos(radLat[i]) * Math.cos(lon));
		const y = radLon.map((lon, i) => Math.cos(radLat[i]) * Math.sin(lon));
		const z = radLat.map(lat => Math.sin(lat));
		return { x, y, z };
	}, [data.lon, data.lat]);

	const aitoffTrace = {
		type: "scattergeo" as const,
		lon: lonDeg,
		lat: latDeg,
		mode: "markers" as const,
		marker: {
			size: 5,
			color: latDeg,
			colorscale: "RdBu",
			reversescale: true,
			opacity: 0.85,
			showscale: true,
			colorbar: {
				title: { text: "Lat (deg)" },
				orientation: "h" as const,
				y: -0.25,
				x: 0.5,
				xanchor: "center" as const,
				len: 0.6,
			},
		},
		hovertemplate: "Lon: %{lon:.2f} deg<br>Lat: %{lat:.2f} deg<extra></extra>",
		name: "Poincare points",
	};

	const latLabels = [];
	for (let i = 0; i <= 6; i++) {
		const lat = -90 + i * 30;
		const y = 0.15 + (i / 6) * 0.7; // vertical spacing
		latLabels.push({
			text: `${lat} deg`,
			x: 0.04,
			y,
			xref: "paper",
			yref: "paper",
			showarrow: false,
			font: { color: axisColor, size: 12 },
			xanchor: "right",
			yanchor: "middle",
		});
	}

	const lonLabels = [];
	for (let i = 0; i <= 8; i++) {
		const lon = -180 + i * 45;
		const x = 0.1 + (i / 8) * 0.8; // horizontal spacing
		lonLabels.push({
			text: `${lon} deg`,
			x,
			y: 0.08,
			xref: "paper",
			yref: "paper",
			showarrow: false,
			font: { color: axisColor, size: 12 },
			xanchor: "center",
			yanchor: "top",
		});
	}


	const aitoffLayout = {
		title: undefined,
		dragmode: false,
		geo: {
			projection: { type: "aitoff" },
			showcountries: false,
			showcoastlines: false,
			showland: false,
			showocean: false,
			lataxis: { showgrid: true, dtick: 30 },
			lonaxis: { showgrid: true, dtick: 45 },
			bgcolor: plotBg,
		},
		annotations: [...latLabels, ...lonLabels],
		margin: { l: 70, r: 30, t: 40, b: 70 },
		height: 480,
		paper_bgcolor: paperBg,
		plot_bgcolor: plotBg,
		font: { color: axisColor },
	};

	const sphere3d = {
		type: "surface" as const,
		visible: true,
		showlegend: false,
		showscale: false,
		opacity: 0.15,
		colorscale: [[0, "#ffffff"], [1, "#ffffff"]] as any,
		...getUnitSphereSurface(20),
	};

	const points3d = {
		type: "scatter3d" as const,
		x: xyz.x,
		y: xyz.y,
		z: xyz.z,
		mode: "markers" as const,
		marker: {
			size: 3,
			color: latDeg,
			colorscale: "RdBu",
			reversescale: true,
			showscale: true,
			colorbar: {
				title: { text: "Lat (deg)" },
				orientation: "h" as const,
				y: -0.2,
				x: 0.5,
				len: 0.6,
			},
		},
		hovertemplate: "x %{x:.2f}<br>y %{y:.2f}<br>z %{z:.2f}<extra></extra>",
		name: "Poincare points",
	};

	const layout3d = {
		title: undefined,
		dragmode: "orbit" as const,
		scene: {
			xaxis: { title: { text: "X" }, range: [-1, 1], gridcolor: gridColor, zerolinecolor: gridColor, linecolor: axisColor, tickfont: { color: axisColor }, tickcolor: axisColor, ticks: "outside" as const, ticklen: 4, titlefont: { color: axisColor }, showline: true },
			yaxis: { title: { text: "Y" }, range: [-1, 1], gridcolor: gridColor, zerolinecolor: gridColor, linecolor: axisColor, tickfont: { color: axisColor }, tickcolor: axisColor, ticks: "outside" as const, ticklen: 4, titlefont: { color: axisColor }, showline: true },
			zaxis: { title: { text: "Z" }, range: [-1, 1], gridcolor: gridColor, zerolinecolor: gridColor, linecolor: axisColor, tickfont: { color: axisColor }, tickcolor: axisColor, ticks: "outside" as const, ticklen: 4, titlefont: { color: axisColor }, showline: true },
			aspectmode: "cube" as const,
		},
		margin: { l: 0, r: 0, t: 50, b: 50 },
		height: 480,
		paper_bgcolor: paperBg,
		plot_bgcolor: plotBg,
		font: { color: axisColor },
	};

	const items = useMemo(() => ({
		aitoff: {
			key: "aitoff" as const,
			title: "Poincare Sphere (Aitoff)",
			data: [aitoffTrace],
			layout: aitoffLayout,
		},
		"3d": {
			key: "3d" as const,
			title: "Poincare Sphere (3D)",
			data: [sphere3d, points3d],
			layout: layout3d,
		},
	}), [aitoffLayout, aitoffTrace, layout3d, points3d, sphere3d]);

	const currentItem = items[view];
	const fullscreenItem = fullscreenKey ? items[fullscreenKey as "aitoff" | "3d"] : null;

	const activeToggleClass = themeIsDark ? "bg-white/15 text-white" : "bg-gray-900 text-white";
	const inactiveToggleClass = themeIsDark ? "text-gray-200 hover:bg-white/5" : "text-gray-800 hover:bg-black/5";

	return (
		<div className="grid grid-cols-1 gap-6">
			<div className="plot-export-scope relative border border-border/50 rounded-lg overflow-hidden p-3">
				<div className="mb-2 flex items-center justify-between gap-2">
					<div className="plot-toolbar">
						<FullscreenIconButton onClick={() => setFullscreenKey(view)} title="Fullscreen" />
						<PlotExportButtons filename={`legacy-poincare-${currentItem.key}`} />
						<div className="text-sm font-semibold text-foreground/90">{currentItem.title}</div>
						<div className="inline-flex rounded-md border border-border/60 overflow-hidden">
							<button
								type="button"
								onClick={() => setView("aitoff")}
								className={`px-3 py-1 text-xs font-semibold transition-colors ${view === "aitoff" ? activeToggleClass : inactiveToggleClass}`}
							>
								Aitoff
							</button>
							<button
								type="button"
								onClick={() => setView("3d")}
								className={`px-3 py-1 text-xs font-semibold transition-colors ${view === "3d" ? activeToggleClass : inactiveToggleClass}`}
							>
								3D
							</button>
						</div>
					</div>
				</div>
				<Plot
					data={currentItem.data}
					layout={{ ...currentItem.layout, dragmode: view === "3d" ? "orbit" : false } as any}
					style={{ width: "100%", height: "480px" }}
					config={paperPlotConfig(`legacy-poincare-${currentItem.key}`)}
					useResizeHandler
					key={`${themeKey}-${currentItem.key}`}
				/>
			</div>

			{fullscreenItem && (
				<FullscreenOverlay onClose={() => setFullscreenKey(null)} contentClassName="p-4 w-[95vw] max-w-7xl h-[90vh]" title={`${fullscreenItem.title} fullscreen`}>
					<div className="plot-export-scope h-full w-full pt-8">
						<div className="plot-toolbar mb-2">
							<PlotExportButtons filename={`legacy-poincare-${fullscreenItem.key}-fullscreen`} />
						</div>
						<Plot
							data={fullscreenItem.data}
							layout={{ ...fullscreenItem.layout, autosize: true, height: undefined, dragmode: fullscreenKey === "3d" ? "orbit" : false } as any}
							style={{ width: "100%", height: "100%" }}
							config={paperPlotConfig(`legacy-poincare-${fullscreenItem.key}-fullscreen`)}
							useResizeHandler
							key={`${themeKey}-${fullscreenKey}-fs`}

						/>
					</div>
				</FullscreenOverlay>
			)}
		</div>
	);
}

function getUnitSphereSurface(steps: number) {
	const phi = [] as number[];
	const theta = [] as number[];
	for (let i = 0; i <= steps; i++) {
		phi.push((Math.PI * i) / steps);
		theta.push((2 * Math.PI * i) / steps);
	}
	const z: number[][] = [];
	const x: number[][] = [];
	const y: number[][] = [];
	for (let i = 0; i <= steps; i++) {
		const zRow: number[] = [];
		const xRow: number[] = [];
		const yRow: number[] = [];
		for (let j = 0; j <= steps; j++) {
			xRow.push(Math.sin(phi[i]) * Math.cos(theta[j]));
			yRow.push(Math.sin(phi[i]) * Math.sin(theta[j]));
			zRow.push(Math.cos(phi[i]));
		}
		x.push(xRow);
		y.push(yRow);
		z.push(zRow);
	}
	return { x, y, z };
}
