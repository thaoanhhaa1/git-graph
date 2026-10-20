import React from 'react';
import { SequencerCommitDialog } from './SequencerCommitDialog';

export interface CherryPickDialogProps {
  commitSha: string;
  commitSubject?: string;
  parents?: string[];
  parentSubjects?: Record<string, string>;
  isOpen: boolean;
  onClose: () => void;
  onCherryPick: (mainlineParent: number | undefined, noCommit: boolean) => void;
}

export const CherryPickDialog: React.FC<CherryPickDialogProps> = (props) => (
  <SequencerCommitDialog
    action="cherry-pick"
    commitSha={props.commitSha}
    commitSubject={props.commitSubject}
    parents={props.parents}
    parentSubjects={props.parentSubjects}
    isOpen={props.isOpen}
    onClose={props.onClose}
    onConfirm={props.onCherryPick}
  />
);
