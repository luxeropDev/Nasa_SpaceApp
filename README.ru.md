# PyroLens — интеллектуальный анализ научных данных для пожарной безопасности космических аппаратов

> От экспериментальных данных к инженерным доказательствам.

PyroLens 3.0 — независимое исследовательское рабочее пространство для анализа записей NASA Physical Sciences Informatics (PSI) о горении. Система сохраняет исходные значения и происхождение данных, нормализует единицы и использует детерминированные правила для сопоставления сценариев, оценки покрытия и классификации пробелов.

PyroLens **не связан с NASA и не одобрен NASA**, не является симулятором пожара или инструментом сертификации и не должен использоваться как оперативное руководство. Оценки совпадения и покрытия помогают искать доказательства, но не являются вероятностями безопасности.

[English](README.md) · **Русский**

## Состав проекта

- фронтенд React/Vite/TypeScript/Tailwind/Recharts, локализация EN/RU, светлая и тёмная темы;
- бэкенд FastAPI/Pydantic с прежним API и эндпоинтами доказательств PyroLens;
- детерминированная проверка пригодности наблюдений, состава газа, совместимости потоков, сопоставления сценариев, покрытия, паспортов экспериментов и отчётов;
- проверяемый набор эталонных случаев со статусом **PENDING INDEPENDENT DOMAIN-EXPERT REVIEW**.

В доступной версии фронтенда отсутствует сообщённый ранее, но не сохранённый в GitHub редизайн Coverage Intelligence. Основной видимый брендинг обновлён без переписывания работающих экранов. Подробности — в [финальном отчёте](docs/PYROLENS_3_0_FINAL_REPORT.md).

## Запуск в Windows PowerShell

Бэкенд, терминал 1:

```powershell
cd D:\QASH\Works\Nasa_SpaceApp\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

Если команда `python` недоступна, но установлен `uv`:

```powershell
cd D:\QASH\Works\Nasa_SpaceApp\backend
$env:UV_CACHE_DIR = "D:\QASH\Works\Nasa_SpaceApp\.uv-cache"
uv run --with-requirements requirements.txt uvicorn app.main:app --reload --port 8000
```

Фронтенд, терминал 2:

```powershell
cd D:\QASH\Works\Nasa_SpaceApp\frontend
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

Интерфейс: <http://127.0.0.1:5173>. Документация API: <http://127.0.0.1:8000/docs>. Если порты заняты, не завершайте чужие процессы: выберите свободные порты и согласуйте прокси Vite и `PYROLENS_CORS_ORIGINS`.

## Конфигурация

Ключ LLM не обязателен. Без ключа ассистент возвращает локальный детерминированный ответ с `llm_used: false`. Бэкенд не загружает `.env` автоматически; переменные задаются в оболочке до запуска.

- `OPENAI_API_KEY`, `OPENAI_MODEL`
- `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`
- `PYROLENS_CORS_ORIGINS`
- `PYROLENS_AI_RATE_PER_MIN` (по умолчанию 20)
- `PYROLENS_LOG_LEVEL` (по умолчанию `INFO`)

Старые переменные `FLAMEWISE_*` поддерживаются для совместимости, но `PYROLENS_*` имеют приоритет. Не сохраняйте ключи в репозитории.

## Основные эндпоинты PyroLens

- `GET /api/passports`, `/api/passports/{accession}`
- `GET /api/coverage/map`, `/matrix`, `/pairs`, `/explore`, `/observations`
- `GET /api/atlas`, `/api/scenario-presets`
- `POST /api/scenario/validate`, `/api/match`, `/api/gaps`, `/api/evidence/report`
- `GET|POST /api/evidence/export`
- `POST /api/assistant` — принимает полный пользовательский объект `scenario`

Детерминированное сопоставление и анализ пробелов выполняются до необязательного синтеза LLM. Заглушка или резервный ответ не считается тестом реальной LLM.

## Проверка

```powershell
cd D:\QASH\Works\Nasa_SpaceApp\backend
python -m pip install -r requirements.txt -r requirements-dev.txt
python -m pytest -q
python -m validation.run_validation

cd D:\QASH\Works\Nasa_SpaceApp\frontend
npm ci
npm run typecheck
npm run build
```

В доступном репозитории нет настроенных скриптов компонентных тестов фронтенда и Playwright, поэтому эти наборы нельзя запустить из текущих файлов.

## Научная честность

- Отсутствующий разбавитель не подменяется воздухом или азотом.
- Несовместимые конфигурации потока не сравниваются как эквивалентные.
- Непламенные наблюдения не увеличивают покрытие горения.
- Неуказанная неопределённость обозначается `uncertainty_not_reported`, а не нулём.
- 123 строки PSI-69 сохраняют неоднозначность CO/CO2.
- `NO_MATCHING_RECORDS` относится только к выбранной коллекции PyroLens и не означает, что явление никогда не изучалось.
- Пороговые значения и независимая научная проверка остаются предварительными.

Документы: [методы](docs/SCIENTIFIC_METHODS.md), [пакет внешнего рецензирования](docs/EXTERNAL_EXPERT_REVIEW_PACKAGE.md), [финальный отчёт](docs/PYROLENS_3_0_FINAL_REPORT.md), [происхождение данных](docs/SCIENTIFIC_DATA_PROVENANCE.md).
