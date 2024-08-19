import jwt_decode from 'jwt-decode';
import api from './api';

export const fetchActiveUser = async () => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('No token found in localStorage');
      throw new Error('No token found');
    }

    let decoded;
    try {
      decoded = jwt_decode(token);
    } catch (error) {
      console.error('Token decoding failed', error);
      throw new Error('Invalid token decoding');
    }

    const userId = decoded.id;
    if (!userId) {
      console.error('No user ID in token');
      throw new Error('Invalid token user ID');
    }

    const response = await api.get(`/user/${userId}`);

    return response.data;
  } catch (error) {
    console.error('Error fetching active user:', error.message);
    return null;
  }
};

export const handleSelectItem = (id, setSelectedItems) => {
  setSelectedItems(prevSelectedItems =>
    prevSelectedItems.includes(id)
      ? prevSelectedItems.filter(item => item !== id)
      : [...prevSelectedItems, id]
  );
};

export const handleSell = async (selectedItems, fetchLoot) => {
  try {
    const token = localStorage.getItem('token');
    const decodedToken = jwt_decode(token);
    const userId = decodedToken.id;

    await api.put(`/loot/update-status`, {
      ids: selectedItems,
      status: 'Pending Sale',
      userId,
    });
    fetchLoot();
  } catch (error) {
    console.error('Error selling items:', error);
  }
};

export const handleTrash = async (selectedItems, fetchLoot) => {
  try {
    const token = localStorage.getItem('token');
    const decodedToken = jwt_decode(token);
    const userId = decodedToken.id;

    await api.put(`/loot/update-status`, {
      ids: selectedItems,
      status: 'Trashed',
      userId,
    });
    fetchLoot();
  } catch (error) {
    console.error('Error trashing items:', error);
  }
};

export const handleKeepSelf = async (selectedItems, fetchLoot, activeUser) => {
  try {
    const token = localStorage.getItem('token');
    const decodedToken = jwt_decode(token);
    const userId = decodedToken.id;

    await api.put(`/loot/update-status`, {
      ids: selectedItems,
      status: 'Kept Self',
      userId,
      whohas: activeUser.activeCharacterId,
    });
    fetchLoot();
  } catch (error) {
    console.error('Error keeping items for self:', error);
  }
};

export const handleKeepParty = async (selectedItems, fetchLoot) => {
  try {
    const token = localStorage.getItem('token');
    const decodedToken = jwt_decode(token);
    const userId = decodedToken.id;

    await api.put(`/loot/update-status`, {
      ids: selectedItems,
      status: 'Kept Party',
      userId,
    });
    fetchLoot();
  } catch (error) {
    console.error('Error keeping items for party:', error);
  }
};

export const handleOpenUpdateDialog = (loot, selectedItems, setUpdatedEntry, setOpenUpdateDialog) => {
  const selectedItem = loot.find(item => item.id === selectedItems[0]);
  setUpdatedEntry(selectedItem);
  setOpenUpdateDialog(true);
};

export const handleUpdateDialogClose = (setOpenUpdateDialog) => {
  setOpenUpdateDialog(false);
};

export const handleSplitDialogClose = (setOpenSplitDialog) => {
  setOpenSplitDialog(false);
};

export const handleUpdateChange = (e, setUpdatedEntry) => {
  const { name, value } = e.target;
  setUpdatedEntry((prevEntry) => ({
    ...prevEntry,
    [name]: value,
  }));
};

export const handleUpdate = async (id, updatedEntry, fetchLoot) => {
  const token = localStorage.getItem('token');
  await api.put(`/loot/${id}`, { updatedEntry });

  fetchLoot();
};

export const handleFilterChange = (event, setFilters) => {
  const { name, value } = event.target;
  setFilters((prevFilters) => ({
    ...prevFilters,
    [name]: value,
  }));
};

export const applyFilters = (loot, filters) => {
  let filteredLoot = { ...loot };

  if (filters.unidentified) {
    filteredLoot.individual = filteredLoot.individual.filter(item =>
      filters.unidentified === 'all' || item.unidentified === null ||
      item.unidentified === (filters.unidentified === 'true')
    );
  }

  if (filters.type) {
    filteredLoot.individual = filteredLoot.individual.filter(item => item.type === filters.type);
  }

  if (filters.size) {
    filteredLoot.individual = filteredLoot.individual.filter(item => item.size === filters.size);
  }

  if (filters.pendingSale) {
    filteredLoot.individual = filteredLoot.individual.filter(item => (item.status === 'Pending Sale') === (filters.pendingSale === 'true'));
  }

  return filteredLoot;
};

export const formatDate = (dateString) => {
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return new Date(dateString).toLocaleDateString(undefined, options);
};

export const handleSplitChange = (index, value, splitEntries, setSplitEntries) => {
  const updatedEntries = [...splitEntries];
  updatedEntries[index] = value;
  setSplitEntries(updatedEntries);
};

export const handleAddSplit = (splitEntries, setSplitEntries) => {
  setSplitEntries([...splitEntries, { quantity: '' }]);
};

export const handleOpenSplitDialog = (item, setSplitItem, setSplitEntries, setSplitDialogOpen) => {
  setSplitItem(item);
  setSplitEntries([{ quantity: item.quantity }]);
  setSplitDialogOpen(true);
};

export const handleSort = (sortConfig, setSortConfig, key) => {
  let direction = 'ascending';
  if (sortConfig.key === key && sortConfig.direction === 'ascending') {
    direction = 'descending';
  }
  setSortConfig({ key, direction });
};

export const handleUpdateSubmit = async (updatedEntry, fetchLoot, setOpenUpdateDialog, setSelectedItems) => {
  try {
    const token = localStorage.getItem('token');
    await api.put(`/loot/update-entry/${updatedEntry.id}`, {
      updatedEntry,
    });
    fetchLoot();
    setOpenUpdateDialog(false);  // Close the dialog
    setSelectedItems([]);
  } catch (error) {
    console.error('Error updating item:', error);
  }
};

export const handleSplitSubmit = async (splitQuantities, selectedItems, originalItemQuantity, userId, fetchLoot, setOpenSplitDialog, setSelectedItems) => {
  // Calculate the sum of split quantities
  const sumOfSplits = splitQuantities.reduce((total, current) => total + parseInt(current.quantity, 10), 0);

  // Check if the sum of splits equals the original item quantity
  if (sumOfSplits !== originalItemQuantity) {
    alert("The sum of the split quantities must equal the original item's quantity.");
    return; // Stop execution if they don't match
  }

  try {
    const token = localStorage.getItem('token');
    const itemId = selectedItems[0];
    const response = await api.post(`/loot/split-stack`, {
      id: itemId,
      splits: splitQuantities,
      userId,
    });
    if (response.status === 200) {
      await fetchLoot();
      setOpenSplitDialog(false);
      setSelectedItems([]);
    } else {
      console.error('Error splitting loot item:', response.data);
    }
  } catch (error) {
    console.error('Error splitting loot item:', error);
  }
};

export const fetchItemNames = async () => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('No token found in localStorage');
      throw new Error('No token found');
    }

    const response = await api.get(`/loot/items`);
    return response.data;  // Return the original data without modification
  } catch (error) {
    console.error('Error fetching item names:', error);
    return [];
  }
};
