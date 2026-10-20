# MCK Browser Manager - Google Admin Deployment Guide

This guide walks you through deploying the **MCK Browser Manager** extension to all users in your organization via Google Workspace Admin Console.

---

## Prerequisites

✅ **Google Workspace admin access** with permissions to manage Chrome apps & extensions  
✅ **Chrome Web Store Developer account** ($5 one-time registration fee)  
✅ **Extension ready to deploy** (this repo contains the complete, tested extension)

---

## Deployment Options

You have **two deployment paths**:

### Option A: Chrome Web Store (Recommended)
Upload to Chrome Web Store as **unlisted** (only users with the link can find it) or **private** (only your domain can install it). Google Admin can then force-install it by extension ID.

**Pros:** Easiest to manage, automatic updates, Google-hosted  
**Cons:** Requires Chrome Web Store developer account, $5 fee, review process (usually 1-3 days)

### Option B: Self-Hosted (Advanced)
Host the `.crx` file on your own server and configure Admin Console to install from your URL.

**Pros:** No Chrome Web Store account needed, full control  
**Cons:** More complex, you manage updates manually, requires HTTPS hosting

---

## **Option A: Chrome Web Store Deployment** (Step-by-Step)

### Step 1: Package the Extension

1. **Set your admin password** (if you haven't already):
   - Edit `popup.js` line 32: `const ADMIN_PASSWORD = "YOUR_PASSWORD_HERE";`
   - Edit `options.js` line 13: `const ADMIN_PASSWORD = "YOUR_PASSWORD_HERE";`

2. **Create a `.zip` file** of the extension:
   ```bash
   # From your project directory
   zip -r mck-browser-manager.zip * -x "*.git*" "*.DS_Store" "node_modules/*"
   ```
   
   Or manually:
   - Select all files in `/mck-browser-manager/` folder
   - Right-click → **Compress** (Mac) or **Send to → Compressed folder** (Windows)
   - Name it `mck-browser-manager.zip`

   ⚠️ **Important:** Zip the **contents** of the folder, not the folder itself. When you unzip, you should see `manifest.json` at the root, not `mck-browser-manager/manifest.json`.

### Step 2: Chrome Web Store Developer Registration

1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Sign in with your Google Workspace admin account (or a dedicated developer account)
3. **Pay the $5 one-time registration fee** (if not already registered)
4. Agree to the Developer Agreement

### Step 3: Upload Your Extension

1. Click **"New Item"** in the Developer Dashboard
2. **Upload** your `mck-browser-manager.zip` file
3. Fill in the required listing information:

   **Store Listing Tab:**
   - **Name:** MCK Browser Manager
   - **Summary:** Enterprise browser management for McKinney — one-click cache clearing, performance tuning, and privacy controls.
   - **Description:** 
     ```
     MCK Browser Manager is an enterprise Chrome extension for McKinney employees, 
     providing centralized browser management tools.

     Features:
     • One-click cache clearing with visual feedback
     • Auto-clear cache on Chrome startup (IT-managed)
     • Performance controls: Memory Saver, Tab Hibernation, Preload Pages
     • Privacy settings: Do Not Track, 3rd Party Cookie blocking, WebRTC protection
     • Centrally managed by McKinney IT Help Desk

     This extension is designed for internal use and managed via Google Admin Console.
     ```
   - **Category:** Productivity
   - **Language:** English (United States)

   **Upload screenshots** (recommended):
   - Take 2-3 screenshots of the extension popup (Cache tab, Privacy tab, etc.)
   - Chrome Web Store requires at least 1 screenshot (1280x800 or 640x400)

   **Privacy Tab:**
   - **Single Purpose:** Browser management and performance optimization for enterprise users
   - **Permission Justification:** Explain each permission:
     - `browsingData`: Required to clear cache
     - `storage`: Persist user settings
     - `tabs`: Memory Saver and Tab Hibernation features
     - `privacy`: Apply Do Not Track and WebRTC settings
     - `contentSettings`: Block 3rd party cookies
     - `alarms`: Schedule automated tab management

   **Visibility:**
   - Select **"Unlisted"** (users with the link can install, but it won't appear in search)
   - OR **"Private"** (only your Google Workspace domain can install) — requires domain verification

4. Click **"Submit for Review"**

### Step 4: Wait for Approval

- **Review time:** Usually 1-3 business days (sometimes as fast as a few hours)
- You'll receive an email when the extension is approved
- Once approved, note the **Extension ID** (looks like: `abcdefghijklmnopqrstuvwxyz123456`)

### Step 5: Deploy via Google Admin Console

Once your extension is live in the Chrome Web Store:

1. **Sign in to Google Admin Console**  
   Go to [admin.google.com](https://admin.google.com)

2. **Navigate to Chrome Management**  
   `Devices` → `Chrome` → `Apps & extensions`

3. **Add the Extension**  
   - Click **"Add Chrome app or extension"** (yellow ➕ button)
   - Paste your **Extension ID** from the Chrome Web Store
   - Click **"Select"**

4. **Configure Installation Policy**  
   - **Who:** Select the organizational unit (OU) to deploy to:
     - Select **"All users"** for company-wide deployment
     - Or choose specific departments/groups
   
   - **Installation Policy:** Choose **"Force install"**
     - This automatically installs the extension for all users in the selected OU
     - Users **cannot** uninstall it (true enterprise policy enforcement)
   
   - **Installation URL:** Auto-filled (Chrome Web Store URL)

5. **Pin to Toolbar (Optional but Recommended)**  
   - Under "User Experience" settings:
     - Set **"Toolbar pin"** to **"Force pinned"**
     - This ensures the extension icon is always visible in the Chrome toolbar

6. **Configure Settings (Optional)**  
   You can also pre-configure settings via Admin Console policies, but since your extension uses `chrome.storage.local`, users will have the default settings defined in `background.js`.

7. **Click "Save"**

### Step 6: Rollout

- **Propagation time:** Changes can take up to 24 hours to apply to all devices
- **For faster testing:** Have a user:
  1. Close and reopen Chrome
  2. Or visit `chrome://policy` → Click **"Reload policies"**

- The extension will automatically install on all managed Chrome browsers within your selected OU
- Users will see "MCK Browser Manager" in their toolbar (if pinned) or extensions list

---

## **Option B: Self-Hosted Deployment** (Advanced)

If you don't want to publish to Chrome Web Store:

### Step 1: Package and Sign the Extension

1. **Create a `.crx` package** (Chrome Extension Package):
   ```bash
   # Chrome requires extensions to be signed
   # Use chrome://extensions/ → Pack extension
   # Or use command line (requires Chrome binary)
   ```

2. **Host the `.crx` and `update.xml` files** on an HTTPS server:
   - Upload `mck-browser-manager.crx` to your web server
   - Create an `update.xml` manifest (example below)

   **update.xml:**
   ```xml
   <?xml version='1.0' encoding='UTF-8'?>
   <gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
     <app appid='YOUR_EXTENSION_ID'>
       <updatecheck codebase='https://your-domain.com/mck-browser-manager.crx' version='1.0.0' />
     </app>
   </gupdate>
   ```

### Step 2: Deploy via Admin Console

1. In Google Admin Console:  
   `Devices` → `Chrome` → `Apps & extensions` → `Add Chrome app or extension`

2. **Choose "Add custom app"**

3. Enter:
   - **Extension ID:** (from your `.pem` file or generated during packing)
   - **Update URL:** `https://your-domain.com/update.xml`

4. Set **Installation Policy** to **"Force install"**

5. Click **"Save"**

⚠️ **Self-hosting drawbacks:**
- More complex initial setup
- You must manually update `update.xml` and `.crx` for every new version
- No automatic security/malware scanning by Google

---

## Updating the Extension

### If using Chrome Web Store:
1. Make your code changes locally
2. Increment the `version` in `manifest.json` (e.g., `1.0.0` → `1.0.1`)
3. Re-zip the extension
4. Upload to Chrome Web Store Developer Dashboard (same listing, click "Package" tab → "Upload new package")
5. Submit for review
6. Once approved, updates **automatically roll out** to all installed instances (within 24-48 hours)

### If self-hosting:
1. Update your code
2. Increment `version` in `manifest.json`
3. Re-create the `.crx` file
4. Update `update.xml` with the new version number and `.crx` URL
5. Upload both files to your server
6. Chrome checks for updates periodically (every few hours)

---

## Testing the Deployment

### Before full rollout:
1. **Create a test OU** in Google Admin:
   - `Admin Console` → `Directory` → `Organizational units` → **Create test OU**
   - Add 1-2 test users to this OU
   - Deploy the extension to this OU first with "Force install"

2. **Test user workflow:**
   - Sign in to Chrome as a test user
   - Verify the extension auto-installs
   - Check all features:
     - Cache clearing works
     - Admin password gate works (try toggling "Auto-clear on startup")
     - Advanced Settings cog reveals tabs
     - Privacy/Performance toggles apply correctly

3. **Once validated:**
   - Expand deployment to **All users** or your main OUs

---

## Troubleshooting

### Extension not installing for users?
- Check the OU selection in Admin Console (ensure the user is in the target OU)
- Verify "Force install" is selected (not "Allow install")
- Ask users to visit `chrome://policy` → **Reload policies** → check "ExtensionInstallForcelist"
- Check Chrome Management enrollment: `chrome://management/` should show "Your browser is managed by [your-domain]"

### Users can uninstall the extension?
- Ensure you selected **"Force install"** (not "Allow install") in Admin Console
- Force install prevents uninstallation by users

### Settings not persisting?
- The extension uses `chrome.storage.local` which is tied to the Chrome profile
- If users are using temporary/guest profiles, settings won't persist
- Ensure users are signed in to their Workspace account in Chrome

### Admin password visible in source code?
- **This is intentional and expected for client-side extensions** — the password is a deterrent, not a security boundary
- For true enforcement, use Chrome Enterprise Policies (can lock settings via Admin Console)
- The current password gate is sufficient for preventing **accidental** changes by non-technical users

---

## Security Best Practices

1. **Restrict Admin Console access** to IT staff only
2. **Review extension updates** before deploying (if self-hosting)
3. **Monitor user feedback** via your configured IT Help Desk link (set in the popup/options footer)
4. **Use "Force install"** to prevent users from disabling/removing the extension
5. **Change the admin password** periodically (update in both `popup.js` and `options.js`, re-deploy)

---

## Support & Maintenance

- **IT Help Desk:** _set your own support URL in `popup.html` and `options.html` before deploying_
- **Extension version:** Displayed in footer of popup and options page
- **Chrome version compatibility:** Manifest V3 requires Chrome 88+ (2021), all modern Chrome browsers supported

---

## Quick Reference

| Task | Google Admin Console Path |
|------|--------------------------|
| Deploy extension | `Devices` → `Chrome` → `Apps & extensions` → `Add app` |
| Pin to toolbar | Extension settings → `Toolbar pin` → `Force pinned` |
| View installed extensions | `Devices` → `Chrome` → `Apps & extensions` |
| Check user devices | `Devices` → `Chrome` → `Devices` |
| Force policy update | User visits `chrome://policy` → `Reload policies` |

---

## Additional Resources

- [Chrome Enterprise Policy List](https://chromeenterprise.google/policies/)
- [Chrome Web Store Developer Documentation](https://developer.chrome.com/docs/webstore/)
- [Google Workspace Admin Help: Manage Chrome Apps](https://support.google.com/chrome/a/answer/2657289)

---

**Questions?** Contact your IT Help Desk or the extension developer.
