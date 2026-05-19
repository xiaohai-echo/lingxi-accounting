## Deploy Configuration (configured by /setup-deploy)
- Platform: netlify (also: vercel)
- Production URL: https://lingxi-accounting.netlify.app/
- Vercel URL: https://lingxi-accounting.vercel.app/
- Deploy workflow: auto-deploy on push (Netlify + Vercel both auto-deploy from connected Git repo)
- Deploy status command: HTTP health check
- Merge method: merge
- Project type: web app (static SPA)
- Post-deploy health check: https://lingxi-accounting.netlify.app/

### Custom deploy hooks
- Pre-merge: none
- Deploy trigger: automatic on push to main
- Deploy status: poll production URL until HTTP 200
- Health check: https://lingxi-accounting.netlify.app/
