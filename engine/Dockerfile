FROM mcr.microsoft.com/playwright/python:v1.49.1-jammy

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY mmd_engine ./mmd_engine
COPY pyproject.toml .

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

CMD ["uvicorn", "mmd_engine.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
