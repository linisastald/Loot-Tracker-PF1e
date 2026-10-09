// frontend/src/components/common/PasswordField.tsx
import React, { useState } from 'react';
import { IconButton, InputAdornment, TextField } from '@mui/material';
import type { TextFieldProps } from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';

/**
 * Password input with a show/hide toggle. Owns its own visibility state and
 * forwards every other TextField prop.
 */
const PasswordField: React.FC<Omit<TextFieldProps, 'type'>> = ({ slotProps, ...props }) => {
    const [visible, setVisible] = useState(false);

    return (
        <TextField
            {...props}
            type={visible ? 'text' : 'password'}
            slotProps={{
                ...slotProps,
                input: {
                    endAdornment: (
                        <InputAdornment position="end">
                            <IconButton
                                aria-label={visible ? 'Hide password' : 'Show password'}
                                onClick={() => setVisible((v) => !v)}
                                edge="end"
                            >
                                {visible ? <VisibilityOff /> : <Visibility />}
                            </IconButton>
                        </InputAdornment>
                    ),
                },
            }}
        />
    );
};

export default PasswordField;
