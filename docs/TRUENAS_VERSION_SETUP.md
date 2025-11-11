# TrueNAS App Version Setup Guide

This guide explains how to set up automatic version display in TrueNAS for the Pathfinder Loot Tracker app.

## Overview

The build script now automatically updates the `app-metadata.yaml` file with the current version, which TrueNAS can use to display proper version information instead of "vcustom" and "v1.0.0".

## Automatic Version Updates

When you run the build script, it will now:
1. Update `app-metadata.yaml` with the current version
2. Commit and push the changes to GitHub
3. Keep all version files synchronized

## TrueNAS Integration Steps

### 1. Copy the Metadata File

After building your image, copy the `app-metadata.yaml` file to your TrueNAS custom app configuration:

```bash
# On your TrueNAS server, copy the metadata file
cp /path/to/your/pathfinder/source/app-metadata.yaml /mnt/your-pool/ix-applications/custom/pathfinder-loot/
```

### 2. Update Your TrueNAS Custom App Configuration

In your TrueNAS custom app settings, reference the metadata file:

```yaml
# In your TrueNAS custom app configuration
metadata:
  file: app-metadata.yaml
```

Or manually set the version in your TrueNAS app configuration:

```yaml
# Alternative: Direct version specification
app_version: "0.8.1"  # This will be auto-updated by the build script
version: "0.8.1"      # This will be auto-updated by the build script
```

### 3. Restart the App

After updating the metadata:
1. Stop the Pathfinder Loot Tracker app in TrueNAS
2. Start it again
3. Check the app info widget - it should now show the correct version

## File Structure

The `app-metadata.yaml` contains:

```yaml
app_metadata:
  name: "Pathfinder Loot Tracker"
  version: "0.8.1"           # Auto-updated by build script
  app_version: "0.8.1"       # Auto-updated by build script
  description: "Pathfinder 1e loot and campaign management system"
  source: "https://github.com/linisastald/Loot-Tracker-PF1e"
  # ... other metadata
```

## Automation Workflow

1. **Developer side**: Run `bash build_image.sh`
2. **Build script**:
   - Increments version (e.g., 0.8.1 → 0.8.2)
   - Updates `app-metadata.yaml` automatically
   - Commits and pushes changes
3. **Server side**: Pull latest changes and rebuild
4. **TrueNAS**: Displays correct version in app widget

## Verification

After setup, your TrueNAS app widget should show:
- **App Version**: `v0.8.1` (instead of `vcustom`)
- **Version**: `v0.8.1` (instead of `v1.0.0`)

## Troubleshooting

### Version Not Updating
- Ensure the `app-metadata.yaml` file exists in your app directory
- Verify TrueNAS is reading the metadata file correctly
- Check that the app was restarted after updating metadata

### "vcustom" Still Showing
- Make sure you're referencing the metadata file in your TrueNAS app configuration
- Verify the metadata file has the correct permissions (readable by TrueNAS)

### Version Mismatch
- Run `git pull` on your server to get the latest metadata updates
- Rebuild the Docker image to ensure version consistency

## Development vs Production

The metadata file supports different configurations:

```yaml
environments:
  production:
    rotr:
      app_version: "0.8.1"     # Production version
      train: "stable"
    sns:
      app_version: "0.8.1"     # Production version
      train: "stable"
  development:
    test:
      app_version: "dev"       # Development version
      train: "unstable"
```

Choose the appropriate environment configuration based on your deployment type.