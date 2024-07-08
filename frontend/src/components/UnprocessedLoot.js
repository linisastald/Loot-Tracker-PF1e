import React, { useState, useEffect } from 'react';
import axios from 'axios';

const UnprocessedLoot = () => {
  const [loot, setLoot] = useState([]);

  useEffect(() => {
    const fetchLoot = async () => {
      const token = localStorage.getItem('token');
      const res = await axios.get('http://192.168.0.64:5000/api/loot', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      setLoot(res.data);
    };

    fetchLoot();
  }, []);

  const handleUpdateStatus = async (id, status) => {
    const token = localStorage.getItem('token');
    try {
      await axios.put('http://192.168.0.64:5000/api/loot', { id, status }, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      setLoot(loot.map(item => item.id === id ? { ...item, status } : item));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div>
      <h2>Loot Overview</h2>
      <ul>
        {loot.map(item => (
          <li key={item.id}>
            <p>{item.name}: {item.type}</p>
            <button onClick={() => handleUpdateStatus(item.id, 'sell')}>Sell</button>
            <button onClick={() => handleUpdateStatus(item.id, 'trash')}>Trash</button>
            <button onClick={() => handleUpdateStatus(item.id, 'keep_self')}>Keep Self</button>
            <button onClick={() => handleUpdateStatus(item.id, 'keep_party')}>Keep Party</button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default UnprocessedLoot;
