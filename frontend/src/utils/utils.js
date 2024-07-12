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
  try {
    await axios.put(`${API_BASE_URL}/api/loot/update-status`, {
      ids: selectedItems.map(Number), // Ensure IDs are integers
      status: 'Pending Sale',
      userId: jwt_decode(getToken()).id,
    }, {
      headers: getAuthHeaders(),
    });
    fetchLoot();
  } catch (error) {
    console.error('Error marking loot as pending sale:', error);
  }
};

// Handle trash action
export const handleTrash = async (selectedItems, fetchLoot) => {
  try {
    await axios.put(`${API_BASE_URL}/api/loot/update-status`, {
      ids: selectedItems.map(Number), // Ensure IDs are integers
      status: 'Trashed',
      userId: jwt_decode(getToken()).id,
    }, {
      headers: getAuthHeaders(),
    });
    fetchLoot();
  } catch (error) {
    console.error('Error trashing loot:', error);
  }
};

// Handle keep self action
export const handleKeepSelf = async (selectedItems, fetchLoot, activeUser) => {
  try {
    await axios.put(`${API_BASE_URL}/api/loot/update-status`, {
      ids: selectedItems.map(Number), // Ensure IDs are integers
      status: 'Kept Self',
      userId: jwt_decode(getToken()).id,
      whohas: activeUser.activeCharacterId,
    }, {
      headers: getAuthHeaders(),
    });
    fetchLoot();
  } catch (error) {
    console.error('Error keeping loot for self:', error);
  }
};

// Handle keep party action
export const handleKeepParty = async (selectedItems, fetchLoot) => {
  try {
    await axios.put(`${API_BASE_URL}/api/loot/update-status`, {
      ids: selectedItems.map(Number), // Ensure IDs are integers
      status: 'Kept Party',
      userId: jwt_decode(getToken()).id,
    }, {
      headers: getAuthHeaders(),
    });
    fetchLoot();
  } catch (error) {
    console.error('Error keeping loot for party:', error);
  }
};

// Handle split stack action
export const handleSplitStack = async (splitQuantities, selectedItems, fetchLoot) => {
  try {
    const token = getToken();
    const selectedId = selectedItems[0];
    const splits = splitQuantities.map((quantity) => ({
      quantity: parseInt(quantity, 10),
    }));
    await axios.post(`${API_BASE_URL}/api/loot/split-stack`, {
      id: selectedId,
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
