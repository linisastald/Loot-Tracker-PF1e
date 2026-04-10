import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useLootEntryForm from '../useLootEntryForm';

describe('useLootEntryForm', () => {
  describe('initial state', () => {
    it('should initialize with a single item entry', () => {
      const { result } = renderHook(() => useLootEntryForm());

      expect(result.current.entries).toHaveLength(1);
      expect(result.current.entries[0].type).toBe('item');
      expect(result.current.entries[0].error).toBeNull();
    });

    it('should initialize with empty error and success messages', () => {
      const { result } = renderHook(() => useLootEntryForm());

      expect(result.current.error).toBe('');
      expect(result.current.success).toBe('');
    });

    it('should have correct initial item entry shape', () => {
      const { result } = renderHook(() => useLootEntryForm());
      const data = result.current.entries[0].data;

      expect(data.sessionDate).toBeInstanceOf(Date);
      expect(data.quantity).toBe('');
      expect(data.name).toBe('');
      expect(data.itemId).toBeNull();
      expect(data.type).toBe('');
      expect(data.value).toBeNull();
      expect(data.unidentified).toBeNull();
      expect(data.masterwork).toBeNull();
      expect(data.size).toBe('');
      expect(data.notes).toBe('');
      expect(data.parseItem).toBe(false);
      expect(data.charges).toBe('');
    });
  });

  describe('handleAddEntry', () => {
    it('should add an item entry when type is "item"', () => {
      const { result } = renderHook(() => useLootEntryForm());

      act(() => {
        result.current.handleAddEntry('item');
      });

      expect(result.current.entries).toHaveLength(2);
      expect(result.current.entries[1].type).toBe('item');
      expect(result.current.entries[1].data.name).toBe('');
      expect(result.current.entries[1].data.quantity).toBe('');
    });

    it('should add a gold entry when type is "gold"', () => {
      const { result } = renderHook(() => useLootEntryForm());

      act(() => {
        result.current.handleAddEntry('gold');
      });

      expect(result.current.entries).toHaveLength(2);
      expect(result.current.entries[1].type).toBe('gold');
      const goldData = result.current.entries[1].data;
      expect(goldData.transactionType).toBe('');
      expect(goldData.platinum).toBe('');
      expect(goldData.gold).toBe('');
      expect(goldData.silver).toBe('');
      expect(goldData.copper).toBe('');
      expect(goldData.notes).toBe('');
      expect(goldData.sessionDate).toBeInstanceOf(Date);
    });

    it('should clear success and error messages when adding an entry', () => {
      const { result } = renderHook(() => useLootEntryForm());

      // Set some messages first
      act(() => {
        result.current.setError('some error');
        result.current.setSuccess('some success');
      });
      expect(result.current.error).toBe('some error');
      expect(result.current.success).toBe('some success');

      act(() => {
        result.current.handleAddEntry('item');
      });

      expect(result.current.error).toBe('');
      expect(result.current.success).toBe('');
    });

    it('should support adding multiple entries of mixed types', () => {
      const { result } = renderHook(() => useLootEntryForm());

      act(() => {
        result.current.handleAddEntry('gold');
        result.current.handleAddEntry('item');
        result.current.handleAddEntry('gold');
      });

      expect(result.current.entries).toHaveLength(4);
      expect(result.current.entries[0].type).toBe('item'); // initial
      expect(result.current.entries[1].type).toBe('gold');
      expect(result.current.entries[2].type).toBe('item');
      expect(result.current.entries[3].type).toBe('gold');
    });
  });

  describe('handleRemoveEntry', () => {
    it('should remove an entry at the specified index', () => {
      const { result } = renderHook(() => useLootEntryForm());

      // Add two more entries so we have 3 total
      act(() => {
        result.current.handleAddEntry('gold');
        result.current.handleAddEntry('item');
      });
      expect(result.current.entries).toHaveLength(3);

      act(() => {
        result.current.handleRemoveEntry(1);
      });

      expect(result.current.entries).toHaveLength(2);
      expect(result.current.entries[0].type).toBe('item');
      expect(result.current.entries[1].type).toBe('item');
    });

    it('should remove the first entry when index is 0', () => {
      const { result } = renderHook(() => useLootEntryForm());

      act(() => {
        result.current.handleAddEntry('gold');
      });

      act(() => {
        result.current.handleRemoveEntry(0);
      });

      expect(result.current.entries).toHaveLength(1);
      expect(result.current.entries[0].type).toBe('gold');
    });

    it('should remove the last entry', () => {
      const { result } = renderHook(() => useLootEntryForm());

      act(() => {
        result.current.handleAddEntry('gold');
      });

      act(() => {
        result.current.handleRemoveEntry(1);
      });

      expect(result.current.entries).toHaveLength(1);
      expect(result.current.entries[0].type).toBe('item');
    });

    it('should result in empty array if the only entry is removed', () => {
      const { result } = renderHook(() => useLootEntryForm());

      act(() => {
        result.current.handleRemoveEntry(0);
      });

      expect(result.current.entries).toHaveLength(0);
    });
  });

  describe('handleEntryChange', () => {
    it('should update a specific field on the entry at the given index', () => {
      const { result } = renderHook(() => useLootEntryForm());

      act(() => {
        result.current.handleEntryChange(0, { name: 'Longsword' });
      });

      expect(result.current.entries[0].data.name).toBe('Longsword');
    });

    it('should update multiple fields at once', () => {
      const { result } = renderHook(() => useLootEntryForm());

      act(() => {
        result.current.handleEntryChange(0, {
          name: 'Potion of Cure Light Wounds',
          quantity: '3',
          type: 'Potion',
          value: 50,
        });
      });

      const data = result.current.entries[0].data;
      expect(data.name).toBe('Potion of Cure Light Wounds');
      expect(data.quantity).toBe('3');
      expect(data.type).toBe('Potion');
      expect(data.value).toBe(50);
    });

    it('should not affect other entries', () => {
      const { result } = renderHook(() => useLootEntryForm());

      act(() => {
        result.current.handleAddEntry('item');
      });

      act(() => {
        result.current.handleEntryChange(1, { name: 'Shield' });
      });

      expect(result.current.entries[0].data.name).toBe('');
      expect(result.current.entries[1].data.name).toBe('Shield');
    });

    it('should preserve existing fields when updating', () => {
      const { result } = renderHook(() => useLootEntryForm());

      act(() => {
        result.current.handleEntryChange(0, { name: 'Dagger' });
      });
      act(() => {
        result.current.handleEntryChange(0, { quantity: '2' });
      });

      expect(result.current.entries[0].data.name).toBe('Dagger');
      expect(result.current.entries[0].data.quantity).toBe('2');
    });

    it('should work with gold entry fields', () => {
      const { result } = renderHook(() => useLootEntryForm());

      act(() => {
        result.current.handleAddEntry('gold');
      });

      act(() => {
        result.current.handleEntryChange(1, {
          transactionType: 'Found',
          gold: '100',
          silver: '50',
        });
      });

      const goldData = result.current.entries[1].data;
      expect(goldData.transactionType).toBe('Found');
      expect(goldData.gold).toBe('100');
      expect(goldData.silver).toBe('50');
      expect(goldData.platinum).toBe('');
      expect(goldData.copper).toBe('');
    });
  });

  describe('resetForm', () => {
    it('should reset entries to a single default item entry', () => {
      const { result } = renderHook(() => useLootEntryForm());

      // Add multiple entries and modify them
      act(() => {
        result.current.handleAddEntry('gold');
        result.current.handleAddEntry('item');
        result.current.handleEntryChange(0, { name: 'Modified item' });
      });
      expect(result.current.entries).toHaveLength(3);

      act(() => {
        result.current.resetForm();
      });

      expect(result.current.entries).toHaveLength(1);
      expect(result.current.entries[0].type).toBe('item');
      expect(result.current.entries[0].data.name).toBe('');
      expect(result.current.entries[0].error).toBeNull();
    });

    it('should clear error and success messages', () => {
      const { result } = renderHook(() => useLootEntryForm());

      act(() => {
        result.current.setError('Something went wrong');
        result.current.setSuccess('Item created');
      });

      act(() => {
        result.current.resetForm();
      });

      expect(result.current.error).toBe('');
      expect(result.current.success).toBe('');
    });
  });

  describe('setEntries (direct setter)', () => {
    it('should allow directly setting entries', () => {
      const { result } = renderHook(() => useLootEntryForm());

      act(() => {
        result.current.setEntries([
          { type: 'gold', data: { transactionType: 'Loot', gold: '500' }, error: null },
        ]);
      });

      expect(result.current.entries).toHaveLength(1);
      expect(result.current.entries[0].type).toBe('gold');
      expect(result.current.entries[0].data.gold).toBe('500');
    });
  });

  describe('setError and setSuccess', () => {
    it('should allow setting error message', () => {
      const { result } = renderHook(() => useLootEntryForm());

      act(() => {
        result.current.setError('Validation failed');
      });

      expect(result.current.error).toBe('Validation failed');
    });

    it('should allow setting success message', () => {
      const { result } = renderHook(() => useLootEntryForm());

      act(() => {
        result.current.setSuccess('Items added successfully');
      });

      expect(result.current.success).toBe('Items added successfully');
    });
  });

  describe('entry independence (no shared references)', () => {
    it('should not share data objects between entries', () => {
      const { result } = renderHook(() => useLootEntryForm());

      act(() => {
        result.current.handleAddEntry('item');
      });

      act(() => {
        result.current.handleEntryChange(0, { name: 'Item A' });
      });

      // Second entry should not be affected
      expect(result.current.entries[1].data.name).toBe('');
    });
  });
});
