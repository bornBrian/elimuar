"use client";

import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatNumber, initials } from "@/lib/format";

export function Card({
  title,
  subtitle,
  action,
  icon,
  children,
  bodyClassName = "p-4 sm:p-5",
  className = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-line px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-start gap-2.5">
            {icon && <span className="mt-0.5 text-slate-400">{icon}</span>}
            <div className="min-w-0">
              <h2 className="truncate text-title font-extrabold text-slate-900">{title}</h2>
              {subtitle && <p className="mt-0.5 text-xs font-medium text-slate-500">{subtitle}</p>}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  loadingText,
  className = "",
  ...rest
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
  loadingText?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants = {
    primary: "bg-primary-700 text-white hover:bg-primary-800 border-primary-700",
    secondary: "bg-white text-slate-700 hover:bg-slate-50 border-line",
    ghost: "bg-transparent text-slate-600 hover:bg-slate-50 border-transparent",
    danger: "bg-danger-600 text-white hover:bg-danger-700 border-danger-600",
  } as const;
  return (
    <button
      {...rest}
      data-variant={variant}
      aria-busy={loading || undefined}
      disabled={rest.disabled || loading}
      className={`action-button inline-flex items-center justify-center gap-1.5 rounded-control border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        size === "sm" ? "h-7 px-2.5 text-sm" : "h-8 px-3 text-sm"
      } ${variants[variant]} ${className}`}
    >
      {loading && <span aria-hidden className="spinner h-3.5 w-3.5" />}
      {loading ? loadingText ?? children : children}
    </button>
  );
}

const CHIP_TONES = {
  neutral: "text-slate-600",
  info: "text-primary-700",
  success: "text-success-700",
  warning: "text-warning-700",
  danger: "text-danger-700",
  accent: "text-accent-700",
} as const;

const TILE_TONES = {
  neutral: "bg-slate-100 text-slate-600",
  info: "bg-primary-50 text-primary-700",
  success: "bg-success-50 text-success-700",
  warning: "bg-warning-50 text-warning-700",
  danger: "bg-danger-50 text-danger-700",
  accent: "bg-accent-50 text-accent-700",
} as const;

export type ChipTone = keyof typeof CHIP_TONES;

export function Chip({ tone = "neutral", children }: { tone?: ChipTone; children: ReactNode }) {
  return <span className={`chip ${CHIP_TONES[tone]}`}>{children}</span>;
}

export function Tile({ tone = "neutral", children }: { tone?: ChipTone; children: ReactNode }) {
  return (
    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-xs ${TILE_TONES[tone]}`}>
      {children}
    </span>
  );
}

export function Avatar({ name, size = 26, src }: { name: string; size?: number; src?: string | null }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className="inline-block shrink-0 rounded-full border border-line object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: "linear-gradient(140deg, #38BDF8 0%, #2563EB 100%)",
      }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function Kpi({
  label,
  value,
  suffix,
  icon,
  tone = "info",
  loading = false,
  onClick,
  active = false,
}: {
  label: string;
  value: ReactNode;
  suffix?: string;
  icon?: ReactNode;
  tone?: ChipTone;
  loading?: boolean;
  onClick?: () => void;
  active?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="micro-label">{label}</p>
        {icon && <Tile tone={tone}>{icon}</Tile>}
      </div>
      <p className="mt-1.5 flex items-baseline gap-0 sm:mt-2">
        {loading ? (
          <span className="skeleton inline-block h-7 w-16" aria-hidden />
        ) : (
          <>
            <span className="metric text-xl sm:text-2xl">{value}</span>
            {suffix && <span className="text-2xl font-semibold text-slate-800">{suffix}</span>}
          </>
        )}
      </p>
    </>
  );

  if (!onClick) return <div className="flex h-full flex-col bg-white px-3 py-3 sm:px-4 sm:py-3.5">{body}</div>;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group flex h-full flex-col px-3 py-3 text-left transition-colors sm:px-4 sm:py-3.5 ${
        active ? "bg-navy-50" : "bg-white hover:bg-navy-50"
      }`}
    >
      {body}
    </button>
  );
}

export function KpiStrip({ children, columns = 5 }: { children: ReactNode; columns?: 4 | 5 }) {
  return (
    <div
      className={`kpi-strip grid grid-cols-2 divide-x divide-y divide-line overflow-hidden rounded-card border border-line bg-white sm:divide-y-0 ${
        columns === 4 ? "lg:grid-cols-4" : "lg:grid-cols-5"
      }`}
    >
      {children}
    </div>
  );
}

export const PAGE_CHROME_SLOT_ID = "page-chrome-slot";

export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    setSlot(document.getElementById(PAGE_CHROME_SLOT_ID));
    setResolved(true);
  }, []);

  if (slot) {
    return createPortal(
      <>
        <h1 className="min-w-0 truncate text-title font-semibold text-primary-900">{title}</h1>
        {actions && (
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2 print:hidden">{actions}</div>
        )}
      </>,
      slot
    );
  }

  if (!resolved) return null;

  return (
    <section className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line pb-2.5">
      <h1 className="min-w-0 truncate text-xl font-semibold text-slate-900">{title}</h1>
      {actions && (
        <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2 print:hidden">{actions}</div>
      )}
    </section>
  );
}

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  numeric?: boolean;
  width?: string;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  loading = false,
  dense = false,
  pageSize = 10,
  paginate = false,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  emptyAction,
  onRowClick,
}: {
  columns: Array<Column<T>>;
  rows: T[];
  loading?: boolean;
  dense?: boolean;
  pageSize?: number;
  paginate?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  onRowClick?: (row: T) => void;
}) {
  const [page, setPage] = useState(1);

  const scroller = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const measure = () => setScrollable(element.scrollWidth > element.clientWidth + 8);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [columns.length, rows.length]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visible = paginate ? rows.slice((safePage - 1) * pageSize, safePage * pageSize) : rows;

  if (!loading && rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  return (
    <div>
      {scrollable && (
        <p className="border-b border-line bg-slate-50 px-3 py-1.5 text-xs text-slate-500 lg:hidden">
          Swipe sideways for more columns.
        </p>
      )}

      <div ref={scroller} className={scrollable ? "table-scroll table-scroll-fade" : "table-scroll"}>
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="table-head">
              {columns.map((column) => {
                return (
                  <th
                    key={column.key}
                    style={column.width ? { width: column.width } : undefined}
                    className={`px-3 py-2 ${column.numeric ? "text-right" : ""} table-head-cell`}
                  >
                    {column.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 5 }).map((_, index) => (
                <tr key={`skeleton-${index}`} aria-hidden>
                  {columns.map((column, columnIndex) => (
                    <td key={column.key} className="table-cell">
                      <span
                        className={`skeleton skeleton-row-${index + 1} block h-3.5 ${
                          columnIndex === 0 ? "w-4/5" : "w-3/5"
                        }`}
                      />
                    </td>
                  ))}
                </tr>
              ))}

            {!loading &&
              visible.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={onRowClick ? "cursor-pointer hover:bg-slate-50" : ""}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`table-cell text-sm text-slate-700 ${
                        column.numeric ? "num text-right" : ""
                      } ${dense ? "py-1.5" : ""}`}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {paginate && rows.length > pageSize && (
        <div className="flex items-center justify-between px-3 py-2 text-xs text-slate-500">
          <span>
            {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, rows.length)} of {rows.length}
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>
              Previous
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={safePage === totalPages}
              onClick={() => setPage(safePage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden className="mb-3">
        <rect x="8" y="14" width="40" height="28" rx="4" stroke="#C7D8EC" strokeWidth="1.5" />
        <path d="M8 22h40" stroke="#C7D8EC" strokeWidth="1.5" />
        <path d="M16 30h14M16 35h9" stroke="#9BB8DA" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="41" cy="33" r="5" stroke="#9BB8DA" strokeWidth="1.5" />
      </svg>
      <p className="text-base font-semibold text-slate-800">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm leading-5 text-slate-500">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

const SERIES = ["#163A70", "#0E7490", "#4A80C0", "#B45309", "#1B7F4B", "#6D28D9"];

const BAR_COLOR = "#163A70";

export function ProgressBar({
  value,
  tone = "primary",
  align = "start",
}: {
  value: number;
  tone?: "primary" | "success" | "warning";
  align?: "start" | "end";
}) {
  const color = { primary: "bg-primary-600", success: "bg-success-500", warning: "bg-warning-500" }[tone];
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <span className={`flex items-center gap-2 ${align === "end" ? "justify-end" : ""}`}>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200/80">
        <span className={`block h-full rounded-full ${color}`} style={{ width: `${clamped}%` }} />
      </span>
      <span className="num w-9 text-right text-xs text-slate-600">{Math.round(clamped)}%</span>
    </span>
  );
}

export function Donut({
  segments,
  centerValue,
  centerLabel,
  size = 150,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
  centerValue: string | number;
  centerLabel: string;
  size?: number;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const radius = size / 2 - 14;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${centerLabel}: ${centerValue}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#EEF2F7" strokeWidth="14" />
          {total > 0 &&
            segments.map((segment) => {
              const fraction = segment.value / total;
              const dash = fraction * circumference;
              const active = hovered === segment.label;
              const dimmed = hovered !== null && !active;
              const grow = active ? 3 : 0;
              const delay = Math.min((offset / circumference) * 500, 500);
              const element = (
                <circle
                  key={segment.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth={14 + grow}
                  strokeDasharray={`${Math.max(0, dash - 1.5)} ${circumference - dash + 1.5}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                  className="chart-donut-arc"
                  style={{
                    opacity: dimmed ? 0.35 : 1,
                    transition: "opacity 200ms ease, stroke-width 200ms cubic-bezier(0.22, 1, 0.36, 1)",
                    animationDelay: `${delay}ms`,
                  }}
                  onMouseEnter={() => setHovered(segment.label)}
                  onMouseLeave={() => setHovered(null)}
                />
              );
              offset += dash;
              return element;
            })}
        </g>
        <text
          x="50%"
          y="47%"
          textAnchor="middle"
          className="fill-slate-900 font-mono text-page font-bold"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {hovered && total > 0
            ? `${Math.round(((segments.find((s) => s.label === hovered)?.value ?? 0) / total) * 100)}%`
            : centerValue}
        </text>
        <text x="50%" y="60%" textAnchor="middle" className="fill-slate-500 text-micro uppercase tracking-wider">
          {hovered ?? centerLabel}
        </text>
      </svg>

      <ul className="w-full space-y-1.5">
        {segments
          .filter((segment) => segment.value > 0)
          .map((segment) => {
            const active = hovered === segment.label;
            const dimmed = hovered !== null && !active;
            return (
              <li
                key={segment.label}
                onMouseEnter={() => setHovered(segment.label)}
                onMouseLeave={() => setHovered(null)}
                className="flex cursor-default items-center gap-2 rounded-control px-1 py-0.5 text-xs transition-opacity"
                style={{ opacity: dimmed ? 0.45 : 1 }}
              >
                <span className="h-2 w-2 rounded-sm" style={{ background: segment.color }} />
                <span className={`flex-1 ${active ? "font-semibold text-slate-800" : "text-slate-600"}`}>
                  {segment.label}
                </span>
                <span className="num font-semibold text-slate-800">{segment.value}</span>
                <span className="num w-9 text-right text-slate-600">
                  {total > 0 ? `${Math.round((segment.value / total) * 100)}%` : "0%"}
                </span>
              </li>
            );
          })}
      </ul>
    </div>
  );
}

export function RankedBars({
  rows,
}: {
  rows: Array<{ label: string; value: number; caption?: string }>;
}) {
  return (
    <ul className="space-y-2.5">
      {rows.map((row, index) => (
        <li key={row.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium text-slate-700">{row.label}</span>
            <span className="num shrink-0 text-slate-500">{row.caption ?? `${Math.round(row.value)}%`}</span>
          </div>
          <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70">
            <span
              className="ranked-bar-fill block h-full rounded-full"
              style={{
                width: `${Math.max(0, Math.min(100, row.value))}%`,
                background: BAR_COLOR,
                animationDelay: `${Math.min(index * 60, 420)}ms`,
              }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AreaChart({
  labels,
  primary,
  secondary,
  height = 220,
  meaning,
}: {
  labels: string[];
  primary: { label: string; color: string; values: number[] };
  secondary?: { label: string; color: string; values: number[] };
  height?: number;
  meaning?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 720;
  const padding = { top: 16, right: 30, bottom: 26, left: 38 };
  const gradientId = useId().replace(/[:]/g, "");

  const series = secondary ? [primary, secondary] : [primary];
  const pointCount = labels.length;
  const peak = Math.max(1, ...series.flatMap((line) => line.values));
  const { max, ticks } = niceAxis(peak);

  const stepX = (width - padding.left - padding.right) / Math.max(1, pointCount - 1);
  const scaleY = (value: number) => padding.top + (1 - value / max) * (height - padding.top - padding.bottom);
  const x = (index: number) => padding.left + index * stepX;

  function smoothPath(values: number[]): string {
    const points = values.map((value, index) => [x(index), scaleY(value)] as const);
    if (points.length < 2) return points.length === 1 ? `M${points[0][0]},${points[0][1]}` : "";
    let path = `M${points[0][0]},${points[0][1]}`;
    for (let i = 0; i < points.length - 1; i += 1) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[i + 1];
      const midX = (x0 + x1) / 2;
      path += ` C${midX},${y0} ${midX},${y1} ${x1},${y1}`;
    }
    return path;
  }

  const baseline = height - padding.bottom;
  const areaPath = `${smoothPath(primary.values)} L${x(pointCount - 1)},${baseline} L${x(0)},${baseline} Z`;
  const totals = primary.values.reduce((sum, value) => sum + value, 0);
  const submitted = secondary ? secondary.values.reduce((sum, value) => sum + value, 0) : 0;

  return (
    <div className="relative">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
          {series.map((line) => (
            <span key={line.label} className="flex items-center gap-1.5">
              <span className="h-2 w-2.5 rounded-sm" style={{ background: line.color }} />
              {line.label}
            </span>
          ))}
        </div>
        {secondary && totals > 0 && (
          <span className="rounded-control bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
            {formatNumber(submitted)} of {formatNumber(totals)} handed in · {Math.round((submitted / totals) * 100)}%
          </span>
        )}
      </div>

      <div className="chart-scroll overflow-x-auto pb-1">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto min-w-[620px] w-full"
          role="img"
          aria-label={meaning ?? "Activity chart"}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={primary.color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={primary.color} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={scaleY(tick)}
                y2={scaleY(tick)}
                stroke="#E2E8F0"
                strokeWidth="1"
                strokeDasharray={tick === 0 ? undefined : "3 4"}
              />
              <text
                x={padding.left - 6}
                y={scaleY(tick) + 3}
                textAnchor="end"
                className="fill-slate-400 text-micro"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {tick}
              </text>
            </g>
          ))}

          <path d={areaPath} fill={`url(#${gradientId})`} className="chart-fill chart-area-rise" />

          {series.map((line, lineIndex) => (
            <g key={`series-${line.label}`}>
              <path
                d={smoothPath(line.values)}
                fill="none"
                stroke={line.color}
                strokeWidth={lineIndex === 0 ? 2.25 : 1.75}
                strokeDasharray={lineIndex === 0 ? undefined : "5 4"}
                strokeLinejoin="round"
                strokeLinecap="round"
                pathLength={lineIndex === 0 ? 1 : undefined}
                className={lineIndex === 0 ? "chart-line chart-line-draw" : "chart-series-fade"}
              />
            </g>
          ))}

          {primary.values.length > 0 && (
            <g>
              <circle
                cx={x(pointCount - 1)}
                cy={scaleY(primary.values[pointCount - 1] ?? 0)}
                r={5}
                fill={primary.color}
                opacity={0.35}
                className="chart-pulse"
              />
              <circle
                cx={x(pointCount - 1)}
                cy={scaleY(primary.values[pointCount - 1] ?? 0)}
                r={3.5}
                fill={primary.color}
                stroke="#FFFFFF"
                strokeWidth="1.5"
                className="chart-dot"
              />
            </g>
          )}

          {hover !== null && (
            <rect
              x={x(hover) - stepX / 2}
              y={padding.top}
              width={stepX}
              height={baseline - padding.top}
              fill="#0F172A"
              opacity="0.045"
              rx="6"
            />
          )}

          {hover !== null && (
            <g>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={padding.top}
                y2={baseline}
                stroke="#94A3B8"
                strokeWidth="1"
              />
              {series.map((line) => (
                <circle
                  key={`dot-${line.label}`}
                  cx={x(hover)}
                  cy={scaleY(line.values[hover] ?? 0)}
                  r={4}
                  fill="#FFFFFF"
                  stroke={line.color}
                  strokeWidth="2"
                  className="chart-dot"
                />
              ))}
            </g>
          )}

          {labels.map((label, index) => {
            const stride = Math.max(1, Math.ceil(pointCount / 6));
            const isLast = index === pointCount - 1;
            if (!isLast && pointCount - 1 - index < stride) return null;
            if (index % stride !== 0 && !isLast) return null;
            return (
              <text
                key={`${label}-${index}`}
                x={x(index)}
                y={height - 8}
                textAnchor={index === 0 && !isLast ? "start" : isLast ? "end" : "middle"}
                className="fill-slate-500 text-micro"
              >
                {label}
              </text>
            );
          })}

          {labels.map((_, index) => (
            <rect
              key={`hit-${index}`}
              x={x(index) - stepX / 2}
              y={0}
              width={stepX}
              height={height}
              fill="transparent"
              onMouseEnter={() => setHover(index)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>
      </div>

      {hover !== null && (
        <div
          className="pointer-events-none absolute z-10 w-[230px] rounded-control border border-line bg-white px-3 py-2 shadow-pop"
          style={{
            left: `${(x(hover) / width) * 100}%`,
            top: 8,
            transform: `translateX(${hover > pointCount / 2 ? "-104%" : "4%"})`,
          }}
        >
          <p className="text-xs font-semibold text-slate-800">{fullLabel(labels[hover])}</p>
          <ul className="mt-1 space-y-0.5">
            {series.map((line) => (
              <li key={`tip-${line.label}`} className="flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span className="h-1.5 w-1.5 rounded-sm" style={{ background: line.color }} />
                  {line.label}
                </span>
                <span className="num text-xs font-semibold text-slate-800">{line.values[hover]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function Sparkline({
  values,
  color = SERIES[0],
  width = 96,
  height = 28,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  const peak = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const scaleY = (value: number) => height - 3 - (value / peak) * (height - 6);
  const points = values.map((value, index) => `${index * step},${scaleY(value)}`).join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="shrink-0">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      {values.length > 0 && (
        <circle cx={(values.length - 1) * step} cy={scaleY(values[values.length - 1])} r={2.5} fill={color} />
      )}
    </svg>
  );
}

export function LineChart({
  labels,
  values,
  series,
  height = 190,
  color = SERIES[0],
  valueSuffix = "",
  meaning,
}: {
  labels: string[];
  values?: number[];
  series?: Array<{ label: string; color: string; values: number[]; hint?: string }>;
  height?: number;
  color?: string;
  valueSuffix?: string;
  meaning?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 660;
  const padding = { top: 14, right: 30, bottom: 26, left: 38 };

  const lines =
    series && series.length > 0
      ? series
      : [{ label: meaning ?? "Value", color, values: values ?? [] }];

  const pointCount = labels.length;
  const peak = Math.max(1, ...lines.flatMap((line) => line.values));

  const { max, ticks } = niceAxis(peak);

  const stepX = (width - padding.left - padding.right) / Math.max(1, pointCount - 1);
  const scaleY = (value: number) => padding.top + (1 - value / max) * (height - padding.top - padding.bottom);
  const x = (index: number) => padding.left + index * stepX;

  const drawn = lines.filter(
    (line, index) =>
      index === 0 ||
      !lines.slice(0, index).some((earlier) => earlier.values.join(",") === line.values.join(","))
  );

  const gridTicks = ticks;

  return (
    <div className="relative">
      {drawn.length > 1 && (
        <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
          {drawn.map((line) => (
            <span key={line.label} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ background: line.color }} />
              {line.label}
            </span>
          ))}
        </div>
      )}

      <div className="chart-scroll overflow-x-auto pb-1">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto min-w-[660px] w-full" role="img" aria-label={meaning ?? "Trend chart"}>
        {gridTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={scaleY(tick)}
              y2={scaleY(tick)}
              stroke="#E2E8F0"
              strokeWidth="1"
              strokeDasharray={tick === 0 ? undefined : "3 4"}
            />
            <text
              x={padding.left - 6}
              y={scaleY(tick) + 3}
              textAnchor="end"
              className="fill-slate-400 text-micro"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {tick}
            </text>
          </g>
        ))}

        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={padding.top} y2={height - padding.bottom} stroke="#94A3B8" strokeWidth="1" />
        )}

        {drawn.map((line, lineIndex) => (
          <g key={`line-${line.label}`}>
            <polyline
              points={line.values.map((value, index) => `${x(index)},${scaleY(value)}`).join(" ")}
              fill="none"
              stroke={line.color}
              strokeWidth="2"
              strokeDasharray={lineIndex === 0 ? undefined : "5 4"}
              strokeLinejoin="round"
              strokeLinecap="round"
              className={lineIndex === 0 ? "chart-line" : undefined}
            />
            {line.values.map((value, index) => (
              <circle
                key={`dot-${line.label}-${index}`}
                cx={x(index)}
                cy={scaleY(value)}
                r={hover === index ? 4.5 : 2.5}
                fill={hover === index ? line.color : "#FFFFFF"}
                stroke={line.color}
                strokeWidth="1.5"
              />
            ))}
          </g>
        ))}

        {labels.map((label, index) => {
          const stride = Math.max(1, Math.ceil(pointCount / 6));
          const isLast = index === pointCount - 1;
          if (!isLast && pointCount - 1 - index < stride) return null;
          if (index % stride !== 0 && !isLast) return null;
          return (
            <text
              key={`${label}-${index}`}
              x={x(index)}
              y={height - 8}
              textAnchor={index === 0 && !isLast ? "start" : isLast ? "end" : "middle"}
              className="fill-slate-500 text-micro"
            >
              {label}
            </text>
          );
        })}

        {labels.map((_, index) => (
          <rect
            key={`hit-${index}`}
            x={x(index) - stepX / 2}
            y={0}
            width={stepX}
            height={height}
            fill="transparent"
            onMouseEnter={() => setHover(index)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>
      </div>

      {hover !== null && (
        <div
          className="pointer-events-none absolute z-10 w-[230px] rounded-control border border-line bg-white px-3 py-2 shadow-pop"
          style={{
            left: `${(x(hover) / width) * 100}%`,
            top: 8,
            transform: `translateX(${hover > pointCount / 2 ? "-104%" : "4%"})`,
          }}
        >
          <p className="text-xs font-semibold text-slate-800">{fullLabel(labels[hover])}</p>
          <ul className="mt-1 space-y-0.5">
            {drawn.map((line) => (
              <li key={`tip-${line.label}`} className="flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span className="h-1.5 w-1.5 rounded-sm" style={{ background: line.color }} />
                  {line.label}
                </span>
                <span className="num text-xs font-semibold text-slate-800">
                  {line.values[hover]}
                  {valueSuffix}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function fullLabel(label: string): string {
  const parsed = new Date(label.length === 10 ? `${label}T00:00:00` : label);
  if (Number.isNaN(parsed.getTime())) return label;
  return parsed.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function CompareBars({
  labels,
  primary,
  secondary,
  height = 200,
  meaning,
}: {
  labels: string[];
  primary: { label: string; color: string; values: number[] };
  secondary: { label: string; color: string; values: number[] };
  height?: number;
  meaning?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 660;
  const padding = { top: 16, right: 30, bottom: 26, left: 38 };
  const gradientId = useId().replace(/[:]/g, "");

  const pointCount = labels.length;
  const peak = Math.max(1, ...primary.values, ...secondary.values);
  const { max, ticks } = niceAxis(peak);

  const slot = (width - padding.left - padding.right) / Math.max(1, pointCount);
  const barWidth = Math.max(3, Math.min(16, slot * 0.32));
  const scaleY = (value: number) => padding.top + (1 - value / max) * (height - padding.top - padding.bottom);
  const x = (index: number) => padding.left + index * slot + slot / 2;

  const totals = primary.values.reduce((sum, value) => sum + value, 0);
  const submitted = secondary.values.reduce((sum, value) => sum + value, 0);
  const rate = totals > 0 ? Math.round((submitted / totals) * 100) : null;

  return (
    <div className="relative">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
          {[
            { label: primary.label, color: primary.color },
            { label: secondary.label, color: secondary.color },
          ].map((entry) => (
            <span key={entry.label} className="flex items-center gap-1.5">
              <span className="h-2 w-2.5 rounded-sm" style={{ background: entry.color }} />
              {entry.label}
            </span>
          ))}
        </div>
        {rate !== null && (
          <span className="rounded-control bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
            {formatNumber(submitted)} of {formatNumber(totals)} handed in · {rate}%
          </span>
        )}
      </div>

      <div className="chart-scroll overflow-x-auto pb-1">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto min-w-[660px] w-full"
          role="img"
          aria-label={meaning ?? "Daily comparison"}
        >
          <defs>
            <linearGradient id={`${gradientId}-a`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={primary.color} stopOpacity="1" />
              <stop offset="100%" stopColor={primary.color} stopOpacity="0.55" />
            </linearGradient>
            <linearGradient id={`${gradientId}-b`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={secondary.color} stopOpacity="1" />
              <stop offset="100%" stopColor={secondary.color} stopOpacity="0.55" />
            </linearGradient>
          </defs>

          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={scaleY(tick)}
                y2={scaleY(tick)}
                stroke="#E2E8F0"
                strokeWidth="1"
                strokeDasharray={tick === 0 ? undefined : "3 4"}
              />
              <text
                x={padding.left - 6}
                y={scaleY(tick) + 3}
                textAnchor="end"
                className="fill-slate-400 text-micro"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {tick}
              </text>
            </g>
          ))}          {labels.map((_, index) => {
            const primaryValue = primary.values[index] ?? 0;
            const secondaryValue = secondary.values[index] ?? 0;

            const centre = x(index);
            const isHover = hover === index;
            const barDelay = `${Math.min(index * 40, 400)}ms`;
            return (
              <g key={`pair-${index}`} opacity={hover === null || isHover ? 1 : 0.45}>
                <rect
                  x={centre - barWidth - 1.5}
                  y={scaleY(primaryValue)}
                  width={barWidth}
                  height={Math.max(1, height - padding.bottom - scaleY(primaryValue))}
                  rx={Math.min(barWidth / 2, 6)}
                  fill={`url(#${gradientId}-a)`}
                  className="chart-bar"
                  style={{ animationDelay: barDelay }}
                />
                <rect
                  x={centre + 1.5}
                  y={scaleY(secondaryValue)}
                  width={barWidth}
                  height={Math.max(1, height - padding.bottom - scaleY(secondaryValue))}
                  rx={Math.min(barWidth / 2, 6)}
                  fill={`url(#${gradientId}-b)`}
                  className="chart-bar"
                  style={{ animationDelay: barDelay }}
                />
                {isHover && (
                  <line
                    x1={centre - slot / 2}
                    x2={centre + slot / 2}
                    y1={padding.top - 4}
                    y2={padding.top - 4}
                    stroke={primary.color}
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                )}
              </g>
            );
          })}

          {labels.map((label, index) => {
            const stride = Math.max(1, Math.ceil(pointCount / 6));
            const isLast = index === pointCount - 1;
            if (!isLast && pointCount - 1 - index < stride) return null;
            if (index % stride !== 0 && !isLast) return null;
            return (
              <text
                key={`${label}-${index}`}
                x={x(index)}
                y={height - 8}
                textAnchor={index === 0 && !isLast ? "start" : isLast ? "end" : "middle"}
                className="fill-slate-500 text-micro"
              >
                {label}
              </text>
            );
          })}

          {labels.map((_, index) => (
            <rect
              key={`hit-${index}`}
              x={padding.left + index * slot}
              y={0}
              width={slot}
              height={height}
              fill="transparent"
              onMouseEnter={() => setHover(index)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>
      </div>

      {hover !== null && (
        <div
          className="pointer-events-none absolute z-10 w-[230px] rounded-control border border-line bg-white px-3 py-2 shadow-pop"
          style={{
            left: `${(x(hover) / width) * 100}%`,
            top: 8,
            transform: `translateX(${hover > pointCount / 2 ? "-104%" : "4%"})`,
          }}
        >
          <p className="text-xs font-semibold text-slate-800">{fullLabel(labels[hover])}</p>
          <ul className="mt-1 space-y-0.5">
            <li className="flex items-baseline justify-between gap-3">
              <span className="flex items-center gap-1.5 text-xs text-slate-600">
                <span className="h-1.5 w-1.5 rounded-sm" style={{ background: primary.color }} />
                {primary.label}
              </span>
              <span className="num text-xs font-semibold text-slate-800">{primary.values[hover]}</span>
            </li>
            <li className="flex items-baseline justify-between gap-3">
              <span className="flex items-center gap-1.5 text-xs text-slate-600">
                <span className="h-1.5 w-1.5 rounded-sm" style={{ background: secondary.color }} />
                {secondary.label}
              </span>
              <span className="num text-xs font-semibold text-slate-800">{secondary.values[hover]}</span>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

function niceAxis(peak: number): { max: number; ticks: number[] } {
  const safe = Math.max(1, peak);
  const rough = safe / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step =
    [1, 2, 2.5, 5, 10].map((multiple) => multiple * magnitude).find((candidate) => candidate >= rough) ?? 10 * magnitude;
  const max = Math.ceil((safe * 1.1) / step) * step;

  const ticks: number[] = [];
  for (let tick = 0; tick <= max + step / 1000; tick += step) ticks.push(Math.round(tick * 1000) / 1000);
  return { max, ticks };
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`relative flex items-center ${className}`}>
      <svg width="14" height="14" viewBox="0 0 14 14" className="absolute left-2.5 text-slate-400" aria-hidden>
        <circle cx="6" cy="6" r="4.2" stroke="currentColor" strokeWidth="1.4" fill="none" />
        <path d="M9.2 9.2 12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-8 w-full rounded-control border border-line bg-white pl-8 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none"
      />
    </label>
  );
}

export function Select({
  value,
  onChange,
  options,
  children,
  className = "",
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  options?: Array<{ value: string; label: string }>;
  children?: ReactNode;
  className?: string;
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange" | "className">) {
  return (
    <select
      {...rest}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`h-8 rounded-control border border-line bg-white px-2 text-sm text-slate-700 focus:border-primary-500 focus:outline-none ${className}`}
    >
      {options?.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
      {children}
    </select>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  title?: string;
  children: ReactNode;
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), tone === "danger" ? 9000 : 5500);
    return () => window.clearTimeout(timer);
  }, [tone, children, title]);

  if (!visible) return null;
  const tones = {
    info: { label: "Note" },
    warning: { label: "Still needed" },
    danger: { label: "Could not do that" },
    success: { label: "Done" },
  } as const;

  return (
    <div className={`rounded-control border px-3.5 py-2.5 ${
      tone === "success"
        ? "border-success-200 bg-success-50"
        : tone === "danger"
          ? "border-danger-200 bg-danger-50"
          : tone === "warning"
            ? "border-warning-200 bg-warning-50"
            : "border-primary-200 bg-primary-50"
    }`} role={tone === "danger" ? "alert" : "status"}>
      <span className="text-sm font-semibold text-slate-900">{title ?? tones[tone].label}: </span>
      <span className="text-sm text-slate-700">{children}</span>
    </div>
  );
}

export const controlClass =
  "h-8 w-full rounded-control border border-line bg-white px-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400";

export function Field({
  label,
  hint,
  error,
  children,
  className = "",
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-bold uppercase tracking-[0.07em] text-slate-600">{label}</span>
      <span className="mt-1 block">{children}</span>
      {error ? (
        <span className="mt-1 block text-xs text-danger-700">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      )}
    </label>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3.5 w-3.5 rounded border-line text-primary-700 focus:ring-primary-600"
      />
      {label}
    </label>
  );
}

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center sm:p-6"
    >
      <div className="w-full max-w-xl rounded-card border border-line bg-white shadow-pop">
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-xs leading-4 text-slate-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-control px-1.5 py-0.5 text-base text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ value: T; label: string; count?: number }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="tablist" className="flex flex-wrap items-center gap-0.5 border-b border-line">
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              active ? "border-primary-700 text-primary-700" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && <span className="num ml-1.5 text-xs text-slate-400">{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export { SERIES };
