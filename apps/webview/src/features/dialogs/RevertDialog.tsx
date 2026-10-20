import React from 'react';
import { SequencerCommitDialog } from './SequencerCommitDialog';

export interface RevertDialogProps {
  commitSha: string;
  commitSubject?: string;
  parents?: string[];
  parentSubjects?: Record<string, string>;
  isOpen: boolean;
  onClose: () => void;
  onRevert: (mainlineParent: number | undefined) => void;
}

export const RevertDialog: React.FC<RevertDialogProps> = (props) => (
  <SequencerCommitDialog
    action="revert"
    commitSha={props.commitSha}
    commitSubject={props.commitSubject}
    parents={props.parents}
    parentSubjects={props.parentSubjects}
    isOpen={props.isOpen}
    onClose={props.onClose}
    onConfirm={(mainlineParent) => props.onRevert(mainlineParent)}
  />
);
