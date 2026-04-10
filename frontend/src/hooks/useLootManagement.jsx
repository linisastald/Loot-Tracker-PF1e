import {useEffect, useState, useCallback} from 'react';
import lootService from '../services/lootService';
import {
  applyFilters,
  handleKeepParty,
  handleKeepSelf,
  handleOpenSplitDialog,
  handleOpenUpdateDialog,
  handleSelectItem,
  handleSell,
  handleSplitDialogClose,
  handleSplitSubmit,
  handleTrash,
  handleUpdateChange,
  handleUpdateDialogClose,
  handleUpdateSubmit,
} from '../utils/utils';
import { useAuth } from '../contexts/AuthContext';

const useLootManagement = (statusToFetch) => {
  const { user: authUser, isDM: isDMUser } = useAuth();

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
    await actionFunc(selectedItems, fetchLoot, activeUser);
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
      null,
      fetchLoot,
      setOpenSplitDialog,
      setSelectedItems
    );
  };

  const handleUpdateSubmitWrapper = () => {
    handleUpdateSubmit(updatedEntry, fetchLoot, setOpenUpdateDialog);
  };

  // Special function for handling appraise in UnprocessedLoot
  const handleAppraise = async () => {
    try {
      if (!authUser || !authUser.id) {
        return;
      }

      await lootService.appraiseLoot({
        lootIds: selectedItems,
        characterId: authUser.activeCharacterId || authUser.id,
        appraisalRolls: selectedItems.map(() => Math.floor(Math.random() * 20) + 1)
      });

      fetchLoot();
    } catch {
      // Error appraising loot
    }
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
    handleUpdateSubmitWrapper,
    handleAppraise,
    // Expose common action handlers
    handleSell: (ids) => handleSell(ids, fetchLoot, authUser),
    handleTrash: (ids) => handleTrash(ids, fetchLoot, authUser),
    handleKeepSelf: (ids) => handleKeepSelf(ids, fetchLoot, authUser),
    handleKeepParty: (ids) => handleKeepParty(ids, fetchLoot, authUser),
  };
};

export default useLootManagement;