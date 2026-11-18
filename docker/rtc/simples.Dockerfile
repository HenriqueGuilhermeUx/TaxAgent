FROM eclipse-temurin:21-jdk-jammy AS build

ARG RTC_SIMPLES_COMMIT=c5b0f01c8351c3f0d0795cc617b29d233e9f98df
ARG RTC_REGULAR_DB_COMMIT=150cccbe414d4a5edea703e4f7a424af5aa222c7

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN git init /src \
 && cd /src \
 && git remote add origin https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional.git \
 && git fetch --depth 1 origin "${RTC_SIMPLES_COMMIT}" \
 && git checkout --detach FETCH_HEAD \
 && test "$(git rev-parse HEAD)" = "${RTC_SIMPLES_COMMIT}"

RUN git init /regular-db \
 && cd /regular-db \
 && git remote add origin https://github.com/ReceitaFederal/calculadora-rtc-regime-regular.git \
 && git fetch --depth 1 origin "${RTC_REGULAR_DB_COMMIT}" \
 && git checkout --detach FETCH_HEAD \
 && test "$(git rev-parse HEAD)" = "${RTC_REGULAR_DB_COMMIT}"

WORKDIR /src

RUN rm -rf ./flyway \
 && cp -r /regular-db/flyway ./flyway \
 && mkdir -p ./calculadora/db \
 && ./mvnw flyway:migrate \
      -Dflyway.configFiles=./flyway/flyway-pro.conf \
      --batch-mode --errors

RUN ./mvnw --batch-mode --errors -ntp -DskipTests clean package \
 && test -s target/api-simples-nacional.jar \
 && test -s calculadora/db/calculadora-pro.db

FROM eclipse-temurin:21-jre-jammy

WORKDIR /app
ENV SPRING_PROFILES_ACTIVE=offline

COPY --from=build /src/target/api-simples-nacional.jar ./api-simples-nacional.jar
COPY --from=build /src/calculadora ./calculadora

EXPOSE 8082 9103

ENTRYPOINT ["java","-jar","api-simples-nacional.jar"]
