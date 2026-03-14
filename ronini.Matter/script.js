// Matter Plugin for NotePlan
// Syncs highlights from Matter (getmatter.app) into NotePlan notes

// ============================================================
// Constants
// ============================================================

var API_BASE = "https://api.getmatter.app/api/v11"
var QR_LOGIN_TRIGGER = API_BASE + "/qr_login/trigger/"
var QR_LOGIN_EXCHANGE = API_BASE + "/qr_login/exchange/"
var TOKEN_REFRESH = API_BASE + "/token/refresh/"
var HIGHLIGHTS_FEED = API_BASE + "/library_items/highlights_feed/"


// ============================================================
// Helpers
// ============================================================

function _log(level, msg) {
  var logLevel = (DataStore.settings && DataStore.settings._logLevel) || "INFO"
  var levels = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, none: 4 }
  if ((levels[level] || 0) >= (levels[logLevel] || 0)) {
    console.log("[Matter " + level + "] " + msg)
  }
}

function _isAuthenticated() {
  var at = DataStore.loadData("ACCESS_TOKEN", true)
  var rt = DataStore.loadData("REFRESH_TOKEN", true)
  return !!(at && rt)
}

function _getTokens() {
  return {
    accessToken: DataStore.loadData("ACCESS_TOKEN", true) || "",
    refreshToken: DataStore.loadData("REFRESH_TOKEN", true) || "",
  }
}

function _saveTokens(accessToken, refreshToken) {
  DataStore.saveData(accessToken, "ACCESS_TOKEN", true)
  DataStore.saveData(refreshToken, "REFRESH_TOKEN", true)
}

function _clearTokens() {
  DataStore.saveData("", "ACCESS_TOKEN", true)
  DataStore.saveData("", "REFRESH_TOKEN", true)
}

function _getLastSyncTime() {
  var timeStr = DataStore.loadData("LAST_SYNC_TIME", true)
  if (timeStr) {
    var d = new Date(timeStr)
    if (!isNaN(d.getTime())) return d
  }
  return null
}

function _setLastSyncTime() {
  DataStore.saveData(new Date().toISOString(), "LAST_SYNC_TIME", true)
}

function _sanitizeTitle(text) {
  if (!text) return ""
  return text
    .replace(/[/\\:*?"<>|#]/g, "")
    .replace(/\n/g, " ")
    .replace(/^\s+|\s+$/g, "")
    .replace(/^["']|["']$/g, "")
    .substring(0, 120)
}

function _formatTag(tagName) {
  var prefix = (DataStore.settings && DataStore.settings.tagPrefix) || "Matter"
  var clean = tagName.replace(/\s+/g, "-")
  return prefix ? prefix + "/" + clean : clean
}

function _getHighlightPrefix() {
  var style = (DataStore.settings && DataStore.settings.highlightStyle) || "quote"
  return style === "list" ? "- " : "> "
}

function _formatDate(dateStr) {
  if (!dateStr) return ""
  try {
    return new Date(dateStr).toISOString().split("T")[0]
  } catch (e) {
    return ""
  }
}

function _buildQRCodeHTML(token) {
  // Uses a CDN-loaded QR code library to render the token as a scannable QR code
  return '<!DOCTYPE html>\n' +
    '<html><head><meta charset="utf-8">\n' +
    '<style>\n' +
    'body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; text-align: center; padding: 20px; background: #1e1e1e; color: #e0e0e0; }\n' +
    'h2 { margin-bottom: 5px; font-size: 18px; }\n' +
    'p { font-size: 13px; color: #aaa; margin: 8px 0; }\n' +
    'canvas { margin: 15px auto; display: block; }\n' +
    '.instructions { font-size: 13px; line-height: 1.5; text-align: left; max-width: 300px; margin: 10px auto; }\n' +
    '.instructions ol { padding-left: 20px; }\n' +
    '</style>\n' +
    '</head><body>\n' +
    '<h2>Scan with Matter App</h2>\n' +
    '<canvas id="qr"></canvas>\n' +
    '<div class="instructions">\n' +
    '<ol>\n' +
    '<li>Open <strong>Matter</strong> on your phone</li>\n' +
    '<li>Go to <strong>Profile → Settings</strong></li>\n' +
    '<li>Tap <strong>Connected Accounts</strong></li>\n' +
    '<li>Scan this QR code</li>\n' +
    '</ol>\n' +
    '<p style="text-align:center;">The window will close automatically once connected.</p>\n' +
    '</div>\n' +
    '<script src="https://cdn.jsdelivr.net/npm/qrious@4.0.2/dist/qrious.min.js"></' + 'script>\n' +
    '<script>\n' +
    'new QRious({ element: document.getElementById("qr"), value: "' + token + '", size: 250, backgroundAlpha: 0, foreground: "#ffffff" });\n' +
    '</' + 'script>\n' +
    '</body></html>'
}

// NotePlan's fetch() returns the response body directly as a string,
// NOT a standard Response object. There is no .ok, .status, .text(), etc.
// Errors throw exceptions via .catch(). Success = you got the body string.

function _parseJSON(responseBody) {
  if (typeof responseBody === "object") return responseBody
  return JSON.parse(responseBody)
}

// ============================================================
// API
// ============================================================

async function _triggerQRLogin() {
  try {
    var response = await fetch(QR_LOGIN_TRIGGER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_type: "integration" }),
    })
    var data = _parseJSON(response)
    _log("DEBUG", "QR login session triggered")
    return data.session_token || null
  } catch (e) {
    _log("ERROR", "QR login trigger error: " + e.message)
    return null
  }
}

async function _exchangeQRToken(sessionToken) {
  try {
    var response = await fetch(QR_LOGIN_EXCHANGE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_token: sessionToken }),
    })
    _log("DEBUG", "QR exchange response type: " + typeof response)
    _log("DEBUG", "QR exchange response: " + String(response).substring(0, 200))
    var data = _parseJSON(response)
    _log("DEBUG", "QR exchange parsed keys: " + Object.keys(data).join(", "))
    if (data.access_token && data.refresh_token) {
      _log("INFO", "Successfully authenticated with Matter")
      return { accessToken: data.access_token, refreshToken: data.refresh_token }
    }
    _log("DEBUG", "QR exchange: no tokens in response yet")
    return null
  } catch (e) {
    _log("DEBUG", "QR exchange poll error: " + e.message)
    return null
  }
}

async function _refreshAccessToken(refreshToken) {
  try {
    var response = await fetch(TOKEN_REFRESH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    var data = _parseJSON(response)
    if (data.access_token && data.refresh_token) {
      _log("INFO", "Access token refreshed")
      return { accessToken: data.access_token, refreshToken: data.refresh_token }
    }
    return null
  } catch (e) {
    _log("ERROR", "Token refresh error: " + e.message)
    return null
  }
}

async function _authedFetch(url, accessToken, refreshToken) {
  try {
    var response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json",
      },
    })
    var data = _parseJSON(response)
    return { data: data, newTokens: null }
  } catch (e) {
    // If fetch fails, try refreshing the token and retry
    _log("INFO", "Fetch failed (" + e.message + "), attempting token refresh...")
    var newTokens = await _refreshAccessToken(refreshToken)
    if (!newTokens) {
      throw new Error('Authentication failed. Please re-login with "Matter: Login".')
    }
    var response2 = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + newTokens.accessToken,
        "Content-Type": "application/json",
      },
    })
    var data2 = _parseJSON(response2)
    return { data: data2, newTokens: newTokens }
  }
}

async function _fetchAllHighlights(accessToken, refreshToken) {
  var allEntries = []
  var url = HIGHLIGHTS_FEED
  var latestTokens = null

  while (url) {
    _log("DEBUG", "Fetching highlights page: " + url)
    var at = latestTokens ? latestTokens.accessToken : accessToken
    var rt = latestTokens ? latestTokens.refreshToken : refreshToken
    var result = await _authedFetch(url, at, rt)

    if (result.newTokens) latestTokens = result.newTokens

    if (result.data.feed && Array.isArray(result.data.feed)) {
      allEntries = allEntries.concat(result.data.feed)
    }

    url = result.data.next || null
  }

  allEntries.reverse()
  _log("INFO", "Fetched " + allEntries.length + " feed entries from Matter")
  return { entries: allEntries, newTokens: latestTokens }
}

// ============================================================
// Note Creation
// ============================================================

function _extractContent(feedEntry) {
  var c = feedEntry.content || {}
  return {
    title: c.title || "Untitled",
    url: c.url || "",
    author: c.author ? c.author.any_name || "" : "",
    publisher: c.publisher ? c.publisher.any_name || "" : "",
    publicationDate: c.publication_date || "",
    note: c.my_note ? c.my_note.note || "" : "",
    tags: (c.tags || []).map(function (t) { return t.name }),
    annotations: c.my_annotations || feedEntry.annotations || [],
    libraryState: c.library ? c.library.library_state : null,
  }
}

function _getFolderPath() {
  var base = (DataStore.settings && DataStore.settings.baseFolder) || "Matter"
  return base
}

function _formatHighlight(annotation) {
  var prefix = _getHighlightPrefix()
  var s = DataStore.settings || {}
  var text = prefix + annotation.text

  if (s.includeHighlightNotes && annotation.note) {
    text += "\n\n**Note:** " + annotation.note
  }

  return text
}

async function _getOrCreateNote(noteTitle, folderPath) {
  // Try to find existing note by title
  var existing = DataStore.projectNoteByTitle(noteTitle, true, false)
  if (existing && existing.length > 0) {
    // Filter to the right folder if needed
    if (folderPath && folderPath !== "/") {
      for (var i = 0; i < existing.length; i++) {
        if (existing[i].filename && existing[i].filename.startsWith(folderPath)) {
          return existing[i]
        }
      }
    }
    return existing[0]
  }

  // Create new note
  var newFilename = await DataStore.newNote(noteTitle, folderPath)
  if (!newFilename) {
    _log("ERROR", "DataStore.newNote returned empty filename for: " + noteTitle)
    return null
  }
  var note = await DataStore.projectNoteByFilename(newFilename)
  return note || null
}

async function _writeEntryToNote(feedEntry) {
  var content = _extractContent(feedEntry)

  if (content.libraryState === 3) {
    _log("DEBUG", "Skipping deleted item: " + content.title)
    return null
  }

  if (!content.annotations || content.annotations.length === 0) {
    _log("DEBUG", "Skipping item with no highlights: " + content.title)
    return null
  }

  var noteTitle = _sanitizeTitle(content.title)
  if (!noteTitle) return null

  var folderPath = _getFolderPath()
  var settings = DataStore.settings || {}

  try {
    var note = await _getOrCreateNote(noteTitle, folderPath)
    if (!note) {
      _log("ERROR", "Failed to create/get note: " + noteTitle)
      return null
    }

    // Build the note content as a single string
    var lines = []

    // Frontmatter
    if (settings.useFrontMatter !== "Heading") {
      lines.push("---")
      if (content.author) lines.push("author: \"[[" + content.author + "]]\"")
      if (content.url) lines.push("url: " + content.url)
      if (content.publisher) lines.push("publisher: " + content.publisher)
      if (content.publicationDate) lines.push("published: " + _formatDate(content.publicationDate))
      if (content.tags.length > 0) {
        lines.push("tags: " + content.tags.map(_formatTag).join(", "))
      }
      lines.push("---")
      lines.push("")
    } else {
      lines.push("## Metadata")
      if (content.author) lines.push("**Author:** [[" + content.author + "]]")
      if (content.publisher) lines.push("**Publisher:** " + content.publisher)
      if (content.url) lines.push("**URL:** " + content.url)
      if (content.publicationDate) lines.push("**Published:** " + _formatDate(content.publicationDate))
      if (content.tags.length > 0) {
        lines.push("**Tags:** " + content.tags.map(_formatTag).join(", "))
      }
      lines.push("")
    }

    // Article note
    if (settings.includeArticleNote && content.note) {
      lines.push("## My Note")
      lines.push(content.note)
      lines.push("")
    }

    // Highlights
    lines.push("# Highlights")
    lines.push("")

    // Sort annotations by word position for reading order
    var sorted = content.annotations.slice().sort(function (a, b) {
      return (a.word_start || 0) - (b.word_start || 0)
    })

    for (var i = 0; i < sorted.length; i++) {
      lines.push(_formatHighlight(sorted[i]))
      lines.push("")
    }

    // Write the entire content at once
    // The note title is already set by DataStore.newNote, so we append after it
    var fullContent = noteTitle + "\n" + lines.join("\n")
    note.content = fullContent

    _log("DEBUG", "Wrote " + sorted.length + " highlights to '" + noteTitle + "'")
    return noteTitle
  } catch (e) {
    _log("ERROR", "Error writing note '" + noteTitle + "': " + e.message)
    return null
  }
}

async function _appendNewHighlights(feedEntry, lastSyncTime) {
  var content = _extractContent(feedEntry)
  if (content.libraryState === 3) return 0

  var noteTitle = _sanitizeTitle(content.title)
  if (!noteTitle) return 0

  var newAnnotations = content.annotations.filter(function (a) {
    if (!a.created_date) return false
    return new Date(a.created_date) > lastSyncTime
  })

  if (newAnnotations.length === 0) return 0

  var folderPath = _getFolderPath()

  try {
    var note = await _getOrCreateNote(noteTitle, folderPath)
    if (!note) return 0

    var sorted = newAnnotations.slice().sort(function (a, b) {
      return (a.word_start || 0) - (b.word_start || 0)
    })

    for (var i = 0; i < sorted.length; i++) {
      var hl = _formatHighlight(sorted[i])
      note.addParagraphBelowHeadingTitle(hl, "text", "Highlights", true, false)
    }

    _log("DEBUG", "Appended " + sorted.length + " new highlights to '" + noteTitle + "'")
    return sorted.length
  } catch (e) {
    _log("ERROR", "Error appending to '" + noteTitle + "': " + e.message)
    return 0
  }
}

// ============================================================
// Plugin Commands (exported via jsFunction names in plugin.json)
// ============================================================

// Step 1: Show QR code for user to scan
async function matterLogin() {
  try {
    if (_isAuthenticated()) {
      var reauth = await CommandBar.prompt(
        "Already Logged In",
        "You are already authenticated with Matter. Re-authenticate?",
        ["Yes", "No"]
      )
      if (reauth !== 0) return
    }

    _log("INFO", "Triggering QR login session...")
    var sessionToken = await _triggerQRLogin()

    if (!sessionToken) {
      await CommandBar.prompt("Error", "Failed to start login session. Please try again.", ["OK"])
      return
    }

    // Save the session token so Step 2 can use it
    DataStore.saveData(sessionToken, "QR_SESSION_TOKEN", true)

    // Show QR code in an HTML window for the user to scan
    var qrHTML = _buildQRCodeHTML(sessionToken)
    HTMLView.showSheet(qrHTML, 400, 520)

    _log("INFO", "QR code displayed. User should scan, then run 'Matter: Complete Login'.")
  } catch (e) {
    _log("ERROR", "Login error: " + e.message)
    await CommandBar.prompt("Error", "Login failed: " + e.message, ["OK"])
  }
}

// Step 2: Exchange the token after user has scanned
async function matterCompleteLogin() {
  try {
    var sessionToken = DataStore.loadData("QR_SESSION_TOKEN", true)

    if (!sessionToken) {
      await CommandBar.prompt("Error", "No login session found. Please run 'Matter: Login' first.", ["OK"])
      return
    }

    _log("INFO", "Attempting QR token exchange...")
    var tokens = await _exchangeQRToken(sessionToken)

    if (!tokens) {
      await CommandBar.prompt(
        "Not Ready",
        "Could not complete login. Make sure you have scanned the QR code in the Matter app, then try this command again.",
        ["OK"]
      )
      return
    }

    // Close the QR code window
    try { HTMLView.closeSheet() } catch (e) { /* ignore */ }

    // Clear session token, save auth tokens
    DataStore.saveData("", "QR_SESSION_TOKEN", true)
    _saveTokens(tokens.accessToken, tokens.refreshToken)

    await CommandBar.prompt("Success", "Logged in to Matter! Run 'Matter: Sync' to import highlights.", ["OK"])
    _log("INFO", "Matter login completed")
  } catch (e) {
    _log("ERROR", "Complete login error: " + e.message)
    await CommandBar.prompt("Error", "Login failed: " + e.message, ["OK"])
  }
}

async function matterLogout() {
  if (!_isAuthenticated()) {
    await CommandBar.prompt("Not Logged In", "You are not currently logged in to Matter.", ["OK"])
    return
  }

  var confirm = await CommandBar.prompt(
    "Confirm Logout",
    "This will clear your Matter authentication. You can log in again anytime.",
    ["Logout", "Cancel"]
  )

  if (confirm === 0) {
    _clearTokens()
    _log("INFO", "Logged out of Matter")
    await CommandBar.prompt("Logged Out", "Successfully logged out of Matter.", ["OK"])
  }
}

async function matterSync() {
  await _doSync(false)
}

async function matterRebuild() {
  var confirm = await CommandBar.prompt(
    "Full Rebuild",
    "This will re-sync ALL highlights from Matter. Existing notes will be updated. Continue?",
    ["Yes", "Cancel"]
  )
  if (confirm !== 0) return
  await _doSync(true)
}

async function _doSync(fullRebuild) {
  if (!_isAuthenticated()) {
    await CommandBar.prompt("Not Logged In", "Please run 'Matter: Login' first.", ["OK"])
    return
  }

  var tokens = _getTokens()
  var lastSyncTime = fullRebuild ? null : _getLastSyncTime()

  try {
    CommandBar.showLoading(true, "Syncing highlights from Matter...")
    _log("INFO", "Starting " + (fullRebuild ? "full rebuild" : "incremental sync") + "...")

    var result = await _fetchAllHighlights(tokens.accessToken, tokens.refreshToken)

    if (result.newTokens) {
      _saveTokens(result.newTokens.accessToken, result.newTokens.refreshToken)
    }

    var notesCreated = 0
    var highlightsAdded = 0

    // Log the first entry structure for debugging
    if (result.entries.length > 0) {
      var sample = result.entries[0]
      _log("DEBUG", "Sample entry keys: " + Object.keys(sample).join(", "))
      if (sample.content) {
        _log("DEBUG", "Sample content keys: " + Object.keys(sample.content).join(", "))
        _log("DEBUG", "Sample title: " + (sample.content.title || "NONE"))
        _log("DEBUG", "Sample my_annotations: " + (sample.content.my_annotations ? sample.content.my_annotations.length : "NONE"))
        _log("DEBUG", "Sample annotations (top-level): " + (sample.annotations ? sample.annotations.length : "NONE"))
      } else {
        _log("DEBUG", "Sample entry has NO .content - full keys: " + JSON.stringify(sample).substring(0, 500))
      }
    }

    for (var i = 0; i < result.entries.length; i++) {
      var entry = result.entries[i]
      CommandBar.showLoading(true, "Processing " + (i + 1) + " of " + result.entries.length + "...")

      if (fullRebuild || !lastSyncTime) {
        var title = await _writeEntryToNote(entry)
        if (title) {
          notesCreated++
          var annots = entry.content ? entry.content.my_annotations : entry.annotations
          highlightsAdded += (annots ? annots.length : 0)
        }
      } else {
        var count = await _appendNewHighlights(entry, lastSyncTime)
        if (count > 0) {
          notesCreated++
          highlightsAdded += count
        }
      }
    }

    _setLastSyncTime()
    CommandBar.showLoading(false)

    var msg = "Synced " + highlightsAdded + " highlights across " + notesCreated + " notes"
    _log("INFO", msg)
    await CommandBar.prompt("Sync Complete", msg, ["OK"])
  } catch (e) {
    CommandBar.showLoading(false)
    _log("ERROR", "Sync error: " + e.message)
    await CommandBar.prompt("Sync Error", "Failed to sync: " + e.message, ["OK"])
  }
}

function onUpdateOrInstall() {
  _log("INFO", "Matter plugin installed/updated")
}

function onSettingsUpdated() {
  _log("DEBUG", "Settings updated")
}
