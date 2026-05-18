from celery import Celery
from app.config import get_settings

settings = get_settings()

app = Celery(
    "virtuoso_vision",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=30 * 60,  # 30-minute hard limit
    task_soft_time_limit=25 * 60,  # 25-minute soft limit
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=1000,
    broker_connection_retry_on_startup=True,
)

# Auto-discover tasks from app.workers module
app.autodiscover_tasks(['app.workers'])

__all__ = ["app"]
