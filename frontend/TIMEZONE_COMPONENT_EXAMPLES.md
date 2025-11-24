# Timezone Component Update Examples

This document provides complete examples of how to update components to use campaign timezone.

## Example 1: GoldTransactions.tsx (Partial Update)

### Changes Required

**Line 31-32**: Add timezone imports
```typescript
import { useCampaignTimezone } from '../../hooks/useCampaignTimezone';
import { formatInCampaignTimezone } from '../../utils/timezoneUtils';
```

**Line 120-121**: Add timezone hook after state declarations
```typescript
// Get campaign timezone
const { timezone } = useCampaignTimezone();
```

**Line 282-285**: Update formatDate callback
```typescript
// OLD:
const formatDate = useCallback((dateString: string) => {
    const options: Intl.DateTimeFormatOptions = {year: 'numeric', month: 'long', day: 'numeric'};
    return new Date(dateString).toLocaleDateString(undefined, options);
}, []);

// NEW:
const formatDate = useCallback((dateString: string) => {
    return formatInCampaignTimezone(dateString, timezone, 'PP');
}, [timezone]);
```

**Result**: All `session_date` values in the transaction history table will display in campaign timezone

---

## Example 2: SoldLoot.tsx (Complete Pattern)

### Full Updated Imports Section

```typescript
import React, {useEffect, useState} from 'react';
import api from '../../../utils/api';
import {
  Collapse,
  Container,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import {KeyboardArrowDown, KeyboardArrowUp} from '@mui/icons-material';
import { useCampaignTimezone } from '../../../hooks/useCampaignTimezone';
import { formatDateOnly } from '../../../utils/timezoneUtils';
```

### Add Hook in Component

```typescript
const SoldLoot = () => {
    const [soldSummary, setSoldSummary] = useState([]);
    const [soldDetails, setSoldDetails] = useState({});
    const [openItems, setOpenItems] = useState({});

    // Add campaign timezone
    const { timezone } = useCampaignTimezone();

    // ... rest of component
```

### Update Table Cell Renders

**Line 132** (showing sold date):
```typescript
// OLD:
<TableCell>{formatDate(item.soldon)}</TableCell>

// NEW:
<TableCell>{formatDateOnly(item.soldon, timezone)}</TableCell>
```

**Line 161** (showing session date in details):
```typescript
// OLD:
<TableCell>{formatDate(detail.session_date)}</TableCell>

// NEW:
<TableCell>{formatDateOnly(detail.session_date, timezone)}</TableCell>
```

---

## Example 3: Infamy.tsx (Local Function Pattern)

### Add Imports

```typescript
import { useCampaignTimezone } from '../../hooks/useCampaignTimezone';
import { formatInCampaignTimezone } from '../../utils/timezoneUtils';
```

### Add Hook

```typescript
const Infamy: React.FC = () => {
    // ... existing state
    const { timezone } = useCampaignTimezone();
    // ... rest of component
```

### Update formatDate Function (around line 566)

```typescript
// OLD:
const formatDate = (dateString) => {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
};

// NEW:
const formatDate = (dateString) => {
    return formatInCampaignTimezone(dateString, timezone, 'PP');
};
```

---

## Example 4: OutpostManagement.tsx (Similar Pattern)

### Add Imports

```typescript
import { useCampaignTimezone } from '../../hooks/useCampaignTimezone';
import { formatDateOnly } from '../../utils/timezoneUtils';
```

### Add Hook

```typescript
const { timezone } = useCampaignTimezone();
```

### Update formatDate Function (around line 159)

```typescript
// OLD:
const formatDate = (dateString) => {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
};

// NEW:
const formatDate = (dateString) => {
    return formatDateOnly(dateString, timezone);
};
```

---

## Example 5: CustomLootTable.jsx (Needs Conversion to TypeScript)

This component is currently `.jsx` and should be converted to `.tsx` for better type safety when adding timezone support.

### Pattern to Follow

```jsx
import { useCampaignTimezone } from '../../hooks/useCampaignTimezone';
import { formatDateOnly } from '../../utils/timezoneUtils';

const CustomLootTable = (props) => {
    const { timezone } = useCampaignTimezone();

    // When rendering session_date or lastupdate columns:
    return (
        <TableCell>
            {formatDateOnly(item.session_date, timezone)}
        </TableCell>
    );
};
```

---

## Common Patterns Summary

### Pattern 1: useCallback with formatDate

When there's a memoized formatDate function:

```typescript
const formatDate = useCallback((dateString: string) => {
    return formatInCampaignTimezone(dateString, timezone, 'PP');
}, [timezone]);
```

### Pattern 2: Simple function

When there's a regular formatDate function:

```typescript
const formatDate = (dateString) => {
    return formatDateOnly(dateString, timezone);
};
```

### Pattern 3: Inline rendering

When dates are rendered directly in JSX:

```typescript
// OLD:
<TableCell>{new Date(item.created_at).toLocaleDateString()}</TableCell>

// NEW:
<TableCell>{formatDateOnly(item.created_at, timezone)}</TableCell>
```

### Pattern 4: With time display

When you need to show time along with date:

```typescript
// Date and time
{formatInCampaignTimezone(item.session_date, timezone, 'PPpp')}

// Date, time, and timezone
{formatInCampaignTimezone(item.session_date, timezone, 'PPpp z')}
```

---

## Error Handling

### Optional: Handle loading state

```typescript
const { timezone, loading, error } = useCampaignTimezone();

if (loading) {
    return <CircularProgress />;
}

if (error) {
    // Fallback to showing dates without timezone context
    // or show error message
}

// Proceed with normal rendering using timezone
```

### Minimal: Use hook without loading state

```typescript
// timezone defaults to 'America/New_York' even if fetch fails
const { timezone } = useCampaignTimezone();

// Proceed directly - loading handled in background
```

---

## Testing Each Update

After updating a component:

1. **Visual Check**: Verify dates display correctly
2. **Console Check**: No errors or warnings
3. **Timezone Test**: Change campaign timezone and verify dates update
4. **Sorting Test**: Ensure date sorting still works correctly
5. **Filter Test**: If dates are filterable, ensure filters work

---

## Quick Reference

| Use Case | Function to Use | Format Pattern |
|----------|----------------|----------------|
| Date only | `formatDateOnly(date, timezone)` | `'PP'` |
| Date + time | `formatInCampaignTimezone(date, timezone, 'PPpp')` | `'PPpp'` |
| With TZ abbr | `formatInCampaignTimezone(date, timezone, 'PPpp z')` | `'PPpp z'` |
| Time only | `formatTimeOnly(date, timezone)` | `'p'` |
| Custom | `formatInCampaignTimezone(date, timezone, pattern)` | Any valid pattern |

