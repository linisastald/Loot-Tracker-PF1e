import React from 'react';
import { Box, Chip, Tooltip, Typography } from '@mui/material';
import FastfoodIcon from '@mui/icons-material/Fastfood';
import HistoryIcon from '@mui/icons-material/History';
import CampaignIcon from '@mui/icons-material/Campaign';
import PushPinIcon from '@mui/icons-material/PushPin';
import LoopIcon from '@mui/icons-material/Loop';
import PriorityHighIcon from '@mui/icons-material/PriorityHigh';
import PersonPinIcon from '@mui/icons-material/PersonPin';
import type { TaskDefinition } from '../../../types/sessionTasks';

interface TaskMetaChipsProps {
  task: TaskDefinition;
  /** Display name for a fixed assignee. */
  characterName: (id: number) => string;
}

/** The description and option chips shown under a task in the list. */
const TaskMetaChips: React.FC<TaskMetaChipsProps> = ({
  task,
  characterName,
}) => {
  const label = task.announce_label;
  const isSnack = label !== null && /snack/i.test(label);
  return (
    <Box>
      {task.description && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          {task.description}
        </Typography>
      )}
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
        {!task.is_active && (
          <Chip
            size="small"
            color="default"
            variant="outlined"
            label="Inactive"
          />
        )}
        {task.quantity > 1 && (
          <Chip size="small" label={`${task.quantity} copies`} />
        )}
        {task.min_characters != null && (
          <Chip
            size="small"
            variant="outlined"
            label={`${task.min_characters}+ characters`}
          />
        )}
        {task.max_characters != null && (
          <Chip
            size="small"
            variant="outlined"
            label={`up to ${task.max_characters} characters`}
          />
        )}
        {task.exclude_late && (
          <Chip
            size="small"
            variant="outlined"
            color="warning"
            label="Not late arrivals"
          />
        )}
        {task.exclude_early && (
          <Chip
            size="small"
            variant="outlined"
            color="warning"
            label="Not early leavers"
          />
        )}
        {task.dm_eligible && (
          <Chip size="small" variant="outlined" label="DM can draw" />
        )}
        {task.requires_previous_attendance && (
          <Tooltip title="Only dealt to characters who were at the last session">
            <Chip
              size="small"
              color="info"
              variant="outlined"
              icon={<HistoryIcon />}
              label="Was at last session"
            />
          </Tooltip>
        )}
        {task.fixed_character_id != null && (
          <Tooltip title="Always goes to this character when they are present and eligible">
            <Chip
              size="small"
              color="primary"
              variant="outlined"
              icon={<PersonPinIcon />}
              label={`Always ${characterName(task.fixed_character_id)}`}
            />
          </Tooltip>
        )}
        {task.sticky && (
          <Tooltip title="Whoever drew it last session keeps it while they are present">
            <Chip
              size="small"
              variant="outlined"
              icon={<PushPinIcon />}
              label="Sticky"
            />
          </Tooltip>
        )}
        {task.avoid_repeat && (
          <Tooltip title="Never dealt to whoever had it last session">
            <Chip
              size="small"
              variant="outlined"
              icon={<LoopIcon />}
              label="Rotates"
            />
          </Tooltip>
        )}
        {task.priority === 1 && (
          <Chip
            size="small"
            variant="outlined"
            icon={<PriorityHighIcon />}
            label="High priority"
          />
        )}
        {task.priority === 2 && (
          <Chip
            size="small"
            color="error"
            variant="outlined"
            icon={<PriorityHighIcon />}
            label="Dealt first"
          />
        )}
        {label && (
          <Tooltip
            title={`Whoever draws this task is announced as "${label}" for the next session`}
          >
            <Chip
              size="small"
              color="secondary"
              icon={isSnack ? <FastfoodIcon /> : <CampaignIcon />}
              label={`Announces ${label}`}
            />
          </Tooltip>
        )}
      </Box>
    </Box>
  );
};

export default TaskMetaChips;
