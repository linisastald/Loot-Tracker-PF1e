// utils.js
import axios from 'axios';
import jwt_decode from 'jwt-decode';

const API_BASE_URL = 'http://192.168.0.64:5000';

const getToken = () => localStorage.getItem('token');

const getAuthHeaders = () => {
  const token = getToken();
  return { Authorization: `Bearer ${token}` };
};

// Fetch the active user details
export const fetchActiveUser = async (setActiveUser) => {
  const token = getToken();
  const decodedToken = jwt_decode(token);
  const userId = decodedToken.id;
  const response = await axios.get(`${API_BASE_URL}/api/user/${userId}`, {
    headers: getAuthHeaders(),
  });
  setActiveUser(response.data);
};

// Select an item for further actions
export const handleSelectItem = (id, setSelectedItems) => {
  setSelectedItems((prevSelectedItems) =>
    prevSelectedItems.includes(id)
      ? prevSelectedItems.filter((itemId) => itemId !== id)
      : [...prevSelectedItems, id]
  );
};

// Update loot status
export const updateLootStatus = async (id, updatedEntry) => {
  await axios.put(`${API_BASE_URL}/api/loot/${id}`, updatedEntry, {
    headers: getAuthHeaders(),
  });
};

// Handle sell action
export const handleSell = async (selectedItems, fetchLoot) => {
  await axios.post(`${API_BASE_URL}/api/loot/sell`, { ids: selectedItems }, {
    headers: getAuthHeaders(),
  });
  fetchLoot();
};

// Handle trash action
export const handleTrash = async (selectedItems, fetchLoot) => {
  await axios.post(`${API_BASE_URL}/api/loot/trash`, { ids: selectedItems }, {
    headers: getAuthHeaders(),
  });
  fetchLoot();
};

// Handle keep self action
export const handleKeepSelf = async (selectedItems, fetchLoot, activeUser) => {
  await axios.post(`${API_BASE_URL}/api/loot/keep-self`, { ids: selectedItems, whohas: activeUser.activeCharacterId }, {
    headers: getAuthHeaders(),
  });
  fetchLoot();
};

// Handle keep party action
export const handleKeepParty = async (selectedItems, fetchLoot) => {
  await axios.post(`${API_BASE_URL}/api/loot/keep-party`, { ids: selectedItems }, {
    headers: getAuthHeaders(),
  });
  fetchLoot();
};

// Handle split stack action
export const handleSplitSubmit = async (splitData, selectedItems, fetchLoot) => {
  try {
    const token = getToken();
    const splits = splitData.map((quantity) => ({
      quantity: parseInt(quantity, 10),
    }));
    await axios.post(`${API_BASE_URL}/api/loot/split-stack`, {
      id: selectedItems[0],
      splits,
      userId: jwt_decode(token).id,
    }, {
      headers: getAuthHeaders(),
    });
    fetchLoot();
  } catch (error) {
    console.error('Error splitting stack:', error);
  }
};



// Handle update action
export const handleUpdate = async (id, updatedEntry, fetchLoot) => {
  await axios.put(`${API_BASE_URL}/api/loot/${id}`, updatedEntry, {
    headers: getAuthHeaders(),
  });
  fetchLoot();
};

// Handle split change
export const handleSplitChange = (index, value, setSplitData) => {
  setSplitData((prevSplits) => {
    const newSplits = [...prevSplits];
    newSplits[index] = value;
    return newSplits;
  });
};

// Handle add split
export const handleAddSplit = (splitData, setSplitData) => {
  setSplitData([...splitData, 0]);
};

// Handle split submit
export const handleSplitSubmit = async (splitData, selectedItems, fetchLoot) => {
  const token = getToken();
  const splits = splitData.map((quantity, index) => ({
    ...selectedItems[0], // Assuming this is the item being split
    quantity,
    id: `${selectedItems[0].id}_split_${index}`, // Creating a unique ID for each split item
  }));
  await axios.post(`${API_BASE_URL}/api/loot/split`, { splits }, {
    headers: getAuthHeaders(),
  });
  fetchLoot();
};

// Open update dialog
export const handleOpenUpdateDialog = (loot, selectedItems, setUpdatedEntry, setOpenUpdateDialog) => {
  const selectedItem = loot.find(item => item.id === selectedItems[0]);
  setUpdatedEntry(selectedItem);
  setOpenUpdateDialog(true);
};

// Open split dialog
export const handleOpenSplitDialog = (loot, selectedItems, setSplitQuantities, setSplitDialogOpen) => {
  const selectedItem = loot.find(item => item.id === selectedItems[0]);
  setSplitQuantities([0, selectedItem.quantity]); // or initialize as needed
  setSplitDialogOpen(true);
};

// Close update dialog
export const handleUpdateDialogClose = (setOpenUpdateDialog) => {
  setOpenUpdateDialog(false);
};

// Close split dialog
export const handleSplitDialogClose = (setSplitDialogOpen) => {
  setSplitDialogOpen(false);
};

// Format date
export const formatDate = (dateString) => {
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return new Date(dateString).toLocaleDateString(undefined, options);
};

// Handle update change
export const handleUpdateChange = (e, setUpdatedEntry) => {
  const { name, value } = e.target;
  setUpdatedEntry((prevEntry) => ({
    ...prevEntry,
    [name]: value,
  }));
};
