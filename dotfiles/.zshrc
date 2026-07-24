## Homebrew, if I'm in MacOS
if [[ -f "/opt/homebrew/bin/brew" ]] then
  # If you're using macOS, you'll want this enabled
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi


## Exports
export XDG_CONFIG_HOME="$HOME/.config" # some macOS apps (e.g. lazygit) ignore ~/.config without this
export EDITOR="nvim"
export VISUAL="$EDITOR"
export PATH="$HOME/.local/bin:$PATH"
export PATH="/Users/andrejonas/.bun/bin:$PATH" # For bun executables


## Completions
fpath=("$HOME/.zsh/completions" $HOMEBREW_PREFIX/share/zsh-completions $fpath)
autoload -Uz compinit && compinit -u


## Plugins (installed via Homebrew)
source $HOMEBREW_PREFIX/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
source $HOMEBREW_PREFIX/share/zsh-autosuggestions/zsh-autosuggestions.zsh
source $HOMEBREW_PREFIX/share/fzf-tab/fzf-tab.zsh


## Keybindings
bindkey -v
bindkey '^y' autosuggest-accept       # Accept items from zsh-autosuggestions
bindkey '^p' history-search-backward  # Go backwards in history
bindkey '^n' history-search-forward   # Go forward in history


## Change cursor shape for different vi modes.
# I have no idea what this is doing, took it from https://gist.github.com/LukeSmithxyz/e62f26e55ea8b0ed41a65912fbebbe52
export KEYTIMEOUT=1
function zle-keymap-select {
  if [[ ${KEYMAP} == vicmd ]] ||
     [[ $1 = 'block' ]]; then
    echo -ne '\e[1 q'
  elif [[ ${KEYMAP} == main ]] ||
       [[ ${KEYMAP} == viins ]] ||
       [[ ${KEYMAP} = '' ]] ||
       [[ $1 = 'beam' ]]; then
    echo -ne '\e[5 q'
  fi
}
zle -N zle-keymap-select
zle-line-init() {
    zle -K viins # initiate `vi insert` as keymap (can be removed if `bindkey -V` has been set elsewhere)
    echo -ne "\e[5 q"
}
zle -N zle-line-init
echo -ne '\e[5 q' # Use beam shape cursor on startup.
preexec() { echo -ne '\e[5 q' ;} # Use beam shape cursor for each new prompt.


## History
HISTSIZE=50000
HISTFILE=~/.zsh_history
SAVEHIST=$HISTSIZE
setopt appendhistory          # Append to history rather than override
setopt sharehistory           # Share history across sessions
setopt hist_ignore_space      # Prevent command from being added to history by adding a trailing space
# Prevent duplicate commands from being saved in history
setopt hist_ignore_all_dups
setopt hist_save_no_dups
setopt hist_find_no_dups      # Prevent duplicates from being shown in historical search


## Completion styling
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Za-z}'                      # Case insensitive completions
zstyle ':completion:*' list-colors "${(s.:.)LS_COLORS}"                     # Enable ls --color
zstyle ':completion:*' menu no                                              # Disable default menu, use Aloxaf/fzf-tab
zstyle ':fzf-tab:complete:*:*' fzf-preview 'bat --color=always --style=numbers --line-range=:200 $realpath 2>/dev/null || eza --icons --color=always $realpath'
# zstyle ':fzf-tab:*' fzf-command ftb-tmux-popup                              # If using >= tmux@3.2
zstyle ':fzf-tab:*' fzf-bindings 'ctrl-y:accept'                            # Map CTRL-y to accept fzf option, same as for the above autosuggest-accept


## Aliases
alias ls='eza -lah --icons --git'
alias tree='eza --tree --icons'
alias vim='nvim'
alias c='clear'
alias docker='podman'
alias docker-compose='podman compose'


## Functions
lfg() {
    local branch="$1"
    local prompt="$2"

    # Create worktree (--no-cd keeps current tab in place)
    wt switch -c "$branch" --no-cd
    # Resolve worktree path in a subshell
    local wt_path
    wt_path="$(wt switch "$branch" -y >&2 && pwd)"

    local tmpfile=$(mktemp /tmp/lfg-XXXXXX.kdl)
    WT_PROMPT="$prompt" envsubst '$WT_PROMPT' \
        < "${XDG_CONFIG_HOME:-$HOME/.config}/zellij/layouts/worktrunk_ide.kdl" > "$tmpfile"
    zellij action new-tab --layout "$tmpfile" --cwd "$wt_path" --name "$branch"
    rm -f "$tmpfile"
}

# Recover magicnas shares when SMB wedges the automounts (ops fail with
# EPERM or "No locks available"). Two failure modes, both handled:
#  - dead mounted session: owner can force-unmount without sudo, autofs
#    remounts fresh on the re-trigger;
#  - kernel session zombie-looping in reconnect (boot/wake races): automount
#    triggers keep joining the zombie and failing, so establish a fresh
#    session via the NetFS path (same door Finder uses), which the
#    re-triggered automounts then ride. Unmount the /Volumes side only
#    after re-triggering, so the healthy session stays referenced.
nasfix() {
    local s
    for s in home Family Singular; do
        diskutil unmount force "$HOME/magicnas/$s" 2>/dev/null
    done
    osascript -e 'mount volume "smb://andre@magicnas._smb._tcp.local/home"' >/dev/null 2>&1
    for s in home Family Singular; do
        command ls "$HOME/magicnas/$s" >/dev/null 2>&1 \
            && echo "$s: mounted" || echo "$s: FAILED (NAS down?)"
    done
    diskutil unmount /Volumes/home >/dev/null 2>&1
}

# Claude Code on Codex models via CLIProxyAPI (needs `brew services start cliproxyapi`).
# Override the model per-call (`claude-codex --model gpt-5.5`) or mid-session (`/model`).
# Effort dial: gpt-5.6-sol-{low,medium,high,xhigh} aliases defined in cliproxyapi.conf;
# plain gpt-5.6-sol resolves to xhigh (Claude Code's adaptive thinking maps there).
claude-codex() {
    ANTHROPIC_BASE_URL="http://127.0.0.1:8317" \
    ANTHROPIC_AUTH_TOKEN="$(< ~/.cli-proxy-api/.local-api-key)" \
    ANTHROPIC_MODEL="gpt-5.6-sol" \
    ANTHROPIC_DEFAULT_HAIKU_MODEL="gpt-5.4-mini" \
    claude "$@"
}


## Shell integrations
eval "$(fzf --zsh)"
eval "$(zoxide init zsh)"  # Use z/zi commands, don't override cd (breaks Claude Code shell snapshots)
eval "$(mise activate zsh)"
eval "$(starship init zsh)"

if command -v wt >/dev/null 2>&1; then eval "$(command wt config shell init zsh)"; fi

# Vite+ bin (https://viteplus.dev)
if [ -f "$HOME/.vite-plus/env" ]; then source "$HOME/.vite-plus/env"; fi
