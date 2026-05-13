import { mapResolutionToLevel, parseTimeToUnix } from "./utils";

interface ApiResponse {
  code: number;
  message: string;
  data: {
    symbol: string;
    market: string;
    level: string;
    raw_kline_list: KLineItem[];
    bi_list: BiItem[];
    zs_list: ZsItem[];
    bsp_list: BspItem[];
    td9_labels?: Array<{
      time: string;
      price: number;
      text: string;
      position: string;
      color: string;
    }>;
    blue_upper?: LadderPoint[];
    blue_lower?: LadderPoint[];
    yellow_upper?: LadderPoint[];
    yellow_lower?: LadderPoint[];
  };
}

export interface KLineItem {
  idx: number;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

export interface BiItem {
  idx: number;
  dir: string | null;
  is_sure: boolean;
  seg_idx: number | null;
  begin_klu_idx: number | null;
  end_klu_idx: number | null;
  begin_time: string | null;
  end_time: string | null;
  begin_price: number | null;
  end_price: number | null;
}

export interface ZsItem {
  idx: number;
  begin_bi_idx: number | null;
  end_bi_idx: number | null;
  bi_in_idx: number | null;
  bi_out_idx: number | null;
  begin_time: string | null;
  end_time: string | null;
  low: number | null;
  high: number | null;
  peak_low: number | null;
  peak_high: number | null;
  bi_idx_list: number[];
}

export interface BspItem {
  idx: number;
  bi_idx: number | null;
  klu_idx: number | null;
  time: string | null;
  price: number | null;
  is_buy: boolean;
  types: string[];
  is_sure: boolean | null;
}

export interface LadderPoint {
  time: string;
  value: number;
}

export interface LadderLines {
  blue_upper: LadderPoint[];
  blue_lower: LadderPoint[];
  yellow_upper: LadderPoint[];
  yellow_lower: LadderPoint[];
}

interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface HistoryMetadata {
  noData: boolean;
  nextTime?: number | null;
}

interface PeriodParams {
  from: number;
  to: number;
  countBack: number;
  firstDataRequest: boolean;
}

export interface LibrarySymbolInfo {
  name: string;
  full_name: string;
  ticker?: string;
  description: string;
  type: string;
  session: string;
  exchange: string;
  listed_exchange: string;
  timezone: string;
  format: "price" | "volume";
  pricescale: number;
  minmov: number;
  supported_resolutions: string[];
  has_intraday: boolean;
  has_daily: boolean;
  has_weekly_and_monthly: boolean;
  volume_precision?: number;
}

interface SearchSymbolResultItem {
  symbol: string;
  full_name: string;
  description: string;
  exchange: string;
  ticker: string;
  type: string;
}

interface DatafeedConfiguration {
  supported_resolutions?: string[];
  supports_marks?: boolean;
  supports_time?: boolean;
  supports_timescale_marks?: boolean;
}

interface OnReadyCallback {
  (configuration: DatafeedConfiguration): void;
}

interface ResolveCallback {
  (symbolInfo: LibrarySymbolInfo): void;
}

interface ErrorCallback {
  (reason: string): void;
}

interface HistoryCallback {
  (bars: Bar[], meta: HistoryMetadata): void;
}

type ResolutionString = string;

interface ChanPatterns {
  raw_kline_list: KLineItem[];
  bi_list: BiItem[];
  zs_list: ZsItem[];
  bsp_list: BspItem[];
  td9_labels?: Array<{
    time: string;
    price: number;
    text: string;
    position: string;
    color: string;
  }>;
  blue_upper?: LadderPoint[];
  blue_lower?: LadderPoint[];
  yellow_upper?: LadderPoint[];
  yellow_lower?: LadderPoint[];
}

function getApiUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
}

function isLadderPointArray(input: any): input is LadderPoint[] {
  return (
    Array.isArray(input) &&
    input.every(
      (item) =>
        item && typeof item.time === "string" && typeof item.value === "number",
    )
  );
}

function extractIndicatorsPayload(raw: any): any {
  if (!raw || typeof raw !== "object") return null;

  if (raw.data && typeof raw.data === "object") return raw.data;
  return raw;
}

function pickArray<T = any>(...candidates: any[]): T[] {
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as T[];
  }
  return [];
}

function extractLadderLines(payload: any): LadderLines {
  const sources = [
    payload,
    payload?.ladder,
    payload?.ladder_lines,
    payload?.ladderLines,
    payload?.indicators,
    payload?.indicators?.ladder,
    payload?.indicators?.ladder_lines,
    payload?.data,
  ];

  for (const source of sources) {
    if (!source || typeof source !== "object") continue;

    const blueUpper = source.blue_upper ?? source.blueUpper;
    const blueLower = source.blue_lower ?? source.blueLower;
    const yellowUpper = source.yellow_upper ?? source.yellowUpper;
    const yellowLower = source.yellow_lower ?? source.yellowLower;

    if (
      isLadderPointArray(blueUpper) ||
      isLadderPointArray(blueLower) ||
      isLadderPointArray(yellowUpper) ||
      isLadderPointArray(yellowLower)
    ) {
      return {
        blue_upper: isLadderPointArray(blueUpper) ? blueUpper : [],
        blue_lower: isLadderPointArray(blueLower) ? blueLower : [],
        yellow_upper: isLadderPointArray(yellowUpper) ? yellowUpper : [],
        yellow_lower: isLadderPointArray(yellowLower) ? yellowLower : [],
      };
    }
  }

  return {
    blue_upper: [],
    blue_lower: [],
    yellow_upper: [],
    yellow_lower: [],
  };
}

function extractTd9Labels(payload: any) {
  return pickArray(
    payload?.td9_labels,
    payload?.td9Labels,
    payload?.indicators?.td9_labels,
    payload?.indicators?.td9Labels,
    payload?.data?.td9_labels,
    payload?.data?.td9Labels,
  );
}

function normalizeSymbolInput(symbolName: string): string {
  const raw = symbolName.trim().toUpperCase();
  if (!raw) return "";
  return raw.split(":")[0].split(".")[0];
}

function buildBackendCode(symbolInfo: LibrarySymbolInfo): string {
  const cleanSymbol = normalizeSymbolInput(
    symbolInfo.ticker || symbolInfo.name || symbolInfo.full_name || "",
  );
  return `${cleanSymbol}:US`;
}

function toBarTimeMs(timeStr: string, resolution: string): number {
  if (resolution === "D" || resolution === "1D") {
    const datePart = timeStr.trim().split(" ")[0].replace(/\//g, "-");
    const [year, month, day] = datePart.split("-").map((v) => parseInt(v, 10));
    return Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  }

  return parseTimeToUnix(timeStr) * 1000;
}

export class CustomDatafeed {
  private apiUrl: string;
  private cachedChanPatterns: ChanPatterns | null = null;
  private onDataLoadedCallback: (() => void) | null = null;
  private currentSymbol = "";
  private currentResolution = "";

  constructor() {
    this.apiUrl = getApiUrl();
    console.log("[Datafeed] constructor", { apiUrl: this.apiUrl });
  }

  setOnDataLoadedCallback(callback: () => void): void {
    this.onDataLoadedCallback = callback;
    if (this.cachedChanPatterns) {
      setTimeout(callback, 0);
    }
  }

  clearCache(): void {
    this.cachedChanPatterns = null;
    this.currentSymbol = "";
    this.currentResolution = "";
  }

  onReady(callback: OnReadyCallback): void {
    const config: DatafeedConfiguration = {
      supported_resolutions: ["D", "240", "120", "60", "30", "15"],
      supports_marks: false,
      supports_time: false,
      supports_timescale_marks: false,
    };

    setTimeout(() => {
      callback(config);
    }, 0);
  }

  searchSymbols(
    userInput: string,
    _exchange: string,
    _symbolType: string,
    onResult: (items: SearchSymbolResultItem[]) => void,
  ): void {
    const query = normalizeSymbolInput(userInput);

    if (!query) {
      setTimeout(() => onResult([]), 0);
      return;
    }

    const items: SearchSymbolResultItem[] = [
      {
        symbol: query,
        full_name: query,
        description: `${query} US Stock`,
        exchange: "US",
        ticker: query,
        type: "stock",
      },
    ];

    setTimeout(() => {
      onResult(items);
    }, 0);
  }

  resolveSymbol(
    symbolName: string,
    onResolve: ResolveCallback,
    _onError: ErrorCallback,
  ): void {
    const cleanSymbol = normalizeSymbolInput(symbolName);

    const symbolInfo: LibrarySymbolInfo = {
      name: cleanSymbol,
      full_name: cleanSymbol,
      ticker: cleanSymbol,
      description: `${cleanSymbol} US Stock`,
      type: "stock",
      session: "0930-1630",
      exchange: "US",
      listed_exchange: "US",
      timezone: "America/New_York",
      format: "price",
      pricescale: 10000,
      minmov: 1,
      supported_resolutions: ["D", "240", "120", "60", "30", "15"],
      has_intraday: true,
      has_daily: true,
      has_weekly_and_monthly: false,
      volume_precision: 0,
    };

    setTimeout(() => {
      onResolve(symbolInfo);
    }, 0);
  }

  async getBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: ResolutionString,
    periodParams: PeriodParams,
    onResult: HistoryCallback,
    onError: ErrorCallback,
  ): Promise<void> {
    const { from, to, countBack } = periodParams;

    try {
      const level = mapResolutionToLevel(resolution);
      const backendCode = buildBackendCode(symbolInfo);

      if (
        symbolInfo.name !== this.currentSymbol ||
        level !== this.currentResolution
      ) {
        this.cachedChanPatterns = null;
        this.currentSymbol = symbolInfo.name;
        this.currentResolution = level;
      }

      const response = await fetch(`${this.apiUrl}/api/chan/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: backendCode,
          level,
        }),
      });

      if (!response.ok) {
        onError(`API error: ${response.status}`);
        return;
      }

      const data: ApiResponse = await response.json();

      if (data.code !== 0) {
        onError(`API error: ${data.message}`);
        return;
      }

      let combinedTd9List = data.data.td9_labels || [];
      let combinedLadderLines: LadderLines = {
        blue_upper: [],
        blue_lower: [],
        yellow_upper: [],
        yellow_lower: [],
      };

      try {
        const indicatorsResp = await fetch(
          `${this.apiUrl}/api/chan/indicators`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: backendCode, level }),
          },
        );

        if (indicatorsResp.ok) {
          const indicatorsRaw = await indicatorsResp.json();
          const indicatorsPayload = extractIndicatorsPayload(indicatorsRaw);
          const indTd9 = extractTd9Labels(indicatorsPayload);
          combinedLadderLines = extractLadderLines(indicatorsPayload);

          if (Array.isArray(indTd9) && indTd9.length > 0) {
            combinedTd9List = indTd9;
          }

          console.log("[Datafeed] indicators parsed", {
            td9: combinedTd9List.length,
            blueUpper: combinedLadderLines.blue_upper.length,
            blueLower: combinedLadderLines.blue_lower.length,
            yellowUpper: combinedLadderLines.yellow_upper.length,
            yellowLower: combinedLadderLines.yellow_lower.length,
          });
        }
      } catch (e) {
        console.log("[Datafeed] indicators fetch failed", e);
      }

      const rawKlines = data.data.raw_kline_list || [];
      const allSortedKlines = [...rawKlines].sort(
        (a, b) =>
          toBarTimeMs(a.time, resolution) - toBarTimeMs(b.time, resolution),
      );

      const rangeStartMs = from * 1000;
      const rangeEndMs = to * 1000;

      let filteredKlines = allSortedKlines.filter((k) => {
        const t = toBarTimeMs(k.time, resolution);
        return t >= rangeStartMs && t < rangeEndMs;
      });

      if (filteredKlines.length < countBack) {
        const firstVisibleTime =
          filteredKlines.length > 0
            ? toBarTimeMs(filteredKlines[0].time, resolution)
            : rangeEndMs;

        const earlier = allSortedKlines.filter(
          (k) => toBarTimeMs(k.time, resolution) < firstVisibleTime,
        );

        const missing = countBack - filteredKlines.length;
        filteredKlines = [...earlier.slice(-missing), ...filteredKlines];
      }

      const bars: Bar[] = filteredKlines
        .map((item) => ({
          time: toBarTimeMs(item.time, resolution),
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
          volume: item.volume ?? 0,
        }))
        .sort((a, b) => a.time - b.time);

      this.cachedChanPatterns = {
        raw_kline_list: rawKlines,
        bi_list: data.data.bi_list || [],
        zs_list: data.data.zs_list || [],
        bsp_list: data.data.bsp_list || [],
        td9_labels: combinedTd9List,
        ...combinedLadderLines,
      };

      onResult(bars, { noData: bars.length === 0 });

      if (this.onDataLoadedCallback) {
        setTimeout(this.onDataLoadedCallback, 0);
      }
    } catch (error) {
      console.error("[Datafeed] getBars failed", error);
      onError(
        `Failed to fetch data: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  subscribeBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: string,
    _onTick: (bar: Bar) => void,
    listenerGuid: string,
    _onResetCacheNeededCallback: () => void,
  ): void {
    console.log("[Datafeed] subscribeBars", {
      symbol: symbolInfo.name,
      resolution,
      listenerGuid,
    });
  }

  unsubscribeBars(listenerGuid: string): void {
    console.log("[Datafeed] unsubscribeBars", { listenerGuid });
  }

  getChanPatterns(): ChanPatterns | null {
    return this.cachedChanPatterns;
  }
}

export default CustomDatafeed;
