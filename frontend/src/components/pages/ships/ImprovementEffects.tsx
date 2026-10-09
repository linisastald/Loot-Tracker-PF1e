import React from 'react';
import { Box, Chip, Typography } from '@mui/material';

export interface ImprovementInfo {
  name: string;
  description: string;
  effects: Record<string, string | number | boolean>;
}

interface ImprovementEffectsProps {
  improvement: ImprovementInfo;
  /** Space under the description (MUI spacing units). */
  descriptionSpacing?: number;
}

/** Description plus mechanical effect chips of a ship improvement. */
const ImprovementEffects: React.FC<ImprovementEffectsProps> = ({ improvement, descriptionSpacing = 1 }) => (
  <>
    <Typography variant="body2" sx={{ color: 'text.secondary', mb: descriptionSpacing }}>
      {improvement.description}
    </Typography>
    {Object.keys(improvement.effects).length > 0 && (
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Effects:</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {Object.entries(improvement.effects).map(([effect, value]) => (
            <Chip
              key={effect}
              label={`${effect.replace(/_/g, ' ')}: ${value}`}
              size="small"
              color="primary"
              variant="outlined"
            />
          ))}
        </Box>
      </Box>
    )}
  </>
);

export default ImprovementEffects;
