# config

Everything configuration.

## New machine setup

### 1. Install Homebrew

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
eval "$(/opt/homebrew/bin/brew shellenv)"
```

### 2. Sign into 1Password

Install and sign into 1Password, then enable the SSH agent under Settings > Developer > SSH Agent.

Create the SSH config so git can use the 1Password agent:

```bash
mkdir -p ~/.ssh
cat > ~/.ssh/config << 'EOF'
Host *
  IdentityAgent "~/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock"
EOF
```

### 3. Register SSH key with GitHub

If this is a new device, generate a new Ed25519 SSH key in 1Password and add it to GitHub:

```bash
brew install gh
gh auth login
```

Copy the public key from 1Password, then:

```bash
pbpaste > /tmp/key.pub
gh ssh-key add /tmp/key.pub --title "Device Name"
rm /tmp/key.pub
```

### 4. Clone and run

```bash
git clone git@github.com:andrezzoid/config.git ~/Projects/config
cd ~/Projects/config
./setup.sh
```

### 5. Manual steps

- Sign into browsers, Slack, Discord, Figma, Notion, Obsidian, etc.
- Import Raycast settings
- Import Karabiner config
- Set default apps

## Linking dotfiles

After making changes to dotfiles, re-run stow to update symlinks:

```bash
stow dotfiles/ -t ~
```

This will symlink every file in the `dotfiles/` directory to the home folder.

## Backup

To backup Homebrew dependencies into `Brewfile`, run in the current directory:

```bash
brew bundle dump --force
```

Note: this captures all packages including transitive dependencies. Review and trim before committing.
