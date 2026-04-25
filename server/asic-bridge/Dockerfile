FROM rust:1.82-slim-bookworm AS builder
WORKDIR /build

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        pkg-config libssl-dev git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock* ./
COPY src ./src

RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/target/release/asic-bridge /usr/local/bin/asic-bridge

ENV ASIC_BRIDGE_PORT=9099
EXPOSE 9099

ENTRYPOINT ["/usr/local/bin/asic-bridge"]
