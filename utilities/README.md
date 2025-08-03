# Python Utilities

This directory contains various Python utilities for database management and data processing.

## Environment Variables Required

All Python scripts in this directory require the following environment variable:

- `DB_PASSWORD`: The database password for connecting to PostgreSQL

## Setting Environment Variables

### Windows (Command Prompt)
```cmd
set DB_PASSWORD=your_password_here
python script_name.py
```

### Windows (PowerShell)
```powershell
$env:DB_PASSWORD="your_password_here"
python script_name.py
```

### Linux/Mac
```bash
export DB_PASSWORD=your_password_here
python script_name.py
```

### Using .env file
Create a `.env` file in the project root with:
```
DB_PASSWORD=your_password_here
```

Then the scripts will automatically load it using python-dotenv.

## Security Note

Never commit passwords or sensitive data to version control. Always use environment variables for credentials.