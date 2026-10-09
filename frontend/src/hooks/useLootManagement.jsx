import {useEffect, useState, useCallback} from 'react';
import lootService from '../services/lootService';
import {
  applyFilters,
  handleOpenSplitDialog,
  handleOpenUpdateDialog,
  handleSelectItem,
  handleSplitDialogClose,
  handleSplitSubmit,
  handleUpdateChange,
  handleUpdateDialogClose,
} from '../utils/utils';
import { useAuth } from '../contexts/AuthContext';
import { useActiveCharacterId, useIsDM } from '../contexts/CampaignContext';

// Columns requested from loot_view; 'appraisals' carries each character's believed value
const LOOT_FIELDS =
  'id,name,quantity,statuspage,unidentified,character_name,session_date,value,type,row_type,size,masterwork,notes,average_appraisal,appraisals,lastupdate';

const EMPTY_LOOT = { summary: [], individual: [] };

// Page status -> service method for the pages that list one status
const STATUS_FETCHERS = {
  'Kept Party': 'getKeptPartyLoot',
  'Kept Self': 'getKeptCharacterLoot',
  'Trash': 'getTrashedLoot',
};

const useLootManagement = (statusToFetch) => {
  const { user: authUser } = useAuth();
  // The active character of the SELECTED campaign (not the auth user's: /auth/status
  // answers for the user's lowest-id campaign)
  const activeCharacterId = useActiveCharacterId();
  const isDMUser = useIsDM();

  // Common state
  const [loot, setLoot] = useState(EMPTY_LOOT);
  const [selectedItems, setSelectedItems] = useState([]);
  const [openUpdateDialog, setOpenUpdateDialog] = useState(false);
  const [openSplitDialog, setOpenSplitDialog] = useState(false);
  const [splitItem, setSplitItem] = useState(null);
  const [splitQuantities, setSplitQuantities] = useState([]);
  const [updatedEntry, setUpdatedEntry] = useState({});
  const [filters, setFilters] = useState({ unidentified: '', type: '', size: '', pendingSale: '', whoHas: [] });
  const [openItems, setOpenItems] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: '', direction: 'asc' });

  // Fetch data based on the status
  const fetchLoot = useCallback(async () => {
    try {
      let response;
      if (!statusToFetch) {
        const params = { isDM: isDMUser, fields: LOOT_FIELDS };

        if (!isDMUser) {
          if (authUser && activeCharacterId) {
            params.activeCharacterId = activeCharacterId;
          } else {
            return;
          }
        }

        response = await lootService.getAllLoot(params);
      } else if (STATUS_FETCHERS[statusToFetch]) {
        response = await lootService[STATUS_FETCHERS[statusToFetch]]({ fields: LOOT_FIELDS });
      } else {
        return;
      }
      setLoot(response.data || EMPTY_LOOT);
    } catch {
      // The page shows an empty list when the fetch fails
      setLoot(EMPTY_LOOT);
    }
  }, [statusToFetch, isDMUser, authUser, activeCharacterId]);

  useEffect(() => {
    fetchLoot();
  }, [fetchLoot]);

  const handleOpenSplitDialogWrapper = (item) => {
    handleOpenSplitDialog(item, setSplitItem, setSplitQuantities, setOpenSplitDialog);
  };

  const handleSplitChange = (index, value) => {
    // A cleared field counts as 0, never NaN; the other rows keep their identity
    const quantity = parseInt(value, 10) || 0;
    setSplitQuantities(splitQuantities.map((q, i) => (i === index ? { ...q, quantity } : q)));
  };

  const handleAddSplit = () => {
    setSplitQuantities([...splitQuantities, { quantity: 0 }]);
  };

  const filteredLoot = applyFilters(loot, filters);

  const handleUpdateDialogWrapper = () => {
    handleOpenUpdateDialog(filteredLoot.individual, selectedItems, setUpdatedEntry, setOpenUpdateDialog);
  };

  const handleSplitSubmitWrapper = () => {
    handleSplitSubmit(
      splitQuantities,
      selectedItems,
      splitItem?.quantity || 0,
      fetchLoot,
      setOpenSplitDialog,
      setSelectedItems
    );
  };

  // Special function for handling appraise in UnprocessedLoot
  // Errors propagate so the page can tell the user (a user id is never sent
  // as a character id: appraising needs an active character).
  const handleAppraise = async () => {
    if (!authUser || !authUser.id) {
      return;
    }
    if (!activeCharacterId) {
      throw new Error('You need an active character to appraise items.');
    }

    const response = await lootService.appraiseLoot({
      lootIds: selectedItems,
      characterId: activeCharacterId,
      appraisalRolls: selectedItems.map(() => Math.floor(Math.random() * 20) + 1)
    });

    // The server answers 200 with per-item errors (already appraised, no
    // value). When nothing at all was appraised, tell the user why.
    const body = response?.data?.data ?? response?.data ?? {};
    const itemErrors = Array.isArray(body.errors) ? body.errors : [];
    if (itemErrors.length > 0 && !(body.summary?.successful > 0)) {
      const reasons = [...new Set(itemErrors.map((e) => e.error).filter(Boolean))];
      throw new Error(reasons.join('; ') || 'None of the selected items could be appraised.');
    }

    await fetchLoot();
  };

  return {
    loot: filteredLoot,
    selectedItems,
    setSelectedItems,
    openUpdateDialog,
    setOpenUpdateDialog,
    openSplitDialog,
    splitQuantities,
    updatedEntry,
    filters,
    setFilters,
    openItems,
    setOpenItems,
    sortConfig,
    setSortConfig,
    fetchLoot,
    handleSelectItem: (id) => handleSelectItem(id, setSelectedItems),
    handleOpenSplitDialogWrapper,
    handleSplitChange,
    handleAddSplit,
    handleUpdateDialogWrapper,
    handleUpdateDialogClose: () => handleUpdateDialogClose(setOpenUpdateDialog),
    handleSplitDialogClose: () => handleSplitDialogClose(setOpenSplitDialog),
    handleUpdateChange: (e) => handleUpdateChange(e, setUpdatedEntry),
    handleSplitSubmitWrapper,
    handleAppraise,
  };
};

export default useLootManagement;