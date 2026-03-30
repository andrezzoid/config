#!/bin/bash
# macOS preferences
# Add defaults write commands here as you customize settings.
# Tip: diff `defaults read` before and after changing a setting to find the command.

# Window management
defaults write -g NSWindowShouldDragOnGesture -bool true          # Drag windows from anywhere with Ctrl+Cmd+drag
defaults write -g NSAutomaticWindowAnimationsEnabled -bool false   # Disable window opening animations
# Disable the press-and-hold popup (so regular key repeat works)
defaults write -g ApplePressAndHoldEnabled -bool false
