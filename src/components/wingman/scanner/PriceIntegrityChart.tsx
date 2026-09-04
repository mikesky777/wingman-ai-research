/**
 * Price Integrity calibration chart.
 *
 * Renders the persisted `token_price_candles` dataset that the Price Integrity
 * classifier actually evaluated, so a human review and the machine result are
 * directly comparable. Display only: no fetching decisions, no classification,
 * no provider calls.
 */
import { useMemo } from "react";
import {
  Bar,
  Cell,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReviewCandle } from "@/lib/wingman/services/scanner/candle-review.server";

export interface IntegrityLevels {
  peakValue: number | null;
  postPeakLowValue: number | null;
  sustainedHigh: number | null;
  currentValue: number | null;
}

interface Datum {
  t: number;
  label: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volumeUsd: number | null;
  body: [number, number] | null;
  wick: [number, number] | null;
  up: boolean;
}

function fmtPrice(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v >= 1) return v.toFixed(4);
  return v.toPrecision(4);
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Custom candle body: a range bar plus its high/low wick. */
function CandleShape(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: Datum;
  yAxis?: { scale?: (v: number) => number };
}) {
  const { x = 0, width = 0, payload, yAxis } = props;
  if (!payload) return null;
  const scale = yAxis?.scale;
  const color = payload.up ? "hsl(var(--positive, 142 70% 45%))" : "hsl(var(--destructive))";
  const cx = x + width / 2;
  const bodyY = props.y ?? 0;
  const bodyH = Math.max(props.height ?? 0, 1);
  const wickTop = scale && payload.high != null ? scale(payload.high) : null;
  const wickBottom = scale && payload.low != null ? scale(payload.low) : null;

  return (
    <g>
      {wickTop !== null && wickBottom !== null ? (
        <line x1={cx} x2={cx} y1={wickTop} y2={wickBottom} stroke={color} strokeWidth={1} />
      ) : null}
      <rect x={x} y={bodyY} width={Math.max(width, 1)} height={bodyH} fill={color} />
    </g>
  );
}

export function PriceIntegrityChart({
  candles,
  levels,
}: {
  candles: ReviewCandle[];
  levels: IntegrityLevels;
}) {
  const data = useMemo<Datum[]>(() => {
    return candles
      .filter((c) => c.close != null || c.high != null)
      .map((c) => {
        const open = c.open ?? c.close ?? null;
        const close = c.close ?? c.open ?? null;
        const lo = open != null && close != null ? Math.min(open, close) : null;
        const hi = open != null && close != null ? Math.max(open, close) : null;
        return {
          t: new Date(c.t).getTime(),
          label: fmtTime(c.t),
          open,
          high: c.high,
          low: c.low,
          close,
          volumeUsd: c.volumeUsd,
          body: lo != null && hi != null ? ([lo, hi === lo ? hi * 1.0005 : hi] as [number, number]) : null,
          wick: c.low != null && c.high != null ? ([c.low, c.high] as [number, number]) : null,
          up: open != null && close != null ? close >= open : true,
        };
      });
  }, [candles]);

  if (data.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        No persisted candles for this token. Nothing is fetched from opening this drawer.
      </p>
    );
  }

  const lows = data.map((d) => d.low ?? d.close ?? 0).filter((v) => v > 0);
  const highs = data.map((d) => d.high ?? d.close ?? 0).filter((v) => v > 0);
  const min = Math.min(...lows, ...(levels.postPeakLowValue ? [levels.postPeakLowValue] : []));
  const max = Math.max(...highs, ...(levels.peakValue ? [levels.peakValue] : []));

  const markers: { key: string; value: number | null; label: string; color: string }[] = [
    { key: "peak", value: levels.peakValue, label: "Early peak", color: "hsl(var(--primary))" },
    {
      key: "low",
      value: levels.postPeakLowValue,
      label: "Post-peak low",
      color: "hsl(var(--destructive))",
    },
    {
      key: "repair",
      value: levels.sustainedHigh,
      label: "Sustained reclaim",
      color: "hsl(var(--muted-foreground))",
    },
    { key: "now", value: levels.currentValue, label: "Current", color: "hsl(var(--foreground))" },
  ];

  return (
    <div className="space-y-2">
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v: number) => fmtTime(new Date(v).toISOString())}
              tick={{ fontSize: 9 }}
              minTickGap={40}
              stroke="hsl(var(--muted-foreground))"
            />
            <YAxis
              domain={[min * 0.95, max * 1.05]}
              tick={{ fontSize: 9 }}
              width={62}
              tickFormatter={(v: number) => fmtPrice(v)}
              stroke="hsl(var(--muted-foreground))"
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 6,
                fontSize: 11,
              }}
              labelFormatter={(v) => fmtTime(new Date(Number(v)).toISOString())}
              formatter={(_value, _name, item) => {
                const p = item?.payload as Datum | undefined;
                if (!p) return ["—", ""];
                return [
                  `O ${fmtPrice(p.open)} · H ${fmtPrice(p.high)} · L ${fmtPrice(p.low)} · C ${fmtPrice(
                    p.close,
                  )}${p.volumeUsd != null ? ` · vol $${Math.round(p.volumeUsd).toLocaleString()}` : ""}`,
                  "OHLCV",
                ];
              }}
            />
            <Bar dataKey="body" shape={<CandleShape /> as never} isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell key={i} />
              ))}
            </Bar>
            {markers.map((m) =>
              m.value != null ? (
                <ReferenceLine
                  key={m.key}
                  y={m.value}
                  stroke={m.color}
                  strokeDasharray="3 3"
                  label={{ value: m.label, position: "insideTopLeft", fontSize: 9, fill: m.color }}
                />
              ) : null,
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="h-16 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 0, right: 6, bottom: 0, left: 0 }}>
            <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} hide />
            <YAxis hide width={62} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 6,
                fontSize: 11,
              }}
              labelFormatter={(v) => fmtTime(new Date(Number(v)).toISOString())}
              formatter={(value) => [`$${Math.round(Number(value)).toLocaleString()}`, "Volume"]}
            />
            <Bar dataKey="volumeUsd" fill="hsl(var(--primary))" opacity={0.45} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        {markers.map((m) => (
          <span key={m.key}>
            <span className="mr-1 inline-block h-[2px] w-3 align-middle" style={{ background: m.color }} />
            {m.label}: {m.value == null ? "unavailable" : fmtPrice(m.value)}
          </span>
        ))}
      </div>
    </div>
  );
}
