import React, { useState } from 'react';
import axios from 'axios';

const LootEntry = () => {
  const [itemName, setItemName] = useState('');
  const [itemDescription, setItemDescription] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    try {
      await axios.post('http://localhost:5000/api/loot', {
        item_name: itemName,
        item_description: itemDescription,
        campaign_id: 1,
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      setItemName('');
      setItemDescription('');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div>
      <h2>Add Loot</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Item Name"
          value={itemName}
          onChange={(e) => setItemName(e.target.value)}
          required
        />
        <input
          type="text"
          placeholder="Item Description"
          value={itemDescription}
          onChange={(e) => setItemDescription(e.target.value)}
          required
        />
        <button type="submit">Add Loot</button>
      </form>
    </div>
  );
};

export default LootEntry;
