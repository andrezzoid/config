# Enable Powerlevel10k instant prompt. Should stay close to the top of ~/.zshrc.
# Initialization code that may require console input (password prompts, [y/n]
# confirmations, etc.) must go above this block; everything else may go below.
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi


## Homebrew, if I'm in MacOS
if [[ -f "/opt/homebrew/bin/brew" ]] then
  # If you're using macOS, you'll want this enabled
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi


## Exports
export PATH=/usr/local/bin:$PATH  # NOTE: For some reason this is in path in iterm2 but not in wezterm
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
  [ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && . "/opt/homebrew/opt/nvm/nvm.sh"  # This loads nvm
  [ -s "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm" ] && . "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm"  # This loads nvm bash_completion


# Set the directory we want to store zinit and plugins
ZINIT_HOME="${XDG_DATA_HOME:-${HOME}/.local/share}/zinit/zinit.git"
 
# Download Zinit, if it's not there yet
if [ ! -d "$ZINIT_HOME" ]; then
   mkdir -p "$(dirname $ZINIT_HOME)"
   git clone https://github.com/zdharma-continuum/zinit.git "$ZINIT_HOME"
fi

# Source/Load zinit
source "${ZINIT_HOME}/zinit.zsh"

# Add in Powerlevel10k
zinit ice depth=1; zinit light romkatv/powerlevel10k

# Add in zsh plugins
zinit light zsh-users/zsh-syntax-highlighting
zinit light zsh-users/zsh-completions
zinit light zsh-users/zsh-autosuggestions
zinit light Aloxaf/fzf-tab

# Load completions
autoload -Uz compinit && compinit


# Replay all cached completions https://github.com/zdharma-continuum/zinit?tab=readme-ov-file#completions-2
zinit cdreplay -q


# To customize prompt, run `p10k configure` or edit ~/.p10k.zsh.
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh


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
HISTSIZE=5000
HISTFILE=~/.zsh_history
SAVEHIST=$HISTSIZE
HISTDUP=erase                 # Erase duplicates inside history
setopt appendhistory          # Append to history rather than override
setopt sharehistory           # Share history across sessions
setopt hist_ignore_space      # Prevent command from being added to history by adding a trailing space
# Prevent duplicate commands from being saved in history
setopt hist_ignore_all_dups
setopt hist_save_no_dups
setopt hist_ignore_dups
setopt hist_find_no_dups      # Prevent duplicates from being shown in historical search


## Completion styling
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Za-z}'                      # Case insensitive completions
zstyle ':completion:*' list-colors "${(s.:.)LS_COLORS}"                     # Enable ls --color
zstyle ':completion:*' menu no                                              # Disable default menu, use Aloxaf/fzf-tab
zstyle ':fzf-tab:complete:cd:*' fzf-preview 'ls --color $realpath'          # Display Aloxaf/fzf-tab when navigating with cd
zstyle ':fzf-tab:complete:__zoxide_z:*' fzf-preview 'ls --color $realpath'  # zoxide completions
zstyle ':fzf-tab:*' fzf-command ftb-tmux-popup                              # If using >= tmux@3.2
zstyle ':fzf-tab:*' fzf-bindings 'ctrl-y:accept'                            # Map CTRL-y to accept fzf option, same as for the above autosuggest-accept


## Aliases
alias ls='ls --color -lah'
alias vim='nvim'
alias c='clear'


## Shell integrations
eval "$(fzf --zsh)"
eval "$(zoxide init --cmd cd zsh)"  # There's also the cdi alias for interactive mode

