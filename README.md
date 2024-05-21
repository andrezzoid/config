# config

Everything configuration.

# install

After getting [Homebrew](https://brew.sh/), install dependencies with:

```
brew bundle install
```

Then setup stow by running:

```
stow dotfiles/ -t ~
```

which will symlink every file in the `dotfiles/` directory to the home folder.

# backup

To backup Homebrew dependencies into `Brewfile`, run in the current directory:

```
brew bundle dump --force
```
