import React from 'react';
import type { Commit } from '@git-graph/shared';
import { useGraphStore } from '../../stores/graphStore';
import { requestCommitsPage } from '../../messaging/messageRouter';
import { SelectField } from '../../components/ui/SelectField';
import { useDistinctOptions, type DistinctOptionsConfig } from '../../hooks/useDistinctOptions';

function* collectAuthorNames(commits: Commit[]): IterableIterator<string> {
  for (const commit of commits) {
    if (commit.author && commit.author.name) {
      yield commit.author.name;
    }
  }
}

const AUTHOR_OPTIONS_CONFIG: DistinctOptionsConfig = {
  sort: true,
  exclude: (value) => value === '*',
};

export interface AuthorSelectorProps {
  id?: string;
  disabled?: boolean;
  className?: string;
}

export const AuthorSelector: React.FC<AuthorSelectorProps> = ({
  id = 'author-select',
  disabled = false,
  className = 'select-control',
}) => {
  const commits = useGraphStore((s) => s.commits);
  const filterAuthor = useGraphStore((s) => s.filterAuthor);
  const isLoading = useGraphStore((s) => s.isLoading);

  // Collect distinct author names from commits
  const getAuthorNames = React.useCallback(() => collectAuthorNames(commits), [commits]);
  const authors = useDistinctOptions(getAuthorNames, AUTHOR_OPTIONS_CONFIG);

  const options = [
    { value: '', label: 'All' },
    ...authors.map((author) => ({ value: author, label: author })),
  ];

  return (
    <SelectField
      id={id}
      label="Authors:"
      ariaLabel="Filter by author"
      className={className}
      value={filterAuthor}
      onChange={(author) => {
        useGraphStore.getState().setFilterAuthor(author);
        requestCommitsPage();
      }}
      disabled={disabled || isLoading}
      testId="author-select"
      options={options}
    />
  );
};
