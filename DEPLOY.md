# Deploying SuperFront

## Access gate (`access-gate` branch)

Every request to the site (app shell, JS/assets, `/api`, the `/lobbies`
socket and all `/wN/` worker HTTP + WebSocket routes) is checked by nginx
inside the container with `auth_request` against the master
(`/__gate/check`). Browsers without an approved device cookie or an admin
session get the gate page. Node binds to `127.0.0.1` inside the container, so
nothing can reach the game without going through nginx. Code:
`src/server/gate/`, wiring: `nginx.conf`, `Dockerfile`.

New environment / storage:

| Setting              | Where        | Notes                                                                      |
| -------------------- | ------------ | -------------------------------------------------------------------------- |
| `ADMIN_CODE_HASH`    | compose env  | `scrypt:…` hash of the 6-digit admin code. Never put the code itself here. |
| `/data/gate`         | named volume | `requests.json`: requests, approvals, admin sessions. Survives rebuilds.   |
| `GATE_ENABLED=false` | compose env  | Emergency switch: opens the site to everyone. Leave unset normally.        |

### First deploy

On the VM (`/home/ubuntu`):

1. **Get the branch.**

   ```sh
   cd /home/ubuntu/OpenFrontIO
   git fetch origin
   git checkout access-gate # or merge the PR into superfork and pull that
   ```

   If the branch isn't on GitHub yet, copy `superfork-access-gate.bundle` to
   the VM and run
   `git fetch /path/to/superfork-access-gate.bundle access-gate:access-gate && git checkout access-gate`.

2. **Back up compose:** `cp docker-compose.yml docker-compose.yml.pre-gate`

3. **Edit `docker-compose.yml`.** In the `openfront` service, add the hash
   next to `GIT_COMMIT` and mount the volume; declare the volume at the
   bottom. Keep your existing build/labels/networks as they are:

   ```yaml
   services:
     openfront:
       # ...existing image/build/labels/networks...
       build:
         context: ./OpenFrontIO
         args:
           GIT_COMMIT: <commit> # build arg, as today
       environment:
         - GIT_COMMIT=<commit> # runtime env, as today
         - ADMIN_CODE_HASH=scrypt:32768:8:1:<salt>:<hash>
       volumes:
         - gate-data:/data/gate

   volumes:
     gate-data:
   ```

   The hash contains no `$`, so compose won't try to interpolate it. Traefik
   must route to the container's **port 80** (nginx), e.g.
   `traefik.http.services.<name>.loadbalancer.server.port=80`. Ports 3000+
   now only listen on loopback and can't be reached from Traefik.

   If you have a healthcheck that curls `/` or `/api/health` through port 80,
   it'll now get the gate page (403). Point it at the master directly:
   `curl -fsS http://127.0.0.1:3000/api/health`.

4. **Rebuild and start:**

   ```sh
   cd /home/ubuntu
   docker compose up -d --build
   docker logs --tail 50 openfront | grep 'gate:'
   ```

   You should see `gate: no data file … starting empty` (first run) and no
   `ADMIN_CODE_HASH not set` warning.

5. **Check it:**
   - `docker exec openfront curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1/` prints `403`.
   - Open the site in a private window: you get the gate page.
   - Enter the admin code: you land on `/__gate/admin`. "Open game" takes you in.
   - From another device, request access, then approve it in the panel. The
     waiting page opens the game within ~5 seconds.

### Everyday use

- Admin panel: `https://<domain>/__gate/admin` (or enter the code on the
  gate page). Pending / Approved / Denied tabs; Approve, Deny, Revoke,
  Delete. "Delete" on a denied device lets it request again.
- Approval is tied to that browser's cookie. Clearing cookies, a new browser
  or private mode means requesting again.
- Cookies are per-hostname. Devices approved on `sccleo.bid` have to request
  again on `dorame.party`.
- Wrong admin codes: 5 per IP, then a lockout starting at 1 min and
  doubling (max 24 h); at most 20 tries/hour and 100/day across all IPs.
  Failures are logged: `docker logs openfront | grep 'FAILED admin login'`.

### Changing the admin code

```sh
docker exec openfront npx tsx src/server/gate/GenerateAdminCode.ts        # random code
docker exec openfront npx tsx src/server/gate/GenerateAdminCode.ts 123456 # or your own
```

Replace `ADMIN_CODE_HASH` in compose with the new hash and run
`docker compose up -d` (no rebuild needed). Existing admin sessions stay valid
for up to 30 days. To end them all now, stop the container and delete the
`adminSessions` entries in the volume's `requests.json`.

### Rollback

- **Quick (keep the gate code, open the site):** add `GATE_ENABLED=false`
  to the `openfront` env and run `docker compose up -d`.
- **Full:** go back to the previous code and compose file, then rebuild:

  ```sh
  cd /home/ubuntu/OpenFrontIO && git checkout superfork
  cd /home/ubuntu && cp docker-compose.yml.pre-gate docker-compose.yml
  docker compose up -d --build
  ```

  The `gate-data` volume stays, so approvals come back if you redeploy the
  gate later.

- **Fallback:** the `openfront-vanilla` container is still on the box
  (`docker start openfront-vanilla`). Point Traefik at it if it isn't
  already routed.
