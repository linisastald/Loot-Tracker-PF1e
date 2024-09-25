import React, { useState, useEffect } from 'react';
import { Container, Paper, Typography, Switch, Button, List, ListItem, ListItemText, FormGroup, FormControlLabel, Box } from '@mui/material';
import { styled } from '@mui/material/styles';
import api from '../../utils/api';

const CompactListItem = styled(ListItem)(({ theme }) => ({
  padding: theme.spacing(0, 1),
}));

const CompactListItemText = styled(ListItemText)(({ theme }) => ({
  margin: 0,
  '& .MuiListItemText-primary': {
    fontSize: '0.9rem',
  },
}));

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

  const shuffleArray = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
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
      const charCount = chars.length;
      let adjustedTasks = [...tasks];

      if (tasks.length < charCount) {
        while (adjustedTasks.length < charCount) {
          adjustedTasks.push('Free Space');
        }
      }

      adjustedTasks = shuffleArray(adjustedTasks);

      const assigned = {};
      chars.forEach(char => {
        assigned[char.name] = [];
      });

      adjustedTasks.forEach((task, index) => {
        const charName = chars[index % charCount].name;
        assigned[charName].push(task);
      });

      return assigned;
    };

    const postChars = [...selectedChars, { id: 'DM', name: 'DM' }];

    setAssignedTasks({
      pre: assignTasksToChars(preTasks, selectedChars),
      during: assignTasksToChars(duringTasks, selectedChars),
      post: assignTasksToChars(postTasks, postChars)
    });
  };

  const renderTaskList = (tasks) => (
    <List disablePadding>
      {Object.entries(tasks).map(([character, characterTasks]) => (
        <CompactListItem key={character}>
          <CompactListItemText
            primary={
              <Box>
                <Typography variant="subtitle1" component="div">{character}</Typography>
                <List disablePadding>
                  {characterTasks.map((task, index) => (
                    <CompactListItem key={index}>
                      <CompactListItemText primary={`• ${task}`} />
                    </CompactListItem>
                  ))}
                </List>
              </Box>
            }
          />
        </CompactListItem>
      ))}
    </List>
  );

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
            {renderTaskList(assignedTasks.pre)}
          </Paper>

          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6">During Session Tasks</Typography>
            {renderTaskList(assignedTasks.during)}
          </Paper>

          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6">Post-Session Tasks</Typography>
            {renderTaskList(assignedTasks.post)}
          </Paper>
        </>
      )}
    </Container>
  );
};

export default Tasks;