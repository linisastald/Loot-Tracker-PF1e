import React, { useState, useEffect } from 'react';
import axios from 'axios';

const GoldTransactions = () => {
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    const fetchTransactions = async () => {
      const token = localStorage.getItem('token');
      const res = await axios.get('http://localhost:5000/api/gold-transactions', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      setTransactions(res.data);
    };

    fetchTransactions();
  }, []);

  return (
    <div>
      <h2>Gold Transactions</h2>
      <ul>
        {transactions.map(tx => (
          <li key={tx.id}>
            <p>{tx.transaction_type}: {tx.gold} gold - {tx.notes}</p>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default GoldTransactions;
