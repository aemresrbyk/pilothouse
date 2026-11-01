# Homebrew cask for the aemresrbyk/homebrew-tap repo (copy to Casks/pilothouse.rb there).
# Always points at the latest GitHub release; the app updates itself (electron-updater), so no per-release edits.
cask "pilothouse" do
  arch arm: "arm64", intel: "x64"

  version :latest
  sha256 :no_check

  url "https://github.com/aemresrbyk/pilothouse/releases/latest/download/Pilothouse-#{arch}-mac.zip"
  name "Pilothouse"
  desc "Tabbed terminal cockpit for Claude Code, Codex and other AI coding agents"
  homepage "https://github.com/aemresrbyk/pilothouse"

  auto_updates true
  depends_on macos: ">= :monterey"

  app "Pilothouse.app"

  zap trash: [
    "~/.pilothouse",
    "~/Library/Application Support/Pilothouse",
    "~/Library/Preferences/com.aemresrbyk.pilothouse.plist",
  ]
end
