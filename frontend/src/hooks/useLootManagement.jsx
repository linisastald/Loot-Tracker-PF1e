import {useEffect, useState, useCallback} from 'react';
import lootService from '../services/lootService';
import {
  applyFilters,
  fetchActiveUser,
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
import {isDM} from '../utils/auth';

const useLootManagement = (statusToFetch) => {
  // Common state
  const [loot, setLoot] = useState({ summary: [], individual: [] });
  const [selectedItems, setSelectedItems] = useState([]);
  const [openUpdateDialog, setOpenUpdateDialog] = useState(false);
  const [openSplitDialog, setOpenSplitDialog] = useState(false);
  const [splitItem, setSplitItem] = useState(null);
  const [splitQuantities, setSplitQuantities] = useState([]);
  const [updatedEntry, setUpdatedEntry] = useState({});
  const [activeUser, setActiveUser] = useState(null);
  const [filters, setFilters] = useState({ unidentified: '', type: '', size: '', pendingSale: '', whoHas: [] });
  const [openItems, setOpenItems] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: '', direction: 'asc' });

  // Fetch data based on the status
  const fetchLoot = useCallback(async () => {
    try {
      if (!statusToFetch) {
        // For unprocessed loot - use the default getAllLoot which now defaults to Unprocessed
        const isDMUser = isDM();
        let params = {
          isDM: isDMUser,
          // Request all fields needed for filtering (excluding character_names due to view structure)
          fields: 'id,name,quantity,statuspage,unidentified,character_name,session_date,value,type,row_type,size,masterwork,notes,average_appraisal,lastupdate'
        };

        if (!isDMUser) {
          const currentActiveUser = await fetchActiveUser();
          if (currentActiveUser && currentActiveUser.activeCharacterId) {
            params.activeCharacterId = currentActiveUser.activeCharacterId;
          } else {
            // No active character ID available
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
  }, [statusToFetch]);

  const fetchActiveUserDetails = async () => {
    const user = await fetchActiveUser();
    if (user && user.activeCharacterId) {
      setActiveUser(user);
    } else if (!isDM()) {
      // Only log error for non-DM users who should have an active character
      // Active character ID is not available or user could not be fetched
    }
    // DM users don't need an active character ID, so no error for them
  };

  useEffect(() => {
    const initializeComponent = async () => {
      if (!isDM()) {
        await fetchActiveUserDetails();
        fetchLoot();
      } else {
        fetchLoot();
        await fetchActiveUserDetails();
      }
    };

    initializeComponent();
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
      // Fetch the current user's info
      const user = await fetchActiveUser();

      if (!user || !user.id) {
        // Unable to fetch user ID for appraisal
        return;
      }

      // The backend expects characterId - it will automatically use the active character
      await lootService.appraiseLoot({
        lootIds: selectedItems,
        characterId: user.activeCharacterId || user.id,
        appraisalRolls: selectedItems.map(() => Math.floor(Math.random() * 20) + 1) // Generate d20 rolls
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
    activeUser,
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
    handleSell: (ids) => handleSell(ids, fetchLoot),
    handleTrash: (ids) => handleTrash(ids, fetchLoot),
    handleKeepSelf: (ids) => handleKeepSelf(ids, fetchLoot, activeUser),
    handleKeepParty: (ids) => handleKeepParty(ids, fetchLoot),
  };
};

export default useLootManagement;