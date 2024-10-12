import React, { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Typography,
  Switch,
  Button,
  List,
  ListItem,
  ListItemText,
  FormGroup,
  FormControlLabel,
  Box,
  Snackbar
} from '@mui/material';
import { styled } from '@mui/material/styles';
import api from '../../utils/api';

const COLORS = {
  PRE_SESSION: 8311585,  // Purple
  DURING_SESSION: 16776960,  // Yellow
  POST_SESSION: 16711680  // Red
};

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
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

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
      showSnackbar('Error fetching active characters');
    }
  };

  const handleToggle = (id) => {
    setSelectedCharacters(prev => ({ ...prev, [id]: !prev[id] }));
  };
  const createEmbed = (title, description, fields, color) => ({
    embeds: [{
      title,
      description,
      fields,
      color,
      author: {
        name: "Task Assignments"
      }
    }]
  });
  const formatTasksForEmbed = (tasks) => {
    return Object.entries(tasks).map(([character, characterTasks]) => ({
      name: character,
      value: characterTasks.map(task => `• ${task}`).join('\n'),
      inline: false
    }));
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

      if (tasks.length === charCount) {
        adjustedTasks = shuffleArray(adjustedTasks);
      } else if (tasks.length > charCount) {
        while (adjustedTasks.length < charCount * 2) {
          adjustedTasks.push('Free Space');
        }
        adjustedTasks = shuffleArray(adjustedTasks);
      } else {
        while (adjustedTasks.length < charCount) {
          adjustedTasks.push('Free Space');
        }
        adjustedTasks = shuffleArray(adjustedTasks);
      }

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


  const formatTaskSection = (tasks) => {
    return Object.entries(tasks).map(([character, characterTasks]) => {
      return `${character}:\n${characterTasks.map(task => `• ${task}`).join('\n')}\n`;
    }).join('\n');
  };

  const sendToDiscord = async () => {
    try {
      if (!assignedTasks) {
        showSnackbar('No tasks assigned yet. Please assign tasks first.');
        return;
      }

      const preSessionEmbed = createEmbed(
          "Pre-Session Tasks:",
          "",
          formatTasksForEmbed(assignedTasks.pre),
          COLORS.PRE_SESSION
      );

      const duringSessionEmbed = createEmbed(
          "During Session Tasks:",
          "",
          formatTasksForEmbed(assignedTasks.during),
          COLORS.DURING_SESSION
      );

      const postSessionEmbed = createEmbed(
          "Post-Session Tasks:",
          "",
          formatTasksForEmbed(assignedTasks.post),
          COLORS.POST_SESSION
      );

      const embeds = [preSessionEmbed, duringSessionEmbed, postSessionEmbed];

      await api.post('/discord/send-message', {embeds});
      showSnackbar('Tasks sent to Discord successfully!');
    } catch (error) {
      console.error('Error sending tasks to Discord:', error);
      showSnackbar('Failed to send tasks to Discord. Please try again.');
    }
  };

  const showSnackbar = (message) => {
    setSnackbarMessage(message);
    setSnackbarOpen(true);
  };

  const handleSnackbarClose = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setSnackbarOpen(false);
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

          <Button variant="contained" onClick={sendToDiscord} sx={{mt: 2}}>
            Send to Discord
          </Button>
        </>
      )}

      <Snackbar
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'left',
          }}
          open={snackbarOpen}
          autoHideDuration={6000}
          onClose={handleSnackbarClose}
          message={snackbarMessage}
      />
    </Container>
  );
};

export default Tasks;