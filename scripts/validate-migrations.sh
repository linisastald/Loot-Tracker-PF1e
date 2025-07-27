#!/bin/bash
# scripts/validate-migrations.sh
# Pre-commit hook to validate migration files

set -e

MIGRATION_DIR="backend/migrations"
ERRORS=0

echo "🔍 Validating migration files..."

# Check if migration directory exists
if [ ! -d "$MIGRATION_DIR" ]; then
    echo "❌ Migration directory not found: $MIGRATION_DIR"
    exit 1
fi

# Function to validate a single migration file
validate_migration() {
    local file="$1"
    local filename=$(basename "$file")
    local errors=0
    
    echo "  Checking $filename..."
    
    # Check file naming convention
    if [[ ! "$filename" =~ ^[0-9]{2}_[a-z_]+\.sql$ ]]; then
        echo "    ❌ Invalid filename format. Use: XX_description.sql"
        ((errors++))
    fi
    
    # Read file content
    local content=$(cat "$file")
    
    # Check for ON CONFLICT with CREATE TABLE IF NOT EXISTS
    if echo "$content" | grep -q "ON CONFLICT" && echo "$content" | grep -q "CREATE TABLE IF NOT EXISTS"; then
        echo "    ⚠️  Warning: ON CONFLICT used with CREATE TABLE IF NOT EXISTS"
        echo "       Consider using INSERT...WHERE NOT EXISTS pattern instead"
    fi
    
    # Check for missing IF NOT EXISTS on CREATE TABLE
    if echo "$content" | grep -E "^CREATE TABLE [^(]*\(" | grep -v "IF NOT EXISTS"; then
        echo "    ⚠️  Warning: CREATE TABLE without IF NOT EXISTS"
        echo "       Consider adding IF NOT EXISTS for idempotency"
    fi
    
    # Check for missing IF NOT EXISTS on CREATE INDEX
    if echo "$content" | grep -E "^CREATE INDEX [^(]*ON" | grep -v "IF NOT EXISTS"; then
        echo "    ⚠️  Warning: CREATE INDEX without IF NOT EXISTS"
        echo "       Consider adding IF NOT EXISTS for idempotency"
    fi
    
    # Check for DROP statements without IF EXISTS
    if echo "$content" | grep -E "^DROP (TABLE|INDEX|COLUMN)" | grep -v "IF EXISTS"; then
        echo "    ⚠️  Warning: DROP statement without IF EXISTS"
        echo "       Consider adding IF EXISTS for safety"
    fi
    
    # Check for SQL syntax (basic)
    if ! echo "$content" | grep -q ";"; then
        echo "    ❌ No semicolon found - possible incomplete SQL"
        ((errors++))
    fi
    
    # Check for comments
    if ! echo "$content" | grep -q "^--"; then
        echo "    ⚠️  Warning: No comments found"
        echo "       Consider adding descriptive comments"
    fi
    
    return $errors
}

# Validate all migration files
for file in "$MIGRATION_DIR"/*.sql; do
    if [ -f "$file" ]; then
        if ! validate_migration "$file"; then
            ((ERRORS++))
        fi
    fi
done

echo ""
if [ $ERRORS -eq 0 ]; then
    echo "✅ All migration files passed validation"
    exit 0
else
    echo "❌ Found $ERRORS error(s) in migration files"
    echo ""
    echo "Please fix the errors above before committing."
    echo "See MIGRATION_BEST_PRACTICES.md for guidelines."
    exit 1
fi
