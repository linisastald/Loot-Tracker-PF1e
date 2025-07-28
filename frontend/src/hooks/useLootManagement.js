import {useEffect, useState} from 'react';
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
  const fetchLoot = async () => {
    try {
      let endpoint;

      if (!statusToFetch) {
        // For unprocessed loot
        const isDMUser = isDM();
        let params = { isDM: isDMUser };

        if (!isDMUser) {
          const currentActiveUser = await fetchActiveUser();
          if (currentActiveUser && currentActiveUser.activeCharacterId) {
            params.activeCharacterId = currentActiveUser.activeCharacterId;
          } else {
            console.error('No active character ID available');
            return;
          }
        }

        const response = await lootService.getAllLoot(params);
        setLoot(response.data);
      } else if (statusToFetch === 'Kept Party') {
        const response = await lootService.getKeptPartyLoot();
        setLoot(response.data);
      } else if (statusToFetch === 'Kept Self') {
        const response = await lootService.getKeptCharacterLoot();
        setLoot(response.data);
      } else if (statusToFetch === 'Trashed') {
        const response = await lootService.getTrashedLoot();
        setLoot(response.data);
      }
    } catch (error) {
      console.error(`Error fetching loot:`, error);
    }
  };

  const fetchActiveUserDetails = async () => {
    const user = await fetchActiveUser();
    if (user && user.activeCharacterId) {
      setActiveUser(user);
    } else {
      console.error('Active character ID is not available or user could not be fetched');
    }
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
  }, []);

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
    handleOpenUpdateDialog(loot.individual, selectedItems, setUpdatedEntry, setOpenUpdateDialog);
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
        console.error('Unable to fetch user ID for appraisal');
        return;
      }

      // The backend expects characterId - it will automatically use the active character
      await lootService.appraiseLoot({
        lootIds: selectedItems,
        characterId: user.activeCharacterId || user.id,
        appraisalRolls: selectedItems.map(() => Math.floor(Math.random() * 20) + 1) // Generate d20 rolls
      });

      fetchLoot();
    } catch (error) {
      console.error('Error appraising loot:', error);
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