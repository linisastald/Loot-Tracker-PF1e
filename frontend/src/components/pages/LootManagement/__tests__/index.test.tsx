import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';

vi.mock('../UnprocessedLoot', () => ({ default: () => <div>page unprocessed</div> }));
vi.mock('../KeptParty', () => ({ default: () => <div>page kept-party</div> }));
vi.mock('../KeptCharacter', () => ({ default: () => <div>page kept-character</div> }));
vi.mock('../SoldLoot', () => ({ default: () => <div>page sold</div> }));
vi.mock('../GivenAwayOrTrashed', () => ({ default: () => <div>page trashed</div> }));

import LootManagement from '../index';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="loot-management/*" element={<LootManagement />} />
      </Routes>
    </MemoryRouter>
  );

const selectedTab = () => screen.getByRole('tab', { selected: true }).textContent;

describe('LootManagement tabs', () => {
  it.each([
    ['/loot-management', 'Unprocessed', 'page unprocessed'],
    ['/loot-management/unprocessed', 'Unprocessed', 'page unprocessed'],
    ['/loot-management/kept-party', 'Party Loot', 'page kept-party'],
    ['/loot-management/kept-character', 'Character Loot', 'page kept-character'],
    ['/loot-management/sold', 'Sold', 'page sold'],
    ['/loot-management/trashed', 'Trashed', 'page trashed'],
  ])('highlights the right tab on a direct load of %s', (path, tab, page) => {
    renderAt(path);

    expect(selectedTab()).toBe(tab);
    expect(screen.getByText(page)).toBeInTheDocument();
  });

  it('navigates when a tab is clicked', () => {
    renderAt('/loot-management/unprocessed');

    fireEvent.click(screen.getByRole('tab', { name: 'Sold' }));

    expect(selectedTab()).toBe('Sold');
    expect(screen.getByText('page sold')).toBeInTheDocument();
  });

  it('follows navigation that does not come from the tabs (back/forward)', () => {
    const Jump = () => {
      const navigate = useNavigate();
      return <button onClick={() => navigate('/loot-management/trashed')}>jump</button>;
    };
    render(
      <MemoryRouter initialEntries={['/loot-management/unprocessed']}>
        <Jump />
        <Routes>
          <Route path="loot-management/*" element={<LootManagement />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('jump'));

    expect(selectedTab()).toBe('Trashed');
  });
});
