import React, { useState } from 'react';
import { useHistory } from 'react-router-dom';

const Login = () => {
  const [characterName, setCharacterName] = useState('');
  const [password, setPassword] = useState('');
  const history = useHistory();

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Dummy login logic: directly navigate to the loot entry page
    localStorage.setItem('token', 'dummy_token');  // Set a dummy token
    history.push('/loot-entry');
  };

  return (
    <div>
      <h2>Login</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Character Name"
          value={characterName}
          onChange={(e) => setCharacterName(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit">Login</button>
      </form>
    </div>
  );
};

export default Login;
