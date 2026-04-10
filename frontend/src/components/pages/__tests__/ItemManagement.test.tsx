import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';

// Mock all sub-route components
vi.mock('../ItemManagement/GeneralItemManagement', () => ({
  default: () => <div data-testid="general-item-management">General Item Management</div>,
}));

vi.mock('../ItemManagement/UnidentifiedItemsManagement', () => ({
  default: () => <div data-testid="unidentified-items">Unidentified Items</div>,
}));

vi.mock('../ItemManagement/PendingSaleManagement', () => ({
  default: () => <div data-testid="pending-sale">Pending Sale</div>,
}));

vi.mock('../ItemManagement/AddItemMod', () => ({
  default: () => <div data-testid="add-item-mod">Add Item/Mod</div>,
}));

vi.mock('../ItemManagement/SearchHistoryManagement', () => ({
  default: () => <div data-testid="search-history">Search History</div>,
}));

import ItemManagement from '../ItemManagement';

const renderComponent = (initialPath = '/item-management') =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/item-management/*" element={<ItemManagement />} />
      </Routes>
    </MemoryRouter>
  );

describe('ItemManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all tab labels', () => {
    renderComponent();
    expect(screen.getByRole('tab', { name: /general/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /unidentified items/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /pending sale/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /add item\/mod/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /search history/i })).toBeInTheDocument();
  });

  it('renders the General sub-route by default', () => {
    renderComponent();
    expect(screen.getByTestId('general-item-management')).toBeInTheDocument();
  });

  it('renders the Unidentified Items sub-route', () => {
    renderComponent('/item-management/unidentified');
    expect(screen.getByTestId('unidentified-items')).toBeInTheDocument();
  });

  it('renders the Pending Sale sub-route', () => {
    renderComponent('/item-management/pending-sale');
    expect(screen.getByTestId('pending-sale')).toBeInTheDocument();
  });

  it('renders the Add Item/Mod sub-route', () => {
    renderComponent('/item-management/add-item-mod');
    expect(screen.getByTestId('add-item-mod')).toBeInTheDocument();
  });

  it('renders the Search History sub-route', () => {
    renderComponent('/item-management/search-history');
    expect(screen.getByTestId('search-history')).toBeInTheDocument();
  });

  it('renders tablist with the correct aria label', () => {
    renderComponent();
    expect(screen.getByRole('tablist', { name: /item management tabs/i })).toBeInTheDocument();
  });
});
