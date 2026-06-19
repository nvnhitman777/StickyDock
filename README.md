# 🎯 StickyDock - Smart Note-Taking Application

A fast, privacy-focused desktop note-taking app with speech recognition, text-to-speech, hierarchical organization, reminders, and PIN-based security.

**Your notes. Your computer. Your privacy.**

---

## ✨ Complete Feature List

### 📝 **Rich Text Editing**
- **Text Formatting**: Bold, Italic, Underline, Highlight, Strikethrough
- **Paragraphs**: Headings (H1-H3), Normal text, Quotes
- **Lists**: Ordered lists, unordered lists, task lists with checkboxes
- **Code**: Inline code, code blocks with syntax highlighting
- **Tables**: Insert multi-row/column tables using `/table` command
- **Links & Images**: Hyperlinks and embedded images
- **Slash Commands**: Type `/` to see 20+ formatting commands
- **Auto-save**: Changes saved automatically every keystroke (250ms debounce)

### 🎤 **Voice-to-Text Transcription (Speech-to-Text)**
- Click **🎤 Listen** button to start transcription
- Speak naturally and watch text appear in real-time
- **Features:**
  - Web Speech API powered (works offline)
  - Supports continuous speaking sessions
  - Timestamp recording for audio sessions
  - Works with any connected microphone or built-in mic
  - Interim results visible as you speak
- **Audio Settings (🎙️):**
  - **Select Device**: Choose from connected audio inputs
  - **Test Audio**: Real-time visual level meter shows microphone signal
  - **Refresh Devices**: Detect newly connected headsets instantly
  - **Microphone Check**: Verify audio before transcribing

### 🔊 **Text-to-Speech (Read Aloud)**
- Click **🔊 Read** button to hear notes read aloud
- **Perfect for:**
  - Reviewing notes hands-free while working
  - Accessibility for long documents
  - Multitasking while listening to notes
- Browser-based (works offline)
- Supports multiple languages and voices via OS settings

### ⏰ **Reminder System**
- Set date & time reminders for any note
- **Multi-channel Notifications:**
  - 🔊 **Sound Alert**: Audible chime
  - 🗣️ **Voice Announcement**: AI reads the reminder message aloud
  - 📌 **Visual Highlight**: Reminder notification blinks in notes list
- Click **⏰** button on any note to set reminder
- Works even when app is running in background
- Perfect for task management and important deadlines

### 📚 **Hierarchical Note Organization**
- Create **parent-child relationships** between notes
- **Tree Structure**: Visualize entire note hierarchy
- **Features:**
  - Click **+** button on any note to create child note
  - Child notes appear indented under parent
  - Collapse/expand parent notes to hide children
  - Drag-drop reordering (coming soon)
- **Use Cases:** Projects with sub-tasks, Books with chapters, Topics with subtopics
- **Graph View**: Visualize connections between all notes (📊)

### 🎨 **Note Customization**
- **Emoji Icons**: Choose from hundreds of emojis to represent notes
- **Color Coding**: Assign colors to notes:
  - Blue, Green, Red, Yellow, Purple, Orange
  - Visual organization at a glance
- **Priority Levels**: Mark notes as Normal, !, !!, !!!
- **Pin to Top**: Keep frequently-used notes at top of list
- **Tags**: Add comma-separated tags for categorization
- **Combine**: Use icons + colors + tags for powerful organization

### 🔍 **Search & Discovery**
- **Instant Search**: Type in search box to filter notes in real-time
- **Full-text Search**: Searches titles and content
- **Graph Visualization (📊)**: 
  - See all note relationships visually
  - Click to navigate between connected notes
  - Identify isolated notes and clusters
- **Multi-select**: Ctrl+Click notes to select multiple for bulk operations

### 🔐 **Privacy & Security**
- **PIN Protection**: Secure your notes with 4-6 digit PIN
  - First launch: Create PIN (one-time setup)
  - Every launch: Enter PIN to access notes
  - SHA256 hashing - military-grade encryption
- **Lock Button (🔒)**: Instantly lock app before handing PC to someone
  - Works from NoteDock header
  - Prevents unauthorized access
  - Requires PIN to unlock
- **Forgot PIN?**: Reset option allows setting new PIN
- **Session-based Unlocking**: Once unlocked, stays unlocked until restart
- **Local Storage**: 100% local - no cloud, no sync, no tracking
- **No Internet Required**: Complete privacy

### 💾 **Data Management**
- **SQLite Database**: Lightweight, local storage
- **No Cloud Sync**: Your data never leaves your computer
- **Auto-save**: Every change saves instantly
- **Backup**: Copy database file anywhere for backup
- **Multi-Database Support**: Store notes in different locations
  - Create new databases anytime
  - Browse and open existing databases
  - Switch between databases seamlessly
- **Database Picker**: Choose workspace on app launch

### 🎨 **Themes**
- **Dark Mode** (default): Easy on eyes, battery-friendly
- **Light Mode**: Bright and crisp appearance
- **System Mode**: Automatically follow OS theme changes
- Change theme anytime via Settings (⚙️)

### 📱 **Bulk Operations**
- **Multi-select**: Hold Ctrl while clicking notes to select multiple
- **Bulk Delete**: Delete all selected notes at once with confirmation dialog
- **Efficient Organization**: Manage many notes quickly

### 🎮 **Quick Access & Shortcuts**

#### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl + N` | Create new note |
| `Ctrl + Click` | Multi-select notes |
| `Delete` | Delete selected note(s) |
| `/` | Open slash commands in editor |
| `Escape` | Close dialogs |

#### Slash Commands (type `/` in editor)
- `/h1`, `/h2`, `/h3` - Headings
- `/bold`, `/italic`, `/underline`, `/strike` - Text formatting
- `/highlight`, `/code` - Emphasis
- `/table` - Insert table
- `/checklist`, `/taskList` - Checkboxes
- `/quote` - Block quote
- `/hr` - Horizontal rule
- `/image` - Insert image
- `/link` - Add hyperlink
- `/codeBlock` - Code block with language selection

---

## 🚀 **Quick Start Guide**

### Setting Up (First Time)
1. **Launch StickyDock** 
2. **Choose Workspace**: Pick where to store your notes
3. **Set PIN**: Create a 4-6 digit PIN (or create without PIN)
4. **See Welcome Note**: Read quick tips

### Daily Usage
1. **Create Note**: Click "New note" button
2. **Write**: Start typing - auto-saves instantly
3. **Format**: Use `/` for formatting or Ctrl+B for bold
4. **Search**: Use search box to find notes
5. **Lock When Done**: Click 🔒 before leaving computer

### Transcribing Your Voice
1. Click **🎤 Listen** button (in editor toolbar)
2. Check microphone is working (test in Audio Settings 🎙️)
3. Speak clearly into microphone
4. Watch text appear in real-time
5. Click **🎤 Listen** again to stop

### Setting Reminders
1. Click **⏰** button on any note
2. Choose date and time
3. Reminder will notify you with sound + speech
4. Click notification to go to that note

### Protecting Your Notes
1. **Set PIN**: Click 🔒, set a PIN (one-time)
2. **Lock App**: Click 🔒 to instantly lock
3. **Next Launch**: Enter PIN to access notes
4. **Sharing PC**: Others can't access your notes

### Organizing with Hierarchy
1. Create a main note for your project/topic
2. Hover over the note, click **+** to add child note
3. Child notes appear indented
4. Click **>** arrow to collapse/expand families
5. Use colors + tags to further organize

### Using Graph View
1. Click **📊** button in top-right
2. See visual map of all notes and connections
3. Click any note to jump to it
4. Find isolated notes that need linking

---

## 💡 **Pro Tips & Tricks**

### 🎤 Audio Best Practices
- Test microphone first (Settings → 🎙️ Audio Settings)
- Speak clearly and at normal pace
- Ensure adequate microphone volume
- Use headset for clearer results than built-in mic

### 📝 Effective Note-Taking
- Use colors strategically (Red=Urgent, Green=Done, Blue=In Progress)
- Tag notes with keywords for quick finding
- Create hierarchies for complex projects
- Review graph periodically to see patterns

### 🔐 Security Best Practices
- Choose PIN that's memorable but not obvious
- Lock app before letting others use your PC
- Backup your database file regularly
- Never share your PIN

### 🚄 Performance Tips
- Use search frequently instead of scrolling
- Archive old/completed notes to keep active list clean
- Use tags for bulk organization
- Collapse note hierarchies you're not working on

---

## 🔧 **Settings** (⚙️)

### Theme Settings
- Switch between Dark, Light, System
- Changes apply immediately

### Database Settings
- View current database location
- Browse and open different databases
- Create new database in custom folder
- Change active workspace

### Audio Settings (🎙️)
- Select audio input device
- Test microphone with real-time visual levels
- Refresh device list after plugging in headset

---

## 🐛 **Troubleshooting**

### "Microphone not detected"
- Ensure microphone is plugged in
- Click 🔄 Refresh in Audio Settings
- Grant microphone permission when prompted by browser
- Try different microphone in Audio Settings

### "Speech not transcribing"
- Check microphone level in Audio Settings (visual bar)
- Ensure microphone has permission in OS settings
- Speak louder and clearer
- Try different audio input device

### "Notes not saving"
- Check storage location has write permissions
- Ensure database file isn't open in other programs
- Try restarting app
- Check disk space availability

### "PIN forgotten"
- Click "🚨 Forgot PIN?" on lock screen
- This resets the PIN - choose new PIN
- Warning: This clears the PIN but keeps notes safe

### "App won't launch"
- Delete corrupted database file
- Restart app - will prompt to create new database
- Check antivirus isn't blocking file access

---

## 📦 **System Requirements**

- **OS**: Windows 10+, macOS 10.15+, or Linux
- **RAM**: 512MB minimum (1GB+ recommended)
- **Disk**: 100MB for app + space for notes
- **Microphone**: Optional (for transcription)
- **Internet**: Not required (completely offline)

---

## 🎯 **Keyboard & Mouse Tips**

### Mouse
- **Single Click**: Select note
- **Ctrl + Click**: Multi-select notes
- **Right Click**: (Future: context menus)
- **Hover**: Shows tooltips on buttons

### Editor
- Type to create content
- `/` opens command palette
- `Backspace` undoes formatting
- Drag-drop to reorder (coming soon)

---

## 📞 **Support & Feedback**

### Getting Help
- Click **❓ Help** button in app for in-app guide
- Read tips in Welcome note (first-time users)
- Check troubleshooting section above

### Report Issues
- All data is local - very easy to debug
- Share your database file for investigation
- Describe exact steps to reproduce issue

---

## 🎉 **Version History**

### v1.0.0 (Current)
✅ Rich text editing
✅ Speech-to-text transcription  
✅ Text-to-speech reading
✅ Reminders with notifications
✅ Hierarchical notes
✅ Graph visualization
✅ PIN-based security
✅ Dark/Light themes
✅ Multi-database support
✅ Bulk operations
✅ Auto-save

---

## 📄 **License**

Private Use Only - All rights reserved

---

**Enjoy StickyDock! Your notes, your computer, your privacy.** 🚀
1. Check microphone volume (OS settings)
2. Test audio input level (red bar should move)
3. Speak clearly into microphone
4. Try different microphone in Audio Settings

### "Notes won't save"
1. Check if file is read-only
2. Verify database location has write permissions
3. Try creating database in a different folder

### "Forgot PIN"
1. Click "🚨 Forgot PIN?" on lock screen
2. Confirm you want to lock all notes
3. PIN resets - create new PIN on next launch
4. **Note:** This action cannot be undone

---

## 📦 **What's Included**

- ✅ Speech-to-text transcription
- ✅ Text-to-speech reading
- ✅ Rich text editor
- ✅ Reminders with notifications
- ✅ Hierarchical notes
- ✅ PIN-based access control
- ✅ Dark/Light themes
- ✅ Auto-save to SQLite
- ✅ Multi-select operations
- ✅ Graph visualization
- ✅ Cross-platform (Windows, Mac, Linux)

---

## 🚀 **System Requirements**

- **OS:** Windows 10+, macOS 10.13+, or Linux
- **RAM:** 2GB minimum (4GB recommended)
- **Storage:** 50MB for application
- **Microphone:** Optional (for speech features)
- **Speakers/Headphones:** Optional (for audio output)

---

## 📝 **Version**

Current Version: **1.0.0**

Last Updated: June 2026

---

## 💬 **Questions?**

Check the **❓ Help** button in the app for in-app help and additional resources.

---

## 🎉 **Happy Note-Taking!**

StickyDock is designed to be fast, private, and intuitive. Your notes, your data, completely secure on your device.
