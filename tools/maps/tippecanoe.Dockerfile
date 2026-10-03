FROM ubuntu:24.04 AS build

ARG DEBIAN_FRONTEND=noninteractive
ARG TIPPECANOE_REF=main

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates \
      git \
      build-essential \
      libsqlite3-dev \
      zlib1g-dev \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN git clone --depth 1 --branch "$TIPPECANOE_REF" https://github.com/felt/tippecanoe.git .

RUN make -j"$(nproc)"

FROM ubuntu:24.04

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates \
      libsqlite3-0 \
      zlib1g \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build /src/tippecanoe /usr/local/bin/tippecanoe
COPY --from=build /src/tile-join /usr/local/bin/tile-join
COPY --from=build /src/tippecanoe-decode /usr/local/bin/tippecanoe-decode
COPY --from=build /src/tippecanoe-enumerate /usr/local/bin/tippecanoe-enumerate

ENTRYPOINT []
CMD ["tippecanoe", "--version"]
