C2C STUDIO – PREVIEW COPY (not the live app)
=============================================

This copy opens straight into the studio with NO sign-in and never contacts
chetchic.com or Wix. A pink "PREVIEW – Preview copy – not the live app" tag in
the header lets you switch what a visitor would see:
  • Haute Pass (paid)            – everything unlocked, clean full-size exports
  • Friends of Chet Chic (free)  – watermark, 10 rotating templates, half-size
                                   exports, 1 demo photo upload (counted on
                                   this device only; "Reset free demo upload"
                                   in the switch gives it back)
  • No plan (gate screen)        – the "Choose a plan" screen
  • Signed out (gate screen)     – the "Sign in on chetchic.com" screen
On the two gate screens the switch sits at the bottom-left corner.
Your choice is remembered in this browser.

HOW TO PUT IT ONLINE (about 5 minutes)
1. On github.com, signed in as chetchic, click + (top right) > New repository.
2. Repository name: C2C-preview   Visibility: Public   > Create repository.
3. Click "uploading an existing file". Unzip this zip first, then drag
   EVERYTHING inside it (the files AND the folders assets, templates,
   branding, cc, cursors) into the upload box. They must sit at the top
   level of the repo, not inside an extra folder. Click Commit changes.
4. Settings > Pages. Source: Deploy from a branch. Branch: main, folder
   / (root) > Save. Leave "Custom domain" EMPTY.
5. Wait a couple of minutes, then open:
       https://chetchic.github.io/C2C-preview/
   (If you named the repo something else, use that name instead – the
   copy works under any repo name.)

IMPORTANT
• There is deliberately NO CNAME file in this zip. Do not add one and do
  not type a custom domain – it would fight with your real site
  c2cstudio.chetchic.com.
• Do not upload these files to your real chetchic/C2C repo.
• The page asks search engines not to list it, but anyone with the link can
  open it while the repo is public. When you are done testing, delete the
  repo (Settings > scroll to the bottom > Delete this repository) or make it
  private (Settings > Change visibility).
