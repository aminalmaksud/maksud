# Mac Cleaner

A small native SwiftUI app that finds caches, logs, developer leftovers and large files, then removes the ones you pick.

## Build & run

You need macOS 13 (Ventura) or newer and Xcode or the Command Line Tools (`xcode-select --install`).

```bash
cd MacCleaner
./build-app.sh
open "build/Mac Cleaner.app"     # or drag it into /Applications
```

For a quick test without building the app bundle, run `swift run`. You can also open `Package.swift` in Xcode and press Run.

## What it cleans

| Category | Location | Pre-selected |
|---|---|---|
| App Caches | `~/Library/Caches` | ✅ |
| Logs & Crash Reports | `~/Library/Logs` | ✅ |
| Xcode DerivedData | `~/Library/Developer/Xcode/DerivedData` | ✅ |
| Xcode Device Support | `~/Library/Developer/Xcode/*OS DeviceSupport` | ✅ |
| Simulator Caches | `~/Library/Developer/CoreSimulator/Caches` | ✅ |
| Mail Attachments Cache | `~/Library/Containers/com.apple.mail/.../Mail Downloads` | ✅ |
| Developer Package Caches | `~/.npm`, `~/.cache`, `~/.gradle/caches`, Cargo, Go, Dart | review |
| Xcode Archives | `~/Library/Developer/Xcode/Archives` | review |
| iPhone & iPad Backups | `~/Library/Application Support/MobileSync/Backup` | review |
| Old Downloads | `~/Downloads`, untouched for 90+ days | review |
| Trash | `~/.Trash` | review |

The **Large Files** tab searches your home folder for big files (100 MB to 5 GB and up). It skips `~/Library` and the inside of app/Photos bundles.

## Safety

- It only deletes items *inside* these folders, never the folders themselves, and refuses any path outside your home folder.
- By default, items go to the **Trash**, so you can restore them. That space comes back once you empty the Trash, which you can do from the Trash category. Turn on **Delete permanently** to skip the Trash.
- Quit apps before cleaning their caches. Running apps may hold files open or recreate them right away.
- System folders (`/Library`, `/System`, `/private/var`) are left alone on purpose. Cleaning them needs admin rights and is easy to get wrong.

## Full Disk Access

macOS hides some folders (Trash, Mail, device backups) until you grant access. Click **Full Disk Access…** in the app, add *Mac Cleaner*, then reopen the app. If you rebuild the app, you may need to remove and re-add it, because the ad-hoc signature changes.
