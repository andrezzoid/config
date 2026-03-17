## Homebrew, if I'm in MacOS
if [[ -f "/opt/homebrew/bin/brew" ]] then
  # If you're using macOS, you'll want this enabled
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi


## Exports
export PATH="$HOME/.local/bin:$PATH"


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


## Shell integrations
eval "$(fzf --zsh)"
eval "$(zoxide init zsh)"  # Use z/zi commands, don't override cd (breaks Claude Code shell snapshots)
eval "$(mise activate zsh)"
eval "$(starship init zsh)"
