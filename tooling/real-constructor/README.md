# tooling/real-constructor

Операционный README для tooling `real-constructor`: запуск драйвера и снятие
зависшей сессии кластера 1С через сервер администрирования `ras` и клиент `rac`.

## Запуск драйвера

`real-constructor` управляет живым веб-клиентом 1С через Playwright: открывает
«Консоль запросов», запускает штатный «Конструктор запроса» и сохраняет
скриншоты для ручной сверки UI. Это исследовательский tooling, не часть VSIX и
не CI-gate.

1. В `.env` задайте `WEB_1C_URL`, `USER_1C` и `PASSWORD_1C`. Значения по
   умолчанию и формат описаны в [`.env.example`](../../.env.example).
2. Убедитесь, что машина, на которой запускается драйвер, видит веб-публикацию 1С
   по этому URL.
3. Установите Chromium для Playwright: `npm run real:setup`.
4. Запустите один сценарий: `npm run real:smoke`.
5. Для инвентаризации десяти запросов выполните `npm run real:inventory`.

Обе команды пишут лог в `tmp/real-constructor.log`, а скриншоты -- в
`tmp/phase7.3-real-constructor/`. Им нужен соответствующий корпус в
`tmp/query1c`; как его подготовить, описано в
[docs/development/corpus-testing.md](../../docs/development/corpus-testing.md).

Если запуск останавливается из-за занятой лицензии, используйте процедуру RAS
ниже. Она относится только к окружению с доступом к администрированию кластера.

## Предусловия

- Клиент `rac` из установки платформы 1С и доступ к `ras` кластера (обычно
  `ras cluster --port=1545` на сервере 1С). `rac` ходит только на `ras`; связь `ras`
  с менеджером кластера (`rmngr`, `1541`) и агентом (`ragent`, `1540`) локальна на
  сервере.
- В `.env` заданы креды администратора кластера: `CLUSTER_USER` и `CLUSTER_PWD`
  (нужны, только если у кластера заданы администраторы).

Проверка доступа (`<сервер>` — адрес сервера 1С):

```bash
rac cluster list <сервер>:1545
```

Команда должна вернуть описание кластера с его `cluster` (UUID). Если она висит или
отказывает — см. раздел «Если не соединяется».

## Снятие зависшей сессии

Везде ниже `$RAS` — адрес сервера администрирования, а `<uuid>` — UUID кластера из
`rac cluster list`.

```bash
RAS=<сервер>:1545

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

Если `rac cluster list` висит или выдаёт ошибку соединения:

- Убедитесь, что на сервере жив процесс `ras`: `ps -ef | grep '[r]as cluster'`.
- Проверьте, что порт слушается на нужном интерфейсе:
  `ss -ltnp | grep 1545` (например, `0.0.0.0:1545`).
- Проверьте файрвол сервера (ufw/iptables) — не блокирует ли он порт `1545` для
  машины, с которой запускается `rac`.
