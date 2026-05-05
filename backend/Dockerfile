# ──────────────────────────────────────────────────────────────────
# ScanAI — Worker Dockerfile
# Base: nuclei image with all ProjectDiscovery tools + Python + testssl
# ──────────────────────────────────────────────────────────────────

FROM projectdiscovery/nuclei:latest AS pd-tools

# ── Stage 2: Build the actual worker image ──
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    wget \
    git \
    dnsutils \
    bsdmainutils \
    openssl \
    procps \
    nmap \
    jq \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy nuclei from the PD image
COPY --from=pd-tools /usr/local/bin/nuclei /usr/local/bin/nuclei

# Install Go (needed to install PD tools from source)
ENV GOVERSION=1.22.5
RUN curl -fsSL "https://go.dev/dl/go${GOVERSION}.linux-amd64.tar.gz" | tar -C /usr/local -xz
ENV PATH="/usr/local/go/bin:/root/go/bin:${PATH}"
ENV GOPATH="/root/go"

# Install ProjectDiscovery tools
RUN go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest && \
    go install github.com/projectdiscovery/httpx/cmd/httpx@latest && \
    go install github.com/projectdiscovery/naabu/v2/cmd/naabu@latest && \
    go install github.com/projectdiscovery/katana/cmd/katana@latest

# Install testssl.sh
RUN git clone --depth 1 https://github.com/testssl/testssl.sh.git /opt/testssl && \
    ln -s /opt/testssl/testssl.sh /usr/local/bin/testssl.sh && \
    chmod +x /opt/testssl/testssl.sh

# Update nuclei templates
RUN nuclei -update-templates 2>/dev/null || true

# Create app directory
WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create temp directory for scan outputs
RUN mkdir -p /tmp/scanai

# Default: run the API server (override in docker-compose for worker)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
