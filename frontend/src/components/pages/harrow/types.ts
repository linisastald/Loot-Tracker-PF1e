// Shared types for the Harrow Point Tracker page and its dialogs.

export interface Choosing {
  card_name: string | null;
  is_chosen_boon: boolean;
}

export interface RosterEntry {
  character_id: number;
  name: string;
  user_id: number | null;
  balance: number;
  choosing: Choosing | null;
}

export interface HarrowState {
  currentChapter: number;
  enabled: boolean;
  balances: RosterEntry[];
}

export interface LedgerEntry {
  id: number;
  chapter: number;
  delta: number;
  reason: string | null;
  entry_type: string;
  created_at: string;
  created_by_name: string | null;
}
