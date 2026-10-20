import React, { useState, useMemo, useCallback } from 'react';
import { SelectField } from '../../components/ui/SelectField';
import { useGraphStore } from '../../stores/graphStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { requestCommitsPage } from '../../messaging/messageRouter';
import { CustomDateRangeDialog } from '../dialogs/CustomDateRangeDialog';

export function formatDateYMD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const DATE_OPTIONS = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: 'custom', label: 'Custom Range...' },
];

export interface DateRangeSelectorProps {
  id?: string;
  disabled?: boolean;
  className?: string;
}

export const DateRangeSelector: React.FC<DateRangeSelectorProps> = ({
  id = 'date-range-select',
  disabled = false,
  className = 'select-control',
}) => {
  const filterDateSince = useGraphStore((s) => s.filterDateSince);
  const filterDateUntil = useGraphStore((s) => s.filterDateUntil);
  const isLoading = useGraphStore((s) => s.isLoading);

  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);

  // Compute active value for dropdown
  const currentValue = useMemo(() => {
    if (!filterDateSince && !filterDateUntil) {
      return 'all';
    }
    const today = formatDateYMD(new Date());
    if (filterDateSince === today && !filterDateUntil) {
      return 'today';
    }
    const d7 = new Date();
    d7.setDate(d7.getDate() - 7);
    if (filterDateSince === formatDateYMD(d7) && !filterDateUntil) {
      return '7d';
    }
    const d30 = new Date();
    d30.setDate(d30.getDate() - 30);
    if (filterDateSince === formatDateYMD(d30) && !filterDateUntil) {
      return '30d';
    }
    return 'custom';
  }, [filterDateSince, filterDateUntil]);

  const handleChange = useCallback((val: string) => {
    if (val === 'all') {
      useGraphStore.getState().setFilterDateRange('', '');
      useSelectionStore.getState().clearSelection();
      requestCommitsPage();
    } else if (val === 'today') {
      const today = formatDateYMD(new Date());
      useGraphStore.getState().setFilterDateRange(today, '');
      useSelectionStore.getState().clearSelection();
      requestCommitsPage();
    } else if (val === '7d') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      useGraphStore.getState().setFilterDateRange(formatDateYMD(d), '');
      useSelectionStore.getState().clearSelection();
      requestCommitsPage();
    } else if (val === '30d') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      useGraphStore.getState().setFilterDateRange(formatDateYMD(d), '');
      useSelectionStore.getState().clearSelection();
      requestCommitsPage();
    } else if (val === 'custom') {
      setIsCustomModalOpen(true);
    }
  }, []);

  const handleApplyCustom = useCallback((since: string, until: string) => {
    useGraphStore.getState().setFilterDateRange(since, until);
    useSelectionStore.getState().clearSelection();
    requestCommitsPage();
  }, []);

  const handleCloseCustom = useCallback(() => {
    setIsCustomModalOpen(false);
  }, []);

  return (
    <>
      <SelectField
        id={id}
        label="Date:"
        ariaLabel="Filter by date range"
        className={className}
        value={currentValue}
        onChange={handleChange}
        disabled={disabled || isLoading}
        testId="date-range-select"
        options={DATE_OPTIONS}
      />

      <CustomDateRangeDialog
        isOpen={isCustomModalOpen}
        initialSince={filterDateSince}
        initialUntil={filterDateUntil}
        onClose={handleCloseCustom}
        onApply={handleApplyCustom}
      />
    </>
  );
};
