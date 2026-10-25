# Build backend
FROM node:16-bookworm-slim AS backend-builder

# Create app directory
WORKDIR /app

# Install the backend's dependencies exactly as the lockfile pins them. Both
# workspaces' package.json are needed for the lockfile to match; only the
# backend's dependencies are installed.
COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/frontend/package.json ./apps/frontend/package.json
RUN npm ci --workspace umbrel-lnd-backend --no-audit --no-fund
# Copy project files and folders
COPY apps/backend ./apps/backend



# Build frontend
FROM node:16-bookworm-slim AS frontend-builder

# Create app directory
WORKDIR /app

# Install the frontend's dependencies exactly as the lockfile pins them.
COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/frontend/package.json ./apps/frontend/package.json
RUN npm ci --workspace umbrel-lnd-frontend --no-audit --no-fund

# Copy project files and folders
COPY apps/frontend ./apps/frontend

# Build assets
RUN yarn run build:frontend



# Final image
FROM node:16-bookworm-slim AS lightning
ARG TARGETARCH

# The channel backup agent the StartOS package runs, and what it needs: rclone
# for the targets, jq for its state, ssh-keyscan/ssh-keygen for SFTP host keys
# and key checks, flock (util-linux) to serialize copies. rclone comes from
# its own release rather than Debian's, which lags the Dropbox and Google
# token handling the agent relies on. The agent is pinned to a commit of the
# package repository: one script serves both platforms.
# Both downloads are checked against pinned SHA-256 sums (rclone's from its
# release SHA256SUMS; the agent's from the pinned commit), so a version pin
# is an artifact pin. curl and unzip leave with the layer.
ARG RCLONE_VERSION=v1.68.2
ARG RCLONE_SHA256_AMD64=0e6fa18051e67fc600d803a2dcb10ddedb092247fc6eee61be97f64ec080a13c
ARG RCLONE_SHA256_ARM64=c6e9d4cf9c88b279f6ad80cd5675daebc068e404890fa7e191412c1bc7a4ac5f
ARG BACKUP_AGENT_REF=edf1b4285ace1a540e998da164c8035ce37c106e
ARG BACKUP_AGENT_SHA256=3c28e380819bc2a051cb4f71d02e36c121cbf3be76264ad0099a22a17560f07d
RUN set -eu; \
    arch="${TARGETARCH:-$(dpkg --print-architecture)}"; \
    case "$arch" in amd64) sum="$RCLONE_SHA256_AMD64" ;; arm64) sum="$RCLONE_SHA256_ARM64" ;; *) echo "no rclone checksum for $arch" >&2; exit 1 ;; esac; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl unzip jq openssh-client util-linux; \
    curl -fsSL "https://downloads.rclone.org/${RCLONE_VERSION}/rclone-${RCLONE_VERSION}-linux-${arch}.zip" -o /tmp/rclone.zip; \
    echo "$sum  /tmp/rclone.zip" | sha256sum -c -; \
    unzip -j /tmp/rclone.zip '*/rclone' -d /usr/local/bin; \
    chmod 755 /usr/local/bin/rclone; \
    rm -f /tmp/rclone.zip; \
    curl -fsSL "https://raw.githubusercontent.com/paulscode/lightning-fork-startos/${BACKUP_AGENT_REF}/backup-agent.sh" -o /usr/local/bin/backup-agent.sh; \
    echo "$BACKUP_AGENT_SHA256  /usr/local/bin/backup-agent.sh" | sha256sum -c -; \
    chmod 755 /usr/local/bin/backup-agent.sh; \
    sh -n /usr/local/bin/backup-agent.sh; \
    apt-get purge -y --auto-remove curl unzip; \
    rm -rf /var/lib/apt/lists/*; \
    rclone version | head -1

# The CAs the image trusts. Eight eMudhra intermediates were found in
# October 2026 to have private keys anyone can recover (CVE-2026-111943).
# They chain to emSign ECC Root CA - G3, and through Sectigo's cross-signs to
# Comodo AAA Services root; bookworm's ca-certificates 20250419~deb12u2
# drops both, so the build refuses an older package. emSign Root CA - C1 and
# emSign ECC Root CA - C3 are distrusted as well, as Mozilla removed them
# (NSS 3.131.1, Alpine ca-certificates 20261020) at eMudhra's request in the
# same week; emSign Root CA - G1 is kept, as Mozilla keeps it. The build
# fails if any of these roots is still in the bundle.
# Node uses that bundle (--use-openssl-ca) instead of the roots compiled
# into Node 16, which still trust them; rclone, being Go, reads the bundle
# already.
RUN set -eu; \
    ver="$(dpkg-query -W -f='${Version}' ca-certificates)"; \
    dpkg --compare-versions "$ver" ge '20250419~deb12u2' || { echo "ca-certificates $ver still trusts the compromised eMudhra chains" >&2; exit 1; }; \
    sed -i -E 's#^(mozilla/(emSign_Root_CA_-_C1|emSign_ECC_Root_CA_-_C3|emSign_ECC_Root_CA_-_G3|Comodo_AAA_Services_root)\.crt)$#!\1#' /etc/ca-certificates.conf; \
    update-ca-certificates --fresh >/dev/null; \
    subjects="$(openssl crl2pkcs7 -nocrl -certfile /etc/ssl/certs/ca-certificates.crt | openssl pkcs7 -print_certs -noout | grep '^subject=')"; \
    for cn in 'emSign Root CA - C1' 'emSign ECC Root CA - C3' 'emSign ECC Root CA - G3' 'AAA Certificate Services'; do \
      if printf '%s\n' "$subjects" | grep -qE "CN = $cn(,|\$)"; then echo "$cn is still trusted" >&2; exit 1; fi; \
    done; \
    printf '%s\n' "$subjects" | wc -l
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt \
    NODE_OPTIONS=--use-openssl-ca

# Change directory to '/app' 
WORKDIR /app

# Copy built code from build stages to '/app' directory
COPY --from=backend-builder /app /app
COPY --from=frontend-builder /app/apps/frontend/dist/ /app/apps/frontend/dist/

EXPOSE 3006
CMD [ "npm", "run", "dev:backend" ]