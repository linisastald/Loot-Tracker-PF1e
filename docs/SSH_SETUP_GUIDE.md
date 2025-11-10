# SSH Key Setup Guide for Git Push from Server

This guide will help you set up SSH authentication so the build script can automatically push version updates to GitHub.

## Step 1: Generate SSH Key on the Server

1. SSH into your TrueNAS server and navigate to your project directory:
```bash
cd /path/to/your/pathfinder/source
```

2. Generate a new SSH key (if you don't already have one):
```bash
ssh-keygen -t ed25519 -C "your-email@example.com"
```

When prompted:
- Press Enter to accept the default file location (`~/.ssh/id_ed25519`)
- Enter a passphrase (optional, but press Enter twice for no passphrase if you want automatic pushes)

3. Display your public key:
```bash
cat ~/.ssh/id_ed25519.pub
```

Copy the entire output (it starts with `ssh-ed25519` and ends with your email).

## Step 2: Add SSH Key to GitHub

1. Go to GitHub.com and log in
2. Click your profile picture (top right) → Settings
3. In the left sidebar, click "SSH and GPG keys"
4. Click "New SSH key" (green button)
5. Give it a title like "TrueNAS Build Server"
6. Paste the public key you copied in Step 1
7. Click "Add SSH key"

## Step 3: Configure Git to Use SSH

On your server, switch the repository from HTTPS to SSH:

```bash
cd /path/to/your/pathfinder/source

# Check current remote URL
git remote -v

# Change from HTTPS to SSH
git remote set-url origin git@github.com:linisastald/Loot-Tracker-PF1e.git

# Verify the change
git remote -v
# Should now show: git@github.com:linisastald/Loot-Tracker-PF1e.git
```

## Step 4: Test SSH Connection

Test that SSH authentication works:

```bash
# Test GitHub SSH connection
ssh -T git@github.com
```

You should see a message like:
```
Hi username! You've successfully authenticated, but GitHub does not provide shell access.
```

If this is your first time connecting, you'll see:
```
The authenticity of host 'github.com (xxx.xxx.xxx.xxx)' can't be established.
Are you sure you want to continue connecting (yes/no)?
```
Type `yes` and press Enter.

## Step 5: Configure Git User Information

Set up git user information if not already configured:

```bash
git config --global user.name "Your Name"
git config --global user.email "your-email@example.com"
```

## Step 6: Test with a Manual Push

Try a manual push to confirm everything works:

```bash
git push origin master
```

If successful, you should see the push complete without asking for username/password.

## Step 7: Run Build Script

Now when you run the build script:
```bash
bash build_image.sh
```

It should:
1. Pull latest code
2. Build the image
3. Update version numbers
4. Commit version changes
5. **Automatically push to GitHub** (no username prompt!)

## Troubleshooting

### Permission Denied Error
If you get "Permission denied (publickey)", ensure:
- The SSH key was added to GitHub correctly
- You're using the correct GitHub account
- The SSH agent is running: `eval $(ssh-agent -s)` then `ssh-add ~/.ssh/id_ed25519`

### Still Asking for Password
If it's still asking for a password:
- Make sure you changed the remote URL to SSH format (Step 3)
- Verify with: `git remote -v`
- Should show `git@github.com:...` not `https://github.com/...`

### Host Key Verification Failed
If you see "Host key verification failed":
```bash
ssh-keyscan github.com >> ~/.ssh/known_hosts
```

### Multiple GitHub Accounts
If you have multiple GitHub accounts, you may need to specify which key to use:
```bash
# Create/edit SSH config
nano ~/.ssh/config

# Add:
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519
```

## Security Notes

- **Never share your private key** (`~/.ssh/id_ed25519`)
- Only share the public key (`~/.ssh/id_ed25519.pub`)
- Consider using a passphrase for added security (though this will require manual entry for pushes)
- Regularly review your SSH keys on GitHub and remove any you don't recognize

## Alternative: Using Deploy Keys (Repository-Specific)

For enhanced security, you can use a deploy key that only has access to this specific repository:

1. Generate a dedicated key:
```bash
ssh-keygen -t ed25519 -f ~/.ssh/pathfinder_deploy_key -C "pathfinder-build-server"
```

2. Add to SSH config:
```bash
nano ~/.ssh/config

# Add:
Host github-pathfinder
  HostName github.com
  User git
  IdentityFile ~/.ssh/pathfinder_deploy_key
```

3. Add as deploy key on GitHub:
   - Go to your repository: https://github.com/linisastald/Loot-Tracker-PF1e
   - Settings → Deploy keys → Add deploy key
   - Check "Allow write access"
   - Add the public key

4. Update remote URL:
```bash
git remote set-url origin git@github-pathfinder:linisastald/Loot-Tracker-PF1e.git
```

This limits the key's access to only this specific repository.