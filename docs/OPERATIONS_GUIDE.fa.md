# راهنمای راه‌اندازی و بهره‌برداری از Event Engine

> **زبان:** [English](./OPERATIONS_GUIDE.md) | فارسی
> مخاطب: کاربری که **هیچ دانش قبلی** نسبت به این پروژه ندارد.
> تمام دستورات این راهنما روی استک واقعی (PostgreSQL 17 و Redis 7.4 در Docker) روی ویندوز ۱۱ با Git Bash اجرا و تأیید شده‌اند؛ رفتارهای وابسته به نسخه صراحتاً مشخص شده‌اند.

---

## ۱. این پروژه چیست؟ (نگاه مفهومی)

این پروژه یک **موتور پردازش رویداد** است: سرویسی بک‌اند که _رویدادها_ را (پیام‌های کوچک JSON که توصیف‌کننده اتفاقی مانند «یک سفارش ثبت شد» هستند) از طریق یک API ن HTTP دریافت می‌کند، آن‌ها را به‌صورت ماندگار در پایگاه داده PostgreSQL ذخیره می‌کند و سپس به یک Redis Stream می‌فرستد تا مصرف‌کننده‌های پس‌زمینه بتوانند آن‌ها را به‌صورت غیرهمگام و مستقل از درخواست HTTP پردازش کنند.

این پروژه از چهار بخش همکار تشکیل شده است:

1. **موتور** — سرویس Node.js/TypeScript شامل API ن HTTP و مصرف‌کننده پس‌زمینه (`src/main.ts`).
2. **PostgreSQL** — «منبع حقیقت» ماندگار که هر رویداد پذیرفته‌شده را برای همیشه نگه می‌دارد (فقط-الحاقی).
3. **Redis Streams** — لایه انتقال که دریافت را از پردازش جدا می‌کند (تحویل حداقل-یک‌بار).
4. **داشبورد وب** — اپلیکیشن Next.js روی پورت ۳۱۰۰ که سلامت سیستم، سنجه‌های زنده توان عملیاتی، فید ترکیبی رویداد/پیام مردود را نشان می‌دهد و امکان تزریق رویداد آزمایشی از طریق مرورگر را فراهم می‌کند.

بازیگران فرعی: **Prometheus** (جمع‌آوری سنجه‌ها)، **Grafana** (داشبوردهای نموداری)، مجموعه کامل تست (۵۹ تست) و Docker Compose برای اجرای تمام زیرساخت‌ها با یک دستور.

در یک جمله: _شما یک رویداد POST می‌کنید؛ رویداد به‌صورت امن ذخیره می‌شود، به گروه مصرف‌کننده استریم می‌شود، با تلاش مجدد خودکار پردازش می‌شود، در صورت شکست مکرر به صف پیام‌های مردود می‌رود و شما همه این‌ها را به‌صورت زنده در مرورگر تماشا می‌کنید._

---

## ۲. اجزا و پورت‌های سیستم

| جزء                    | فناوری                                 | پورت پیش‌فرض | نحوه اجرا                   |
| ---------------------- | -------------------------------------- | ------------ | --------------------------- |
| API موتور + مصرف‌کننده | Node.js ≥ 22، Fastify 5                | `3000`       | `npm run dev` (ریپوی پروژه) |
| داشبورد وب             | Next.js 15 (App Router)، React 19      | `3100`       | `npm run dashboard:dev`     |
| PostgreSQL             | `postgres:17-alpine`                   | `5432`       | `npm run stack:up` (Docker) |
| Redis                  | `redis:7.4-alpine` (AOF، `noeviction`) | `6379`       | `npm run stack:up` (Docker) |
| Prometheus             | `prom/prometheus:v3.2.1`               | `9090`       | `npm run stack:up` (Docker) |
| Grafana                | `grafana/grafana:11.6.0`               | `3001`       | `npm run stack:up` (Docker) |

> ⚠️ نکته پورت: داشبورد عمداً از **۳۱۰۰** استفاده می‌کند (۳۰۰۰ مال موتور است و گرافانا ۳۰۰۱ را گرفته).

---

## ۳. پیش‌نیازها و نصب

فقط سه ابزار لازم دارید.

### ۳.۱ Node.js ≥ 22.11.0 (همراه با npm)

بررسی نصب بودن:

```bash
node --version    # باید v22.x.x یا بالاتر چاپ شود
npm --version     # باید 10.x یا بالاتر چاپ شود
```

در صورت نبود، از <https://nodejs.org> (نسخه LTS) نصب کنید یا با [nvm-windows](https://github.com/coreybutler/nvm-windows) / [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm install 22
nvm use 22
```

حداقل نسخه در `package.json` (ریشه پروژه) با `"engines": { "node": ">=22.11.0" }` اجباری شده است.

### ۳.۲ Docker Desktop (با دیمون در حال اجرا)

Docker تأمین‌کننده PostgreSQL، Redis، Prometheus و Grafana است تا مجبور به نصب بومی هیچ‌کدام نباشید.

بررسی اینکه **دیمون** در حال اجراست (خطای رایج — نصب بودن Docker Desktop کافی نیست):

```bash
docker info --format '{{.ServerVersion}}'   # در حالت سالم مثلاً 29.9.1 چاپ می‌شود
```

اگر خطایی مثل `failed to connect to the docker API ...` دیدید، **Docker Desktop** را اجرا کنید:

- **ویندوز:** از منوی Start اجرا کنید (نصب per-user معمولاً در مسیر `C:\Users\<you>\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe` است) و تا پیام «Docker Desktop is running» در system tray صبر کنید. اولین اجرا پس از بوت ممکن است ۱ تا ۳ دقیقه طول بکشد.
- **macOS:** Docker را از Applications اجرا کنید.
- **لینوکس:** `sudo systemctl start docker`.

در پذیرش‌آزمایی با Docker نسخه **29.9.1** تأیید شده است.

### ۳.3 گیت (Git)

برای فعال‌شدن هوک‌های Git هنگام `npm install` (لینت/فرمت پیش از کامیت و اعتبارسنجی پیام‌ها بر اساس Conventional Commits). بررسی با `git --version`؛ نصب از <https://git-scm.com>. در ویندوز از **Git Bash** برای دستورات این راهنما استفاده کنید.

همین! PostgreSQL، Redis، Prometheus و Grafana از ایمیج‌های Docker می‌آیند و هرگز به‌صورت بومی نصب نمی‌شوند.

---

## ۴. دریافت کد منبع

```bash
cd <مسیر-پروژه‌های-شما>
git clone <repository-url> event-engine  # یا پوشه را کپی کنید
cd event-engine                          # تمام دستورات بعدی از اینجا اجرا می‌شوند
```

در این راهنما، ریشه پروژه `event-engine/` نامیده می‌شود. روی دستگاه مرجع: `C:\Users\GIGABYTE-PC\Desktop\ai\event-engine`.

---

## ۵. ساختار پروژه (توضیح تک‌تک پوشه‌ها)

```
event-engine/
├── package.json                  # وابستگی‌های موتور + تمام اسکریپت‌های npm (ریشه)
├── tsconfig.json                 # پیکربندی TypeScript سخت‌گیرانه (موتور + تست‌ها)
├── tsconfig.build.json           # پیکربندی بیلد پروداکشن (فقط src/ → dist/)
├── eslint.config.mjs             # ESLint 9 (با بررسی نوع)
├── .prettierrc.json              # قواعد فرمت‌بندی
├── lint-staged.config.mjs        # پیش از کامیت: eslint --fix + prettier
├── commitlint.config.mjs         # اعمال Conventional Commits
├── vitest.config.ts              # پیکربندی اجراکننده تست موتور
├── docker-compose.yml            # PostgreSQL + Redis + Prometheus + Grafana
├── .env                          # پیکربندی محلی موتور (در git نادیده گرفته می‌شود)
├── .env.example                  # قالب مستندشده تمام متغیرها
├── .nvmrc                        # نسخه پیشنهادی Node (22)
├── .husky/                       # هوک‌های Git: pre-commit، commit-msg
│
├── src/                          # ===== موتور (TypeScript) =====
│   ├── main.ts                   # نقطه ورود: راه‌اندازی ترتیبی همه اجزا
│   ├── domain/                   # مدل کسب‌وکار خالص (بدون هیچ فریم‌ورک)
│   │   ├── entities/             #   اگریگات EventRecord + کلاس‌های پایه
│   │   ├── value-objects/        #   EventId، EventType، AggregateId، EventPayload، EventMetadata
│   │   ├── events/               #   کلاس پایه DomainEvent + رویداد EventRecorded
│   │   ├── repositories/         #   EventRecordRepository (فقط اینترفیس)
│   │   ├── errors/               #   سلسله‌مراتب خطاهای تایپ‌دار
│   │   └── shared/               #   قرارداد Identifier، الگوهای regex، گاردها
│   ├── application/              # موارد کاربردی (بدون وابستگی به فریم‌ورک)
│   │   ├── commands/             #   هندلرهای IngestEvent و ReplayDeadLetter
│   │   ├── queries/              #   هندلرهای GetEventById، ListEvents، ListDeadLetters
│   │   ├── processing/           #   StreamEventProcessor (موارد کاربردی سمت مصرف‌کننده)
│   │   ├── ports/                #   اینترفیس‌ها: logger، metrics، publisher و…
│   │   ├── dtos/                 #   اسکیماهای zod + شکل پاسخ‌ها
│   │   └── mappers/              #   تبدیل دامنه → DTO
│   ├── infrastructure/           # آداپتورهایی که پورت‌ها را پیاده می‌کنند
│   │   ├── config/env.config.ts  #   اعتبارسنجی zod محیط (بوت fail-fast)
│   │   ├── database/             #   اتصال Prisma، ریپازیتوری‌ها، مپرها
│   │   ├── redis/                #   اتصال، ناشر استریم، مصرف‌کننده، پارسرها
│   │   ├── logger/pino.logger.ts #   آداپتور لاگ pino
│   │   ├── metrics/engine.metrics.ts  # رجیستری prom-client
│   │   └── di/container.ts       #   ریشه ترکیب (سیم‌کشی همه اجزا)
│   ├── interfaces/http/          # لایه Fastify: سرور، روت‌ها، کنترلرها،
│   │                             # هندلر خطا، پروب‌های health/ready/metrics
│   └── shared/                   # ابزارهای errorInfo و withTimeout
│
├── prisma/
│   ├── schema.prisma             # جدول‌ها: events (فروشگاه فقط-الحاقی) و
│   │                             #         dead_letter_events (ممیزی)
│   └── migrations/               # مایگریشن‌های SQL (با prisma migrate ساخته می‌شود)
│
├── tests/                        # ۴۴ تست موتور (بدون نیاز به Docker)
│   ├── integration/http/api.contract.spec.ts
│   └── unit/{config,domain,infrastructure}/
│
├── client/                       # ===== داشبورد (Next.js 15) =====
│   ├── package.json              # وابستگی‌ها + اسکریپت‌های داشبورد
│   ├── next.config.ts            # strict mode، حذف x-powered-by، ریشه tracing
│   ├── .env                      # BACKEND_URL برای BFF (git-ignored)
│   ├── .env.example              # قالب مستندشده
│   ├── src/app/                  # App Router: page.tsx (داشبورد)، layout.tsx، globals.css
│   │   └── api/                  # روت‌های پروکسی (Backend-for-Frontend):
│   │       ├── health/route.ts   #   GET /api/health → موتور /healthz + /readyz
│   │       ├── metrics/route.ts  #   GET /api/metrics → موتور /metrics (تجزیه‌شده)
│   │       ├── events/route.ts   #   GET/POST /api/events → موتور /v1/events
│   │       └── dead-letters/route.ts
│   ├── src/components/           # ویجت‌های UI (کارت سلامت، KPI، جدول، شبیه‌ساز…)
│   ├── src/lib/                  # کلاینت بک‌اند، پارسر Prometheus، هوک polling…
│   ├── tests/api/                # ۱۵ تست داشبورد (هندلرها + پارسر)
│   └── README.md                 # مستندات اختصاصی داشبورد
│
├── monitoring/
│   ├── prometheus/prometheus.yml                        # پیکربندی scrape
│   └── grafana/provisioning/datasources/prometheus.yml  # دیتاسورس خودکار
│
└── docs/
    ├── OPERATIONS_GUIDE.md       # این فایل (انگلیسی)
    └── OPERATIONS_GUIDE.fa.md    # این فایل (فارسی)
```

---

## ۶. مرجع پیکربندی

### ۶.۱ پیکربندی موتور — فایل `event-engine/.env`

موتور یک فایل `.env` در ریشه ریپو می‌خواند (با `dotenv` در `src/main.ts`) و در بوت با zod اعتبارسنجی می‌کند (`src/infrastructure/config/env.config.ts`). **اگر متغیری نباشد یا نامعتبر باشد، فرایند از بوت امتناع می‌کند** و دقیقاً می‌گوید کدام متغیرها مشکل دارند.

اگر فایل وجود ندارد، از قالب بسازید:

```bash
cp .env.example .env
```

تمام متغیرها با مقدار پیش‌فرض و معنی:

| متغیر                                | پیش‌فرض          | اجباری  | معنی                                                                                                                                                        |
| ------------------------------------ | ---------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                           | `development`    | خیر     | `development` \| `test` \| `production`                                                                                                                     |
| `PORT`                               | `3000`           | خیر     | پورت HTTP موتور                                                                                                                                             |
| `LOG_LEVEL`                          | `info`           | خیر     | سطوح pino از `fatal` تا `trace`                                                                                                                             |
| `DATABASE_URL`                       | —                | **بله** | آدرس PostgreSQL. مقدار محلی پیش‌فرض: `postgresql://event_engine:event_engine@localhost:5432/event_engine?schema=public&connection_limit=20&pool_timeout=10` |
| `REDIS_URL`                          | —                | **بله** | آدرس Redis، مثلاً `redis://localhost:6379`                                                                                                                  |
| `REDIS_STREAM_NAME`                  | `events:stream`  | خیر     | نام Redis Stream                                                                                                                                            |
| `REDIS_STREAM_MAX_LENGTH`            | `1000000`        | خیر     | سقف تقریبی `MAXLEN ~` برای محدودسازی حافظه استریم                                                                                                           |
| `REDIS_CONSUMER_GROUP`               | `engine-workers` | خیر     | نام گروه مصرف‌کننده                                                                                                                                         |
| `REDIS_CONSUMER_NAME`                | `worker-1`       | خیر     | نام این مصرف‌کننده در گروه                                                                                                                                  |
| `REDIS_CONSUMER_BATCH_SIZE`          | `100`            | خیر     | تعداد رکورد در هر `XREADGROUP` (۱ تا ۱۰۰۰)                                                                                                                  |
| `REDIS_CONSUMER_BLOCK_MS`            | `2000`           | خیر     | پنجره long-poll هر بار خواندن (۱۰۰ تا ۶۰۰۰۰)                                                                                                                |
| `REDIS_CONSUMER_RECLAIM_IDLE_MS`     | `60000`          | خیر     | رکوردهای معطل مانده بیش از این مدت، از مصرف‌کننده‌های ازکارافتاده بازپس‌گیری می‌شوند                                                                        |
| `REDIS_CONSUMER_RECLAIM_INTERVAL_MS` | `15000`          | خیر     | فاصله زمانی اسکن بازپس‌گیری                                                                                                                                 |
| `REDIS_MAX_DELIVERY_ATTEMPTS`        | `5`              | خیر     | سقف تلاش تحویل قبل از ارسال به صف پیام‌های مردود                                                                                                            |
| `CORS_ORIGINS`                       | `*`              | خیر     | لیست originها با کاما، یا `*`                                                                                                                               |
| `RATE_LIMIT_MAX`                     | `10000`          | خیر     | درخواست در دقیقه به‌ازای هر IP                                                                                                                              |
| `PROCESSING_FAILURE_PATTERN`         | _(خالی)_         | خیر     | **فقط برای تست DLQ** — نوع رویدادهایی که با این regex مطابقت دارند تا مرگ عمداً شکست می‌خورند. در `NODE_ENV=production` بوت رد می‌شود.                      |

فایل `.env` موجود با مقادیر پیش‌فرض Docker Compose هم‌خوانی دارد؛ ترکیب پیش‌فرض بدون هیچ تغییری کار می‌کند.

### ۶.۲ پیکربندی داشبورد — فایل `event-engine/client/.env`

```bash
cp client/.env.example client/.env
```

| متغیر         | پیش‌فرض                 | معنی                                                                                                                                               |
| ------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BACKEND_URL` | `http://127.0.0.1:3000` | آدرس موتور برای روت‌های پروکسی سمت سرور داشبورد. فقط سمت سرور — هرگز به مرورگر ارسال نمی‌شود. در `client/src/lib/env.ts` با zod اعتبارسنجی می‌شود. |

### ۶.۳ متغیرهای Docker Compose

`docker-compose.yml` متغیرهای اختیاری زیر را از `.env` ریشه می‌خواند (با مقادیر پیش‌فرض امن): `POSTGRES_USER`، `POSTGRES_PASSWORD`، `POSTGRES_DB` (همه `event_engine`)، `POSTGRES_PORT` (5432)، `REDIS_PORT` (6379)، `PROMETHEUS_PORT` (9090)، `GRAFANA_PORT` (3001)، `GRAFANA_ADMIN_USER`/`GRAFANA_ADMIN_PASSWORD` (`admin`/`admin`). این‌ها اعتبارنامه توسعه محلی هستند.

---

## ۷. اولین اجرا — گام‌به‌گام

تمام دستورات را از ریشه ریپو (`event-engine/`) اجرا کنید. خروجی‌های مورد انتظار، خروجی واقعی ثبت‌شده در پذیرش‌آزمایی هستند.

**گام ۱ — نصب وابستگی‌های موتور** (هوک‌های Git هم فعال می‌شوند):

```bash
npm install
```

**گام ۲ — اجرای زیرساخت** (هر چهار کانتینر):

```bash
npm run stack:up
```

تا سالم شدن صبر کنید (اجرای اول ایمیج‌ها را دانلود می‌کند — چند دقیقه):

```bash
docker compose ps
# event-engine-postgres     Up … (healthy)
# event-engine-redis        Up … (healthy)
# event-engine-prometheus   Up … (healthy)
# event-engine-grafana      Up …
```

بررسی مستقیم (اختیاری):

```bash
docker compose exec -T postgres pg_isready -U event_engine -d event_engine   # accepting connections
docker compose exec -T redis redis-cli ping                                  # PONG
```

**گام ۳ — ساخت اسکیمای پایگاه داده** (فقط یک‌بار؛ پوشه `prisma/migrations/` ساخته می‌شود):

```bash
npm run prisma:migrate -- --name init
# … Your database is now in sync with your schema.
```

> اگر Prisma درباره drift هشدار داد یا _reset_ پیشنهاد کرد، **بایستید و بخوانید** — reset داده‌ها را حذف می‌کند. روی ولوم تازه این اتفاق نمی‌افتد.

**گام ۴ — اجرای موتور** (ترمینال ۱؛ باز نگه دارید):

```bash
npm run dev
```

لاگ‌های pino را می‌بینید؛ موتور وقتی آماده است که `healthz` جواب بدهد. از ترمینال دوم:

```bash
curl http://localhost:3000/healthz
# {"status":"ok","uptimeSeconds":22,"timestamp":"…"}
curl http://localhost:3000/readyz
# {"status":"ok","checks":{"database":"ok","redis":"ok"},"timestamp":"…"}
```

**گام ۵ — نصب و اجرای داشبورد** (ترمینال ۲):

```bash
npm run dashboard:install    # npm install داخل client/
npm run dashboard:dev        # next dev -p 3100
```

**http://localhost:3100** را باز کنید. حداکثر تا یک چرخه polling (۵ ثانیه) هر سه کارت سلامت سبز می‌شوند.

**اکنون یک سیستم کامل در حال اجرا دارید.** ادامه را ببینید: §۹ (API)، §۱۰ (داشبورد) یا §۱۱ (بازیابی پیام‌های مردود).

---

## ۸. سیستم در زمان اجرا چگونه کار می‌کند (جریان اجرا)

### ۸.۱ ترتیب راه‌اندازی (`src/main.ts`)

1. `loadEnv()` (`src/infrastructure/config/env.config.ts`) — اعتبارسنجی همه متغیرها؛ در صورت خطا توقف.
2. `buildContainer()` (`src/infrastructure/di/container.ts`) — ریشه ترکیب؛ پیاده‌سازی‌های عینی به پورت‌های اپلیکیشن متصل می‌شوند (ریپازیتوری Prisma، ناشر/مصرف‌کننده Redis، لاگر pino، سنجه‌های prom-client).
3. اتصال به PostgreSQL (`src/infrastructure/database/prisma.connection.ts`) و Redis (`src/infrastructure/redis/redis.connection.ts`).
4. `buildServer()` (`src/interfaces/http/server.ts`) — Fastify با helmet، CORS، محدودسازی نرخ بر پایه IP، هوک سنجه درخواست‌ها، هندلر خطای ساختاریافته و پلاگین‌های روت (`src/interfaces/http/routes/`).
5. `app.listen(:3000)` و سپس `eventConsumer.start()` — مصرف‌کننده در صورت نبود، گروه مصرف را می‌سازد (`XGROUP CREATE … MKSTREAM`) و حلقه خواندن را آغاز می‌کند.
6. هندلرهای سیگنال: `SIGTERM`/`SIGINT` خاموشی آرام را آغاز می‌کند (توقف مصرف‌کننده → بستن HTTP → توقف تایمر سنجه‌ها → بستن Redis → بستن Prisma، با گارد اجبار ۱۰ ثانیه‌ای).

### ۸.۲ مسیر دریافت (پیش‌زمینه)

`POST /v1/events` → `src/interfaces/http/routes/event.routes.ts` → `src/interfaces/http/controllers/event.controller.ts` (اعتبارسنجی zod از `src/application/dtos/event.dtos.ts`؛ خطاها به HTTP 400 تمیز با خطاهای فیلدبه‌فیلد تبدیل می‌شوند) → `IngestEventHandler` (`src/application/commands/ingest-event.handler.ts`) → ساخت دامنه (`src/domain/entities/event-record.aggregate.ts`؛ اعتبارسنجی نوع رویداد/اگریگیت/payload و صدای رویداد دامنه) → **ابتدا درج در PostgreSQL** (`src/infrastructure/database/repositories/prisma-event-record.repository.ts`؛ تخصیص `sequence` سراسری) → **سپس انتشار در Redis** (`src/infrastructure/redis/redis-stream.publisher.ts`؛ `XADD … MAXLEN ~ <سقف>` با تایم‌اوت ۵ ثانیه) → پاسخ HTTP 201 همراه رویداد ذخیره‌شده.

### ۸.۳ مسیر مصرف‌کننده (پس‌زمینه)

`RedisStreamConsumer` (`src/infrastructure/redis/redis-stream.consumer.ts`) بی‌نهایت حلقه می‌زند:

1. `XREADGROUP … COUNT 100 BLOCK 2000 STREAMS events:stream >` — دریافت رکوردهای جدید.
2. هر رکورد → `StreamEventProcessor` (`src/application/processing/stream-event.processor.ts`): دیکود با zod، ارسال به هندلرِ ثبت‌شده برای آن نوع رویداد (به‌صورت پیش‌فرض هندلری ثبت نشده — رکوردها اعتبارسنجی و تایید می‌شوند)، ثبت سنجه `processed`.
3. موفقیت → `XACK`. شکست → **بدون ack**؛ رکورد در لیست Pending Entries (PEL) می‌ماند.
4. هر `REDIS_CONSUMER_RECLAIM_INTERVAL_MS`، رکوردهایی که بیش از `REDIS_CONSUMER_RECLAIM_IDLE_MS` معطل مانده‌اند با `XPENDING`/`XCLAIM` بازپس‌گیری می‌شوند (مصرف‌کننده‌های ازکارافتاده خودشان ترمیم می‌شوند).
5. رکوردی که تعداد تحویلش به `REDIS_MAX_DELIVERY_ATTEMPTS` برسد در جدول `dead_letter_events` در PostgreSQL نوشته (`PrismaDeadLetterStore`) و تایید (ack) می‌شود — دیگر هرگز گروه را مسدود نمی‌کند.

### ۸.۴ مسیر بازیابی

`POST /v1/dead-letters/:id/replay` (`src/application/commands/replay-dead-letter.handler.ts`) رویداد اصلی را **از PostgreSQL** بار می‌کند (با وفاداری کامل)، دوباره در استریم منتشر می‌کند و ردیف پیام مردود را حذف می‌کند — اما فقط پس از انتشار موفق؛ پس شکست replay هرگز باعث از دست رفتن رکورد نمی‌شود.

---

## ۹. مرجع API ن HTTP (موتور، پورت ۳۰۰۰)

همه بدنه‌ها JSON هستند. خطاها یک پاکت یکسان دارند: `{"statusCode", "error", "message", "requestId", "details?"}`.

### ۹.۱ دریافت رویداد

```bash
curl -X POST http://localhost:3000/v1/events \
  -H 'content-type: application/json' \
  -d '{
    "eventType": "order.created",
    "aggregateType": "order",
    "aggregateId": "order-42",
    "payload": { "amount": 125.5, "currency": "EUR" },
    "metadata": { "source": "web-checkout" }
  }'
```

- `eventType` — توکن حروف کوچک مثل `order.created` (با regex اعمال می‌شود)، ۳ تا ۱۲۸ کاراکتر.
- `aggregateType` — kebab-case، ۲ تا ۶۴ کاراکتر.
- `aggregateId` — شناسه آزاد، ۱ تا ۱۲۸ کاراکتر.
- `payload` — شیء JSON **غیرخالی**.
- `metadata` — اختیاری؛ `source` (رشته)، `correlationId`/`causationId` (UUID)، `attributes` (شیء).
- `eventId` — UUID اختیاری؛ با ارسال مقدار یکسان، دریافت idempotent می‌شود.

**پاسخ 201** (خروجی واقعی):

```json
{
  "id": "d7842965-fcaa-45c7-a000-d08bed7e27b3",
  "eventType": "order.created",
  "aggregateType": "order",
  "aggregateId": "order-42",
  "version": 1,
  "payload": { "amount": 125.5, "currency": "EUR" },
  "metadata": { "source": "web-checkout" },
  "occurredAt": "2026-10-31T21:41:52.808Z",
  "sequence": "1"
}
```

**400 در خطای اعتبارسنجی** (خروجی واقعی):

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Request body failed schema validation",
  "requestId": "req-9",
  "details": { "formErrors": [], "fieldErrors": { "eventType": ["…must be a lowercase…"] } }
}
```

**409** وقتی `eventId` ارسالی قبلاً ذخیره شده (گارد idempotency).

### ۹.۲ فهرست رویدادها

```bash
curl "http://localhost:3000/v1/events?page=1&pageSize=50&eventType=order.created"
```

→ `{ "items": [...], "page": 1, "pageSize": 50, "total": 2, "totalPages": 1 }` — جدیدترین اول (بر اساس sequence فروشگاه).

### ۹.۳ دریافت یک رویداد

```bash
curl http://localhost:3000/v1/events/<id>     # 200 | 404 | 400 (شناسه خراب)
```

### ۹.۴ پیام‌های مردود و بازیابی

```bash
curl http://localhost:3000/v1/dead-letters?page=1&pageSize=50
curl -X POST http://localhost:3000/v1/dead-letters/<deadLetterId>/replay
# → {"replayed":true,"deadLetterId":"…","eventId":"…"}
```

### ۹.۵ پروب‌ها و سنجه‌ها

```bash
curl http://localhost:3000/healthz    # زنده‌بودن: {"status":"ok",…}
curl http://localhost:3000/readyz     # آماده‌بودن: وضعیت هر وابستگی، بودجه ۲ ثانیه
curl http://localhost:3000/metrics    # خروجی Prometheus
```

---

## ۱۰. استفاده از داشبورد وب (پورت ۳۱۰۰)

**http://localhost:3100** را باز کنید. صفحه (`client/src/app/page.tsx`) از طریق روت‌های سمت‌سرور BFF polling می‌کند — مرورگر هرگز مستقیم با موتور صحبت نمی‌کند.

- **کارت‌های سلامت** (`client/src/components/health-cards.tsx`) — API Gateway، PostgreSQL، Redis؛ هر کدام Healthy/Failing/Offline همراه رشته واقعی جزئیات readiness. هر ۵ ثانیه.
- **پنل سنجه‌ها** (`client/src/components/metrics-panel.tsx`) — نرخ دریافت (req/s) با اسپارک‌لاین، رویداد پردازش‌شده بر ثانیه، طول استریم Redis، مجموع پیام‌های مردود، تأخیر دریافت و وضعیت مشتق‌شده مصرف‌کننده (Consuming/Idle/Stalled). هر ۲ ثانیه. توجه: نرخ‌ها و پیل وضعیت از تفاضل شمارنده‌ها _استنتاج_ می‌شوند؛ شمارنده‌ها و طول استریم مستقیماً اندازه‌گیری می‌شوند.
- **جدول Event Stream** (`client/src/components/event-stream-table.tsx`) — فید ترکیبی جدیدترین‌ها از رویدادهای دریافتی (سبز **Success**) و رکوردهای مردود (نشان قرمز **DLQ** همراه خطا و تعداد تلاش). ردیف‌های جدید فلش می‌زنند؛ قابل توقف.
- **شبیه‌ساز دریافت** (`client/src/components/ingestion-simulator.tsx`) — فرم سمت راست. یک preset انتخاب کنید (`order.created`، `payment.settled`، `user.signed_up`، `shipment.dispatched`)، payload را ویرایش کنید و **Send event** را بزنید. پنل سبز `201 Created · تأخیر · id · sequence` را نشان می‌دهد؛ خطاهای اعتبارسنجی با خطای دقیق هر فیلد نمایش داده می‌شوند؛ هر تلاش با کد وضعیت و تأخیر ثبت می‌شود. رویدادهای ارسالی تا ~۲.۵ ثانیه بعد در جدول ظاهر می‌شوند و اسپارک‌لاین‌ها حرکت می‌کنند.
- **Pause live** (هدر) تمام polling را متوقف می‌کند؛ آخرین داده روی صفحه می‌ماند.

---

## ۱۱. آموزش گام‌به‌گام بازیابی پیام مردود (دستورات تأییدشده)

این سناریو چرخه کامل شکست→ممیزی→بازیابی را در حدود یک دقیقه تمرین می‌کند.

**۱ — فعال‌سازی تزریق خطا و سریع‌کردن تلاش مجدد** — به `event-engine/.env` اضافه و موتور را ری‌استارت کنید (Ctrl+C سپس `npm run dev`):

```bash
PROCESSING_FAILURE_PATTERN=^qa\.dlq$
REDIS_CONSUMER_RECLAIM_IDLE_MS=3000
REDIS_CONSUMER_RECLAIM_INTERVAL_MS=2000
REDIS_MAX_DELIVERY_ATTEMPTS=3
```

**۲ — ارسال رویداد محکوم:**

```bash
curl -X POST http://localhost:3000/v1/events -H 'content-type: application/json' \
  -d '{"eventType":"qa.dlq","aggregateType":"qa","aggregateId":"qa-demo-1","payload":{"scenario":"demo"}}'
```

پس از ~۱۰ ثانیه: شمارنده `failed` برابر ۳، `dead_lettered` برابر ۱، و در جدول یک ردیف قرمز **DLQ** ظاهر می‌شود.

**۳ — بررسی:**

```bash
curl http://localhost:3000/v1/dead-letters
```

**۴ — رفع خطا:** `PROCESSING_FAILURE_PATTERN` را از `.env` حذف و موتور را ری‌استارت کنید.

**۵ — بازیابی:**

```bash
curl -X POST http://localhost:3000/v1/dead-letters/<deadLetterId>/replay
# → {"replayed":true,"deadLetterId":"…","eventId":"…"}
```

رویداد دوباره **از PostgreSQL** منتشر می‌شود (payload/metadata اصلی حفظ می‌شود)، این بار با موفقیت مصرف می‌شود و ردیف DLQ حذف می‌شود. در پذیرش‌آزمایی به‌صورت کامل تأیید شده است.

---

## ۱۲. اجرای تست‌ها

```bash
npm test                 # موتور: ۴۴ تست — مجموعه قرارداد HTTP (پورت‌های درون‌حافظه)،
                         # اعتبارسنجی env، پارسرهای استریم، مدل دامنه
npm run test:dashboard   # داشبورد: ۱۵ تست — هندلرهای BFF با fetch شبیه‌سازی‌شده
npm run typecheck        # tsc --noEmit موتور
npm --prefix client run typecheck
npm run lint             # ESLint موتور (با بررسی نوع)
npm --prefix client run lint
```

هیچ‌کدام از تست‌ها به Docker یا سرویس در حال اجرا نیاز ندارند (تست‌های HTTP از فیک‌های درون‌حافظه روی پورت‌ها با `app.inject()` استفاده می‌کنند؛ تست‌های داشبورد `fetch` را شبیه‌سازی می‌کنند). رفتار با سرویس واقعی به‌طور دستی نیز راستی‌آزمایی شده است — بخش محدودیت‌های README را ببینید.

---

## ۱۳. بیلد و اجرای سبک پروداکشن

```bash
npm run build            # tsc → dist/
node dist/main.js        # اجرای موتور کامپایل‌شده
npm run dashboard:build  # next build (client/.next)
npm --prefix client start   # سرو کردن بیلد داشبورد روی :3100
```

> ⚠️ در حین اجرای `npm run dashboard:dev` هرگز `npm run dashboard:build` را اجرا نکنید — هر دو در `client/.next/` می‌نویسند و کش سرور توسعه خراب می‌شود (مشاهده‌شده: `Cannot find module './897.js'` → HTTP 500). اول dev را متوقف کنید؛ در صورت خرابی، dev را متوقف، `client/.next/` را حذف (کش بازتولیدشدنی، بدون داده کاربر) و دوباره dev را اجرا کنید.

---

## ۱۴. مانیتورینگ (Prometheus + Grafana)

جزو `npm run stack:up` هستند:

- رابط Prometheus: <http://localhost:9090> — هر ۱۵ ثانیه موتور را روی `host.docker.internal:3000/metrics` scrape می‌کند (فایل `monitoring/prometheus/prometheus.yml`).
- رابط Grafana: <http://localhost:3001> — ورود `admin`/`admin` (با `GRAFANA_ADMIN_*` در `.env` قابل تغییر)؛ دیتاسورس Prometheus به‌طور خودکار از `monitoring/grafana/provisioning/datasources/prometheus.yml` فراهم می‌شود.

سری‌های کلیدی سنجه (همه با پیشوند `event_engine_`): `events_ingested_total`، `events_processed_total{status}`، `ingest_duration_seconds`، `processing_duration_seconds`، `http_request_duration_seconds`، `http_requests_total`، `stream_length`.

---

## ۱۵. توقف و پاک‌سازی

```bash
# توقف موتور و داشبورد: Ctrl+C در ترمینال‌های مربوطه.

# توقف همه کانتینرها (داده‌ها در Docker Volumeها «حفظ» می‌شوند):
npm run stack:down

# بعداً: ادامه دقیقاً از همان‌جا (نیازی به مایگریشن دوباره نیست):
npm run stack:up && npm run dev
```

داده‌ها در Volumeهای نام‌دار Docker هستند (`postgres-data`، `redis-data`، `prometheus-data`، `grafana-data` — در `docker-compose.yml`). رویدادها از ری‌استارت کانتینر و ریبوت دستگاه جان سالم به در می‌برند.

> ⚠️ **مخرب:** دستور `docker compose down -v` علاوه بر کانتینرها، Volumeها و بنابراین **تمام رویدادها و پیام‌های مردود ذخیره‌شده را حذف می‌کند**. مگر با پذیرش کامل از دست رفتن داده، اجرا نکنید.

---

## ۱۶. عیب‌یابی

| نشانه                                                                   | علت                                                                                                          | راه‌حل                                                                                                                    |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `failed to connect to the docker API at npipe:…`                        | Docker Desktop اجرا نیست                                                                                     | Docker Desktop را اجرا کنید؛ تا پیام «Docker Desktop is running» صبر کنید؛ دوباره `docker info`.                          |
| `EADDRINUSE` / اشغال پورت 3000/3100                                     | پروسه دیگری پورت را گرفته                                                                                    | پیدا کنید: `netstat -ano \| findstr :3000` (ویندوز) یا `lsof -i :3000`؛ آن پروسه را متوقف کنید.                           |
| موتور اجراست ولی curl از :3000 پاسخ HTML/عجیب می‌گیرد                   | پروسه بیگانه `127.0.0.1:3000` را گرفته و `0.0.0.0:3000` موتور را سایه انداخته (ویندوز اجازه هر دو را می‌دهد) | پروسه بیگانه را شناسایی و متوقف کنید؛ موتور سالم است.                                                                     |
| `npm run dev` کشته شد ولی :3000 هنوز LISTENING است (ویندوز)             | فرزند `tsx watch` پس از کشتن والد npm یتیم شده                                                               | `netstat -ano \| findstr :3000` → `taskkill /PID <pid> /F`.                                                               |
| داشبورد HTTP 500 با `Cannot find module './897.js'`                     | `next build` در حین سرو‌بودن `next dev` روی همان `.next/` اجرا شده                                           | dev را متوقف، `client/.next/` را حذف (کش بازتولیدشدنی)، dev را دوباره اجرا کنید.                                          |
| `curl /readyz` → 503 همراه `TimeoutError: Redis health check timed out` | کانتینر Redis متوقف/غیرقابل‌دسترس                                                                            | `docker compose start redis`؛ بررسی با `docker compose exec -T redis redis-cli ping`.                                     |
| دریافت رویداد هنگام قطعی Redis پس از ~۵ ثانیه 500 می‌دهد                | تایم‌اوت انتشار (عمدی — قبلاً درخواست بی‌نهایت معلق می‌شد)                                                   | رویداد **در PostgreSQL ذخیره شده است**؛ اگر پروسه روشن بماند، انتشار در reconnect انجام می‌شود. بخش محدودیت‌ها را ببینید. |
| 409 `already exists` هنگام دریافت                                       | `eventId` تکراری ارسال کرده‌اید                                                                              | رفتار عمدی idempotency؛ برای رویداد جدید از UUID تازه استفاده کنید.                                                       |
| Prisma هنگام `migrate dev` پیشنهاد _reset_ داد                          | ناهمخوانی اسکیما با پایگاه داده                                                                              | **reset را نپذیرید** مگر از دست رفتن داده را بپذیرید؛ اول `npx prisma migrate status`.                                    |
| هشدار `.git can't be found` از Husky در `npm install`                   | پوشه، ریپو گیت نیست                                                                                          | در ریشه پروژه `git init` کنید و دوباره `npm install`.                                                                     |
| `Cannot find module '@prisma/client'`                                   | کلاینت Prisma تولید نشده                                                                                     | `npm run prisma:generate`.                                                                                                |
| ورود گرافانا رد می‌شود                                                  | اعتبارنامه تغییر کرده                                                                                        | پیش‌فرض `admin`/`admin` است مگر `GRAFANA_ADMIN_USER/PASSWORD` در `.env` تنظیم شده باشد.                                   |

---

## ۱۷. محدودیت‌های شناخته‌شده (راستی‌آزمایی‌شده، بدون پنهان‌کاری)

1. **شکاف دو-نوشتاری (Dual-Write).** دریافت، ابتدا در PostgreSQL درج و سپس در Redis منتشر می‌کند (تراکنشی که هر دو را پوشش دهد وجود ندارد). با قطع Redis، دریافت سریع (~۵ ثانیه) 500 می‌دهد اما رویداد در آن لحظه ذخیره شده و **در استریم نیست**؛ اگر پروسه روشن بماند انتشار صف‌شده در reconnect انجام می‌شود (مشاهده‌شده)، اما اگر پروسه وسط قطعی ری‌استارت شود، رویداد ذخیره می‌ماند و **هیچ بازانتشار خودکاری ندارد**. راه‌حل درست: تراکنش Outbox (به‌عنوان کار آینده مستند شده و عمداً اینجا پیاده نشده است).
2. **بازیابی حداقل-یک‌بار است.** بازیابی‌های همزمان پیام مردود می‌توانند انتشار تکراری بسازند (تأیید شده). هندلرها باید idempotent باشند.
3. **احراز هویت وجود ندارد.** هر کس به پورت‌های ۳۰۰۰/۳۱۰۰ دسترسی داشته باشد می‌تواند رویداد بفرستد و داده بخواند. فقط برای توسعه محلی.
4. **نرخ‌ها و وضعیت مصرف‌کننده در داشبورد استنتاجی است**، نه پروب مستقیم سلامت مصرف‌کننده.
5. **خاموشی آرام با SIGTERM پیاده شده ولی در ویندوز قابل راستی‌آزمایی نیست** (سیگنال بیرونی در ویندوز پروسه را بی‌رحمانه می‌کشد)؛ فقط با بازبینی کد تأیید شده.

---

## ۱۸. مرجع کامل دستورات

| محل       | دستور                                                             | عمل                                           |
| --------- | ----------------------------------------------------------------- | --------------------------------------------- |
| ریشه      | `npm install`                                                     | نصب وابستگی‌های موتور + فعال‌سازی هوک‌های Git |
| ریشه      | `npm run stack:up` / `stack:down`                                 | اجرا / توقف کانتینرهای Docker                 |
| ریشه      | `npm run prisma:migrate -- --name init`                           | ساخت + اعمال اسکیما                           |
| ریشه      | `npm run prisma:generate` / `prisma:deploy`                       | تولید کلاینت / اعمال مایگریشن‌های کامیت‌شده   |
| ریشه      | `npm run dev`                                                     | سرور توسعه موتور (watch mode) + مصرف‌کننده    |
| ریشه      | `npm run build` / `start`                                         | کامپایل به `dist/` / اجرای موتور کامپایل‌شده  |
| ریشه      | `npm test` / `test:dashboard` / `test:watch`                      | مجموعه‌های تست                                |
| ریشه      | `npm run typecheck` / `lint` / `format`                           | دروازه‌های کیفیت                              |
| ریشه      | `npm run dashboard:install` / `dashboard:dev` / `dashboard:build` | چرخه حیات داشبورد                             |
| `client/` | `npm run dev` / `build` / `start` / `typecheck` / `test`          | همین‌ها داخل پکیج داشبورد                     |
