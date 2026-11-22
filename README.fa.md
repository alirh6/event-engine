<div align="center">

# ⚡ Event Engine

### پردازش توزیع‌شده رویدادها، همراه با نمای زنده عملیات

دریافت رویداد با HTTP · ذخیره در PostgreSQL · پردازش با Redis Streams

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D%2022.11-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5-000000?style=for-the-badge&logo=fastify&logoColor=white)](https://fastify.dev/)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![License](https://img.shields.io/badge/License-MIT-7C3AED?style=for-the-badge)](LICENSE)

[معرفی](#-معرفی) · [شروع سریع](#-شروع-سریع) · [معماری](#-معماری) · [API](#-مرجع-api) · [محدودیت‌ها](#-محدودیتهای-شناختهشده)

[English](README.md) | [فارسی](README.fa.md)

</div>

---

## ✨ معرفی

Event Engine پروژه‌ای برای پردازش توزیع‌شده رویدادهاست که یک API مبتنی بر HTTP، یک مخزن رویداد PostgreSQL، مصرف‌کننده‌های Redis Streams و یک کنسول عملیات بلادرنگ را در کنار هم قرار می‌دهد. این پروژه مسیر دریافت، پردازش، مشاهده‌پذیری و بازیابی رویدادها را در یک سامانه یکپارچه می‌کند.

| قابلیت            | کاربرد                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| **دریافت رویداد** | API اعتبارسنجی‌شده با پاسخ‌های خطای تایپ‌دار و پشتیبانی از `eventId` ارسالی کلاینت برای جلوگیری از ثبت تکراری. |
| **ذخیره رویداد**  | مخزن فقط‌الحاقی PostgreSQL با شماره‌گذاری سراسری و کنترل همزمانی خوش‌بینانه برای هر aggregate.                 |
| **پردازش استریم** | گروه‌های مصرف‌کننده Redis، خواندن دسته‌ای، بازپس‌گیری پیام‌های معلق و تعداد تلاش قابل‌پیکربندی.                |
| **بازیابی خطا**   | ثبت پیام‌های مردود در PostgreSQL و بازپخش رویداد اصلی از مخزن.                                                 |
| **مشاهده‌پذیری**  | لاگ ساختاریافته با pino، سنجه‌های Prometheus و Grafana آماده پیکربندی‌شده.                                     |
| **کنسول عملیات**  | داشبورد تیره با کارت‌های سلامت، سنجه‌ها، فهرست رویدادها و پیام‌های مردود و شبیه‌ساز دریافت رویداد.             |

> [!IMPORTANT]
> این پروژه یک نمونه‌کار است و ادعای آماده‌بودن برای محیط عملیاتی (production) ندارد. احراز هویت پیاده‌سازی نشده و بین نوشتن در PostgreSQL و انتشار در Redis شکاف دو-نوشتاری وجود دارد. پیش از استقرار یا در دسترس قراردادن سرویس‌ها، [محدودیت‌های شناخته‌شده](#-محدودیتهای-شناختهشده) را بخوانید.

## 🚀 شروع سریع

**پیش‌نیازها:** نسخه **22.11 یا بالاتر Node.js**، ابزار Git و Docker Desktop در حال اجرا.

دستورهای زیر را از پوشه اصلی پروژه اجرا کنید. نمونه‌های shell برای Bash نوشته شده‌اند؛ در ویندوز می‌توانید از Git Bash استفاده کنید یا دستورها را برای PowerShell تطبیق دهید.

```bash
# Create local configuration without overwriting an existing .env.
cp -n .env.example .env

# Install dependencies and start the infrastructure.
npm install
npm run stack:up

# Create the database schema, then start the API and consumer.
npm run prisma:migrate -- --name init
npm run dev
```

در یک **ترمینال دوم**، داشبورد را اجرا کنید:

```bash
npm run dashboard:install
npm run dashboard:dev
```

آدرس **http://localhost:3100** را باز کنید و سپس یک رویداد به API بفرستید:

```bash
curl -X POST http://localhost:3000/v1/events \
  -H 'content-type: application/json' \
  -d '{"eventType":"order.created","aggregateType":"order","aggregateId":"order-42","payload":{"amount":125.5,"currency":"EUR"}}'
```

رویداد را در جدول **Event Stream** داشبورد مشاهده کنید. برای تمرین مسیر خطا و بازپخش، به بخش [بازیابی پیام مردود](#-بازیابی-پیام-مردود) بروید.

> [!TIP]
> برای پیش‌نیازها، تنظیمات، خروجی‌های مورد انتظار و عیب‌یابی، [راهنمای راه‌اندازی و بهره‌برداری](docs/OPERATIONS_GUIDE.fa.md) را ببینید ([English](docs/OPERATIONS_GUIDE.md)). اطلاعات ورود نمونه فقط برای توسعه محلی هستند؛ پیش از استفاده خارج از آن محیط، آن‌ها را تغییر دهید.

## 🧱 معماری

```text
        ┌───────────────────────────────────────────────────────────┐
        │  client/ (Next.js :3100)  health · metrics · stream ·     │
        │                           ingestion simulator             │
        └────────────────────────────┬──────────────────────────────┘
                                     │ BFF route handlers (/api/*)
        ┌────────────────────────────▼──────────────────────────────┐
        │  engine (Fastify :3000)   interfaces → application →      │
        │                           domain  ◀── infrastructure      │
        └───────┬───────────────────────────────────┬───────────────┘
                │                                   │
      ┌─────────▼─────────┐               ┌─────────▼──────────┐
      │ PostgreSQL :5432  │               │  Redis :6379       │
      │ events · dead     │  publish /    │  events:stream     │
      │ letter_events     │  consume      │  (AOF, noeviction) │
      └───────────────────┘               └────────────────────┘
```

موتور از قاعده وابستگی معماری تمیز پیروی می‌کند: لایه دامنه (`src/domain/`) وابستگی مستقیمی به فریم‌ورک‌ها ندارد و لایه‌های زیرساخت و HTTP، پورت‌های تعریف‌شده در لایه‌های application و domain را پیاده‌سازی می‌کنند. ذخیره در PostgreSQL و انتشار در Redis عملیات جداگانه‌ای هستند؛ [محدودیت دو-نوشتاری](#-محدودیتهای-شناختهشده) را ببینید.

## 📡 مرجع API

| متد    | مسیر                          | کاربرد                                                                           |
| ------ | ----------------------------- | -------------------------------------------------------------------------------- |
| `POST` | `/v1/events`                  | دریافت رویداد؛ پاسخ `201`، خطای اعتبارسنجی `400` یا `409` برای `eventId` تکراری. |
| `GET`  | `/v1/events`                  | فهرست رویدادها از جدید به قدیم؛ با پشتیبانی از `page`، `pageSize` و `eventType`. |
| `GET`  | `/v1/events/:id`              | دریافت یک رویداد.                                                                |
| `GET`  | `/v1/dead-letters`            | فهرست سوابق پیام‌های مردود از جدید به قدیم.                                      |
| `POST` | `/v1/dead-letters/:id/replay` | انتشار مجدد رویداد اصلی در استریم و پاک‌سازی رکورد پیام مردود.                   |
| `GET`  | `/healthz` · `/readyz`        | بررسی زنده‌بودن و آمادگی وابستگی‌ها؛ با محدودیت زمانی ۲ ثانیه برای readiness.    |
| `GET`  | `/metrics`                    | ارائه سنجه‌ها با قالب Prometheus.                                                |

## 🔁 بازیابی پیام مردود

یک قابلیت اختیاری تزریق خطا امکان تمرین چرخه شکست ← تلاش مجدد ← پیام مردود ← بازپخش را بدون نیاز به یک handler معیوب فراهم می‌کند. متغیر `PROCESSING_FAILURE_PATTERN` در حالت `NODE_ENV=production` هنگام راه‌اندازی پذیرفته نمی‌شود.

```bash
# Add to .env, then restart the engine.
PROCESSING_FAILURE_PATTERN=^payment\.settled$
REDIS_CONSUMER_RECLAIM_IDLE_MS=3000
REDIS_MAX_DELIVERY_ATTEMPTS=3
```

۱. یک رویداد مطابق الگو ارسال کنید. پس از پایان تعداد تلاش‌های مجاز، رویداد با نشان **DLQ** در داشبورد ظاهر می‌شود.
۲. الگوی تزریق خطا را حذف و موتور را مجدداً اجرا کنید.
۳. شناسه پیام مردود را جایگزین `<id>` کنید و درخواست بازپخش بفرستید:

```bash
curl -X POST http://localhost:3000/v1/dead-letters/<id>/replay
```

شناسه واقعی را بدون علامت‌های `<` و `>` بنویسید. رویداد از PostgreSQL دوباره برای پردازش منتشر می‌شود و رکورد DLQ پاک می‌شود. برای آموزش کامل، [بخش ۱۱ راهنمای بهره‌برداری](docs/OPERATIONS_GUIDE.fa.md) را ببینید.

## 🖥️ کنسول عملیات

| بخش              | اطلاعات قابل مشاهده                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------- |
| **سلامت**        | وضعیت API، PostgreSQL و Redis همراه با جزئیات آمادگی.                                       |
| **سنجه‌ها**      | نرخ دریافت و پردازش، طول استریم، تعداد پیام‌های مردود، تأخیر و وضعیت محاسبه‌شده مصرف‌کننده. |
| **Event Stream** | فهرست ترکیبی رویدادها و پیام‌های مردود، از جدید به قدیم، با امکان توقف و ادامه نمایش.       |
| **شبیه‌ساز**     | نمونه‌های آماده، ویرایشگر محتوای JSON، جزئیات پاسخ و گزارش تلاش‌ها.                         |

مرورگر با route handlerهای Next.js در معماری Backend-for-Frontend ارتباط می‌گیرد. آدرس موتور (`BACKEND_URL`) سمت سرور باقی می‌ماند؛ بنابراین مرورگر مستقیماً به موتور متصل نیست و به تنظیم CORS بین آن دو وابسته نمی‌شود.

## 🧪 تست

```bash
npm test                 # Engine tests
npm run test:dashboard   # Dashboard BFF and Prometheus parser tests
npm run typecheck
npm run lint
```

مجموعه تست‌ها قراردادهای HTTP، اعتبارسنجی محیط، پارسرهای استریم، قواعد دامنه، handlerهای BFF داشبورد و پارسر Prometheus را پوشش می‌دهند. علاوه بر مسیرهای موفق، پاسخ‌های خطا نیز بررسی می‌شوند. اجرای این مجموعه‌ها به Docker یا سرویس در حال اجرا نیاز ندارد.

## ⚙️ پیکربندی

پیکربندی هنگام راه‌اندازی با zod اعتبارسنجی می‌شود. جدول زیر تعدادی از تنظیمات پرکاربرد را نشان می‌دهد؛ فهرست کامل در [راهنمای بهره‌برداری](docs/OPERATIONS_GUIDE.fa.md) آمده است.

| متغیر                                             | مقدار پیش‌فرض                                              | کاربرد                                           |
| ------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------ |
| `DATABASE_URL` / `REDIS_URL`                      | —                                                          | رشته‌های اتصال اجباری.                           |
| `PORT` / `LOG_LEVEL` / `NODE_ENV`                 | `3000` / `info` / `development`                            | تنظیمات اجرای موتور.                             |
| `REDIS_STREAM_NAME` / `REDIS_STREAM_MAX_LENGTH`   | `events:stream` / `1000000`                                | نام استریم و سقف طول آن.                         |
| `REDIS_CONSUMER_*`، `REDIS_MAX_DELIVERY_ATTEMPTS` | دسته ۱۰۰، block دو ثانیه، بازپس‌گیری ۶۰ / ۱۵ ثانیه، ۵ تلاش | تنظیم رفتار مصرف‌کننده.                          |
| `CORS_ORIGINS` / `RATE_LIMIT_MAX`                 | `*` / `10000`                                              | تنظیم مبدأهای HTTP و محدودیت نرخ درخواست.        |
| `PROCESSING_FAILURE_PATTERN`                      | تنظیم نشده                                                 | تزریق خطا برای تست DLQ؛ در production ممنوع است. |
| `BACKEND_URL` (کلاینت)                            | `http://127.0.0.1:3000`                                    | آدرس موتور برای BFF در سمت سرور.                 |

## 📁 ساختار پروژه

```text
event-engine/
├── src/            # Engine: domain, application, infrastructure, HTTP interfaces
├── client/         # Next.js console, BFF routes, components, utilities, tests
├── prisma/         # Schema and migrations: events and dead-letter events
├── tests/          # Engine integration and unit tests
├── monitoring/     # Prometheus config and Grafana datasource provisioning
├── docs/           # Setup and operations guides in English and Persian
└── docker-compose.yml
```

## ⚠️ محدودیت‌های شناخته‌شده

این ملاحظات برای ارزیابی و توسعه پروژه مهم هستند:

1. **شکاف دو-نوشتاری (Dual-write).** موتور ابتدا در PostgreSQL ثبت و سپس در Redis منتشر می‌کند؛ تراکنش مشترکی برای هر دو وجود ندارد. در صورت شکست انتشار، ممکن است رویداد در مخزن باقی بماند ولی وارد استریم نشود؛ پس از راه‌اندازی مجدد هم بازانتشار خودکار وجود ندارد. الگوی transactional outbox به‌عنوان بهبود آینده مستند شده و در این نسخه پیاده‌سازی نشده است.
2. **تحویل حداقل یک‌بار.** تحویل مجدد و بازپخش همزمان پیام‌های مردود می‌توانند باعث پردازش تکراری شوند. handlerها باید idempotent باشند؛ در مرحله دریافت، `eventId` ارسالی کلاینت برای جلوگیری از ثبت تکراری استفاده می‌شود.
3. **نبود احراز هویت.** هر کسی که به پورت‌های 3000 یا 3100 دسترسی داشته باشد می‌تواند داده دریافت یا ثبت کند. این پروژه برای توسعه محلی در نظر گرفته شده است؛ پیش از قرار دادن آن در دسترس دیگران، از یک gateway دارای احراز هویت استفاده کنید.
4. **شاخص‌های محاسبه‌شده داشبورد.** نرخ‌های پردازش و نشانگر وضعیت مصرف‌کننده از تغییرات سنجه‌ها محاسبه می‌شوند، نه از بررسی مستقیم زنده‌بودن مصرف‌کننده.

## 🤝 مشارکت

از مشارکت استقبال می‌شود. برای تغییرات مهم، لطفاً ابتدا یک issue باز کنید. پیام‌های commit را مطابق [Conventional Commits](https://www.conventionalcommits.org/) بنویسید و پیش از ارسال pull request دستورهای `npm test`، `npm run typecheck` و `npm run lint` را اجرا کنید. هنوز راهنمای مشارکت جداگانه‌ای وجود ندارد.

## 📄 مجوز

این پروژه تحت [مجوز MIT](LICENSE) منتشر شده است. حق نشر © 2026 Ali Rahimpanah.

## 📬 پشتیبانی

- **گزارش باگ و پیشنهاد قابلیت:** یک [GitHub Issue](../../issues) با مراحل بازتولید و توضیح رفتار مورد انتظار و رفتار واقعی باز کنید.
- **پرسش‌های راه‌اندازی:** ابتدا [راهنمای راه‌اندازی و بهره‌برداری](docs/OPERATIONS_GUIDE.fa.md)، به‌ویژه بخش عیب‌یابی را ببینید.
- **سایر پرسش‌ها:** یک [GitHub Issue](../../issues) باز کنید.

---

<div align="center">

ساخته‌شده توسط **Ali Rahimpanah** · [بازگشت به بالا](#-event-engine)

</div>
