import React, { useState, useMemo } from 'react';
import {
  ListChecks,
  CheckCircle,
  AlertTriangle,
  AlertOctagon,
  Info,
  X,
  FileQuestion,
  Clock,
  Calendar,
  Layers,
  ChevronRight,
  ShieldCheck,
  FileText
} from 'lucide-react';
import { Interstitial, Show, ScheduleDiagnosticsResult, ScheduleIssue, ScheduleIssueType, ScheduleIssueSeverity } from '../types';
import { cn } from '../lib/utils';
import { evaluateScheduleDiagnostics } from '../lib/scheduleDiagnostics';

interface ScheduleAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  interstitials: Interstitial[];
  shows?: Show[];
  now?: Date;
  defaultStartDate?: Date;
  defaultEndDate?: Date;
  diagnostics?: ScheduleDiagnosticsResult;
  onLocateInCalendar: (issue: ScheduleIssue) => void;
}

function formatDateToYmd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function ScheduleAuditModal({
  isOpen,
  onClose,
  interstitials,
  shows = [],
  now = new Date(),
  defaultStartDate,
  defaultEndDate,
  onLocateInCalendar
}: ScheduleAuditModalProps) {
  const initialStartDate = useMemo(() => formatDateToYmd(defaultStartDate || now), [defaultStartDate, now]);
  const initialEndDate = useMemo(() => {
    if (defaultEndDate) return formatDateToYmd(defaultEndDate);
    const d = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    return formatDateToYmd(d);
  }, [defaultEndDate, now]);

  const [startDateInput, setStartDateInput] = useState<string>(initialStartDate);
  const [endDateInput, setEndDateInput] = useState<string>(initialEndDate);

  React.useEffect(() => {
    if (isOpen) {
      if (defaultStartDate) {
        setStartDateInput(formatDateToYmd(defaultStartDate));
      }
      if (defaultEndDate) {
        setEndDateInput(formatDateToYmd(defaultEndDate));
      }
    }
  }, [isOpen, defaultStartDate, defaultEndDate]);

  const [selectedFilter, setSelectedFilter] = useState<'all' | ScheduleIssueType>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<'all' | ScheduleIssueSeverity>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const computedDiagnostics = useMemo(() => {
    const sDate = startDateInput ? new Date(`${startDateInput}T00:00:00`) : now;
    const eDate = endDateInput ? new Date(`${endDateInput}T23:59:59`) : new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    return evaluateScheduleDiagnostics({
      interstitials,
      shows,
      now,
      startDate: sDate,
      endDate: eDate,
      includePastHours: true
    });
  }, [interstitials, shows, now, startDateInput, endDateInput]);

  const { issues, summary, scopeStartDate, scopeEndDate } = computedDiagnostics;

  const formatDateRange = (startIso: string, endIso: string) => {
    try {
      const s = new Date(startIso);
      const e = new Date(endIso);
      const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
      return `${s.toLocaleDateString(undefined, options)} – ${e.toLocaleDateString(undefined, options)}`;
    } catch {
      return 'Selected Range';
    }
  };

  const filteredIssues = useMemo(() => {
    return issues.filter(issue => {
      if (selectedFilter !== 'all' && issue.type !== selectedFilter) return false;
      if (selectedSeverity !== 'all' && issue.severity !== selectedSeverity) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = issue.interstitialName.toLowerCase().includes(q);
        const matchDesc = issue.description.toLowerCase().includes(q);
        const matchFile = issue.fileName ? issue.fileName.toLowerCase().includes(q) : false;
        const matchTime = issue.timeLabel.toLowerCase().includes(q);
        if (!matchName && !matchDesc && !matchFile && !matchTime) return false;
      }
      return true;
    });
  }, [issues, selectedFilter, selectedSeverity, searchQuery]);

  if (!isOpen) return null;

  const getSeverityBadge = (severity: ScheduleIssueSeverity) => {
    switch (severity) {
      case 'critical':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-black uppercase tracking-tight bg-red-100 text-red-800 border border-red-200 shrink-0">
            <AlertOctagon className="w-3 h-3 text-red-600 shrink-0" />
            <span>Critical</span>
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-black uppercase tracking-tight bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
            <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
            <span>Warning</span>
          </span>
        );
      case 'info':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-black uppercase tracking-tight bg-blue-100 text-blue-800 border border-blue-200 shrink-0">
            <Info className="w-3 h-3 text-blue-600 shrink-0" />
            <span>Info</span>
          </span>
        );
    }
  };

  const getTypeBadge = (type: ScheduleIssueType) => {
    switch (type) {
      case 'missing_media':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-tight bg-slate-100 text-slate-700 border border-slate-250 shrink-0">
            <FileQuestion className="w-3 h-3 text-slate-500 shrink-0" />
            <span>Missing Media</span>
          </span>
        );
      case 'overlap':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-tight bg-orange-100 text-orange-800 border border-orange-250 shrink-0">
            <Layers className="w-3 h-3 text-orange-600 shrink-0" />
            <span>Dual Media Collision</span>
          </span>
        );
      case 'gap':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-tight bg-purple-100 text-purple-800 border border-purple-250 shrink-0">
            <Clock className="w-3 h-3 text-purple-600 shrink-0" />
            <span>Schedule Gap</span>
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 z-[100] animate-in fade-in duration-150">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2.5 rounded-lg border shrink-0",
              summary.total > 0
                ? (summary.criticalCount > 0 ? "bg-red-50 text-red-600 border-red-200" : "bg-amber-50 text-amber-600 border-amber-200")
                : "bg-emerald-50 text-emerald-600 border-emerald-200"
            )}>
              {summary.total > 0 ? (
                <ListChecks className="w-5 h-5" />
              ) : (
                <ShieldCheck className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                  Issues Audit
                </h2>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                  {formatDateRange(scopeStartDate, scopeEndDate)}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">
                Check for unassigned media, schedule gaps, and schedule overlaps.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
            title="Close Audit"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Date Filter Toolbar */}
        <div className="p-3 sm:px-5 bg-slate-100/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 uppercase tracking-tight">
              <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>Date Range:</span>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <input
                type="date"
                value={startDateInput}
                onChange={e => setStartDateInput(e.target.value)}
                className="px-2 py-0.5 bg-white border border-slate-300 rounded text-xs font-mono font-bold text-slate-800 outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
              />
              <span className="text-slate-400 font-normal">to</span>
              <input
                type="date"
                value={endDateInput}
                onChange={e => setEndDateInput(e.target.value)}
                className="px-2 py-0.5 bg-white border border-slate-300 rounded text-xs font-mono font-bold text-slate-800 outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
              />
            </div>
          </div>
        </div>

        {/* Filter Toolbar & Summary Bar */}
        <div className="p-3 sm:px-5 bg-white border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          {/* Categorical Filter Chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-slate-450 uppercase tracking-tight mr-1">Filter:</span>
            <button
              type="button"
              onClick={() => setSelectedFilter('all')}
              className={cn(
                "px-2.5 py-1 rounded text-xs font-black uppercase tracking-tight transition-all cursor-pointer border",
                selectedFilter === 'all'
                  ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                  : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
              )}
            >
              All ({summary.total})
            </button>
            <button
              type="button"
              onClick={() => setSelectedFilter('missing_media')}
              className={cn(
                "px-2.5 py-1 rounded text-xs font-black uppercase tracking-tight transition-all cursor-pointer border flex items-center gap-1",
                selectedFilter === 'missing_media'
                  ? "bg-red-600 text-white border-red-600 shadow-xs"
                  : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
              )}
            >
              <span>Missing Media</span>
              <span className="px-1 py-0.2 rounded-full bg-white/20 text-[10px]">
                {summary.missingMediaCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedFilter('overlap')}
              className={cn(
                "px-2.5 py-1 rounded text-xs font-black uppercase tracking-tight transition-all cursor-pointer border flex items-center gap-1",
                selectedFilter === 'overlap'
                  ? "bg-orange-600 text-white border-orange-600 shadow-xs"
                  : "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100"
              )}
            >
              <span>Dual Media Collisions</span>
              <span className="px-1 py-0.2 rounded-full bg-white/20 text-[10px]">
                {summary.overlapCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedFilter('gap')}
              className={cn(
                "px-2.5 py-1 rounded text-xs font-black uppercase tracking-tight transition-all cursor-pointer border flex items-center gap-1",
                selectedFilter === 'gap'
                  ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                  : "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"
              )}
            >
              <span>Gaps</span>
              <span className="px-1 py-0.2 rounded-full bg-white/20 text-[10px]">
                {summary.gapCount}
              </span>
            </button>
          </div>

          {/* Quick Search */}
          <div className="relative shrink-0 sm:w-56">
            <input
              type="text"
              placeholder="Search diagnosed issues..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full px-3 py-1 bg-slate-50 border border-slate-250 rounded-lg text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500 font-sans text-slate-800 placeholder-slate-400 h-8"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Audit Content Area */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 custom-scrollbar min-h-0 bg-slate-50/40">
          {filteredIssues.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="p-4 rounded-full bg-emerald-100 text-emerald-600 mb-3 border border-emerald-200">
                <CheckCircle className="w-8 h-8" />
              </div>
              <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                {issues.length === 0 ? "No Schedule Anomalies Detected" : "No Matching Issues Found"}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mt-1 font-medium leading-relaxed">
                {issues.length === 0
                  ? "All interstitials have assigned media, no gaps, and no overlaps."
                  : "No issues match your current filter and search criteria. Try clearing the filter or adjusting search terms."}
              </p>
              {issues.length > 0 && selectedFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFilter('all');
                    setSelectedSeverity('all');
                    setSearchQuery('');
                  }}
                  className="mt-4 px-3.5 py-1.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                >
                  Reset Filters ({issues.length} total issues)
                </button>
              )}
            </div>
          ) : (
            <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-200 bg-white shadow-sm">
              {filteredIssues.map((issue, idx) => (
                <div
                  key={issue.id}
                  className={cn(
                    "p-3 sm:px-4 transition-colors hover:bg-slate-50 flex flex-col gap-1.5 min-w-0 w-full",
                    idx % 2 === 0 ? "bg-white" : "bg-slate-205",
                    issue.severity === 'critical' ? "border-l-4 border-l-red-500" :
                    issue.severity === 'warning' ? "border-l-4 border-l-amber-500" :
                    "border-l-4 border-l-blue-500"
                  )}
                >
                  {/* Top row: Severity, Type, Date/Time badges + Edit Interstitial Button */}
                  <div className="flex items-center justify-between gap-2 flex-wrap min-w-0">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      {getSeverityBadge(issue.severity)}
                      {getTypeBadge(issue.type)}
                      <span className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {issue.timeLabel}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => onLocateInCalendar(issue)}
                      className="px-2.5 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-black uppercase tracking-tight flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs shrink-0"
                      title="Edit this interstitial"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Edit Interstitial</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Interstitial Name & File */}
                  <div className="flex items-center gap-1.5 text-xs text-slate-900 font-extrabold truncate">
                    <span className="truncate">{issue.interstitialName}</span>
                    {issue.fileName && (
                      <span className="font-mono text-slate-500 font-normal truncate">
                        ({issue.fileName})
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-600 font-medium leading-relaxed">
                    {issue.description}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:px-5 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <span className="text-xs font-bold text-slate-500">
            Showing {filteredIssues.length} of {issues.length} diagnosed {issues.length === 1 ? 'issue' : 'issues'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-black uppercase tracking-tight cursor-pointer transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
