"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  Calendar,
  CalendarDays,
  Check,
  CircleCheckBig,
  Download,
  Eye,
  FileText,
  Info,
  ShieldCheck,
  X,
} from "lucide-react";
import type { ExportFormat } from "@/lib/export";

export interface ExportOptions {
  format: ExportFormat;
  range: "current" | "all" | "custom";
  dateFrom?: string;
  dateTo?: string;
}

const FORMAT_OPTIONS: {
  value: ExportFormat;
  label: string;
  description: string;
}[] = [
  { value: "xlsx", label: "Excel (XLSX)", description: "Best for data analysis" },
  { value: "csv", label: "CSV", description: "Universal format" },
];

const RANGE_OPTIONS: {
  value: "current" | "all" | "custom";
  label: string;
  description: string;
}[] = [
  {
    value: "current",
    label: "Current View",
    description: "Export the appointments currently shown",
  },
  {
    value: "all",
    label: "All Appointments",
    description: "Export all appointments from all tabs",
  },
  {
    value: "custom",
    label: "Custom Date Range",
    description: "Choose a specific date range",
  },
];

/**
 * "Export Appointments" options popup (reference: docs/Export Appointments
 * html css.txt, teal variant). Lets the user pick format (Excel/CSV) and data
 * range (current view / all / custom dates) before downloading.
 */
export function ExportAppointmentsModal({
  open,
  currentCount,
  onClose,
  onExport,
}: {
  open: boolean;
  currentCount: number;
  onClose: () => void;
  onExport: (options: ExportOptions) => void;
}) {
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [range, setRange] = useState<"current" | "all" | "custom">("current");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    if (open) {
      setFormat("csv");
      setRange("current");
      setDateFrom("");
      setDateTo("");
    }
  }, [open]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, handleKeyDown]);

  if (!open || typeof document === "undefined") return null;

  const customInvalid = range === "custom" && (!dateFrom || !dateTo);
  const topicValue =
    range === "current"
      ? `${currentCount} appointment${currentCount === 1 ? "" : "s"}`
      : range === "all"
        ? "all your appointments"
        : dateFrom && dateTo
          ? `${dateFrom} to ${dateTo}`
          : "the selected range";
  const topicLabel =
    range === "current"
      ? `Export ${currentCount} appointment${currentCount === 1 ? "" : "s"} from the current tab`
      : range === "all"
        ? "Export all appointments from all tabs"
        : "Export appointments in the chosen date range";

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Export Appointments"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-3xl rounded-b-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl animate-scale-in">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-primary to-primary-light p-6 text-white">
          <div className="absolute inset-0 bg-black/5" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                <Download className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Export Appointments</h2>
                <p className="mt-0.5 hidden text-sm text-white/80 md:block">
                  Download your appointment data
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close export modal"
              className="group rounded-xl p-2 transition-colors duration-200 hover:bg-white/20 disabled:opacity-50"
            >
              <X
                className="h-5 w-5 transition-transform duration-200 group-hover:rotate-90"
                aria-hidden="true"
              />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
          {/* Export Format */}
          <div>
            <label className="mb-3 block text-sm font-semibold text-text-primary">
              Export Format
            </label>
            <div className="grid grid-cols-2 gap-3">
              {FORMAT_OPTIONS.map((option) => {
                const selected = format === option.value;
                return (
                  <label key={option.value} className="group cursor-pointer">
                    <input
                      type="radio"
                      name="exportFormat"
                      value={option.value}
                      checked={selected}
                      onChange={() => setFormat(option.value)}
                      className="sr-only"
                    />
                    <div
                      className={`relative rounded-xl border-2 p-4 transition-all duration-200 ${
                        selected
                          ? "border-primary bg-primary/5 shadow-md"
                          : "border-gray-200 group-hover:border-gray-300 group-hover:shadow-sm"
                      }`}
                    >
                      <div className="flex items-start space-x-3">
                        <FileText
                          className={`mt-0.5 h-5 w-5 shrink-0 ${
                            selected ? "text-primary" : "text-gray-400"
                          }`}
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm font-semibold ${
                              selected ? "text-primary" : "text-gray-700"
                            }`}
                          >
                            {option.label}
                          </p>
                          <p className="mt-0.5 hidden text-xs text-gray-500 md:block">
                            {option.description}
                          </p>
                        </div>
                      </div>
                      {selected && (
                        <CircleCheckBig
                          className="absolute right-3 top-3 hidden h-4 w-4 text-primary md:block"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Data Range */}
          <div>
            <label className="mb-3 block text-sm font-semibold text-text-primary">
              Data Range
            </label>
            <div className="space-y-3">
              {RANGE_OPTIONS.map((option) => {
                const selected = range === option.value;
                const Icon =
                  option.value === "current"
                    ? Eye
                    : option.value === "all"
                      ? Activity
                      : Calendar;
                return (
                  <label key={option.value} className="group block cursor-pointer">
                    <input
                      type="radio"
                      name="exportRange"
                      value={option.value}
                      checked={selected}
                      onChange={() => setRange(option.value)}
                      className="sr-only"
                    />
                    <div
                      className={`relative rounded-xl border-2 p-4 transition-all duration-200 ${
                        selected
                          ? "border-primary bg-primary/5 shadow-md"
                          : "border-gray-200 group-hover:border-gray-300 group-hover:shadow-sm"
                      }`}
                    >
                      <div className="flex items-start space-x-3">
                        <Icon
                          className={`mt-0.5 h-5 w-5 shrink-0 ${
                            selected ? "text-primary" : "text-gray-400"
                          }`}
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm font-semibold ${
                              selected ? "text-primary" : "text-gray-700"
                            }`}
                          >
                            {option.label}
                          </p>
                          <p className="text-xs text-gray-500">
                            {option.value === "current"
                              ? topicLabel
                              : option.description}
                          </p>
                        </div>
                        {selected && (
                          <CircleCheckBig
                            className="hidden h-4 w-4 shrink-0 text-primary md:block"
                            aria-hidden="true"
                          />
                        )}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Custom date range picker */}
          {range === "custom" && (
            <div className="animate-in fade-in slide-in-from-top-2 space-y-4 rounded-xl border-2 border-primary-light/40 bg-primary/5 p-4 duration-200">
              <p className="mb-1 text-sm font-semibold text-text-primary">
                Select Date Range
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-semibold text-text-primary">
                    Start Date
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      value={dateFrom}
                      max={dateTo || undefined}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="w-full rounded-xl border-2 border-gray-300 bg-white px-3 py-2.5 pl-10 text-sm text-text-primary transition-all duration-200 hover:border-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <CalendarDays
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                      aria-hidden="true"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold text-text-primary">
                    End Date
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      value={dateTo}
                      min={dateFrom || undefined}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="w-full rounded-xl border-2 border-gray-300 bg-white px-3 py-2.5 pl-10 text-sm text-text-primary transition-all duration-200 hover:border-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <CalendarDays
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                      aria-hidden="true"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Export information */}
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-start space-x-3">
              <div className="rounded-lg bg-blue-100 p-1.5">
                <Info className="h-4 w-4 text-blue-600" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900">
                  Export Information
                </p>
                <ul className="mt-2 space-y-1 text-xs text-blue-700">
                  <li className="flex items-start gap-1.5">
                    <Check className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                    <span>
                      {topicValue} will be included in {format.toUpperCase()} format
                    </span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <Check className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                    <span>File will download automatically when ready</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <Check className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                    <span>Large exports may take a few moments</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="shrink-0 border-t border-gray-200 bg-gray-50 px-6 py-4"
          style={{ flexShrink: 0 }}
        >
          {/* Desktop */}
          <div className="hidden items-center justify-between md:flex">
            <div className="flex items-center text-sm text-gray-500">
              <ShieldCheck
                className="mr-1 h-4 w-4 text-green-500"
                aria-hidden="true"
              />
              Your data is secure
            </div>
            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  onExport({ format, range, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined })
                }
                disabled={customInvalid}
                className="flex items-center space-x-2 rounded-lg bg-gradient-to-r from-primary to-primary-light px-4 py-2 text-sm font-medium text-white shadow-md transition-all duration-200 hover:from-primary-light hover:to-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                <span>
                  {format === "xlsx" ? "Export Excel" : "Export Data"}
                </span>
              </button>
            </div>
          </div>

          {/* Mobile */}
          <div className="flex flex-col gap-2 md:hidden">
            <button
              type="button"
              onClick={() =>
                onExport({ format, range, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined })
              }
              disabled={customInvalid}
              className="flex w-full items-center justify-center space-x-2 rounded-xl bg-gradient-to-r from-primary to-primary-light py-3 text-sm font-semibold text-white shadow-lg transition-all duration-200 hover:from-primary-light hover:to-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span>{format === "xlsx" ? "Export Excel" : "Export Data"}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl border-2 border-gray-300 bg-white py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}