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
import { useIsDM } from '../contexts/CampaignContext';

const useLootManagement = (statusToFetch) => {
  const { user: authUser } = useAuth();
  const isDMUser = useIsDM();

  // Common state
  const [loot, setLoot] = useState({ summary: [], individual: [] });
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
      if (!statusToFetch) {
        let params = {
          isDM: isDMUser,
          fields: 'id,name,quantity,statuspage,unidentified,character_name,session_date,value,type,row_type,size,masterwork,notes,average_appraisal,lastupdate'
        };

        if (!isDMUser) {
          if (authUser && authUser.activeCharacterId) {
            params.activeCharacterId = authUser.activeCharacterId;
          } else {
            return;
          }
        }

        const response = await lootService.getAllLoot(params);
        setLoot(response.data || { summary: [], individual: [] });
      } else if (statusToFetch === 'Kept Party') {
        const response = await lootService.getKeptPartyLoot({
          fields: 'id,name,quantity,statuspage,unidentified,character_name,session_date,value,type,row_type,size,masterwork,notes,average_appraisal,lastupdate'
        });
        setLoot(response.data || { summary: [], individual: [] });
      } else if (statusToFetch === 'Kept Self') {
        const response = await lootService.getKeptCharacterLoot({
          fields: 'id,name,quantity,statuspage,unidentified,character_name,session_date,value,type,row_type,size,masterwork,notes,average_appraisal,lastupdate'
        });
        setLoot(response.data || { summary: [], individual: [] });
      } else if (statusToFetch === 'Trash') {
        const response = await lootService.getTrashedLoot({
          fields: 'id,name,quantity,statuspage,unidentified,character_name,session_date,value,type,row_type,size,masterwork,notes,average_appraisal,lastupdate'
        });
        setLoot(response.data || { summary: [], individual: [] });
      }
    } catch {
      // Error fetching loot
      setLoot({ summary: [], individual: [] });
    }
  }, [statusToFetch, isDMUser, authUser]);

  useEffect(() => {
    fetchLoot();
  }, [fetchLoot]);

  const handleAction = async (actionFunc) => {
    await actionFunc(selectedItems, fetchLoot, authUser);
    setSelectedItems([]);
  };

  const handleOpenSplitDialogWrapper = (item) => {
    handleOpenSplitDialog(item, setSplitItem, setSplitQuantities, setOpenSplitDialog);
  };

  const handleSplitChange = (index, value) => {
    const updatedQuantities = [...splitQuantities];
    updatedQuantities[index].quantity = parseInt(value, 10);
    setSplitQuantities(updatedQuantities);
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
    if (!authUser.activeCharacterId) {
      throw new Error('You need an active character to appraise items.');
    }

    await lootService.appraiseLoot({
      lootIds: selectedItems,
      characterId: authUser.activeCharacterId,
      appraisalRolls: selectedItems.map(() => Math.floor(Math.random() * 20) + 1)
    });

    await fetchLoot();
  };

  return {
    loot: filteredLoot,
    selectedItems,
    setSelectedItems,
    openUpdateDialog,
    setOpenUpdateDialog,
    openSplitDialog,
    setOpenSplitDialog,
    splitItem,
    splitQuantities,
    updatedEntry,
    activeUser: authUser,
    filters,
    setFilters,
    openItems,
    setOpenItems,
    sortConfig,
    setSortConfig,
    fetchLoot,
    handleAction,
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