import React from 'react';
import { Grid, TextField } from '@mui/material';
import { SessionDefaults, TIMING_FIELDS } from './sessionConfig';

interface SessionTimingFieldsProps {
    values: SessionDefaults;
    onChange: (values: SessionDefaults) => void;
    /** 'defaults' labels the fields "Default ..." and uses the shorter helper texts. */
    variant: 'create' | 'defaults';
}

/** The minimum-players and announce/reminder/confirmation hour inputs. */
const SessionTimingFields: React.FC<SessionTimingFieldsProps> = ({ values, onChange, variant }) => (
    <Grid container spacing={3}>
        {TIMING_FIELDS.map(field => (
            <Grid key={field.key} size={{ xs: 12, md: 6 }}>
                <TextField
                    label={variant === 'defaults' ? `Default ${field.label}` : field.label}
                    type="number"
                    fullWidth
                    value={values[field.key]}
                    onChange={(e) =>
                        onChange({ ...values, [field.key]: Math.max(1, parseInt(e.target.value, 10) || field.fallback) })
                    }
                    slotProps={{ htmlInput: { min: 1, max: field.max } }}
                    helperText={variant === 'defaults' ? field.defaultsHelper : field.createHelper}
                />
            </Grid>
        ))}
    </Grid>
);

export default SessionTimingFields;
