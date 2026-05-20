# AnaesApp — Deploy Instructions

## Files to upload to GitHub

Upload ALL of these to your GitHub repository:

```
index.html
package.json
vite.config.ts
tsconfig.json
vercel.json
src/
  main.tsx
  App.tsx
  AnaesApp.tsx   ← copy this from your Replit download
api/
  anaes-ai/
    assist.ts
```

## IMPORTANT — AnaesApp.tsx

You must also upload your `AnaesApp.tsx` file into the `src/` folder.
Download it from Replit: artifacts/anaes-app/src/AnaesApp.tsx

## Deploy on Vercel

1. Go to vercel.com → Add New Project → Import from GitHub
2. Select the AnaesApp repository
3. Add Environment Variable:
   - Name:  ANTHROPIC_API_KEY
   - Value: your key from console.anthropic.com
4. Click Deploy

That's it. Your app will be live in ~2 minutes.
