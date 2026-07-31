FROM docker.io/library/node:24-bookworm-slim AS frontend

WORKDIR /build
COPY Project.toml CHANGELOG.md ./
COPY public/robots.txt public/robots.txt
COPY gui/package.json gui/package-lock.json gui/
RUN npm --prefix gui ci --include=dev
COPY contracts contracts
COPY gui gui
RUN npm --prefix gui run build

FROM docker.io/library/julia:1.12.6-bookworm AS application

LABEL org.opencontainers.image.title="WebQuantumSavory"
LABEL org.opencontainers.image.description="Public educational WebQuantumSavory deployment"
LABEL org.opencontainers.image.source="https://github.com/QuantumSavory/WebQuantumSavory"

ENV GENIE_ENV=prod
ENV JULIA_DEPOT_PATH=/opt/webquantumsavory/depot
ENV WQS_DEPLOYMENT_PROFILE=public
ENV WQS_ENABLE_SOURCE_EVALUATION=false
ENV WEBQUANTUMSAVORY_ENABLE_MCP=false

RUN groupadd --gid 10001 webquantumsavory \
    && useradd \
        --uid 10001 \
        --gid webquantumsavory \
        --home-dir /home/webquantumsavory \
        --create-home \
        --shell /usr/sbin/nologin \
        webquantumsavory \
    && mkdir -p "$JULIA_DEPOT_PATH" /app \
    && chown -R webquantumsavory:webquantumsavory \
        /home/webquantumsavory /opt/webquantumsavory /app

WORKDIR /app
COPY --chown=webquantumsavory:webquantumsavory Project.toml bootstrap.jl routes.jl ./
COPY --chown=webquantumsavory:webquantumsavory src src
COPY --chown=webquantumsavory:webquantumsavory config config
COPY --chown=webquantumsavory:webquantumsavory contracts contracts
COPY --from=frontend --chown=webquantumsavory:webquantumsavory /build/public public

USER 10001:10001
RUN julia --startup-file=no --project=/app -e \
    'using Pkg; Pkg.instantiate(); Pkg.precompile(); using WebQuantumSavory'

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD curl --fail --silent --show-error http://127.0.0.1:8000/status >/dev/null

CMD ["julia", "--startup-file=no", "--project=/app", "/app/bootstrap.jl", "-s=true"]
