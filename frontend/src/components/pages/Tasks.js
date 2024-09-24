import React, { useState, useEffect } from 'react';
import { Container, Paper, Typography, Switch, Button, List, ListItem, ListItemText, FormGroup, FormControlLabel } from '@mui/material';
import api from '../../utils/api';

const Tasks = () => {
  const [activeCharacters, setActiveCharacters] = useState([]);
  const [selectedCharacters, setSelectedCharacters] = useState({});
  const [assignedTasks, setAssignedTasks] = useState(null);

  useEffect(() => {
    fetchActiveCharacters();
  }, []);

  const fetchActiveCharacters = async () => {
    try {
      const response = await api.get('/user/active-characters');
      setActiveCharacters(response.data);
      const initialSelectedState = response.data.reduce((acc, char) => {
        acc[char.id] = false;
        return acc;
      }, {});
      setSelectedCharacters(initialSelectedState);
    } catch (error) {
      console.error('Error fetching active characters:', error);
    }
  };

  const handleToggle = (id) => {
    setSelectedCharacters(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const assignTasks = () => {
    const selectedChars = activeCharacters.filter(char => selectedCharacters[char.id]);

    const preTasks = [
      'Get Dice Trays',
      'Put Initiative name tags on tracker',
      'Wipe TV',
      'Recap'
    ];
    if (selectedChars.length >= 6) {
      preTasks.push('Bring in extra chairs if needed');
    }

    const duringTasks = [
      'Calendar Master',
      'Loot Master',
      'Lore Master',
      'Battle Master',
      'Rule Master',
      'Inspiration Master'
    ];

    const postTasks = [
      'Food, Drink, and Trash Clear Check',
      'TV(s) off and windows shut and locked',
      'Dice Trays and Books put away',
      'Clean Initiative tracker and put away name labels',
      'Chairs pushed in and extra chairs put back',
      'Post Discord Reminders',
      'Ensure no duplicate snacks for next session'
    ];

    const assignTasksToChars = (tasks, chars) => {
      const assigned = [];
      let charIndex = 0;
      for (let i = 0; i < Math.max(tasks.length, chars.length); i++) {
        assigned.push({
          character: chars[charIndex % chars.length].name,
          task: tasks[i] || 'Free Space'
        });
        charIndex++;
      }
      return assigned;
    };

    const postChars = [...selectedChars, { id: 'DM', name: 'DM' }];

    setAssignedTasks({
      pre: assignTasksToChars(preTasks, selectedChars),
      during: assignTasksToChars(duringTasks, selectedChars),
      post: assignTasksToChars(postTasks, postChars)
    });
  };

  return (
    <Container maxWidth={false} component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Task Assignment</Typography>
        <FormGroup>
          {activeCharacters.map((char) => (
            <FormControlLabel
              key={char.id}
              control={<Switch checked={selectedCharacters[char.id] || false} onChange={() => handleToggle(char.id)} />}
              label={char.name}
            />
          ))}
        </FormGroup>
        <Button variant="contained" onClick={assignTasks} sx={{ mt: 2 }}>Assign Tasks</Button>
      </Paper>

      {assignedTasks && (
        <>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6">Pre-Session Tasks</Typography>
            <List>
              {assignedTasks.pre.map((item, index) => (
                <ListItem key={index}>
                  <ListItemText primary={`${item.character}: ${item.task}`} />
                </ListItem>
              ))}
            </List>
          </Paper>

          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6">During Session Tasks</Typography>
            <List>
              {assignedTasks.during.map((item, index) => (
                <ListItem key={index}>
                  <ListItemText primary={`${item.character}: ${item.task}`} />
                </ListItem>
              ))}
            </List>
          </Paper>

          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6">Post-Session Tasks</Typography>
            <List>
              {assignedTasks.post.map((item, index) => (
                <ListItem key={index}>
                  <ListItemText primary={`${item.character}: ${item.task}`} />
                </ListItem>
              ))}
            </List>
          </Paper>
        </>
      )}
    </Container>
  );
};

export default Tasks;