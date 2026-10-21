FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY src/ src/
ENV PYTHONPATH=/app/src PYTHONUNBUFFERED=1
RUN useradd --uid 1000 --create-home appuser
USER appuser
CMD ["python", "-m", "notifications.main"]
