"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CaretDown as ChevronDown,
  CaretLeft as ChevronLeft,
  CaretRight as ChevronRight,
  Check,
  DotsThreeOutlineVertical as EllipsisVertical,
  Icon,
  MagnifyingGlass as Search,
  TrendDown,
  TrendUp,
  X,
  type IconProps,
} from "@phosphor-icons/react";

export type ConsoleIcon = Icon;
export type { IconProps as ConsoleIconProps };

export interface Crumb {
  label: string;
  href?: string;
}

export function ConsolePage({
  crumbs,
  lead,
  title,
  subtitle,
  actions,
  children,
  width = "wide",
}: {
  crumbs?: Crumb[];
  lead?: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  width?: "wide" | "form";
}) {
  const trail = (crumbs ?? []).filter(
    (crumb, index) =>
      !(index === (crumbs ?? []).length - 1 && crumb.label.toLowerCase() === title.toLowerCase())
  );

  return (
    <div className={`mx-auto w-full ${width === "form" ? "max-w-[1180px]" : ""}`}>
      {trail.length > 0 && (
        <nav aria-label="Breadcrumb" className="console-crumb">
          {trail.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
              {index > 0 && <ChevronRight size={13} weight="bold" aria-hidden className="text-[#c2d2e6]" />}
              {crumb.href ? <Link href={crumb.href}>{crumb.label}</Link> : <span data-current>{crumb.label}</span>}
            </span>
          ))}
        </nav>
      )}
      {lead && <p className="mb-1 text-[13px] text-ink-500">{lead}</p>}

      <header className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
        <div className="min-w-0 lg:flex-1">
          <h1 className="text-head font-bold text-ink-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm leading-5 text-ink-500">{subtitle}</p>}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2.5 lg:shrink-0 lg:flex-nowrap lg:justify-end">{actions}</div>
        )}
      </header>

      <div className="mt-5">{children}</div>
    </div>
  );
}

export function Panel({
  icon,
  title,
  meta,
  action,
  children,
  className = "",
  bodyClassName = "",
  padded = true,
}: {
  icon?: ConsoleIcon;
  title?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  padded?: boolean;
}) {
  const IconCmp = icon;
  return (
    <section className={`console-card flex flex-col ${className}`}>
      {title && (
        <header className="flex items-start justify-between gap-3 px-5 pb-4 pt-5">
          <div className="flex min-w-0 items-start gap-2.5">
            {IconCmp && (
              <span className="console-tile mt-0.5">
                <IconCmp size={20} weight="regular" aria-hidden />
              </span>
            )}
            <div className="min-w-0 pt-0.5">
              <h2 className="truncate text-[15px] font-bold text-ink-900">{title}</h2>
              {meta && <p className="mt-0.5 text-[13px] text-ink-500">{meta}</p>}
            </div>
          </div>
          {action && <div className="shrink-0 pt-1">{action}</div>}
        </header>
      )}
      <div className={`min-h-0 flex-1 ${padded ? `px-5 pb-5 ${title ? "" : "pt-5"}` : ""} ${bodyClassName}`}>
        {children}
      </div>
    </section>
  );
}

export function PanelLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-[13px] font-semibold text-brand-600 hover:text-brand-700">
      {children}
    </Link>
  );
}

const BUTTON_VARIANT = {
  primary: "console-btn-primary",
  outline: "console-btn-outline",
  danger: "console-btn-danger",
} as const;

export function Btn({
  children,
  href,
  variant = "outline",
  size = "md",
  loading = false,
  className = "",
  ...rest
}: {
  children: ReactNode;
  href?: string;
  variant?: "primary" | "outline" | "danger";
  size?: "md" | "sm";
  loading?: boolean;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const classes = `console-btn ${BUTTON_VARIANT[variant]} ${size === "sm" ? "console-btn-sm" : ""} ${className}`;
  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button
      {...rest}
      type={rest.type ?? "button"}
      disabled={rest.disabled || loading}
      aria-busy={loading || undefined}
      className={classes}
    >
      {loading ? <span aria-hidden className="spinner h-3.5 w-3.5" /> : null}
      {children}
    </button>
  );
}

export function IconTile({ icon: Icon, size = "md" }: { icon: ConsoleIcon; size?: "md" | "sm" }) {
  return (
    <span className="console-tile inline-flex shrink-0 items-center justify-center">
      <Icon size={size === "sm" ? 17 : 21} weight="duotone" aria-hidden />
    </span>
  );
}

export function Status({ value, label }: { value: string; label?: string }) {
  const tone =
    value === "active" || value === "published"
      ? "console-status-active"
      : value === "pending" || value === "in_review" || value === "draft"
        ? "console-status-pending"
        : value === "suspended" || value === "removed"
          ? "console-status-suspended"
          : "console-status-muted";
  const text =
    label ??
    ({
      active: "Active",
      suspended: "Inactive",
      pending: "Pending",
      published: "Published",
      draft: "Draft",
      in_review: "In review",
      archived: "Archived",
      transferred: "Transferred",
      removed: "Removed",
    }[value] ??
      value);
  return <span className={`console-status ${tone}`}>{text}</span>;
}

export function RoleLabel({ role }: { role: string }) {
  const label =
    ({
      platform_admin: "Platform Admin",
      school_admin: "School Head",
      academic_master: "Academic Master",
      secretary: "Secretary",
      teacher: "Teacher",
      student: "Student",
    }[role] ?? role);
  return <span>{label}</span>;
}

export interface TabDef {
  key: string;
  label: string;
  count?: number;
}

export function Tabs({
  tabs,
  value,
  onChange,
  className = "",
}: {
  tabs: TabDef[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={`flex flex-wrap items-center gap-7 border-b border-line ${className}`}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={tab.key === value}
          onClick={() => onChange(tab.key)}
          className="console-tab"
        >
          {tab.label}
          {tab.count !== undefined && <span className="ml-1.5 text-[12px] font-semibold text-ink-500">({tab.count})</span>}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <span className={`relative block ${className}`}>
      <Search
        size={16}
        weight="bold"
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#64809f]"
      />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="console-input pl-9"
      />
    </span>
  );
}

export function Select({
  value,
  onChange,
  options,
  ariaLabel,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={ariaLabel}
      className={`console-input ${className}`}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="console-label">{label}</span>
      {children}
    </label>
  );
}

export function Dialog({
  open,
  title,
  description,
  onClose,
  footer,
  children,
  width = "md",
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
  width?: "md" | "lg";
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" onClick={onClose} className="fixed inset-0 bg-ink-900/45" />
      <div
        className={`relative mx-auto my-4 w-full ${
          width === "lg" ? "max-w-[760px]" : "max-w-[560px]"
        } rounded-2xl border border-line bg-white shadow-[0_30px_80px_-40px_rgba(10,33,56,0.55)]`}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-[16px] font-bold text-ink-900">{title}</h2>
            {description && <p className="mt-0.5 text-[13px] leading-5 text-ink-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-500 hover:bg-brand-50 hover:text-brand-600"
          >
            <X size={17} weight="bold" aria-hidden />
          </button>
        </header>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2.5 border-t border-line px-5 py-3.5">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

export function RowMenu({
  items,
  ariaLabel = "More actions",
}: {
  items: Array<{ label: string; icon?: ConsoleIcon; onSelect: () => void; tone?: "default" | "danger" }>;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const holder = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (holder.current && !holder.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <span ref={holder} className="relative inline-block">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 hover:bg-brand-50 hover:text-brand-600"
      >
        <EllipsisVertical size={17} weight="bold" aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-20 w-44 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-[0_18px_40px_-22px_rgba(10,33,56,0.4)]"
        >
          {items.map((item) => {
            const ItemIcon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium ${
                  item.tone === "danger"
                    ? "text-danger-600 hover:bg-danger-50"
                    : "text-ink-700 hover:bg-brand-50 hover:text-brand-700"
                }`}
              >
                {ItemIcon && <ItemIcon size={15} weight="bold" aria-hidden />}
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </span>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
  label,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  label: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  const windowStart = Math.max(1, Math.min(page - 2, pages - 4));
  const numbers = Array.from({ length: Math.min(5, pages) }, (_, index) => windowStart + index).filter(
    (value) => value >= 1 && value <= pages
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
      <p className="text-[13px] text-ink-500">
        {label} {first} – {last} of {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 hover:bg-brand-50 hover:text-brand-600 disabled:opacity-40"
        >
          <ChevronLeft size={16} weight="bold" aria-hidden />
        </button>
        {numbers.map((value) => (
          <button
            key={value}
            type="button"
            aria-current={value === page ? "page" : undefined}
            onClick={() => onChange(value)}
            className={`h-8 min-w-8 rounded-lg px-2 text-[13px] font-semibold ${
              value === page ? "bg-brand-600 text-white" : "text-ink-600 hover:bg-brand-50 hover:text-brand-600"
            }`}
          >
            {value}
          </button>
        ))}
        <button
          type="button"
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 hover:bg-brand-50 hover:text-brand-600 disabled:opacity-40"
        >
          <ChevronRight size={16} weight="bold" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export interface TableColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  numeric?: boolean;
  width?: string;
}

export function ConsoleTable<T extends { id: string }>({
  columns,
  rows,
  loading = false,
  pageSize = 10,
  paginate = true,
  emptyMessage = "Nothing to show here yet.",
  onRowClick,
}: {
  columns: Array<TableColumn<T>>;
  rows: T[];
  loading?: boolean;
  pageSize?: number;
  paginate?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
}) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pages);
  const visible = paginate ? rows.slice((safePage - 1) * pageSize, safePage * pageSize) : rows;

  return (
    <div>
      <div className="table-scroll">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="console-thead">
              {columns.map((column) => (
                <th
                  key={column.key}
                  style={column.width ? { width: column.width } : undefined}
                  className={`console-th ${column.numeric ? "text-right" : ""}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 4 }).map((_, index) => (
                <tr key={`skeleton-${index}`} className="console-row" aria-hidden>
                  {columns.map((column, cell) => (
                    <td key={column.key} className="console-cell">
                      <Skeleton className={`h-4 ${cell === 0 ? "w-32" : "w-16"}`} />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading &&
              visible.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`console-row ${onRowClick ? "cursor-pointer" : ""}`}
                >
                  {columns.map((column) => (
                    <td key={column.key} className={`console-cell ${column.numeric ? "num text-right" : ""}`}>
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            {!loading && rows.length === 0 && <EmptyRow colSpan={columns.length} message={emptyMessage} />}
          </tbody>
        </table>
      </div>
      {paginate && rows.length > pageSize && (
        <Pagination page={safePage} pageSize={pageSize} total={rows.length} onChange={setPage} label="Showing" />
      )}
    </div>
  );
}

export function StatCard({
  icon,
  label,
  value,
  caption,
  trend,
}: {
  icon: ConsoleIcon;
  label: string;
  value: ReactNode;
  caption: ReactNode;
  trend?: { delta: number; previous: number; points: number[] };
}) {
  const up = (trend?.delta ?? 0) > 0;
  const down = (trend?.delta ?? 0) < 0;
  const percent =
    trend && trend.previous > 0 ? Math.round((trend.delta / trend.previous) * 100) : null;
  const toneClass = up ? "text-[#0F7A3D]" : down ? "text-danger-600" : "text-ink-500";
  const TrendIcon = up ? TrendUp : down ? TrendDown : undefined;
  return (
    <div className="console-card px-5 py-4">
      <div className="flex items-center gap-2 text-brand-600">
        <StatGlyph icon={icon} />
        <p className="text-[13px] font-semibold text-ink-600">{label}</p>
      </div>
      <p className="mt-2.5 text-[30px] font-bold leading-9 tracking-tight text-ink-900">{value}</p>
      <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-ink-500">
        {trend && trend.delta !== 0 && TrendIcon && (
          <span className={`inline-flex items-center gap-0.5 font-semibold ${toneClass}`}>
            <TrendIcon size={13} weight="bold" aria-hidden />
            {up ? "+" : down ? "−" : ""}
            {Math.abs(trend.delta)}
            {percent !== null && <span aria-hidden> ({up ? "+" : down ? "−" : ""}{Math.abs(percent)}%)</span>}
          </span>
        )}
        {trend && trend.delta !== 0 ? <span aria-hidden>·</span> : null}
        <span>{caption}</span>
      </p>
    </div>
  );
}

function StatGlyph({ icon: Icon }: { icon: ConsoleIcon }) {
  return <Icon size={18} weight="duotone" aria-hidden />;
}

export function ActivityChart({
  labels,
  series,
}: {
  labels: string[];
  series: Array<{ key: string; label: string; color: string; values: number[] }>;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const width = 900;
  const height = 300;
  const padding = { top: 18, right: 14, bottom: 34, left: 44 };

  const toggleSeries = (key: string) => {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(key) && next.size === series.length - 1) return next;
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const visible = series.filter((line) => !hidden.has(line.key));
  const peak = Math.max(1, ...visible.flatMap((line) => line.values));
  const max = niceMax(peak);
  const stepX = (width - padding.left - padding.right) / Math.max(1, labels.length - 1);
  const scaleY = (value: number) => padding.top + (1 - value / max) * (height - padding.top - padding.bottom);
  const x = (index: number) => padding.left + index * stepX;

  const path = (values: number[]) => {
    const points = values.map((value, index) => [x(index), scaleY(value)] as const);
    if (points.length === 0) return "";
    let d = `M${points[0][0]},${points[0][1]}`;
    for (let index = 1; index < points.length; index += 1) {
      const [x0, y0] = points[index - 1];
      const [x1, y1] = points[index];
      const mid = (x0 + x1) / 2;
      d += ` C${mid},${y0} ${mid},${y1} ${x1},${y1}`;
    }
    return d;
  };

  const ticks = Array.from({ length: 6 }, (_, index) => Math.round((max / 5) * index));

  const totals = series.map((line) => ({
    ...line,
    total: line.values.reduce((sum, value) => sum + value, 0),
    off: hidden.has(line.key),
  }));

  return (
    <div className="relative flex flex-col gap-4 lg:flex-row">
      <div className="relative min-w-0 flex-1">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-[260px] w-full"
          role="img"
          aria-label={`Platform activity over ${labels.length} days`}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={scaleY(tick)}
                y2={scaleY(tick)}
                stroke={tick === 0 ? "#DCE6F5" : "#EDF2F9"}
                strokeWidth="1"
              />
              <text x={padding.left - 10} y={scaleY(tick) + 5} textAnchor="end" className="fill-[#9db0c9] text-[20px]">
                {tick}
              </text>
            </g>
          ))}

          {hover !== null && (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={padding.top}
              y2={height - padding.bottom}
              stroke="#C6DCFD"
              strokeWidth="1.5"
            />
          )}

          {visible.map((line) => (
            <g key={line.key}>
              <path
                d={path(line.values)}
                fill="none"
                stroke={line.color}
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="chart-line-draw"
              />
              {hover !== null && (
                <circle
                  cx={x(hover)}
                  cy={scaleY(line.values[hover] ?? 0)}
                  r="4"
                  fill="#FFFFFF"
                  stroke={line.color}
                  strokeWidth="2.5"
                />
              )}
            </g>
          ))}

          {labels.map((label, index) => {
            const stride = Math.max(1, Math.ceil(labels.length / 6));
            const last = index === labels.length - 1;
            if (!last && index % stride !== 0) return null;
            if (!last && labels.length - 1 - index < stride) return null;
            return (
              <text
                key={`${label}-${index}`}
                x={x(index)}
                y={height - 8}
                textAnchor={index === 0 ? "start" : last ? "end" : "middle"}
                className="fill-[#64809f] text-[20px]"
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

      <ul className="w-full shrink-0 space-y-1 lg:w-[220px] lg:pt-4">
        {totals.map((line) => (
          <li key={line.key}>
            <button
              type="button"
              aria-pressed={!line.off}
              onClick={() => toggleSeries(line.key)}
              title={line.off ? `Show ${line.label}` : `Hide ${line.label}`}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-opacity hover:bg-[#F4F8FE]"
            >
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: line.off ? "transparent" : line.color, boxShadow: line.off ? `inset 0 0 0 1.5px ${line.color}` : undefined }}
              />
              <span
                className={`flex-1 truncate text-[13px] font-medium ${
                  line.off ? "text-ink-500 line-through decoration-1 opacity-60" : "text-ink-600"
                }`}
              >
                {line.label}
              </span>
              <span className={`num text-[13px] font-semibold ${line.off ? "text-ink-500 opacity-60" : "text-ink-900"}`}>
                {line.total}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {hover !== null && (
        <div
          className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-xl bg-ink-900 px-3 py-2 shadow-[0_18px_40px_-18px_rgba(10,33,56,0.7)]"
          role="status"
        >
          <p className="text-[12px] font-bold text-white">{labels[hover]}</p>
          <ul className="mt-1 space-y-0.5">
            {visible.map((line) => (
              <li key={`tip-${line.key}`} className="flex items-center gap-2.5 whitespace-nowrap">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: line.color }} />
                <span className="flex-1 text-[11.5px] font-medium text-[#c8d6e8]">{line.label}</span>
                <span className="num text-[11.5px] font-bold text-white">{line.values[hover] ?? 0}</span>
              </li>
            ))}
          </ul>
          {visible.length < series.length && (
            <p className="mt-1 text-[10.5px] text-[#8ba1be]">{series.length - visible.length} hidden — tap a legend item to show it</p>
          )}
        </div>
      )}
    </div>
  );
}

function niceMax(peak: number): number {
  if (peak <= 5) return 5;
  const magnitude = Math.pow(10, Math.floor(Math.log10(peak)));
  for (const factor of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    const candidate = magnitude * factor;
    if (candidate >= peak) return candidate;
  }
  return magnitude * 10;
}

export function RankedList({
  rows,
  emptyLabel = "Nothing recorded yet",
}: {
  rows: Array<{ label: string; value: ReactNode }>;
  emptyLabel?: string;
}) {
  if (rows.length === 0) return <p className="py-2 text-[13px] text-ink-500">{emptyLabel}</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((row) => (
        <li key={row.label} className="flex items-center justify-between gap-3 py-2.5">
          <span className="truncate text-[13.5px] font-medium text-ink-700">{row.label}</span>
          <span className="num shrink-0 text-[13.5px] font-semibold text-ink-900">{row.value}</span>
        </li>
      ))}
    </ul>
  );
}

export function MiniStat({ label, value, tone = "default" }: { label: string; value: ReactNode; tone?: "default" | "warning" }) {
  return (
    <div className="flex min-h-[64px] flex-col justify-between">
      <p className="text-[22px] font-bold leading-7 text-ink-900">{value}</p>
      <p className={`text-[11.5px] font-medium leading-4 ${tone === "warning" ? "text-[#a3600a]" : "text-ink-500"}`}>
        {label}
      </p>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; icon?: ConsoleIcon }>;
}) {
  return (
    <div className="inline-flex rounded-lg border border-[#DCE6F5] bg-[#F7FAFE] p-0.5">
      {options.map((option) => {
        const IconCmp = option.icon;
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`flex h-8 items-center gap-1.5 rounded-[7px] px-3 text-[13px] font-semibold transition-colors ${
              active ? "bg-white text-brand-600 shadow-[0_1px_2px_rgba(10,33,56,0.08)]" : "text-ink-500 hover:text-ink-700"
            }`}
          >
            {IconCmp && <IconCmp size={14} weight="bold" aria-hidden />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function CheckBox({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <span className="relative inline-flex h-4 w-4 items-center justify-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={ariaLabel}
        className="peer h-4 w-4 appearance-none rounded border border-[#C6D6EA] bg-white checked:border-brand-600 checked:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
      />
      <Check
        size={11}
        weight="bold"
        aria-hidden
        className="pointer-events-none absolute text-white opacity-0 peer-checked:opacity-100"
      />
    </span>
  );
}

export function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-12 text-center text-[13.5px] text-ink-500">
        {message}
      </td>
    </tr>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-[#E4EBF6] bg-[#F7FAFE] px-3.5 py-2.5 text-[12.5px] leading-5 text-ink-500">
      {children}
    </p>
  );
}

export const TH = "console-th";
export const TD = "console-cell";

export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`skeleton inline-block ${className}`} />;
}

export function useDebounced<T>(value: T, delayMs = 250): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}
