import React, { useState, useEffect, useRef } from 'react';
import { Modal, ModalTitle, ModalField, ModalActions } from '../../components/ui/Modal';
import { TextInput } from '../../components/ui/TextInput';

export interface CustomDateRangeDialogProps {
  isOpen: boolean;
  initialSince?: string;
  initialUntil?: string;
  onClose: () => void;
  onApply: (since: string, until: string) => void;
}

export const CustomDateRangeDialog: React.FC<CustomDateRangeDialogProps> = ({
  isOpen,
  initialSince = '',
  initialUntil = '',
  onClose,
  onApply,
}) => {
  const [since, setSince] = useState(initialSince);
  const [until, setUntil] = useState(initialUntil);
  const sinceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSince(initialSince);
      setUntil(initialUntil);
      setTimeout(() => {
        if (sinceInputRef.current) {
          sinceInputRef.current.focus();
        }
      }, 50);
    }
  }, [isOpen, initialSince, initialUntil]);

  const handleConfirm = () => {
    onApply(since.trim(), until.trim());
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleConfirm}
      titleId="custom-date-range-title"
      overlayClassName="custom-date-range-overlay"
      dialogClassName="custom-date-range-dialog"
      overlayTestId="custom-date-range-dialog-overlay"
      dialogTestId="custom-date-range-dialog"
    >
      <ModalTitle id="custom-date-range-title">Custom Date Range Filter</ModalTitle>

      <div
        className="custom-date-range-form"
        style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
      >
        <ModalField label="Since (commits after or on):" htmlFor="custom-date-since-input">
          <TextInput
            ref={sinceInputRef}
            id="custom-date-since-input"
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            className="select-control custom-date-input"
            data-testid="custom-date-since-input"
            aria-label="Filter commits since date"
            style={{ width: '100%' }}
          />
        </ModalField>

        <ModalField label="Until (commits before or on):" htmlFor="custom-date-until-input">
          <TextInput
            id="custom-date-until-input"
            type="date"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            className="select-control custom-date-input"
            data-testid="custom-date-until-input"
            aria-label="Filter commits until date"
            style={{ width: '100%' }}
          />
        </ModalField>
      </div>

      <ModalActions
        className="custom-date-range-actions"
        actions={[
          {
            text: 'Cancel',
            variant: 'secondary',
            onClick: onClose,
            testId: 'custom-date-cancel-btn',
          },
          {
            text: 'Apply Filter',
            variant: 'primary',
            onClick: handleConfirm,
            testId: 'custom-date-apply-btn',
          },
        ]}
      />
    </Modal>
  );
};
