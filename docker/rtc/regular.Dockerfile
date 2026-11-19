FROM maven:3.9.5-eclipse-temurin-21 AS build

ARG RTC_REGULAR_COMMIT=150cccbe414d4a5edea703e4f7a424af5aa222c7

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN git init /src \
 && cd /src \
 && git remote add origin https://github.com/ReceitaFederal/calculadora-rtc-regime-regular.git \
 && git fetch --depth 1 origin "${RTC_REGULAR_COMMIT}" \
 && git checkout --detach FETCH_HEAD \
 && test "$(git rev-parse HEAD)" = "${RTC_REGULAR_COMMIT}"

WORKDIR /src

RUN set -eux; \
    mkdir -p ./calculadora/db; \
    success=0; \
    for attempt in 1 2 3 4 5; do \
      if mvn flyway:migrate -Dflyway.configFiles=./flyway/flyway-pro.conf --batch-mode --errors -ntp; then success=1; break; fi; \
      if [ "$attempt" -lt 5 ]; then sleep $((attempt * 10)); fi; \
    done; \
    test "$success" = "1"; \
    test -s calculadora/db/calculadora-pro.db

RUN set -eux; \
    success=0; \
    for attempt in 1 2 3 4 5; do \
      if mvn --batch-mode --errors -ntp -DskipTests clean package; then success=1; break; fi; \
      if [ "$attempt" -lt 5 ]; then sleep $((attempt * 10)); fi; \
    done; \
    test "$success" = "1"; \
    test -s target/api-regime-geral.jar; \
    test -s calculadora/db/calculadora-pro.db

FROM eclipse-temurin:21-jre-jammy

WORKDIR /app
ENV SPRING_PROFILES_ACTIVE=offline

COPY --from=build /src/target/api-regime-geral.jar ./api-regime-geral.jar
COPY --from=build /src/calculadora ./calculadora

EXPOSE 8080 9101

ENTRYPOINT ["java","-jar","api-regime-geral.jar"]
