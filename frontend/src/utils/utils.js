import axios from 'axios';
import jwt_decode from 'jwt-decode';

export const fetchActiveUser = async () => {
  try {
    const token = localStorage.getItem('token');
    const decoded = jwt_decode(token);
    const userId = decoded.userId;
    const response = await axios.get(`http://192.168.0.64:5000/api/user/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching active user:', error);
    return null;
  }
};

export const handleSelectItem = (itemId, setSelectedItems) => {
  setSelectedItems((prevSelected) =>
    prevSelected.includes(itemId)
      ? prevSelected.filter((id) => id !== itemId)
      : [...prevSelected, itemId]
  );
};

export const handleSell = async (selectedItems, fetchLoot) => {
  try {
    const token = localStorage.getItem('token');
    await axios.put('http://192.168.0.64:5000/api/loot/status', {
      ids: selectedItems,
      status: 'Pending Sale',
      userId: jwt_decode(token).userId,
    }, {
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchLoot();
  } catch (error) {
    console.error('Error selling items:', error);
  }
};

export const handleTrash = async (selectedItems, fetchLoot) => {
  try {
    const token = localStorage.getItem('token');
    await axios.put('http://192.168.0.64:5000/api/loot/status', {
      ids: selectedItems,
      status: 'Trashed',
      userId: jwt_decode(token).userId,
    }, {
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchLoot();
  } catch (error) {
    console.error('Error trashing items:', error);
  }
};

export const handleKeepSelf = async (selectedItems, fetchLoot, activeUser) => {
  try {
    const token = localStorage.getItem('token');
    await axios.put('http://192.168.0.64:5000/api/loot/status', {
      ids: selectedItems,
      status: 'Kept Self',
      userId: jwt_decode(token).userId,
      whohas: activeUser.activeCharacterId,
    }, {
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchLoot();
  } catch (error) {
    console.error('Error keeping items for self:', error);
  }
};

export const handleKeepParty = async (selectedItems, fetchLoot) => {
  try {
    const token = localStorage.getItem('token');
    await axios.put('http://192.168.0.64:5000/api/loot/status', {
      ids: selectedItems,
      status: 'Kept Party',
      userId: jwt_decode(token).userId,
    }, {
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchLoot();
  } catch (error) {
    console.error('Error keeping items for party:', error);
  }
};

export const handleSplitSubmit = async (splitQuantities, selectedItems, fetchLoot) => {
  const token = localStorage.getItem('token');
  const splits = splitQuantities.filter(qty => qty > 0);
  const total = splits.reduce((sum, qty) => sum + qty, 0);
  const selectedItem = selectedItems[0];
  const selectedItemData = await axios.get(`http://192.168.0.64:5000/api/loot/${selectedItem}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (total !== selectedItemData.data.quantity) {
    alert("The sum of split quantities must equal the original quantity.");
    return;
  }

  await axios.post('http://192.168.0.64:5000/api/loot/split', {
    id: selectedItem,
    splits,
    userId: jwt_decode(token).userId,
  }, {
    headers: { Authorization: `Bearer ${token}` },
  });

  fetchLoot();
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
  await axios.put(`http://192.168.0.64:5000/api/loot/${id}`, { updatedEntry }, {
    headers: { Authorization: `Bearer ${token}` },
  });

  fetchLoot();
};

export const handleFilterChange = (e, setFilters) => {
  const { name, value } = e.target;
  setFilters((prevFilters) => ({
    ...prevFilters,
    [name]: value,
  }));
};

export const applyFilters = (loot, filters) => {
  let filteredLoot = { ...loot };

  if (filters.unidentified) {
    filteredLoot.individual = filteredLoot.individual.filter(item => item.unidentified === (filters.unidentified === 'true'));
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