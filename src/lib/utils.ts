/**
 * Utilities for TradingView + Chan analysis integration.
 *
 * Key rules:
 * - TradingView bars use UTC timestamps in milliseconds.
 * - Daily bars should be aligned to 00:00:00 UTC of the trading day.
 * - Intraday bars should be converted from US Eastern market time to UTC.
 */

function isUSEasternDST(
  year: number,
  month: number,
  day: number,
  hour = 12,
  minute = 0,
  second = 0,
): boolean {
  const marchFirst = new Date(Date.UTC(year, 2, 1));
  let secondSundayMarch = 8;
  const marchFirstDay = marchFirst.getUTCDay();
  if (marchFirstDay !== 0) {
    secondSundayMarch = 8 + (7 - marchFirstDay);
  }

  const novemberFirst = new Date(Date.UTC(year, 10, 1));
  let firstSundayNovember = 1;
  const novemberFirstDay = novemberFirst.getUTCDay();
  if (novemberFirstDay !== 0) {
    firstSundayNovember = 8 - novemberFirstDay;
  }

  // DST starts: second Sunday in March, 02:00 local = 07:00 UTC (EST -> EDT)
  const dstStart = Date.UTC(year, 2, secondSundayMarch, 7, 0, 0);

  // DST ends: first Sunday in November, 02:00 local = 06:00 UTC (EDT -> EST)
  const dstEnd = Date.UTC(year, 10, firstSundayNovember, 6, 0, 0);

  // Use a provisional EST-based UTC timestamp for boundary checking.
  const probeUtc = Date.UTC(year, month, day, hour + 5, minute, second, 0);

  return probeUtc >= dstStart && probeUtc < dstEnd;
}

function normalizeTimeString(timeStr: string): string {
  return timeStr.trim().replace(/\//g, "-").replace(/\s+/g, " ");
}

function parseDateParts(timeStr: string) {
  const normalized = normalizeTimeString(timeStr);
  const [datePart, timePartRaw] = normalized.split(" ");

  if (!datePart) {
    throw new Error(`Invalid time string: ${timeStr}`);
  }

  const [yearStr, monthStr, dayStr] = datePart.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    throw new Error(`Invalid date format: ${timeStr}`);
  }

  let hour = 0;
  let minute = 0;
  let second = 0;
  const hasTime = Boolean(timePartRaw);

  if (timePartRaw) {
    const timePart = timePartRaw.trim();

    if (timePart.includes(":")) {
      const [h = "0", m = "0", s = "0"] = timePart.split(":");
      hour = parseInt(h, 10);
      minute = parseInt(m, 10);
      second = parseInt(s, 10);
    } else if (/^\d{4}$/.test(timePart)) {
      hour = parseInt(timePart.slice(0, 2), 10);
      minute = parseInt(timePart.slice(2, 4), 10);
    } else if (/^\d{6}$/.test(timePart)) {
      hour = parseInt(timePart.slice(0, 2), 10);
      minute = parseInt(timePart.slice(2, 4), 10);
      second = parseInt(timePart.slice(4, 6), 10);
    } else {
      throw new Error(`Unsupported time format: ${timeStr}`);
    }

    if (
      !Number.isFinite(hour) ||
      !Number.isFinite(minute) ||
      !Number.isFinite(second)
    ) {
      throw new Error(`Invalid time value: ${timeStr}`);
    }
  }

  return { year, month, day, hour, minute, second, hasTime };
}

/**
 * Convert backend time string to UTC milliseconds for TradingView bars.
 * Supported inputs:
 * - YYYY-MM-DD
 * - YYYY-MM-DD HH:mm
 * - YYYY-MM-DD HH:mm:ss
 * - YYYY-MM-DD HHmm
 * - YYYY-MM-DD HHmmss
 */
export function parseTimeToUnixMs(timeStr: string): number {
  const { year, month, day, hour, minute, second, hasTime } =
    parseDateParts(timeStr);

  if (!hasTime) {
    return Date.UTC(year, month, day, 0, 0, 0, 0);
  }

  const isDST = isUSEasternDST(year, month, day, hour, minute, second);
  const utcOffsetHours = isDST ? 4 : 5;
  return Date.UTC(year, month, day, hour + utcOffsetHours, minute, second, 0);
}

/**
 * Backward-compatible helper if other code still expects seconds.
 */
export function parseTimeToUnix(timeStr: string): number {
  return Math.floor(parseTimeToUnixMs(timeStr) / 1000);
}

export function mapLevelToResolution(level: string): string {
  const map: Record<string, string> = {
    "1D": "D",
    "4H": "240",
    "2H": "120",
    "1H": "60",
    "30M": "30",
    "15M": "15",
  };
  return map[level] || "D";
}

export function mapResolutionToLevel(resolution: string): string {
  const map: Record<string, string> = {
    D: "1D",
    "1D": "1D",
    "240": "4H",
    "4H": "4H",
    "120": "2H",
    "2H": "2H",
    "60": "1H",
    "1H": "1H",
    "30": "30M",
    "15": "15M",
  };
  return map[resolution] || "1D";
}

export function formatPrice(price: number): string {
  if (price >= 1) return price.toFixed(2);
  return price.toFixed(4);
}
