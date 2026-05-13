"use client";

import { useEffect, useRef, useState } from "react";
import CustomDatafeed, {
  BiItem,
  BspItem,
  KLineItem,
  ZsItem,
} from "@/lib/datafeed";
import { parseTimeToUnix } from "@/lib/utils";

const TV_CONTAINER_ID = "tv_chart_container";

declare global {
  interface Window {
    TradingView: {
      widget: new (options: TradingViewWidgetOptions) => TradingViewWidget;
    };
  }

  interface TradingViewWidgetOptions {
    container?: string | HTMLElement;
    container_id?: string;
    datafeed: CustomDatafeed;
    interval: string;
    symbol: string;
    library_path: string;
    locale: string;
    fullscreen?: boolean;
    autosize?: boolean;
    theme?: "Light" | "Dark";
    timezone?: string;
    enabled_features?: string[];
    disabled_features?: string[];
    overrides?: Record<string, any>;
    debug?: boolean;
    symbol_search_request_delay?: number;
  }

  interface TradingViewWidget {
    onChartReady(callback: () => void): void;
    chart(): IChartWidgetApi;
    remove(): void;
  }

  interface IChartWidgetApi {
    onSymbolChanged(): {
      subscribe: (obj: object | null, member: () => void) => void;
    };
    onIntervalChanged?: () => {
      subscribe: (obj: object | null, member: () => void) => void;
    };
    symbol(): string;
    resolution(): string;
    getVisibleRange?: () => { from: number; to: number } | null;
    createStudy?: (...args: any[]) => any;
    createShape(point: any, options?: any): any;
    createMultipointShape?: (points: any[], options?: any) => any;
    removeEntity?: (entityId: string | number) => void;
    removeShape?: (shapeId: string | number) => void;
  }
}

type DrawnShapeId = string | number;

interface LadderPoint {
  time: string;
  value: number;
}

interface ChanPatterns {
  raw_kline_list: KLineItem[];
  bi_list: BiItem[];
  zs_list: ZsItem[];
  bsp_list: BspItem[];
  blue_upper?: LadderPoint[];
  blue_lower?: LadderPoint[];
  yellow_upper?: LadderPoint[];
  yellow_lower?: LadderPoint[];
  td9_labels?: Array<{
    time: string;
    price: number;
    text: string;
    position?: string;
    color?: string;
  }>;
}

type TvPoint = {
  time: number;
  price: number;
};

function normalizeShapeTime(input: string | null | undefined): number | null {
  if (!input) return null;
  try {
    const ts = parseTimeToUnix(input);
    if (!Number.isFinite(ts) || ts <= 0) return null;
    return ts;
  } catch {
    return null;
  }
}

function buildIdxToTimeMap(rawKlines: KLineItem[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const item of rawKlines) {
    const ts = parseTimeToUnix(item.time);
    if (ts != null && Number.isFinite(ts) && ts > 0) {
      map.set(item.idx, ts);
    }
  }
  return map;
}

function getTimeByKluIdx(
  idxToTime: Map<number, number>,
  kluIdx: number | null | undefined,
  fallbackTime?: string | null,
): number | null {
  if (kluIdx != null && idxToTime.has(kluIdx)) {
    return idxToTime.get(kluIdx)!;
  }
  return normalizeShapeTime(fallbackTime);
}

function getBiColor(dir: string | null | undefined): string {
  if (!dir) return "#ef5350";
  const normalized = dir.toUpperCase();
  return normalized.includes("UP") ? "#26a69a" : "#ef5350";
}

function normalizeLadderPoints(points: LadderPoint[] | undefined): TvPoint[] {
  if (!Array.isArray(points) || points.length === 0) return [];

  return points
    .map((pt) => {
      const ts = normalizeShapeTime(pt.time);
      if (ts == null || pt.value == null || !Number.isFinite(pt.value)) {
        return null;
      }
      return { time: ts, price: pt.value };
    })
    .filter((pt): pt is TvPoint => pt !== null)
    .sort((a, b) => a.time - b.time);
}

function filterVisibleTvPoints(
  points: TvPoint[],
  visibleRange?: { from: number; to: number } | null,
): TvPoint[] {
  if (!visibleRange?.from || !visibleRange?.to || points.length === 0) {
    return points;
  }

  const from = visibleRange.from;
  const to = visibleRange.to;
  const span = Math.max(to - from, 1);

  const paddedFrom = from - span * 0.5;
  const paddedTo = to + span * 0.5;

  const filtered = points.filter(
    (pt) => pt.time >= paddedFrom && pt.time <= paddedTo,
  );

  if (filtered.length >= 2) {
    return filtered;
  }

  return points;
}

function dedupeByTime(points: TvPoint[]): TvPoint[] {
  const result: TvPoint[] = [];
  let prevTime: number | null = null;

  for (const pt of points) {
    if (pt.time !== prevTime) {
      result.push(pt);
      prevTime = pt.time;
    } else {
      result[result.length - 1] = pt;
    }
  }

  return result;
}

function downsamplePoints(points: TvPoint[], maxPoints: number): TvPoint[] {
  if (points.length <= maxPoints) return points;
  if (maxPoints <= 2) return [points[0], points[points.length - 1]];

  const result: TvPoint[] = [];
  const step = (points.length - 1) / (maxPoints - 1);

  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round(i * step);
    result.push(points[idx]);
  }

  return dedupeByTime(result);
}

function splitPolylineSegments(points: TvPoint[]): TvPoint[][] {
  if (points.length < 2) return [];

  const segments: TvPoint[][] = [];
  let current: TvPoint[] = [points[0]];

  const timeDiffs: number[] = [];
  const priceDiffs: number[] = [];

  for (let i = 1; i < points.length; i++) {
    timeDiffs.push(points[i].time - points[i - 1].time);
    priceDiffs.push(Math.abs(points[i].price - points[i - 1].price));
  }

  const sortedTimeDiffs = [...timeDiffs].sort((a, b) => a - b);
  const sortedPriceDiffs = [...priceDiffs].sort((a, b) => a - b);

  const medianTimeDiff =
    sortedTimeDiffs.length > 0
      ? sortedTimeDiffs[Math.floor(sortedTimeDiffs.length / 2)]
      : 24 * 60 * 60;

  const medianPriceDiff =
    sortedPriceDiffs.length > 0
      ? sortedPriceDiffs[Math.floor(sortedPriceDiffs.length / 2)]
      : 0;

  const maxAllowedTimeGap = Math.max(medianTimeDiff * 3, 3 * 24 * 60 * 60);
  const maxAllowedPriceJump = Math.max(medianPriceDiff * 6, 8);

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];

    const dt = curr.time - prev.time;
    const dp = Math.abs(curr.price - prev.price);

    const shouldBreak = dt > maxAllowedTimeGap || dp > maxAllowedPriceJump;

    if (shouldBreak) {
      if (current.length >= 2) {
        segments.push(current);
      }
      current = [curr];
    } else {
      current.push(curr);
    }
  }

  if (current.length >= 2) {
    segments.push(current);
  }

  return segments.filter((seg) => seg.length >= 2);
}

export default function TradingViewChart({
  initialSymbol,
  initialInterval,
  onSymbolChange,
}: {
  initialSymbol: string;
  initialInterval: string;
  onSymbolChange?: (symbol: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<TradingViewWidget | null>(null);
  const datafeedRef = useRef<CustomDatafeed | null>(null);
  const drawnShapeIdsRef = useRef<DrawnShapeId[]>([]);
  const widgetIdRef = useRef(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    widgetIdRef.current += 1;
    const thisWidgetId = widgetIdRef.current;
    let isMounted = true;

    if (typeof window === "undefined") return;
    if (!window.TradingView?.widget) return;
    if (!containerRef.current) return;

    const containerEl = containerRef.current;
    if (!containerEl.id) {
      containerEl.id = TV_CONTAINER_ID;
    }

    setIsLoading(true);

    if (!datafeedRef.current) {
      datafeedRef.current = new CustomDatafeed();
    }

    if (widgetRef.current) {
      try {
        widgetRef.current.remove();
      } catch {}
      widgetRef.current = null;
    }

    let widget: TradingViewWidget | null = null;
    let cancelDraw: (() => void) | null = null;

    try {
      widget = new window.TradingView.widget({
        container: containerEl,
        datafeed: datafeedRef.current!,
        interval: initialInterval,
        symbol: initialSymbol,
        library_path: "/charting_library/",
        locale: "en",
        fullscreen: false,
        autosize: true,
        theme: "Dark",
        timezone: "America/New_York",
        enabled_features: ["header_symbol_search"],
        disabled_features: [
          "timeframes_toolbar",
          "create_volume_indicator_by_default",
        ],
        overrides: {
          "mainSeriesProperties.statusViewStyle.showInterval": true,
          "mainSeriesProperties.statusViewStyle.symbolTextSource": "ticker",
        },
        symbol_search_request_delay: 0,
        debug: true,
      });

      widgetRef.current = widget;
    } catch (e) {
      console.error("[TradingViewChart] widget creation failed", e);
      setIsLoading(false);
      return;
    }

    widget.onChartReady(() => {
      if (!isMounted || widgetIdRef.current !== thisWidgetId) return;

      setIsLoading(false);

      const chart = widget!.chart();

      const createMaStudies = async (cht: typeof chart) => {
        const addMA = async (
          length: number,
          color: string,
          lineWidth: number,
        ) => {
          try {
            await cht.createStudy?.(
              "Moving Average",
              false,
              false,
              {
                length,
                source: "close",
              },
              {
                "Plot.color": color,
                "Plot.linewidth": lineWidth,
              },
            );
          } catch (e) {
            console.log("[MA Study] failed", { length, error: e });
          }
        };

        await addMA(55, "rgb(239, 49, 49)", 1);
        await addMA(60, "rgb(255, 255, 255)", 1);
        await addMA(65, "rgb(102, 187, 106)", 1);
        await addMA(120, "rgb(180, 44, 194)", 2);
        await addMA(250, "rgb(187, 17, 1)", 4);
      };

      void createMaStudies(chart);

      const clearDrawings = () => {
        const ids = drawnShapeIdsRef.current;
        if (!ids.length) return;

        ids.forEach((id) => {
          try {
            if (typeof chart.removeEntity === "function") {
              chart.removeEntity(id);
            } else if (typeof chart.removeShape === "function") {
              chart.removeShape(id);
            }
          } catch {}
        });

        drawnShapeIdsRef.current = [];
      };

      const saveShapeId = (id: any) => {
        if (id !== undefined && id !== null) {
          drawnShapeIdsRef.current.push(id as DrawnShapeId);
        }
      };

      const drawTrendSegments = async (
        points: TvPoint[],
        color: string,
        lineWidth: number,
      ) => {
        const segments = splitPolylineSegments(points);
        if (
          !segments.length ||
          typeof chart.createMultipointShape !== "function"
        ) {
          return;
        }

        for (const seg of segments) {
          if (seg.length < 2) continue;

          for (let i = 1; i < seg.length; i++) {
            const p1 = seg[i - 1];
            const p2 = seg[i];

            try {
              const shapeId = await chart.createMultipointShape([p1, p2], {
                shape: "trend_line",
                lock: true,
                disableSelection: true,
                disableSave: true,
                disableUndo: true,
                overrides: {
                  linecolor: color,
                  linewidth: lineWidth,
                },
              });
              saveShapeId(shapeId);
            } catch {}
          }
        }
      };

      const drawLadderLines = async (
        upperRaw: LadderPoint[] | undefined,
        lowerRaw: LadderPoint[] | undefined,
        color: string,
      ) => {
        const visibleRange = chart.getVisibleRange?.() ?? null;

        const upper = downsamplePoints(
          dedupeByTime(
            filterVisibleTvPoints(
              normalizeLadderPoints(upperRaw),
              visibleRange,
            ),
          ),
          200,
        );

        const lower = downsamplePoints(
          dedupeByTime(
            filterVisibleTvPoints(
              normalizeLadderPoints(lowerRaw),
              visibleRange,
            ),
          ),
          200,
        );

        await drawTrendSegments(upper, color, 3);
        await drawTrendSegments(lower, color, 3);
      };

      const drawPatterns = async () => {
        clearDrawings();

        const patterns = datafeedRef.current?.getChanPatterns();
        if (!patterns) return;

        const idxToTime = buildIdxToTimeMap(patterns.raw_kline_list);
        const hasMultiPointShape =
          typeof chart.createMultipointShape === "function";

        for (const bi of patterns.bi_list) {
          const beginTs = getTimeByKluIdx(
            idxToTime,
            bi.begin_klu_idx,
            bi.begin_time,
          );
          const endTs = getTimeByKluIdx(idxToTime, bi.end_klu_idx, bi.end_time);

          if (
            beginTs == null ||
            endTs == null ||
            bi.begin_price == null ||
            bi.end_price == null
          ) {
            continue;
          }

          const p1 = { time: beginTs as any, price: bi.begin_price };
          const p2 = { time: endTs as any, price: bi.end_price };

          if (hasMultiPointShape) {
            try {
              const shapeId = await chart.createMultipointShape?.([p1, p2], {
                shape: "trend_line",
                lock: true,
                disableSelection: true,
                disableSave: true,
                disableUndo: true,
                overrides: {
                  linecolor: getBiColor(bi.dir),
                  linewidth: 2,
                },
              });
              saveShapeId(shapeId);
            } catch {}
          }
        }

        for (const zs of patterns.zs_list) {
          const beginTs = normalizeShapeTime(zs.begin_time);
          const endTs = normalizeShapeTime(zs.end_time);

          if (
            beginTs == null ||
            endTs == null ||
            zs.low == null ||
            zs.high == null
          ) {
            continue;
          }

          const topLeft = { time: beginTs as any, price: zs.high };
          const bottomRight = { time: endTs as any, price: zs.low };

          if (hasMultiPointShape) {
            try {
              const shapeId = await chart.createMultipointShape?.(
                [topLeft, bottomRight],
                {
                  shape: "rectangle",
                  lock: true,
                  disableSelection: true,
                  disableSave: true,
                  disableUndo: true,
                  overrides: {
                    linecolor: "#3b82f6",
                    fillBackground: true,
                    backgroundColor: "rgba(59, 130, 246, 0.10)",
                    transparency: 85,
                    linewidth: 1,
                  },
                },
              );
              saveShapeId(shapeId);
            } catch {}
          }
        }

        for (const bsp of patterns.bsp_list) {
          const ts = getTimeByKluIdx(idxToTime, bsp.klu_idx, bsp.time);
          if (ts == null || bsp.price == null) continue;

          try {
            const shapeId = chart.createShape(
              { time: ts as any, price: bsp.price },
              {
                shape: bsp.is_buy ? "arrow_up" : "arrow_down",
                text: Array.isArray(bsp.types) ? bsp.types.join("/") : "",
                lock: true,
                disableSelection: true,
                disableSave: true,
                disableUndo: true,
                overrides: {
                  color: bsp.is_buy ? "#22c55e" : "#ef4444",
                  textColor: bsp.is_buy ? "#22c55e" : "#ef4444",
                  fontsize: 12,
                },
              },
            );
            saveShapeId(shapeId);
          } catch {}
        }

        const labels = patterns.td9_labels || [];
        for (const lb of labels) {
          const ts = normalizeShapeTime(lb.time);
          if (ts == null || lb.price == null || !lb.text) continue;

          const absPrice = Math.abs(lb.price) || 1;
          const offsetAmount = Math.max(absPrice * 0.005, 0.01);
          const pricePoint =
            lb.position === "above"
              ? lb.price + offsetAmount
              : lb.price - offsetAmount;

          try {
            const shapeId = chart.createShape(
              { time: ts as any, price: pricePoint },
              {
                shape: "text",
                text: lb.text,
                lock: true,
                disableSelection: true,
                disableSave: true,
                disableUndo: true,
                overrides: {
                  textColor: lb.color || "#ff00ff",
                  color: lb.color || "#ff00ff",
                  fontsize: 12,
                },
              },
            );
            saveShapeId(shapeId);
          } catch {}
        }

        await drawLadderLines(
          patterns.yellow_upper,
          patterns.yellow_lower,
          "#f0b90b",
        );

        await drawLadderLines(
          patterns.blue_upper,
          patterns.blue_lower,
          "#2962ff",
        );
      };

      const safeDrawPatterns = () => {
        let cancelled = false;

        const attempt = async (retries: number) => {
          if (cancelled || !isMounted || widgetIdRef.current !== thisWidgetId) {
            return;
          }

          try {
            await drawPatterns();
          } catch (err) {
            console.error("[TradingView] drawPatterns failed", err);
            if (retries > 0 && !cancelled) {
              setTimeout(() => void attempt(retries - 1), 300);
            }
          }
        };

        void attempt(5);

        return () => {
          cancelled = true;
        };
      };

      datafeedRef.current?.setOnDataLoadedCallback(() => {
        if (cancelDraw) cancelDraw();
        cancelDraw = safeDrawPatterns();
      });

      chart.onSymbolChanged().subscribe(null, () => {
        clearDrawings();
        datafeedRef.current?.clearCache();

        const newSymbol = chart.symbol();
        if (onSymbolChange) {
          onSymbolChange(newSymbol);
        }
      });

      if (typeof chart.onIntervalChanged === "function") {
        chart.onIntervalChanged().subscribe(null, () => {
          clearDrawings();
          datafeedRef.current?.clearCache();
        });
      }
    });

    return () => {
      isMounted = false;

      const currentWidget = widgetRef.current;
      widgetRef.current = null;

      if (currentWidget) {
        try {
          currentWidget.remove();
        } catch {}
      }

      drawnShapeIdsRef.current = [];
    };
  }, [initialSymbol, initialInterval, onSymbolChange]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {isLoading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#131722",
            color: "#d1d4dc",
            zIndex: 2,
            fontFamily:
              "-apple-system, BlinkMacSystemFont, Trebuchet MS, Roboto, Ubuntu, sans-serif",
            fontSize: 14,
          }}
        >
          Loading chart...
        </div>
      )}

      <div
        id={TV_CONTAINER_ID}
        ref={containerRef}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
