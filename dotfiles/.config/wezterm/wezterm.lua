local wezterm = require("wezterm")
local config = wezterm.config_builder()

-- Font and ligatures
config.font = wezterm.font({
	family = "0xProto Nerd Font Mono",
	harfbuzz_features = { "calt", "clig", "liga", "zero" },
})
config.font_size = 13

-- Color scheme
-- theme from folke/tokyonight.nvim in /colors folder
config.color_scheme = "tokyonight_storm"

-- Window configuration
config.window_decorations = "INTEGRATED_BUTTONS|RESIZE"
config.window_background_opacity = 0.9
config.macos_window_background_blur = 25
config.window_padding = {
	left = 0,
	right = 0,
	top = 16,
	bottom = 0,
}

-- Hide the tab bar
config.use_fancy_tab_bar = false
config.show_tabs_in_tab_bar = false
config.show_new_tab_button_in_tab_bar = false

-- Scrollback
config.scrollback_lines = 10000

-- Hyperlink rules
config.hyperlink_rules = wezterm.default_hyperlink_rules()
-- make username/project paths clickable. this implies paths like the following are for github.
-- ( "nvim-treesitter/nvim-treesitter" | wbthomason/packer.nvim | wez/wezterm | "wez/wezterm.git" )
-- as long as a full url hyperlink regex exists above this it should not match a full url to
-- github or gitlab / bitbucket (i.e. https://gitlab.com/user/project.git is still a whole clickable url)
-- NOTE: when inside neovim, urls can be opened with Shift+click
table.insert(config.hyperlink_rules, {
	regex = [[["]?([\w\d]{1}[-\w\d]+)(/){1}([-\w\d\.]+)["]?]],
	format = "https://www.github.com/$1/$3",
})

-- Launch
config.default_prog = { "/opt/homebrew/bin/zellij", "-l", "welcome" }

return config
