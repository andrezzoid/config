#!/bin/bash
set -e

echo "=== macOS Setup ==="

# Homebrew
if ! command -v brew &>/dev/null; then
  echo "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$(/opt/homebrew/bin/brew shellenv zsh)"
fi

# Packages
echo "Installing packages..."
brew bundle install

# Dotfiles
echo "Linking dotfiles..."
stow dotfiles/ -t ~

# Launch agents
echo "Loading launch agents..."
for plist in dotfiles/Library/LaunchAgents/*.plist; do
  label=$(/usr/libexec/PlistBuddy -c "Print :Label" "$plist")
  if ! launchctl list "$label" &>/dev/null; then
    launchctl load "$HOME/Library/LaunchAgents/$(basename "$plist")"
    echo "  Loaded $label"
  else
    echo "  $label already loaded"
  fi
done

# macOS preferences
if [ -f defaults.sh ]; then
  echo "Applying macOS preferences..."
  bash defaults.sh
fi

# Podman machine setup
if command -v podman &>/dev/null; then
  podman machine init 2>/dev/null
  podman machine start 2>/dev/null
fi

echo ""
echo "=== Done! Manual steps remaining ==="
echo "  1. Sign into 1Password"
echo "  2. Enable 1Password SSH agent (Settings > Developer > SSH Agent)"
echo "  3. Sign into: browsers, Slack, Discord, Figma, Notion, etc."
echo "  4. Set default apps"
echo "  5. Install tooling:"
echo "		mise use --global node@lts"
