# tooling/real-constructor: снятие зависших сессий 1С через RAS

Операционный README для tooling `real-constructor`: как из dev-контейнера
управлять сессиями кластера 1С, найти и принудительно завершить зависшую
сессию через сервер администрирования `ras` и клиент `rac`.

## Запуск драйвера

`real-constructor` управляет живым веб-клиентом 1С через Playwright: открывает
«Консоль запросов», запускает штатный «Конструктор запроса» и сохраняет
скриншоты для ручной сверки UI. Это исследовательский tooling, не часть VSIX и
не CI-gate.

1. В `.env` задайте `WEB_1C_URL`, `USER_1C` и `PASSWORD_1C`. Значения по
   умолчанию и формат описаны в [`.env.example`](../../.env.example).
2. Убедитесь, что контейнер или хост видит веб-публикацию 1С по этому URL.
3. Установите Chromium для Playwright: `npm run real:setup`.
4. Запустите один сценарий: `npm run real:smoke`.
5. Для инвентаризации десяти запросов выполните `npm run real:inventory`.

Обе команды пишут лог в `tmp/real-constructor.log`, а скриншоты -- в
`tmp/phase7.3-real-constructor/`. Им нужен соответствующий корпус в
`tmp/query1c`; как его подготовить, описано в
[docs/corpus-testing.md](../../docs/corpus-testing.md).

Если запуск останавливается из-за занятой лицензии, используйте процедуру RAS
ниже. Она относится только к окружению с доступом к администрированию кластера.

## Как это устроено

- На хосте работает `ras cluster --port=1545`, слушает `0.0.0.0:1545`.
- Клиент `rac` ходит **только** на `ras` (порт `1545`). Связь `ras` с менеджером
  кластера (`rmngr`, порт `1541`) и агентом (`ragent`, порт `1540`) происходит
  локально на хосте — контейнеру эти порты не нужны.
- Контейнер резолвит хост через `host.docker.internal` (`--add-host=...:host-gateway`
  в `.devcontainer/devcontainer.json`).
- Бинарник `rac` в образе `node:22-bookworm` отсутствует, поэтому каталог установки
  платформы 1С пробрасывается с хоста read-only (блок `mounts` в
  `devcontainer.json`), а `post-create.sh` делает симлинк `/usr/local/bin/rac`.

```
контейнер: rac ──TCP 1545──▶ host.docker.internal (ras) ──локально──▶ rmngr/ragent
```

## Предусловия

- Контейнер пересобран после правок (`Dev Containers: Rebuild Container`), иначе
  bind-mount платформы и симлинк `rac` не подхватятся.
- В `.env` заданы креды администратора кластера: `CLUSTER_USER` и `CLUSTER_PWD`
  (нужны, только если у кластера заданы администраторы).

Проверка доступа:

```bash
rac cluster list host.docker.internal:1545
```

Команда должна вернуть описание кластера с его `cluster` (UUID). Если она висит или
отказывает — см. раздел «Если не соединяется».

## Снятие зависшей сессии

Везде ниже `$RAS` — адрес сервера администрирования, а `<uuid>` — UUID кластера из
`rac cluster list`.

```bash
RAS=host.docker.internal:1545

# 1. UUID кластера
rac cluster list $RAS

# 2. Список сессий (найти зависшую: по базе, пользователю, времени старта)
rac session list \
    --cluster=<uuid> \
    --cluster-user=admin --cluster-pwd=*** \
    $RAS

# 3. Завершить конкретную сессию по её UUID
rac session terminate \
    --cluster=<uuid> \
    --session=<session-uuid> \
    --cluster-user=admin --cluster-pwd=*** \
    $RAS
```

Полезные срезы при поиске зависшей сессии:

```bash
# Сессии конкретной информационной базы
rac infobase summary list --cluster=<uuid> --cluster-user=admin --cluster-pwd=*** $RAS   # узнать infobase UUID
rac session list --cluster=<uuid> --infobase=<infobase-uuid> --cluster-user=admin --cluster-pwd=*** $RAS

# Активные соединения (если сессию нужно рвать по соединению)
rac connection list --cluster=<uuid> --cluster-user=admin --cluster-pwd=*** $RAS
```

`--cluster-user` / `--cluster-pwd` обязательны только если у кластера настроены
администраторы. Если администраторов нет — параметры можно опустить.

## Если не соединяется

`ras` слушает `0.0.0.0:1545`, поэтому обычно всё работает сразу после ребилда.
Если `rac cluster list` висит или выдаёт ошибку соединения:

- Убедитесь, что на хосте жив процесс `ras`: `ps -ef | grep '[r]as cluster'`.
- Проверьте, что порт слушается на всех интерфейсах:
  `ss -ltnp | grep 1545` → должно быть `0.0.0.0:1545`.
- Проверьте файрвол хоста (ufw/iptables) — не блокирует ли он docker-подсеть до
  порта `1545` (правится с правами root).

## Обслуживание

Версия платформы больше не зашита в коде. `.devcontainer/devcontainer.json`
монтирует весь каталог `/opt/1cv8/x86_64` (read-only, тем же путём), а конкретную
версию выбирает `.devcontainer/post-create.sh`:

1. `ONEC_PLATFORM_DIR` из `.env`, если задана там;
2. иначе — самая свежая установленная версия из `/opt/1cv8/x86_64/` (автоопределение).

При обновлении платформы 1С обычно ничего править не нужно — после ребилда
подхватится новейшая версия. Чтобы зафиксировать конкретную версию, раскомментируйте
и пропишите `ONEC_PLATFORM_DIR` в `.env`.
