@echo off
REM Apply password reset tokens migration

echo Applying password reset tokens migration...

REM Set database connection details (update these with your actual values)
set DB_HOST=localhost
set DB_PORT=5432
set DB_USER=loot_user
set DB_NAME=loot_tracking

REM Run the migration (you'll be prompted for password)
psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -f ..\database\migrations\001_add_password_reset_tokens.sql

echo Migration complete!
pause
