# Deploy guide

Push to `main` builds `back_end` and `front_end` and deploys them to one EC2 instance. GitHub authenticates to AWS with OIDC and runs the deploy through SSM, so no SSH and no stored keys.

```
push to main -> GitHub Actions (lint, test, build)
             -> S3 bucket (release bundle)
             -> SSM command on the instance -> deploy/remote-deploy.sh
             -> nginx: /  = /var/www/noree (Vite build)
                       /api/ -> Nest on :3000 (pm2: noree-api)
```

| File | Runs where | Purpose |
|---|---|---|
| `aws-bootstrap.sh` | your PC / CloudShell, once | S3 bucket, instance role (SSM + S3 read), GitHub OIDC role. Idempotent. |
| `setup-server.sh` | the instance, once | Node 22, pm2, nginx, AWS CLI, certbot. Never overwrites an existing nginx config. |
| `enable-https.sh` | the instance, once | Let's Encrypt certificate and http -> https redirect. |
| `remote-deploy.sh` | the instance, every deploy | Pulls the release from S3, updates both apps, health-checks `/api/`. |
| `setup-sandbox.sh` | the instance, every deploy | Installs the 3D service into `~/noree-sandbox`, keeping its `.env`, venv and registry. A failure only warns. |
| `run-sandbox.sh` | the instance, by pm2 | Loads keys and starts the 3D service on `127.0.0.1:8000`. |
| `../.github/workflows/deploy.yml` | GitHub | CI on every push/PR, deploy on `main`. |

## Setting up a new server, in order
1. **AWS side.** In `aws-bootstrap.sh` set `INSTANCE_ID` and `GITHUB_SUB`, then run it with admin credentials: `bash deploy/aws-bootstrap.sh`.
   - `GITHUB_SUB` must be the exact OIDC subject GitHub sends. It embeds numeric IDs, e.g. `repo:<owner>@<id>/<repo>@<id>:environment:production`. If a deploy fails with "Not authorized to perform sts:AssumeRoleWithWebIdentity", print the real `sub` in a workflow step and compare.
2. **GitHub.** Create the environment `production`, limit it to the `main` branch, and add the secrets the bootstrap prints: `AWS_ROLE_ARN`, `INSTANCE_ID`, `S3_BUCKET`.
3. **Security group.** Allow inbound 80 and 443. Port 22 is not needed for deploys.
4. **Instance setup.** Copy and run the script (Ubuntu arm64):
   ```
   scp -i <key>.pem deploy/setup-server.sh ubuntu@<ip>:~/
   DOMAIN=your.domain.com bash setup-server.sh
   ```
5. **First deploy.** Push to `main`, or run the workflow manually. Check `http://<ip>/` (frontend) and `http://<ip>/api/` (`Hello World!`).
6. **HTTPS.** Once the domain's A record points at the Elastic IP:
   ```
   scp -i <key>.pem deploy/enable-https.sh ubuntu@<ip>:~/
   DOMAIN=your.domain.com EMAIL=you@example.com bash enable-https.sh
   ```

## Notes
- `/api/foo` reaches Nest as `/foo` (nginx strips the prefix). Call the API with relative URLs, so no CORS is needed.
- Backend secrets go in `~/noree-api/.env` on the server. Deploys never overwrite it.
- The 3D service also reads `~/noree-api/.env`. Its own `~/noree-sandbox/.env` only needs `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET`. After changing it, run `pm2 restart noree-sandbox --update-env`.
- Deploys replace the frontend files and the backend `dist/`, then reload pm2. They never touch nginx or the certificate.
- Re-running `setup-server.sh` is safe: the nginx config is only written if it doesn't exist.
- A browser opening `https://` before step 6 fails with "site can't be reached". Plain `http://` works.
- If the repo is renamed or recreated, its IDs change: update `GITHUB_SUB` and re-run `aws-bootstrap.sh`.
