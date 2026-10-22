import { describe, it, expect, beforeEach } from 'vitest';
import { useConfigStore, DEFAULT_VIEW_CONFIG } from '../../src/stores/configStore';

describe('configStore', () => {
  beforeEach(() => {
    useConfigStore.getState().resetConfig();
  });

  it('initializes with default view configuration', () => {
    const { config } = useConfigStore.getState();
    expect(config).toEqual(DEFAULT_VIEW_CONFIG);
    expect(config.showAuthor).toBe(true);
    expect(config.showDate).toBe(true);
    expect(config.showRemoteBranches).toBe(true);
    expect(config.showTags).toBe(true);
    expect(config.dateType).toBe('default');
    expect(config.pageSize).toBe(500);
    expect(config.commitOrdering).toBe('date-order');
  });

  it('updates commitOrdering setting', () => {
    useConfigStore.getState().setCommitOrdering('topo-order');
    expect(useConfigStore.getState().config.commitOrdering).toBe('topo-order');

    useConfigStore.getState().setCommitOrdering('author-date-order');
    expect(useConfigStore.getState().config.commitOrdering).toBe('author-date-order');

    useConfigStore.getState().setCommitOrdering('date-order');
    expect(useConfigStore.getState().config.commitOrdering).toBe('date-order');
  });

  it('updates showAuthor setting', () => {
    useConfigStore.getState().setShowAuthor(false);
    expect(useConfigStore.getState().config.showAuthor).toBe(false);

    useConfigStore.getState().setShowAuthor(true);
    expect(useConfigStore.getState().config.showAuthor).toBe(true);
  });

  it('updates showDate setting', () => {
    useConfigStore.getState().setShowDate(false);
    expect(useConfigStore.getState().config.showDate).toBe(false);
  });

  it('updates showRemoteBranches setting', () => {
    useConfigStore.getState().setShowRemoteBranches(false);
    expect(useConfigStore.getState().config.showRemoteBranches).toBe(false);
  });

  it('updates showTags setting', () => {
    useConfigStore.getState().setShowTags(false);
    expect(useConfigStore.getState().config.showTags).toBe(false);
  });

  it('updates dateType setting', () => {
    useConfigStore.getState().setDateType('absolute');
    expect(useConfigStore.getState().config.dateType).toBe('absolute');

    useConfigStore.getState().setDateType('relative');
    expect(useConfigStore.getState().config.dateType).toBe('relative');

    useConfigStore.getState().setDateType('default');
    expect(useConfigStore.getState().config.dateType).toBe('default');
  });

  it('updates and safely clamps pageSize setting', () => {
    expect(useConfigStore.getState().config.pageSize).toBe(500);

    useConfigStore.getState().setPageSize(250);
    expect(useConfigStore.getState().config.pageSize).toBe(250);

    // Clamps below 1 to 1
    useConfigStore.getState().setPageSize(0);
    expect(useConfigStore.getState().config.pageSize).toBe(1);

    // Clamps above 2000 to 2000
    useConfigStore.getState().setPageSize(5000);
    expect(useConfigStore.getState().config.pageSize).toBe(2000);
  });

  it('supports partial configuration updates', () => {
    useConfigStore.getState().updateConfig({
      showAuthor: false,
      dateType: 'absolute',
      pageSize: 1000,
    });

    const { config } = useConfigStore.getState();
    expect(config.showAuthor).toBe(false);
    expect(config.dateType).toBe('absolute');
    expect(config.pageSize).toBe(1000);
    expect(config.showDate).toBe(true); // Unmodified
  });

  it('updates compactMode setting', () => {
    expect(useConfigStore.getState().config.compactMode).toBe(false);

    useConfigStore.getState().setCompactMode(true);
    expect(useConfigStore.getState().config.compactMode).toBe(true);

    useConfigStore.getState().setCompactMode(false);
    expect(useConfigStore.getState().config.compactMode).toBe(false);
  });

  it('resets to default configuration', () => {
    useConfigStore.getState().updateConfig({
      showAuthor: false,
      showTags: false,
      dateType: 'absolute',
      pageSize: 100,
    });
    expect(useConfigStore.getState().config.showAuthor).toBe(false);
    expect(useConfigStore.getState().config.pageSize).toBe(100);

    useConfigStore.getState().resetConfig();
    expect(useConfigStore.getState().config).toEqual(DEFAULT_VIEW_CONFIG);
  });

  it('updates minimap, compact display and blame settings', () => {
    useConfigStore.getState().setShowMinimap(false);
    expect(useConfigStore.getState().config.showMinimap).toBe(false);

    useConfigStore.getState().setShowStatusBarItem(false);
    expect(useConfigStore.getState().config.showStatusBarItem).toBe(false);

    useConfigStore.getState().setBlameEnabled(false);
    expect(useConfigStore.getState().config.blameEnabled).toBe(false);

    useConfigStore.getState().setBlameFormat('${author} ${subject}');
    expect(useConfigStore.getState().config.blameFormat).toBe('${author} ${subject}');

    useConfigStore.getState().updateConfig({ compactMode: true, showMinimap: true });
    expect(useConfigStore.getState().config.compactMode).toBe(true);
    expect(useConfigStore.getState().config.showMinimap).toBe(true);
  });

  it('increments the column widths reset token', () => {
    const initial = useConfigStore.getState().columnWidthsResetToken;
    useConfigStore.getState().resetColumnWidths();
    expect(useConfigStore.getState().columnWidthsResetToken).toBe(initial + 1);
    useConfigStore.getState().resetColumnWidths();
    expect(useConfigStore.getState().columnWidthsResetToken).toBe(initial + 2);
  });
});
