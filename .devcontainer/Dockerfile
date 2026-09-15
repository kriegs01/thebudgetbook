FROM mcr.microsoft.com/devcontainers/base:2.0.4-noble

RUN set -eux; apt-get update; apt-get install -y --no-install-recommends nodejs npm; apt-get clean; rm -rf /var/lib/apt/lists/*

# Additional packages can be installed in the RUN instruction above.
