# macOS VM Setup Guide — VMware Workstation on Windows

## INFRA-55 | CareerPilot Auto-Apply Infrastructure

This guide documents the exact steps used to get a macOS Sequoia VM running on Windows
with VMware Workstation for Cowork/Dispatch computer use capabilities.

---

## Prerequisites

- **VMware Workstation Pro 25H2** (free for personal use)
  - Download from: https://www.techpowerup.com/download/vmware-workstation-pro/
  - Broadcom's website requires an account; TechPowerUp has direct downloads
  - VMware Workstation 16 is NOT compatible with OC4VM templates (hardware version too old)

- **OC4VM v2.5.1** (OpenCore for VMware) — pre-built release, NOT the source repo
  - Download the **release ZIP** from: https://github.com/DrDonk/OC4VM/releases
  - CRITICAL: Download the release asset ZIP (e.g., `oc4vm-2.5.1.zip`), NOT "Source code"
  - The source repo has unrendered Jinja2 templates (`{{VERSION}}`, `{{DESCRIPTION}}`) that VMware cannot parse

- **recoveryOS v1.0.1** — creates bootable macOS recovery VMDK
  - Download from: https://github.com/DrDonk/recoveryOS/releases
  - Get the Windows release

- **QEMU** (specifically `qemu-img.exe`) — required by recoveryOS for DMG→VMDK conversion
  - Install via: `winget install SoftwareFreedomConservancy.QEMU`
  - Or download from: https://qemu.weilnetz.de/w64/
  - After installing, close and reopen PowerShell so PATH updates
  - Or add to current session: `$env:PATH += ";C:\Program Files\qemu"`

---

## What DIDN'T Work (Lessons Learned)

### 1. gibMacOS — Wrong output format
- gibMacOS (https://github.com/corpnewt/gibMacOS) downloads raw `.pkg` files from Apple
- VMware needs an ISO or VMDK to boot — can't use `.pkg` files directly
- Converting `.pkg` to bootable ISO requires an existing macOS installation (chicken-and-egg)
- **Verdict:** Useful for reference but not for creating VM boot media on Windows

### 2. OC4VM source repo (git clone)
- Cloning the repo gives you unbuilt template files with `{{VERSION}}`, `{{COMMIT}}`, `{{DESCRIPTION}}` placeholders
- The `make.sh` build script requires macOS to run
- VMware silently refuses to open VMX files with template syntax
- **Verdict:** Always use the pre-built release ZIP from GitHub Releases

### 3. VMware Workstation 16
- OC4VM templates require `virtualHW.version = "21"` (Workstation 17.6+)
- OC4VM uses `guestOS = "darwin24-64"` which Workstation 16 doesn't recognize
- Even with manual VMX edits, the template's NVRAM and OpenCore config assume modern hardware
- **Verdict:** Must upgrade to Workstation 17.6+ or 25H2

### 4. OC4VM opencore.vmdk as boot device
- The `opencore.vmdk` in the release is only 1KB — it's a descriptor, not a full disk
- The VMX template references it as a USB boot device, but the UEFI firmware couldn't chain-load from it
- `BOOTx64.efi` would load but do nothing — no OpenCore picker, no macOS boot
- **Verdict:** Use the `opencore.iso` (40MB) for the OpenCore bootloader, and recoveryOS VMDK for the actual macOS installer

### 5. AMD vs Intel OpenCore ISO
- OC4VM provides separate AMD and Intel folders with different OpenCore builds
- Using the AMD `opencore.iso` on an Intel CPU = silent boot failure
- The EFI binary loads but can't execute because the CPU patches don't match
- **Verdict:** Always use the ISO matching your CPU architecture

---

## Working Setup — Step by Step

### Step 1: Install VMware Workstation Pro 25H2

1. Download from https://www.techpowerup.com/download/vmware-workstation-pro/
2. Run installer — installs over any existing VMware Workstation version
3. No license key needed (free for personal use since 2024)

### Step 2: Download and Extract OC4VM Release

1. Go to https://github.com/DrDonk/OC4VM/releases
2. Download the latest release ZIP (e.g., `oc4vm-2.5.1.zip`) — NOT "Source code"
3. Extract to `C:\Users\Joe\Downloads\oc4vm-2.5.1\`
4. Navigate to `vmware\intel\` — this has the pre-configured template files:
   - `macos.vmx` — VM configuration (all OpenCore settings baked in)
   - `macos.vmdk` — Pre-formatted APFS virtual disk (17MB, target for macOS install)
   - `macos.nvram` — Preconfigured UEFI/NVRAM boot variables (265KB)
   - `macos.plist` — VMware Fusion config (ignore on Windows)
   - `opencore.iso` — OpenCore bootloader (40MB)
   - `opencore.vmdk` — OpenCore descriptor (1KB — NOT the boot media)

### Step 3: Create recoveryOS Boot VMDK

1. Download recoveryOS from https://github.com/DrDonk/recoveryOS/releases
2. Extract to `C:\Users\Joe\Downloads\recoveryOS-1.0.1\`
3. Make sure QEMU is installed (see Prerequisites)
4. Open PowerShell and run:

```powershell
$env:PATH += ";C:\Program Files\qemu"
cd "C:\Users\Joe\Downloads\recoveryOS-1.0.1\windows\amd64"
.\recoveryOS.exe
```

5. Select **6. Sequoia** from the menu
6. Wait for download (~847MB from Apple's CDN)
7. When prompted for format, select **1. VMware VMDK**
8. Output: `sequoia.vmdk` (~2.3GB) in the same folder

### Step 4: Assemble the VM

1. Create the VM directory:

```powershell
New-Item -Path "F:\Virtual Machines\macOS-Sequoia" -ItemType Directory -Force
```

2. Copy the Intel template files:

```powershell
Copy-Item -Path "C:\Users\Joe\Downloads\oc4vm-2.5.1\vmware\intel\*" -Destination "F:\Virtual Machines\macOS-Sequoia\" -Force
```

3. Copy the recovery VMDK:

```powershell
Copy-Item -Path "C:\Users\Joe\Downloads\recoveryOS-1.0.1\windows\amd64\sequoia.vmdk" -Destination "F:\Virtual Machines\macOS-Sequoia\" -Force
```

4. Edit `macos.vmx` in Notepad — add the recovery disk as a second SATA drive:

```
sata0:2.fileName = "sequoia.vmdk"
sata0:2.present = "TRUE"
```

Also update the CDROM to point to the Intel OpenCore ISO and connect at startup:

```
sata0:1.autodetect = "FALSE"
sata0:1.deviceType = "cdrom-image"
sata0:1.fileName = "opencore.iso"
sata0:1.present = "TRUE"
sata0:1.startConnected = "TRUE"
```

### Step 5: Boot and Install macOS

1. Double-click `F:\Virtual Machines\macOS-Sequoia\macos.vmx` to open in VMware
2. Power on the VM
3. The Apple logo should appear with a progress bar
4. macOS Recovery will load — this downloads Sequoia from Apple over the internet
5. In Recovery:
   - Click **reinstall macOS Sequoia**
   - Install on **Macintosh HD**
   - Follow the prompts (takes 30-60 minutes with reboots)
6. After installation, set up a local account (skip Apple ID for now)

### Step 6: Post-Install — OpenCore Tools

After macOS is running, run these commands in Terminal:

```bash
# Regenerate serial numbers (important before signing into Apple ID)
/Volumes/OPENCORE/tools/regen

# Hide the VM from Apple's detection
/Volumes/OPENCORE/tools/vmhide on
```

> **NOTE:** These tools may not exist in all OC4VM releases. Check with
> `find /Volumes/OPENCORE/ -type f` to see what's available. If the tools
> aren't present, skip this step — it's only needed if you plan to sign into
> Apple ID. For Cowork/Claude Desktop testing, a local account is sufficient
> and avoids the serial number issue entirely.

### Step 7: Install VMware Tools

VMware Tools enables clipboard sharing (copy/paste between Windows and macOS),
display auto-resize, and shared folders. **Install this before anything else —
the VM will feel significantly more usable.**

1. In VMware Workstation menu bar → **VM → Install VMware Tools**
2. If that option is grayed out, mount the darwin.iso manually:
   - Check `/Volumes/OPENCORE/` for a darwin.iso
   - Or look in `F:\Virtual Machines\macOS-Sequoia\` on the Windows side
3. Open the mounted disk in Finder and run the VMware Tools installer package
4. Reboot the VM after installation
5. When prompted, allow **vmware-tools-daemon** to control the computer
   (System Settings → Privacy & Security → Accessibility)

**If VMware Tools installer isn't available**, use open-vm-tools via Homebrew:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install open-vm-tools
```

### Step 8: Performance Tuning

macOS VMs are slow because VMware can't pass through the GPU — everything is
software-rendered by the CPU. These settings make the VM usable for Claude
Desktop and Cowork without crushing the host machine.

#### VMware Settings (shut down VM first → VM → Settings)

**Hardware tab → Display:**
- **3D graphics:** Uncheck "Accelerate 3D graphics" — counterintuitively, this
  makes macOS VMs *slower* because the 3D emulation is buggy with macOS
- **Monitors:** Select "Specify monitor settings"
  - Number of monitors: **1**
  - Maximum resolution: **1280 x 1024** (or 1920x1080 max — do NOT use
    2560x1600, the software rendering can't keep up)
- **Display scaling:** Uncheck "Automatically adjust user interface size in the
  virtual machine" — this constantly recalculates scaling and triggers re-renders

**Options tab → VMware Tools:**
- Check "Synchronize guest time with host"
- VMware Tools updates: "Update automatically"

**Options tab → Advanced:**
- Leave "Enable side channel mitigations for Hyper-V enabled hosts" **unchecked**
  — safe for a local dev/test VM and gives a small CPU performance boost
- "Allow memory page trimming" should be **checked**

#### macOS Settings (inside the VM)

**Disable sleep/standby** — waking from standby hammers the CPU and slows the
entire host machine:

```bash
sudo pmset -a sleep 0
sudo pmset -a disablesleep 1
sudo pmset -a displaysleep 0
```

Verify with `pmset -g` — should show `sleep 0`, `displaysleep 0`, `disablesleep 1`.

**Disable animations and transparency** — these are all software-rendered
without a real GPU:

```bash
# Kill window animations
defaults write NSGlobalDomain NSAutomaticWindowAnimationsEnabled -bool false

# Force simpler rendering pipeline
defaults write -g RendererPolicy -int 1
```

**System Settings → Accessibility → Display:**
- Enable **Reduce motion** — kills all macOS animations
- Enable **Reduce transparency** — removes translucent menu bars and sidebars

**System Settings → Lock Screen:**
- Set "Turn display off on battery when inactive" → **Never**
- Set "Turn display off on power adapter when inactive" → **Never**

**System Settings → Energy (or Energy Saver):**
- Disable "Put hard disks to sleep when possible"
- Disable "Enable Power Nap"

#### Host Machine Tips

- **Store the VM on an SSD/NVMe** — macOS does constant background I/O
  (Spotlight indexing, APFS snapshots, system analytics). A spinning HDD will
  bottleneck everything.
- **Don't over-allocate CPU cores** — if the VM has more than half your physical
  cores, VMware's scheduler gets *slower* due to co-scheduling overhead.
  4 cores is the sweet spot for most systems.
- **Close unnecessary host applications** while running the VM — even with 64GB
  RAM, the CPU contention from software rendering is the real bottleneck.
- **Disable Spotlight indexing** inside the VM to reduce background I/O:

```bash
sudo mdutil -a -i off
```

### Step 9: Install Claude Desktop + Cowork

1. Open Safari in the macOS VM
2. Navigate to https://claude.ai
3. Download Claude Desktop for macOS
4. Install and sign in with your Anthropic account
5. Enable Cowork/Dispatch from Settings
6. Pair with your phone for remote tasking

---

## VM Specs Used

| Setting | Value |
|---------|-------|
| VMware Version | Workstation Pro 25H2 |
| Guest OS | darwin24-64 (macOS Sequoia) |
| Hardware Version | 21 |
| RAM | 12 GB |
| CPU | 4 cores |
| Disk | 128 GB SATA (APFS) |
| Network | NAT |
| Boot | OpenCore via ISO + recoveryOS VMDK |
| Display | 1280 x 1024, 3D acceleration OFF |

---

## File Sizes Reference

These are the expected file sizes — useful for verifying you have the right files:

| File | Expected Size | Notes |
|------|--------------|-------|
| opencore.iso | ~40 MB | The real bootloader — use this |
| opencore.vmdk | ~1 KB | Descriptor only — NOT bootable on its own |
| macos.vmdk | ~17 MB | Empty APFS disk (grows during install) |
| macos.nvram | ~265 KB | Preconfigured UEFI boot variables |
| macos.vmx | ~5 KB | VM configuration |
| sequoia.vmdk | ~2.3 GB | recoveryOS boot disk |

---

## Troubleshooting

### VM won't open / double-click does nothing
- Check VMware version — need 25H2 or 17.6+
- Check for `{{template}}` placeholders in VMX — means you have source, not release
- Check `virtualHW.version` — must match your VMware version

### UEFI Shell appears instead of macOS
- The NVRAM boot entry isn't finding OpenCore
- Make sure `opencore.iso` is attached as CDROM and connected at power on
- Make sure `sequoia.vmdk` (recovery) is attached as sata0:2
- Try: `FS0:` → `cd EFI\BOOT` → `BOOTx64.efi` from the shell

### BOOTx64.efi loads but does nothing
- Wrong architecture — make sure you're using the Intel ISO, not AMD
- Missing NVRAM — make sure `macos.nvram` from the release is in the VM folder

### macOS installer can't find disk
- Open Disk Utility first and erase the main disk as APFS
- The disk must be formatted before the installer can see it

### VM is extremely slow / sluggish UI
- See **Step 8: Performance Tuning** above
- Most common fix: lower display resolution to 1280x1024 and disable 3D acceleration
- Reduce motion + reduce transparency in macOS Accessibility settings
- Disable sleep to prevent expensive wake-from-standby cycles
- Verify VM is stored on SSD, not spinning HDD
- Check that CPU allocation is ≤ half your physical cores

### Copy/paste not working between Windows and macOS
- VMware Tools must be installed inside the VM (Step 7)
- After install, allow vmware-tools-daemon in System Settings → Privacy & Security → Accessibility
- Reboot the VM after granting the permission

---

## Purpose

This macOS VM enables:
- **Cowork/Dispatch** with full computer use (mouse/keyboard/screen control)
- **Autonomous job applications** via CareerPilot auto-apply pipeline
- Testing browser automation without Claude in Chrome's tool call limits
- Remote tasking from phone — "apply to my queued jobs" while away from desk

---

*Guide created: March 30, 2026*
*Last updated: March 30, 2026*
*INFRA-55 | CareerPilot Project*
