import React from 'react';
import { useRepositoryStore } from '../../stores/repositoryStore';
import { selectRepository } from '../../messaging/messageRouter';
import { SelectControl } from '../../components/ui/SelectControl';

export interface RepositorySelectorProps {
  id?: string;
  disabled?: boolean;
  className?: string;
  onSelect?: (repositoryId: string) => void;
}

export const RepositorySelector: React.FC<RepositorySelectorProps> = ({
  id = 'repo-select',
  disabled = false,
  className = 'select-control',
  onSelect,
}) => {
  const repositories = useRepositoryStore((s) => s.repositories);
  const activeRepositoryId = useRepositoryStore((s) => s.activeRepositoryId);
  const isLoading = useRepositoryStore((s) => s.isLoading);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextId = e.target.value;
    if (onSelect) {
      onSelect(nextId);
    } else {
      selectRepository(nextId);
    }
  };

  const isControlDisabled = disabled || isLoading || repositories.length === 0;

  const options =
    repositories.length === 0
      ? [{ value: '', label: 'No repository detected' }]
      : repositories.map((repo) => ({ value: repo.id, label: repo.name }));

  return (
    <SelectControl
      id={id}
      aria-label="Repository"
      className={className}
      value={activeRepositoryId ?? ''}
      onChange={handleChange}
      disabled={isControlDisabled}
      data-testid="repo-select"
      options={options}
    />
  );
};
