import React from 'react';

export interface IconDefinition {
  viewBox?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: string;
  strokeLinecap?: 'butt' | 'round' | 'square' | 'inherit';
  strokeLinejoin?: 'miter' | 'round' | 'bevel' | 'inherit';
  children: React.ReactNode;
}

export type IconName =
  | 'find-head'
  | 'search'
  | 'filter'
  | 'branch-tree'
  | 'settings'
  | 'fetch'
  | 'fetch-spinner'
  | 'pull'
  | 'push'
  | 'remote'
  | 'undo'
  | 'refresh'
  | 'view-columns'
  | 'alert-circle'
  | 'info-circle'
  | 'close'
  | 'copy'
  | 'check'
  | 'tree'
  | 'list'
  | 'folder'
  | 'file'
  | 'ref-head'
  | 'ref-tag'
  | 'ref-branch'
  | 'plus'
  | 'minus'
  | 'trash'
  | 'stash'
  | 'commit'
  | 'archive'
  | 'worktree'
  | 'git-graph';

export const ICONS: Record<IconName, IconDefinition> = {
  'find-head': {
    children: (
      <>
        <circle cx="8" cy="8" r="4.5" />
        <line x1="8" y1="1" x2="8" y2="3.5" />
        <line x1="8" y1="12.5" x2="8" y2="15" />
        <line x1="1" y1="8" x2="3.5" y2="8" />
        <line x1="12.5" y1="8" x2="15" y2="8" />
      </>
    ),
  },
  search: {
    children: (
      <>
        <circle cx="6.5" cy="6.5" r="4" />
        <line x1="9.5" y1="9.5" x2="14" y2="14" strokeLinecap="round" />
      </>
    ),
  },
  filter: {
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    children: <polygon points="2 3 14 3 9.5 8.5 9.5 13 6.5 14.5 6.5 8.5" fill="none" />,
  },
  'branch-tree': {
    children: (
      <>
        <circle cx="4" cy="12" r="2" />
        <circle cx="4" cy="4" r="2" />
        <circle cx="12" cy="4" r="2" />
        <path d="M4 6v4" />
        <path d="M4 9a4 4 0 004-4h2" />
      </>
    ),
  },
  settings: {
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    children: (
      <>
        <circle cx="8" cy="8" r="2.5" />
        <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
      </>
    ),
  },
  fetch: {
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    children: (
      <>
        <path d="M12.5 10A3.5 3.5 0 0 0 11 3.32 4.5 4.5 0 0 0 2.5 5.5 3.5 3.5 0 0 0 3.5 12" />
        <polyline points="8 9 8 14" />
        <polyline points="5.5 11.5 8 14 10.5 11.5" />
      </>
    ),
  },
  pull: {
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    children: (
      <>
        <line x1="8" y1="2" x2="8" y2="10" />
        <polyline points="4.5 6.5 8 10 11.5 6.5" />
        <path d="M2.5 12.5v1a1 1 0 001 1h9a1 1 0 001-1v-1" />
      </>
    ),
  },
  push: {
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    children: (
      <>
        <line x1="8" y1="13" x2="8" y2="5" />
        <polyline points="4.5 8.5 8 5 11.5 8.5" />
        <path d="M2.5 2.5v1a1 1 0 001 1h9a1 1 0 001-1v-1" />
      </>
    ),
  },
  remote: {
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    children: (
      <>
        <circle cx="8" cy="4" r="2.5" />
        <circle cx="3" cy="12" r="2" />
        <circle cx="13" cy="12" r="2" />
        <path d="M8 6.5v2M8 8.5L3 10M8 8.5L13 10" />
      </>
    ),
  },
  undo: {
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    children: (
      <>
        <path d="M3 6.5h6.5a4 4 0 010 8H6" />
        <polyline points="5.5 3.5 2.5 6.5 5.5 9.5" />
      </>
    ),
  },
  'fetch-spinner': {
    stroke: undefined,
    children: (
      <>
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
        <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
  },
  refresh: {
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    children: (
      <>
        <path d="M13.5 8A5.5 5.5 0 1 1 12 4.1L13.5 2.5" />
        <polyline points="13.5 6 13.5 2.5 10 2.5" />
      </>
    ),
  },
  'view-columns': {
    fill: 'currentColor',
    stroke: undefined,
    children: (
      <>
        <rect x="2" y="8" width="3" height="6" rx="0.5" />
        <rect x="6.5" y="4" width="3" height="10" rx="0.5" />
        <rect x="11" y="2" width="3" height="12" rx="0.5" />
      </>
    ),
  },
  'alert-circle': {
    viewBox: '0 0 24 24',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    children: (
      <>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </>
    ),
  },
  'info-circle': {
    viewBox: '0 0 24 24',
    strokeWidth: '1.5',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    children: (
      <>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </>
    ),
  },
  close: {
    fill: 'currentColor',
    stroke: undefined,
    children: (
      <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854z" />
    ),
  },
  copy: {
    fill: 'currentColor',
    stroke: undefined,
    children: (
      <>
        <path d="M4 1.5A1.5 1.5 0 0 1 5.5 0h6A1.5 1.5 0 0 1 13 1.5v9A1.5 1.5 0 0 1 11.5 12h-6A1.5 1.5 0 0 1 4 10.5v-9zM5.5 1a.5.5 0 0 0-.5.5v9a.5.5 0 0 0 .5.5h6a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5h-6z" />
        <path d="M2.5 4a.5.5 0 0 1 .5.5v9a.5.5 0 0 0 .5.5h6a.5.5 0 0 1 0 1h-6A1.5 1.5 0 0 1 2 13.5v-9a.5.5 0 0 1 .5-.5z" />
      </>
    ),
  },
  check: {
    fill: 'currentColor',
    stroke: undefined,
    children: (
      <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z" />
    ),
  },
  tree: {
    fill: 'currentColor',
    stroke: undefined,
    children: (
      <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5V3h2V2.5A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5V5H7v6h2v-.5A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5V13H7a1 1 0 0 1-1-1V5H2.5A1.5 1.5 0 0 1 1 3.5v-1z" />
    ),
  },
  list: {
    fill: 'currentColor',
    stroke: undefined,
    children: (
      <path
        fillRule="evenodd"
        d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5z"
      />
    ),
  },
  folder: {
    fill: 'currentColor',
    stroke: undefined,
    children: (
      <path d="M1.75 2.5h3.633a1.75 1.75 0 0 1 1.238.513l.99.987h6.639A1.75 1.75 0 0 1 16 5.75v7.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25V4.25C0 3.284.784 2.5 1.75 2.5z" />
    ),
  },
  file: {
    fill: 'currentColor',
    stroke: undefined,
    children: (
      <path d="M3.75 1.5A1.75 1.75 0 0 0 2 3.25v9.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0 0 14 12.75V5.5L10 1.5H3.75zm6 1.75L12.5 6H10a.25.25 0 0 1-.25-.25V3.25z" />
    ),
  },
  'ref-head': {
    fill: 'currentColor',
    stroke: undefined,
    children: (
      <>
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <circle cx="8" cy="8" r="3.2" fill="currentColor" />
      </>
    ),
  },
  'ref-tag': {
    fill: 'currentColor',
    stroke: undefined,
    children: (
      <path d="M2.5 3A1.5 1.5 0 001 4.5v3.086c0 .398.158.78.44 1.06l6.5 6.5a1.5 1.5 0 002.12 0l4.38-4.38a1.5 1.5 0 000-2.12l-6.5-6.5A1.5 1.5 0 006.879 2.5H2.5zm2 3a1 1 0 110-2 1 1 0 010 2z" />
    ),
  },
  'ref-branch': {
    fill: 'currentColor',
    stroke: undefined,
    children: (
      <path
        fillRule="evenodd"
        d="M11.75 2.5a1.75 1.75 0 10-2.45 1.605V5.5a2.5 2.5 0 01-2.5 2.5h-.05A2.75 2.75 0 004 10.75v.445a1.75 1.75 0 101.5 0v-.445a1.25 1.25 0 011.25-1.25H6.8a4 4 0 004-4V4.105A1.75 1.75 0 0011.75 2.5z"
      />
    ),
  },
  plus: {
    strokeLinecap: 'round',
    children: (
      <>
        <line x1="8" y1="3" x2="8" y2="13" />
        <line x1="3" y1="8" x2="13" y2="8" />
      </>
    ),
  },
  minus: {
    strokeLinecap: 'round',
    children: <line x1="3" y1="8" x2="13" y2="8" />,
  },
  trash: {
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    children: (
      <>
        <path d="M2.5 4h11" />
        <path d="M5.5 4V2.5h5V4" />
        <path d="M4 4l.6 9.2a1 1 0 001 .8h4.8a1 1 0 001-.8L12 4" />
        <line x1="6.5" y1="6.5" x2="6.5" y2="11.5" />
        <line x1="9.5" y1="6.5" x2="9.5" y2="11.5" />
      </>
    ),
  },
  stash: {
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    children: (
      <>
        <path d="M2.5 5.5h11l-1 8h-9z" />
        <path d="M2.5 5.5l1.5-3h8l1.5 3" />
        <line x1="6" y1="8.5" x2="10" y2="8.5" />
      </>
    ),
  },
  commit: {
    strokeLinecap: 'round',
    children: (
      <>
        <circle cx="8" cy="8" r="3" />
        <line x1="1" y1="8" x2="5" y2="8" />
        <line x1="11" y1="8" x2="15" y2="8" />
      </>
    ),
  },
  archive: {
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    children: (
      <>
        <rect x="2" y="3" width="12" height="3" rx="0.5" />
        <path d="M3 6v6.5a.5.5 0 00.5.5h9a.5.5 0 00.5-.5V6" />
        <line x1="6.5" y1="9" x2="9.5" y2="9" />
      </>
    ),
  },
  worktree: {
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    children: (
      <>
        <rect x="1.5" y="2" width="5" height="4" rx="0.5" />
        <rect x="9.5" y="2" width="5" height="4" rx="0.5" />
        <rect x="1.5" y="10" width="5" height="4" rx="0.5" />
        <path d="M6.5 4h3M4 6v4M4 8h5.5a2.5 2.5 0 002.5-2.5V6" />
      </>
    ),
  },
  'git-graph': {
    viewBox: '0 0 16 16',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    children: (
      <>
        <path d="M 4 12 C 4 8.5, 6 6, 8 6 C 10 6, 11 5, 12 3.5" fill="none" strokeWidth="1.2" />
        <path d="M 7 9 C 9 9, 10 9.5, 10 8 C 10 6, 11 5, 12 3.5" fill="none" strokeWidth="1.2" />
        <line x1="4" y1="12" x2="12" y2="3.5" strokeWidth="1.4" />
        <circle cx="4" cy="12" r="1.5" fill="currentColor" />
        <circle cx="7" cy="9" r="1.2" fill="currentColor" />
        <circle cx="10" cy="8" r="1.2" fill="currentColor" />
        <circle cx="12" cy="3.5" r="1.6" fill="currentColor" />
      </>
    ),
  },
} satisfies Record<IconName, IconDefinition>;
