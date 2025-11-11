# Build Script Improvements

## Overview
Updated `build_image.sh` to implement a development-focused Docker build workflow with proper stable release management.

## Key Changes

### 🚧 Default Behavior (Dev/Unstable)
**Command:** `./build_image.sh` (no flags)

- **Target:** `pathfinder-loot:dev`
- **Git Pull:** ✅ Always pulls latest code from master
- **Cache:** ❌ Always builds with `--no-cache` for fresh builds
- **Use Case:** Development, testing latest features

### 🏗️ Stable Build Mode
**Command:** `./build_image.sh --stable`

- **Target:** `pathfinder-loot:latest`
- **Git Pull:** ❌ Uses current local code (no automatic pull)
- **Cache:** ❌ Builds with `--no-cache` for reproducible builds
- **Versioning:** Archives previous `latest` image with timestamp/commit
- **Use Case:** Production releases from tested code

### 📦 Archive System
When building `--stable` with `latest` tag:
1. Checks for existing `pathfinder-loot:latest`
2. Archives it as `pathfinder-loot:stable-YYYYMMDD-HHMMSS-{commit}`
3. Builds new `latest` image
4. Provides clear versioning for rollbacks

## New Features

### 🏷️ Enhanced Metadata
- **Build Date:** ISO 8601 timestamp
- **Git Commit:** Short commit hash
- **Build Type:** `dev` or `stable`
- **OCI Labels:** Standard container metadata

### 📋 Improved Output
- Clear build type indication with emojis
- Detailed configuration summary
- Helpful command suggestions
- Better error messaging
- Success/failure status with troubleshooting tips

### ⚙️ Flexible Options
- `--keep-cache`: Override default no-cache behavior
- `--tag TAG`: Custom tag override
- `--stable`: Switch to stable build mode
- Comprehensive `--help` documentation

## Usage Examples

```bash
# Development workflow (default)
./build_image.sh                    # Fresh dev build with latest code

# Stable release workflow
./build_image.sh --stable           # Stable build from current local code
./build_image.sh --stable --tag v2.1.0  # Tagged stable release

# Cache optimization (if needed)
./build_image.sh --keep-cache       # Dev build with cache
./build_image.sh --stable --keep-cache  # Stable build with cache
```

## Workflow Benefits

### For Development
- **Always Fresh:** No-cache ensures all changes are included
- **Latest Code:** Automatic git pull gets newest features
- **Fast Iteration:** Simple `./build_image.sh` command
- **Clear Identification:** `dev` tag distinguishes from production

### For Production
- **Controlled Releases:** No automatic git pull prevents surprises
- **Version Management:** Automatic archival of previous releases
- **Rollback Capability:** Timestamped archive images
- **Reproducible Builds:** No-cache ensures consistent builds

### For Operations
- **Image Metadata:** Build info embedded in container labels
- **Clear Documentation:** Comprehensive help and examples
- **Error Handling:** Better troubleshooting information
- **Safety Measures:** Archive before overwriting stable images

## Migration from Old Script

### Old Usage → New Usage
```bash
# Old: Basic build
./build_image.sh
# New: Dev build (same result but clearer intent)
./build_image.sh

# Old: No-cache build
./build_image.sh --no-cache
# New: Default behavior (no flag needed)
./build_image.sh

# Old: Skip pull
./build_image.sh --skip-pull
# New: Stable build (better semantics)
./build_image.sh --stable

# Old: Custom tag
./build_image.sh --tag custom
# New: Same syntax
./build_image.sh --tag custom
```

## Safety Improvements

1. **Archive System:** Previous stable images are preserved
2. **Metadata Tracking:** Build info embedded for debugging
3. **Clear Intent:** Explicit dev vs stable modes
4. **Better Validation:** Improved error handling and messages
5. **Documentation:** Comprehensive help and examples

The updated script provides a robust, development-focused workflow while maintaining safety and traceability for production releases.